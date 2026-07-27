/**
 * Writer único de proyección semanal (ADR-HE-SSOT-001 / PROJECTION CONTRACT v1).
 *
 * Responsabilidades (únicas):
 * 1. Recibir hechos de entrada (vía Supabase + overrides existentes)
 * 2. Invocar Hours Engine (liquidateWeek)
 * 3. Invocar Cost Engine (priceLiquidationOvertime)
 * 4. Validar Projection Contract / invariantes
 * 5. Persistir columnas C (+ identidad A en insert)
 * 6. Verificar read-back antes de dar por bueno el commit lógico
 *
 * Prohibido: recalcular reglas, reinterpretar carry/OT/payable, inventar overrides B.
 *
 * Fase 1: módulo listo. Cableado cron/fichajes/imports/toggle/contratos = Fase 1b.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bagModeOverrideLookupFromRows,
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from '../opening-carry.ts';
import { loadEmployeeBoundaryFacts } from '../load-employee-facts.ts';
import { liquidateWeek } from '../liquidation-engine.ts';
import { priceLiquidationOvertime } from '../week-card-from-liquidation.ts';
import {
  assertMonday,
  compareCivilDate,
  mondayOnOrBefore,
  nextWeekStart,
  weekBounds,
} from '../week-dates.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../../madrid-date-bounds.ts';
import type { CivilDate, TimeLogFact } from '../types.ts';
import {
  domainRowToInsertPayload,
  domainRowToUpdatePayload,
  MONEY_EPS,
  projectionDomainEquals,
  type WeeklyProjectionDomainRow,
} from './map-projection.ts';
import {
  validateProjectionBatch,
  validateWriterPreconditions,
  type ProjectionWeekCandidate,
} from './validate-projection.ts';
import {
  buildProjectionMetadata,
  type ProjectionGenerationMetadata,
  type ProjectionProcessKind,
} from './versions.ts';

function ymdKey(raw: string): CivilDate {
  return (typeof raw === 'string' ? raw.split('T')[0]! : String(raw)) as CivilDate;
}

function todayMadridYmd(): CivilDate {
  const ymd = formatYmdInMadrid(new Date());
  if (!ymd) {
    throw new Error('writeWeeklyProjection: no se pudo obtener fecha Madrid');
  }
  return ymd;
}

export type WriteWeeklyProjectionInput = {
  userId: string;
  /** Lunes inclusive. */
  fromWeekStart: CivilDate;
  /** Lunes inclusive; default = lunes de hoy Madrid. */
  toWeekStart?: CivilDate;
  /** Metadata de proceso (no dominio). Default: writer. */
  processKind?: ProjectionProcessKind;
  /**
   * Si true: liquida + valida + mapea, no escribe BD.
   * Útil para tests / shadow sin persistir.
   */
  dryRun?: boolean;
};

export type WriteWeeklyProjectionSuccess = {
  ok: true;
  userId: string;
  fromWeekStart: CivilDate;
  toWeekStart: CivilDate;
  weeksWritten: number;
  weeksInserted: number;
  weeksUpdated: number;
  rows: WeeklyProjectionDomainRow[];
  metadata: ProjectionGenerationMetadata;
  dryRun: boolean;
};

export type WriteWeeklyProjectionFailure = {
  ok: false;
  error: string;
};

export type WriteWeeklyProjectionResult =
  | WriteWeeklyProjectionSuccess
  | WriteWeeklyProjectionFailure;

function rowFromDb(raw: {
  user_id: string;
  week_start: string;
  week_end: string;
  pending_balance: number | null;
  balance_hours: number | null;
  final_balance: number | null;
  total_hours: number | null;
  ordinary_hours: number | null;
  extra_hours: number | null;
  contracted_hours_snapshot: number;
  total_cost: number | null;
}): WeeklyProjectionDomainRow {
  return {
    user_id: raw.user_id,
    week_start: ymdKey(raw.week_start),
    week_end: ymdKey(raw.week_end),
    pending_balance: raw.pending_balance ?? 0,
    balance_hours: raw.balance_hours ?? 0,
    final_balance: raw.final_balance ?? 0,
    total_hours: raw.total_hours ?? 0,
    ordinary_hours: raw.ordinary_hours ?? 0,
    extra_hours: raw.extra_hours ?? 0,
    contracted_hours_snapshot: raw.contracted_hours_snapshot,
    total_cost: raw.total_cost ?? 0,
  };
}

/**
 * Writer único: hechos → HE → Cost → validar → persistir proyección C.
 */
export async function writeWeeklyProjection(
  client: SupabaseClient,
  input: WriteWeeklyProjectionInput,
): Promise<WriteWeeklyProjectionResult> {
  const userId = input.userId;
  const processKind = input.processKind ?? 'writer';
  const dryRun = input.dryRun === true;
  const metadata = buildProjectionMetadata(processKind);

  let fromWeekStart: CivilDate;
  let toWeekStart: CivilDate;
  try {
    fromWeekStart = mondayOnOrBefore(ymdKey(input.fromWeekStart));
    toWeekStart = mondayOnOrBefore(ymdKey(input.toWeekStart ?? todayMadridYmd()));
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
      error: `writeWeeklyProjection: fromWeekStart (${fromWeekStart}) > toWeekStart (${toWeekStart})`,
    };
  }

  let employee;
  try {
    employee = await loadEmployeeBoundaryFacts(client, userId);
  } catch (err) {
    return {
      ok: false,
      error: `writeWeeklyProjection: frontera empleado: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const timelineStart = employeeTimelineStartWeek(employee);
  // Semilla INV-C01 se comprueba tras cargar logs/overrides (misma cadena que el write).

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
      error: `writeWeeklyProjection: time_logs: ${logsRes.error.message}`,
    };
  }
  if (snapsRes.error) {
    return {
      ok: false,
      error: `writeWeeklyProjection: weekly_snapshots (overrides): ${snapsRes.error.message}`,
    };
  }

  const snapRows = snapsRes.data ?? [];
  const isPaidByWeek = isPaidLookupFromRows(snapRows);
  const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapRows);
  const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(snapRows);

  const engineLogs: TimeLogFact[] = (logsRes.data ?? []).map((l) => ({
    clockInIso: l.clock_in,
    clockOutIso: l.clock_out,
    totalHours: l.total_hours,
  }));

  let openingCarryAtTimelineStart = 0;
  let carryIn: number;
  try {
    if (timelineStart != null) {
      openingCarryAtTimelineStart = resolveOpeningCarryIn({
        employee,
        chainStart: timelineStart,
        logs: engineLogs,
        isPaidByWeek,
        bagModeOverrideByWeek,
      });
    }
    const pre = validateWriterPreconditions({
      employee,
      timelineStart,
      openingCarryAtTimelineStart,
    });
    if (pre) {
      return { ok: false, error: pre.error };
    }

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
      error: `writeWeeklyProjection: opening carry: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const candidates: ProjectionWeekCandidate[] = [];

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
    const isPaid = isPaidByWeek(weekStart);

    try {
      const liquidation = liquidateWeek({
        employee,
        weekStart,
        logs: weekLogs,
        isPaid,
        carryIn,
        bagModeOverride,
      });
      carryIn = liquidation.carryOut;

      const pricing = priceLiquidationOvertime(liquidation, employee, {
        bagModeOverride,
        overrideRate,
      });

      candidates.push({
        liquidation,
        estimatedValue: pricing.estimatedValue,
        overrides: {
          isPaid,
          preferStockHoursOverride: bagModeOverride,
          overtimePriceSnapshot: overrideRate,
        },
      });
    } catch (err) {
      return {
        ok: false,
        error: `writeWeeklyProjection: liquidación/coste ${weekStart}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  const validated = validateProjectionBatch(candidates, { timelineStart });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const rows = validated.rows;

  if (dryRun) {
    return {
      ok: true,
      userId,
      fromWeekStart,
      toWeekStart,
      weeksWritten: 0,
      weeksInserted: 0,
      weeksUpdated: 0,
      rows,
      metadata,
      dryRun: true,
    };
  }

  let weeksInserted = 0;
  let weeksUpdated = 0;

  for (const row of rows) {
    const { data: existing, error: existErr } = await client
      .from('weekly_snapshots')
      .select(
        'user_id, week_start, week_end, pending_balance, balance_hours, final_balance, total_hours, ordinary_hours, extra_hours, contracted_hours_snapshot, total_cost, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
      )
      .eq('user_id', userId)
      .eq('week_start', row.week_start)
      .maybeSingle();

    if (existErr) {
      return {
        ok: false,
        error: `writeWeeklyProjection: existencia ${row.week_start}: ${existErr.message}`,
      };
    }

    if (existing) {
      // INV-J07: no tocar overrides B. Solo UPDATE de C (+ week_end identidad).
      const updatePayload = domainRowToUpdatePayload(row);
      const { error: updErr } = await client
        .from('weekly_snapshots')
        .update(updatePayload)
        .eq('user_id', userId)
        .eq('week_start', row.week_start);

      if (updErr) {
        return {
          ok: false,
          error: `writeWeeklyProjection: UPDATE ${row.week_start}: ${updErr.message}`,
        };
      }
      weeksUpdated += 1;
    } else {
      const insertPayload = domainRowToInsertPayload(row);
      const { error: insErr } = await client
        .from('weekly_snapshots')
        .insert(insertPayload);

      if (insErr) {
        return {
          ok: false,
          error: `writeWeeklyProjection: INSERT ${row.week_start}: ${insErr.message}`,
        };
      }
      weeksInserted += 1;
    }

    const { data: readBack, error: readErr } = await client
      .from('weekly_snapshots')
      .select(
        'user_id, week_start, week_end, pending_balance, balance_hours, final_balance, total_hours, ordinary_hours, extra_hours, contracted_hours_snapshot, total_cost, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
      )
      .eq('user_id', userId)
      .eq('week_start', row.week_start)
      .maybeSingle();

    if (readErr) {
      return {
        ok: false,
        error: `writeWeeklyProjection: read-back ${row.week_start}: ${readErr.message}`,
      };
    }
    if (!readBack) {
      return {
        ok: false,
        error: `writeWeeklyProjection: read-back vacío tras write @ ${row.week_start}`,
      };
    }

    const persisted = rowFromDb(readBack);
    if (!projectionDomainEquals(row, persisted, MONEY_EPS)) {
      return {
        ok: false,
        error: `writeWeeklyProjection: read-back diverge del payload @ ${row.week_start}`,
      };
    }

    // INV-J07: si había fila, overrides B deben permanecer intactos.
    if (existing) {
      const beforePaid = existing.is_paid;
      const beforeBag = existing.prefer_stock_hours_override;
      const beforeRate = existing.overtime_price_snapshot;
      if (
        beforePaid !== readBack.is_paid ||
        beforeBag !== readBack.prefer_stock_hours_override ||
        beforeRate !== readBack.overtime_price_snapshot
      ) {
        return {
          ok: false,
          error: `writeWeeklyProjection: INV-J07 overrides alterados @ ${row.week_start}`,
        };
      }
    }
  }

  return {
    ok: true,
    userId,
    fromWeekStart,
    toWeekStart,
    weeksWritten: weeksInserted + weeksUpdated,
    weeksInserted,
    weeksUpdated,
    rows,
    metadata,
    dryRun: false,
  };
}
