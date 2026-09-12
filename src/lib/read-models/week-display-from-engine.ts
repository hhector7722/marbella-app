/**
 * Read-model de semana: DTO de pintura desde Hours Engine + Cost Engine.
 *
 * SSOT: liquidateWeekForCard → weekCardSummaryFromLiquidation.
 * PROHIBIDO: derivar extras/importe/bolsa desde extra_hours o total_cost.
 *
 * weekly_snapshots aporta hechos administrativos (is_paid, overrides)
 * y, en la tarjeta suelta, `pending_balance` como carryIn persistido (INV-J01).
 * El desglose diario no está en esa fila: relojes y Ex del día salen de
 * time_logs de esa semana + una liquidación.
 */

import { addDays, endOfWeek, format, getISOWeek, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from '../hours-engine/opening-carry.ts';
import { resolveWeekCardCarryIn } from '../hours-engine/week-card-carry-in.ts';
import { loadEmployeeBoundaryFacts } from '../hours-engine/load-employee-facts.ts';
import {
  liquidateWeekForCard,
  netPayableHoursFromLiquidation,
  type WeekCardSummaryFromEngine,
} from '../hours-engine/week-card-from-liquidation.ts';
import type { CivilDate, LiquidationResult } from '../hours-engine/types.ts';
import {
  addCivilDays,
  previousWeekStart,
} from '../hours-engine/week-dates.ts';
import {
  formatYmdInMadrid,
  madridRangeUtcIso,
} from '../madrid-date-bounds.ts';
import {
  aggregateLogsForDay,
  buildEmployeeWeeksFromTimeLogs,
  buildEmployeeWeeksInRange,
  type RawTimeLogForWeek,
} from '../staff/build-employee-weeks-from-logs.ts';

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

type WeekCardSnapRow = {
  week_start: string;
  is_paid: boolean | null;
  prefer_stock_hours_override?: boolean | null;
  overtime_price_snapshot?: number | null;
  pending_balance?: number | null;
};

function weekKey(value: unknown): CivilDate {
  return String(value).split('T')[0]! as CivilDate;
}

function localDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function pendingBalanceFromRow(row: WeekCardSnapRow): number {
  const n = Number(row.pending_balance);
  return Number.isFinite(n) ? n : 0;
}

function engineLogsInWeek(
  logs: Array<{ clockInIso: string; clockOutIso: string | null; totalHours: number | null }>,
  weekStart: CivilDate,
  sunday: CivilDate,
) {
  return logs.filter((l) => {
    const day = formatYmdInMadrid(l.clockInIso);
    return day != null && day >= weekStart && day <= sunday;
  });
}

async function loadWeekCardWindow(
  supabase: SupabaseClient,
  userId: string,
  weekStart: CivilDate,
) {
  const sunday = addCivilDays(weekStart, 6);
  const prevMonday = previousWeekStart(weekStart);
  const { startIso, endIso } = madridRangeUtcIso(prevMonday, sunday);

  const [employee, snapsRes, logsRes] = await Promise.all([
    loadEmployeeBoundaryFacts(supabase, userId),
    supabase
      .from('weekly_snapshots')
      .select(
        'week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot, pending_balance',
      )
      .eq('user_id', userId)
      .in('week_start', [prevMonday, weekStart]),
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

  const snapByWeek = new Map<string, WeekCardSnapRow>();
  for (const row of (snapsRes.data ?? []) as WeekCardSnapRow[]) {
    snapByWeek.set(weekKey(row.week_start), row);
  }

  const rawLogs = (logsRes.data ?? []) as RawTimeLogForWeek[];
  const engineLogs = rawLogs.map((l) => ({
    clockInIso: l.clock_in as string,
    clockOutIso: l.clock_out as string | null,
    totalHours: l.total_hours as number | null,
  }));

  return { employee, sunday, prevMonday, snapByWeek, rawLogs, engineLogs };
}

function historyWeekFromLiquidation(input: {
  weekStart: CivilDate;
  rawLogs: RawTimeLogForWeek[];
  extrasByDay: Readonly<Record<string, number>>;
  display: WeekDisplayDto;
  bagModeOverride: boolean | null;
  overtimeRateOverride: number | null;
}): HistoryWeekDto {
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addCivilDays(input.weekStart, i);
    const agg = aggregateLogsForDay(
      input.rawLogs.filter((l) => formatYmdInMadrid(l.clock_in as string) === date),
    );
    const local = localDateFromYmd(date);
    return {
      date,
      dayName: format(local, 'EEE', { locale: es }),
      dayNumber: local.getDate(),
      hasLog: agg.hasLog,
      clockIn: agg.clockIn,
      clockOut: agg.clockOut,
      clock_out_show_no_registrada: agg.clock_out_show_no_registrada,
      totalHours: agg.totalHours,
      extraHours: Number(input.extrasByDay[date]) || 0,
      eventType: agg.eventType,
      isToday: isSameDay(local, today),
      justifiedHours: agg.justifiedHours,
    };
  });

  return {
    weekNumber: getISOWeek(localDateFromYmd(input.weekStart)),
    startDate: input.weekStart,
    isCurrentWeek: isSameDay(localDateFromYmd(input.weekStart), currentWeekStart),
    days,
    summary: {
      ...input.display,
      bagModeOverride: input.bagModeOverride,
      overtimeRateOverride: input.overtimeRateOverride,
    },
  };
}

/**
 * Una semana (mosaico Staff / modal de persona): carryIn del snapshot,
 * fichajes de como máximo dos semanas, una liquidación de la semana vista.
 */
export async function buildEmployeeHistoryWeekFromEngine(
  supabase: SupabaseClient,
  input: { userId: string; weekStart: string },
): Promise<HistoryWeekDto> {
  const weekStart = weekKey(input.weekStart);
  const window = await loadWeekCardWindow(supabase, input.userId, weekStart);
  const thisSnap = window.snapByWeek.get(weekStart) ?? null;
  const prevSnap = window.snapByWeek.get(window.prevMonday) ?? null;

  const resolved = resolveWeekCardCarryIn({
    weekStart,
    employee: window.employee,
    thisWeekSnapshot: thisSnap
      ? { pendingBalance: pendingBalanceFromRow(thisSnap) }
      : null,
    previousWeek:
      prevSnap != null
        ? {
            snapshot: { pendingBalance: pendingBalanceFromRow(prevSnap) },
            logs: engineLogsInWeek(
              window.engineLogs,
              window.prevMonday,
              addCivilDays(window.prevMonday, 6),
            ),
            isPaid: prevSnap.is_paid === true,
            bagModeOverride:
              prevSnap.prefer_stock_hours_override === true ||
              prevSnap.prefer_stock_hours_override === false
                ? prevSnap.prefer_stock_hours_override
                : null,
          }
        : null,
  });

  let carryIn = resolved.source === 'needs-full-replay' ? 0 : resolved.carryIn;
  let isPaid = thisSnap?.is_paid === true;
  let bagModeOverride: boolean | null =
    thisSnap?.prefer_stock_hours_override === true ||
    thisSnap?.prefer_stock_hours_override === false
      ? thisSnap.prefer_stock_hours_override
      : null;
  let overtimeRateOverride: number | null =
    thisSnap?.overtime_price_snapshot != null &&
    Number.isFinite(Number(thisSnap.overtime_price_snapshot))
      ? Number(thisSnap.overtime_price_snapshot)
      : null;
  let weekLogs = engineLogsInWeek(window.engineLogs, weekStart, window.sunday);
  let rawLogs = window.rawLogs.filter((l) => {
    const day = formatYmdInMadrid(l.clock_in as string);
    return day != null && day >= weekStart && day <= window.sunday;
  });

  if (resolved.source === 'needs-full-replay') {
    const ctx = await loadAdminFlagsAndLogs(
      supabase,
      input.userId,
      weekStart,
      window.sunday,
    );
    carryIn = resolveOpeningCarryIn({
      employee: ctx.employee,
      chainStart: weekStart,
      logs: ctx.engineLogs,
      isPaidByWeek: ctx.isPaidByWeek,
      bagModeOverrideByWeek: ctx.bagModeOverrideByWeek,
    });
    isPaid = ctx.isPaidByWeek(weekStart);
    bagModeOverride = ctx.bagModeOverrideByWeek(weekStart);
    overtimeRateOverride = ctx.overtimeRateOverrideByWeek(weekStart);
    weekLogs = engineLogsInWeek(ctx.engineLogs, weekStart, window.sunday);
    rawLogs = (ctx.rawLogs as RawTimeLogForWeek[]).filter((l) => {
      const day = formatYmdInMadrid(l.clock_in as string);
      return day != null && day >= weekStart && day <= window.sunday;
    });
  }

  const { result, summary, extrasByDay } = liquidateWeekForCard({
    employee: window.employee,
    weekStart,
    logs: weekLogs,
    isPaid,
    carryIn,
    bagModeOverride,
    overrideRate: overtimeRateOverride,
  });

  return historyWeekFromLiquidation({
    weekStart,
    rawLogs,
    extrasByDay,
    display: weekDisplayFromEngine(result, summary, bagModeOverride),
    bagModeOverride,
    overtimeRateOverride,
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
  const [{ data: profile }, week] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', input.userId)
      .maybeSingle(),
    buildEmployeeHistoryWeekFromEngine(supabase, input),
  ]);

  const name =
    `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || '—';

  return {
    workerName: name,
    days: week.days.map((d) => ({
      date: d.date,
      hasLog: d.hasLog,
      clockIn: d.clockIn,
      clockOut: d.clockOut,
      totalHours: d.totalHours,
      extraHours: d.extraHours,
    })),
    summary: week.summary,
  };
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
