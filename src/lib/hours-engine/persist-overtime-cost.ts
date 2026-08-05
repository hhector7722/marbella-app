/**
 * @deprecated Fase 1b — LEGADO INERTE.
 * No usar en producción. Columnas C (incl. total_cost) → writeWeeklyProjection.
 * Definiciones conservadas solo por compatibilidad de exports; sin callers vivos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bagModeOverrideLookupFromRows,
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from './opening-carry.ts';
import { loadEmployeeBoundaryFacts } from './load-employee-facts.ts';
import { liquidateWeek } from './liquidation-engine.ts';
import { priceLiquidationOvertime } from './week-card-from-liquidation.ts';
import {
  assertMonday,
  compareCivilDate,
  mondayOnOrBefore,
  nextWeekStart,
  weekBounds,
} from './week-dates.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import type { CivilDate, TimeLogFact } from './types.ts';

/** Tolerancia vs numeric(10,2). */
const MONEY_EPS = 0.005;

export type PersistOvertimeCostResult =
  | {
      ok: true;
      weeksPersisted: number;
      /** Semanas liquidadas para carry sin fila en weekly_snapshots. */
      weeksSkippedNoRow: number;
      userId: string;
      fromWeekStart: CivilDate;
      toWeekStart: CivilDate;
    }
  | { ok: false; error: string };

export type RecalcAndPersistResult =
  | {
      ok: true;
      weeksPersisted: number;
      userId: string;
      fromWeekStart: CivilDate;
    }
  | { ok: false; error: string };

function ymdKey(raw: string): CivilDate {
  return (typeof raw === 'string' ? raw.split('T')[0]! : String(raw)) as CivilDate;
}

function todayMadridYmd(): CivilDate {
  const ymd = formatYmdInMadrid(new Date());
  if (!ymd) {
    throw new Error(
      'persistOvertimeCostFromEngine: no se pudo obtener fecha Madrid',
    );
  }
  return ymd;
}

/**
 * Persiste estimatedValue → weekly_snapshots.total_cost para [fromWeekStart, toWeekStart].
 * Solo toca total_cost. Valida lectura tras cada UPDATE.
 */
export async function persistOvertimeCostFromEngine(
  client: SupabaseClient,
  input: {
    userId: string;
    /** Lunes inclusive. */
    fromWeekStart: CivilDate;
    /** Lunes inclusive; default = lunes de hoy Madrid. */
    toWeekStart?: CivilDate;
  },
): Promise<PersistOvertimeCostResult> {
  const userId = input.userId;
  let fromWeekStart: CivilDate;
  let toWeekStart: CivilDate;
  try {
    fromWeekStart = mondayOnOrBefore(ymdKey(input.fromWeekStart));
    toWeekStart = mondayOnOrBefore(
      ymdKey(input.toWeekStart ?? todayMadridYmd()),
    );
    assertMonday(fromWeekStart);
    assertMonday(toWeekStart);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (compareCivilDate(fromWeekStart, toWeekStart) > 0) {
    return {
      ok: false,
      error: `persistOvertimeCostFromEngine: fromWeekStart (${fromWeekStart}) > toWeekStart (${toWeekStart})`,
    };
  }

  let employee;
  try {
    employee = await loadEmployeeBoundaryFacts(client, userId);
  } catch (err) {
    return {
      ok: false,
      error: `persistOvertimeCostFromEngine: frontera empleado: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const timelineStart = employeeTimelineStartWeek(employee);
  const logsFrom = timelineStart ?? fromWeekStart;
  const { weekEnd: horizonEndDay } = weekBounds(toWeekStart);
  const { startIso, endIso } = madridRangeUtcIso(logsFrom, horizonEndDay);

  const [logsRes, snapsRes] = await Promise.all([
    client
      .from('time_logs')
      .select('clock_in, clock_out, total_hours')
      .eq('user_id', userId)
      .gte('clock_in', startIso)
      .lte('clock_in', endIso),
    client
      .from('weekly_snapshots')
      .select(
        'week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
      )
      .eq('user_id', userId)
      .gte('week_start', logsFrom)
      .lte('week_start', toWeekStart),
  ]);

  if (logsRes.error) {
    return {
      ok: false,
      error: `persistOvertimeCostFromEngine: time_logs: ${logsRes.error.message}`,
    };
  }
  if (snapsRes.error) {
    return {
      ok: false,
      error: `persistOvertimeCostFromEngine: weekly_snapshots: ${snapsRes.error.message}`,
    };
  }

  const snapRows = snapsRes.data ?? [];
  const isPaidByWeek = isPaidLookupFromRows(snapRows);
  const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapRows);
  const overtimeRateOverrideByWeek =
    overtimeRateOverrideLookupFromRows(snapRows);

  const engineLogs: TimeLogFact[] = (logsRes.data ?? []).map((l) => ({
    clockInIso: l.clock_in,
    clockOutIso: l.clock_out,
    totalHours: l.total_hours,
  }));

  let carryIn: number;
  try {
    carryIn = resolveOpeningCarryIn({
      employee,
      chainStart: fromWeekStart,
      logs: engineLogs,
      isPaidByWeek,
      bagModeOverrideByWeek,
    });
  } catch (err) {
    return {
      ok: false,
      error: `persistOvertimeCostFromEngine: opening carry: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  let weeksPersisted = 0;
  let weeksSkippedNoRow = 0;
  for (
    let weekStart = fromWeekStart;
    compareCivilDate(weekStart, toWeekStart) <= 0;
    weekStart = nextWeekStart(weekStart)
  ) {
    const daySet = new Set(weekBounds(weekStart).days);
    const weekLogs = engineLogs.filter((l) => {
      const day = formatYmdInMadrid(l.clockInIso);
      return day != null && daySet.has(day);
    });
    const bagModeOverride = bagModeOverrideByWeek(weekStart);
    const overrideRate = overtimeRateOverrideByWeek(weekStart);

    let estimatedValue: number | null;
    try {
      const result = liquidateWeek({
        employee,
        weekStart,
        logs: weekLogs,
        isPaid: isPaidByWeek(weekStart),
        carryIn,
        bagModeOverride,
      });
      carryIn = result.carryOut;
      const pricing = priceLiquidationOvertime(result, employee, {
        bagModeOverride,
        overrideRate,
      });
      estimatedValue = pricing.estimatedValue;
    } catch (err) {
      return {
        ok: false,
        error: `persistOvertimeCostFromEngine: liquidación ${weekStart}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    const { data: existing, error: existErr } = await client
      .from('weekly_snapshots')
      .select('week_start')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existErr) {
      return {
        ok: false,
        error: `persistOvertimeCostFromEngine: existencia ${weekStart}: ${existErr.message}`,
      };
    }
    if (!existing) {
      // Semana en la cadena de carry sin fila SQL (p.ej. pre-primer fichaje).
      // No inventar snapshot; solo avanzar carry.
      weeksSkippedNoRow += 1;
      continue;
    }

    // Redondeo a céntimos (columna numeric(10,2)).
    const persisted = estimatedValue == null ? null : Math.round(estimatedValue * 100) / 100;

    const { error: updErr } = await client
      .from('weekly_snapshots')
      .update({ total_cost: persisted })
      .eq('user_id', userId)
      .eq('week_start', weekStart);

    if (updErr) {
      return {
        ok: false,
        error: `persistOvertimeCostFromEngine: UPDATE ${weekStart}: ${updErr.message}`,
      };
    }

    const { data: readBack, error: readErr } = await client
      .from('weekly_snapshots')
      .select('total_cost')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (readErr) {
      return {
        ok: false,
        error: `persistOvertimeCostFromEngine: lectura ${weekStart}: ${readErr.message}`,
      };
    }
    if (!readBack) {
      return {
        ok: false,
        error: `persistOvertimeCostFromEngine: fila desapareció tras UPDATE ${weekStart}`,
      };
    }

    if (persisted != null) {
      const stored =
        readBack.total_cost == null ? null : Number(readBack.total_cost);
      if (stored == null || !Number.isFinite(stored)) {
        return {
          ok: false,
          error: `persistOvertimeCostFromEngine: validación ${weekStart}: total_cost quedó NULL/ inválido tras UPDATE (esperado ${persisted})`,
        };
      }
      if (Math.abs(stored - persisted) > MONEY_EPS) {
        return {
          ok: false,
          error: `persistOvertimeCostFromEngine: inconsistencia ${weekStart}: total_cost=${stored} ≠ estimatedValue=${persisted}`,
        };
      }
    }

    weeksPersisted += 1;
  }

  return {
    ok: true,
    weeksPersisted,
    weeksSkippedNoRow,
    userId,
    fromWeekStart,
    toWeekStart,
  };
}

/**
 * Recalcula horas en SQL y después persiste dinero desde Cost Engine.
 * Único flujo recomendado tras mutaciones que disparan fn_recalc.
 */
export async function recalcSnapshotsAndPersistOvertimeCost(
  client: SupabaseClient,
  userId: string,
  startDate: string,
): Promise<RecalcAndPersistResult> {
  const fromWeekStart = mondayOnOrBefore(ymdKey(startDate));

  const { error: rpcError } = await client.rpc(
    'fn_recalc_and_propagate_snapshots',
    {
      p_user_id: userId,
      p_start_date: startDate,
    },
  );

  if (rpcError) {
    return {
      ok: false,
      error: `fn_recalc_and_propagate_snapshots: ${rpcError.message}`,
    };
  }

  const persist = await persistOvertimeCostFromEngine(client, {
    userId,
    fromWeekStart,
  });

  if (!persist.ok) {
    return { ok: false, error: persist.error };
  }

  return {
    ok: true,
    weeksPersisted: persist.weeksPersisted,
    userId,
    fromWeekStart,
  };
}
