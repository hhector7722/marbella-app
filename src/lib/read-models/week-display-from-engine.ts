/**
 * Read-model de semana: DTO de pintura desde Hours Engine + Cost Engine.
 *
 * SSOT: liquidateWeekForCard → weekCardSummaryFromLiquidation.
 * PROHIBIDO: derivar extras/importe/bolsa desde columnas crudas del snapshot
 * (extra_hours, total_cost, pending_balance, prefer_stock_hours_override, …).
 *
 * weekly_snapshots solo aporta hechos administrativos:
 * is_paid, prefer_stock_hours_override, overtime_price_snapshot.
 */

import { addDays, endOfWeek, format, getISOWeek, parseISO, startOfWeek } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from '../hours-engine/opening-carry.ts';
import { loadEmployeeBoundaryFacts } from '../hours-engine/load-employee-facts.ts';
import {
  liquidateWeekForCard,
  netPayableHoursFromLiquidation,
  type WeekCardSummaryFromEngine,
} from '../hours-engine/week-card-from-liquidation.ts';
import type { LiquidationResult } from '../hours-engine/types.ts';
import {
  formatMadridHmFromIso,
  formatYmdInMadrid,
  madridRangeUtcIso,
} from '../madrid-date-bounds.ts';
import { buildEmployeeWeeksFromTimeLogs } from '../staff/build-employee-weeks-from-logs.ts';
import { buildEmployeeWeeksInRange } from '../staff/build-employee-weeks-from-logs.ts';

const EPS = 1e-9;

/** DTO final para pintar. Sin lógica en el cliente. */
export type WeekDisplayDto = {
  /** HORAS */
  displayHours: number;
  /** PENDIENTES (= carryIn) */
  displayPendingBalance: number;
  /** EXTRAS (footer HE; 0 si carryOut < 0) */
  displayExtras: number;
  /** IMPORTE (Cost Engine; null si falta tarifa) */
  displayEstimatedValue: number | null;
  displayPreferStock: boolean;
  displayOrdinaryHours: number;
  displayCarryOut: number;
  displayFinalBalance: number;
  displayIsPaid: boolean;
  displayLimitHours: number;
  displayHourlyRate: number | null;

  // Aliases estables para WeekCard / modal (mismos nombres históricos)
  totalHours: number;
  startBalance: number;
  weeklyBalance: number;
  finalBalance: number;
  estimatedValue: number | null;
  preferStock: boolean;
  isPaid: boolean;
  limitHours: number;
  hourlyRate: number | null;
  hasMissingRate?: boolean;
};

export type WeekFooterDto = WeekDisplayDto;

export type HistoryWeekDto = {
  weekNumber: number;
  startDate: string;
  isCurrentWeek?: boolean;
  days: Array<{
    date: string;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    clock_out_show_no_registrada?: boolean;
    totalHours: number;
    extraHours: number;
    eventType: string;
    isToday: boolean;
    justifiedHours?: number;
  }>;
  summary: WeekDisplayDto & {
    bagModeOverride?: boolean | null;
    overtimeRateOverride?: number | null;
  };
};

/**
 * Invariantes arquitectónicos del DTO de lectura.
 * Si fallan, el read-model está corrupto (no se pinta basura).
 */
export function assertWeekDisplayInvariants(
  result: LiquidationResult,
  summary: WeekCardSummaryFromEngine,
  bagModeOverride?: boolean | null,
): void {
  if (result.carryOut < -EPS) {
    if (summary.weeklyBalance > EPS) {
      throw new Error(
        `Invariante display: carryOut=${result.carryOut} < 0 pero displayExtras=${summary.weeklyBalance}`,
      );
    }
    if (summary.estimatedValue != null && summary.estimatedValue > EPS) {
      throw new Error(
        `Invariante display: carryOut=${result.carryOut} < 0 pero displayEstimatedValue=${summary.estimatedValue}`,
      );
    }
  }

  const netPayable = netPayableHoursFromLiquidation(result, bagModeOverride);
  if (summary.preferStock && netPayable <= EPS && summary.estimatedValue != null && summary.estimatedValue > EPS) {
    throw new Error(
      `Invariante display: bolsa + netPayable=0 pero displayEstimatedValue=${summary.estimatedValue}`,
    );
  }
}

export function weekDisplayFromEngine(
  result: LiquidationResult,
  summary: WeekCardSummaryFromEngine,
  bagModeOverride?: boolean | null,
): WeekDisplayDto {
  assertWeekDisplayInvariants(result, summary, bagModeOverride);
  return {
    displayHours: summary.totalHours,
    displayPendingBalance: summary.startBalance,
    displayExtras: summary.weeklyBalance,
    displayEstimatedValue: summary.estimatedValue,
    displayPreferStock: summary.preferStock,
    displayOrdinaryHours: result.ordinaryHours,
    displayCarryOut: result.carryOut,
    displayFinalBalance: summary.finalBalance,
    displayIsPaid: summary.isPaid,
    displayLimitHours: summary.limitHours,
    displayHourlyRate: summary.hourlyRate,
    totalHours: summary.totalHours,
    startBalance: summary.startBalance,
    weeklyBalance: summary.weeklyBalance,
    finalBalance: summary.finalBalance,
    estimatedValue: summary.estimatedValue,
    preferStock: summary.preferStock,
    isPaid: summary.isPaid,
    limitHours: summary.limitHours,
    hourlyRate: summary.hourlyRate,
    hasMissingRate: summary.hasMissingRate,
  };
}

function mondayOnOrBeforeYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return format(dt, 'yyyy-MM-dd');
}

async function loadAdminFlagsAndLogs(
  supabase: SupabaseClient,
  userId: string,
  chainStart: string,
  rangeEndSunday: string,
) {
  const employee = await loadEmployeeBoundaryFacts(supabase, userId);
  const timelineStart = employeeTimelineStartWeek(employee);
  const logsFrom =
    timelineStart && timelineStart < chainStart ? timelineStart : chainStart;
  const { startIso, endIso } = madridRangeUtcIso(logsFrom, rangeEndSunday);

  const [snapsRes, logsRes] = await Promise.all([
    supabase
      .from('weekly_snapshots')
      .select('week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot')
      .eq('user_id', userId)
      .gte('week_start', logsFrom)
      .lte('week_start', mondayOnOrBeforeYmd(rangeEndSunday)),
    supabase
      .from('time_logs')
      .select(
        'clock_in, clock_out, total_hours, justified_hours, event_type, clock_out_show_no_registrada',
      )
      .eq('user_id', userId)
      .gte('clock_in', startIso)
      .lte('clock_in', endIso),
  ]);

  if (snapsRes.error) throw snapsRes.error;
  if (logsRes.error) throw logsRes.error;

  const snapRows = snapsRes.data ?? [];
  const isPaidByWeek = isPaidLookupFromRows(snapRows);
  const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapRows);
  const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(snapRows);

  const engineLogs = (logsRes.data ?? []).map((l) => ({
    clockInIso: l.clock_in as string,
    clockOutIso: l.clock_out as string | null,
    totalHours: l.total_hours as number | null,
  }));

  const flagsByWeek = new Map<
    string,
    { bag: boolean | null; rate: number | null }
  >();
  for (const r of snapRows) {
    const key = String(r.week_start).split('T')[0]!;
    const bag =
      r.prefer_stock_hours_override === true || r.prefer_stock_hours_override === false
        ? r.prefer_stock_hours_override
        : null;
    const rate =
      r.overtime_price_snapshot != null && Number.isFinite(Number(r.overtime_price_snapshot))
        ? Number(r.overtime_price_snapshot)
        : null;
    flagsByWeek.set(key, { bag, rate });
  }

  return {
    employee,
    logsFrom,
    engineLogs,
    rawLogs: logsRes.data ?? [],
    isPaidByWeek,
    bagModeOverrideByWeek,
    overtimeRateOverrideByWeek,
    flagsByWeek,
  };
}

function liquidateChainFooters(input: {
  employee: Awaited<ReturnType<typeof loadEmployeeBoundaryFacts>>;
  weekStarts: string[];
  engineLogs: Array<{
    clockInIso: string;
    clockOutIso: string | null;
    totalHours: number | null;
  }>;
  isPaidByWeek: (ws: string) => boolean;
  bagModeOverrideByWeek: (ws: string) => boolean | null;
  overtimeRateOverrideByWeek: (ws: string) => number | null;
  chainStart: string;
}): Map<string, { display: WeekDisplayDto; extrasByDay: Readonly<Record<string, number>> }> {
  const out = new Map<
    string,
    { display: WeekDisplayDto; extrasByDay: Readonly<Record<string, number>> }
  >();
  if (input.weekStarts.length === 0) return out;

  let carryIn = resolveOpeningCarryIn({
    employee: input.employee,
    chainStart: input.chainStart,
    logs: input.engineLogs,
    isPaidByWeek: input.isPaidByWeek,
    bagModeOverrideByWeek: input.bagModeOverrideByWeek,
  });

  for (const weekStart of input.weekStarts) {
    const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');
    const weekLogs = input.engineLogs.filter((l) => {
      const day = formatYmdInMadrid(l.clockInIso);
      return day != null && day >= weekStart && day <= weekEnd;
    });
    const bagModeOverride = input.bagModeOverrideByWeek(weekStart);
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      employee: input.employee,
      weekStart,
      logs: weekLogs,
      isPaid: input.isPaidByWeek(weekStart),
      carryIn,
      bagModeOverride,
      overrideRate: input.overtimeRateOverrideByWeek(weekStart),
    });
    carryIn = result.carryOut;
    out.set(weekStart, {
      display: weekDisplayFromEngine(result, summary, bagModeOverride),
      extrasByDay: extrasByDay as Readonly<Record<string, number>>,
    });
  }
  return out;
}

/**
 * Historial mensual: relojes desde time_logs; footer desde HE/Cost Engine.
 */
export async function buildEmployeeHistoryMonthFromEngine(
  supabase: SupabaseClient,
  input: {
    userId: string;
    filterYear: number;
    filterMonth: number;
  },
): Promise<HistoryWeekDto[]> {
  const { userId, filterYear, filterMonth } = input;
  const monthStart = new Date(filterYear, filterMonth, 1);
  const monthEnd = new Date(filterYear, filterMonth + 1, 0);
  const rangeStart = mondayOnOrBeforeYmd(format(monthStart, 'yyyy-MM-dd'));
  const rangeEndSunday = format(
    addDays(parseISO(mondayOnOrBeforeYmd(format(monthEnd, 'yyyy-MM-dd'))), 6),
    'yyyy-MM-dd',
  );

  const ctx = await loadAdminFlagsAndLogs(
    supabase,
    userId,
    rangeStart,
    rangeEndSunday,
  );

  const mapped = buildEmployeeWeeksFromTimeLogs({
    filterYear,
    filterMonth,
    logs: ctx.rawLogs,
    isPaidByWeek: (ws) => ctx.isPaidByWeek(ws),
    bagModeOverrideByWeek: (ws) => ctx.bagModeOverrideByWeek(ws),
  });

  const weekStarts = [
    ...new Set(mapped.map((w) => w.startDate.split('T')[0]!)),
  ].sort();

  const footers = liquidateChainFooters({
    employee: ctx.employee,
    weekStarts,
    engineLogs: ctx.engineLogs,
    isPaidByWeek: ctx.isPaidByWeek,
    bagModeOverrideByWeek: ctx.bagModeOverrideByWeek,
    overtimeRateOverrideByWeek: ctx.overtimeRateOverrideByWeek,
    chainStart: weekStarts[0] ?? rangeStart,
  });

  return mapped.map((week) => {
    const ws = week.startDate.split('T')[0]!;
    const entry = footers.get(ws);
    if (!entry) {
      throw new Error(`Read-model HE: sin footer para semana ${ws}`);
    }
    const { display: footer, extrasByDay } = entry;
    const flags = ctx.flagsByWeek.get(ws);

    return {
      weekNumber: week.weekNumber ?? getISOWeek(parseISO(ws)),
      startDate: week.startDate,
      isCurrentWeek: week.isCurrentWeek,
      days: week.days.map((d) => {
        const dayKey = typeof d.date === 'string' ? d.date.split('T')[0]! : String(d.date);
        return {
          ...d,
          extraHours: Number(extrasByDay[dayKey]) || 0,
        };
      }),
      summary: {
        ...footer,
        bagModeOverride: flags?.bag ?? null,
        overtimeRateOverride: flags?.rate ?? null,
      },
    };
  });
}

/**
 * Una semana (modal / staff home): footer HE + relojes.
 */
export async function buildWeekDetailFromEngine(
  supabase: SupabaseClient,
  input: { userId: string; weekStart: string },
): Promise<{
  workerName: string;
  days: Array<{
    date: string;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
    extraHours: number;
  }>;
  summary: WeekDisplayDto;
}> {
  const weekStart = input.weekStart.split('T')[0]!;
  const sunday = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

  const [{ data: profile }, ctx] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', input.userId)
      .maybeSingle(),
    loadAdminFlagsAndLogs(supabase, input.userId, weekStart, sunday),
  ]);

  const name =
    `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || '—';

  const bagModeOverride = ctx.bagModeOverrideByWeek(weekStart);
  const carryIn = resolveOpeningCarryIn({
    employee: ctx.employee,
    chainStart: weekStart,
    logs: ctx.engineLogs,
    isPaidByWeek: ctx.isPaidByWeek,
    bagModeOverrideByWeek: ctx.bagModeOverrideByWeek,
  });

  const weekLogs = ctx.engineLogs.filter((l) => {
    const day = formatYmdInMadrid(l.clockInIso);
    return day != null && day >= weekStart && day <= sunday;
  });

  const { result, summary, extrasByDay } = liquidateWeekForCard({
    employee: ctx.employee,
    weekStart,
    logs: weekLogs,
    isPaid: ctx.isPaidByWeek(weekStart),
    carryIn,
    bagModeOverride,
    overrideRate: ctx.overtimeRateOverrideByWeek(weekStart),
  });

  const display = weekDisplayFromEngine(result, summary, bagModeOverride);

  const days: Array<{
    date: string;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
    extraHours: number;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const d = format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd');
    const dayLogs = (ctx.rawLogs ?? []).filter(
      (l) => formatYmdInMadrid(l.clock_in as string) === d,
    );
    const first = dayLogs[0] as
      | { clock_in?: string; clock_out?: string | null; total_hours?: number | null }
      | undefined;
    days.push({
      date: d,
      hasLog: dayLogs.length > 0,
      clockIn: first?.clock_in ? formatMadridHmFromIso(first.clock_in) : null,
      clockOut: first?.clock_out ? formatMadridHmFromIso(first.clock_out) : null,
      totalHours: dayLogs.reduce(
        (s, l) => s + (Number((l as { total_hours?: number }).total_hours) || 0),
        0,
      ),
      extraHours: Number(extrasByDay[d as keyof typeof extrasByDay]) || 0,
    });
  }

  return { workerName: name, days, summary: display };
}

/**
 * Historial en rango (export): relojes + footers HE.
 */
export async function buildEmployeeHistoryRangeFromEngine(
  supabase: SupabaseClient,
  input: {
    userId: string;
    rangeStart: Date;
    rangeEnd: Date;
  },
): Promise<HistoryWeekDto[]> {
  const { userId, rangeStart, rangeEnd } = input;
  const rangeStartYmd = format(startOfWeek(rangeStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const rangeEndYmd = format(endOfWeek(rangeEnd, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const ctx = await loadAdminFlagsAndLogs(
    supabase,
    userId,
    rangeStartYmd,
    rangeEndYmd,
  );

  const mapped = buildEmployeeWeeksInRange({
    rangeStart,
    rangeEnd,
    logs: ctx.rawLogs,
    isPaidByWeek: (ws) => ctx.isPaidByWeek(ws),
    bagModeOverrideByWeek: (ws) => ctx.bagModeOverrideByWeek(ws),
  });

  const weekStarts = [
    ...new Set(mapped.map((w) => w.startDate.split('T')[0]!)),
  ].sort();

  const footers = liquidateChainFooters({
    employee: ctx.employee,
    weekStarts,
    engineLogs: ctx.engineLogs,
    isPaidByWeek: ctx.isPaidByWeek,
    bagModeOverrideByWeek: ctx.bagModeOverrideByWeek,
    overtimeRateOverrideByWeek: ctx.overtimeRateOverrideByWeek,
    chainStart: weekStarts[0] ?? rangeStartYmd,
  });

  return mapped.map((week) => {
    const ws = week.startDate.split('T')[0]!;
    const entry = footers.get(ws);
    if (!entry) {
      throw new Error(`Read-model HE: sin footer para semana ${ws}`);
    }
    const { display: footer, extrasByDay } = entry;
    const flags = ctx.flagsByWeek.get(ws);
    return {
      weekNumber: week.weekNumber ?? getISOWeek(parseISO(ws)),
      startDate: week.startDate,
      isCurrentWeek: week.isCurrentWeek,
      days: week.days.map((d) => {
        const dayKey = typeof d.date === 'string' ? d.date.split('T')[0]! : String(d.date);
        return {
          ...d,
          extraHours: Number(extrasByDay[dayKey]) || 0,
        };
      }),
      summary: {
        ...footer,
        bagModeOverride: flags?.bag ?? null,
        overtimeRateOverride: flags?.rate ?? null,
      },
    };
  });
}
