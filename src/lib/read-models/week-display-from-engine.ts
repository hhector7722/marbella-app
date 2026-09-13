/**
 * Read-model de semana: DTO de pintura desde la proyección persistida (v2).
 *
 * Relojes: time_logs. Footer y Ex del día: weekly_snapshots + weekly_snapshot_days.
 * PROHIBIDO: liquidateWeek / liquidateWeekForCard / resolveOpeningCarryIn.
 */

import { addDays, endOfWeek, format, getISOWeek, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extrasFooterFromProjection } from '../hours-engine/extras-footer.ts';
import type { CivilDate, LiquidationResult } from '../hours-engine/types.ts';
import { addCivilDays, mondayOnOrBefore } from '../hours-engine/week-dates.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import {
  aggregateLogsForDay,
  buildEmployeeWeeksFromTimeLogs,
  buildEmployeeWeeksInRange,
  type RawTimeLogForWeek,
} from '../staff/build-employee-weeks-from-logs.ts';
import type { WeekCardSummaryFromEngine } from '../hours-engine/week-card-from-liquidation.ts';
import { netPayableHoursFromLiquidation } from '../hours-engine/week-card-from-liquidation.ts';

const EPS = 1e-9;

const SNAP_SELECT =
  'week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot, pending_balance, balance_hours, final_balance, total_hours, ordinary_hours, extra_hours, contracted_hours_snapshot, total_cost, carry_out, prefer_stock_effective, has_missing_rate, overtime_rate_effective';

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

type ProjectionSnapRow = {
  week_start: string;
  is_paid: boolean | null;
  prefer_stock_hours_override: boolean | null;
  overtime_price_snapshot: number | null;
  pending_balance: number | null;
  balance_hours: number | null;
  final_balance: number | null;
  total_hours: number | null;
  ordinary_hours: number | null;
  extra_hours: number | null;
  contracted_hours_snapshot: number | null;
  total_cost: number | null;
  carry_out: number | null;
  prefer_stock_effective: boolean | null;
  has_missing_rate: boolean | null;
  overtime_rate_effective: number | null;
};

type ProjectionDayRow = {
  week_start: string;
  day: string;
  overtime_hours: number | null;
  overtime_cost: number | null;
};

function weekKey(value: unknown): CivilDate {
  return String(value).split('T')[0]! as CivilDate;
}

function mondayOnOrBeforeYmd(ymd: string): string {
  return mondayOnOrBefore(weekKey(ymd));
}

function num(value: number | null | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function missingProjectionError(weekStart: string): Error {
  return new Error(
    `Proyección v2 ausente para la semana ${weekStart}. Regenerar con el Writer.`,
  );
}

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
  return weekDisplayFromProjectionFields({
    totalHours: summary.totalHours,
    pendingBalance: summary.startBalance,
    extrasFooter: summary.weeklyBalance,
    estimatedValue: summary.hasMissingRate ? null : summary.estimatedValue,
    preferStock: summary.preferStock,
    ordinaryHours: result.ordinaryHours,
    carryOut: result.carryOut,
    finalBalance: summary.finalBalance,
    isPaid: summary.isPaid,
    limitHours: summary.limitHours,
    hourlyRate: summary.hourlyRate,
    hasMissingRate: summary.hasMissingRate,
  });
}

export function weekDisplayFromProjectionFields(input: {
  totalHours: number;
  pendingBalance: number;
  extrasFooter: number;
  estimatedValue: number | null;
  preferStock: boolean;
  ordinaryHours: number;
  carryOut: number;
  finalBalance: number;
  isPaid: boolean;
  limitHours: number;
  hourlyRate: number | null;
  hasMissingRate?: boolean;
}): WeekDisplayDto {
  return {
    displayHours: input.totalHours,
    displayPendingBalance: input.pendingBalance,
    displayExtras: input.extrasFooter,
    displayEstimatedValue: input.estimatedValue,
    displayPreferStock: input.preferStock,
    displayOrdinaryHours: input.ordinaryHours,
    displayCarryOut: input.carryOut,
    displayFinalBalance: input.finalBalance,
    displayIsPaid: input.isPaid,
    displayLimitHours: input.limitHours,
    displayHourlyRate: input.hourlyRate,
    totalHours: input.totalHours,
    startBalance: input.pendingBalance,
    weeklyBalance: input.extrasFooter,
    finalBalance: input.finalBalance,
    estimatedValue: input.estimatedValue,
    preferStock: input.preferStock,
    isPaid: input.isPaid,
    limitHours: input.limitHours,
    hourlyRate: input.hourlyRate,
    hasMissingRate: input.hasMissingRate,
  };
}

function displayFromSnap(snap: ProjectionSnapRow): WeekDisplayDto {
  if (snap.carry_out == null || snap.prefer_stock_effective == null || snap.has_missing_rate == null) {
    throw missingProjectionError(weekKey(snap.week_start));
  }
  const carryIn = num(snap.pending_balance);
  const carryOut = num(snap.carry_out);
  const overtimeHours = num(snap.extra_hours);
  const balanceFinal = num(snap.final_balance);
  const preferStock = snap.prefer_stock_effective === true;
  const extrasFooter = extrasFooterFromProjection({
    preferStock,
    carryIn,
    carryOut,
    overtimeHours,
    balanceFinal,
  });
  const hasMissingRate = snap.has_missing_rate === true;
  return weekDisplayFromProjectionFields({
    totalHours: num(snap.total_hours),
    pendingBalance: carryIn,
    extrasFooter,
    estimatedValue: hasMissingRate ? null : num(snap.total_cost),
    preferStock,
    ordinaryHours: num(snap.ordinary_hours),
    carryOut,
    finalBalance: balanceFinal,
    isPaid: snap.is_paid === true,
    limitHours: num(snap.contracted_hours_snapshot),
    hourlyRate:
      snap.overtime_rate_effective != null && Number.isFinite(Number(snap.overtime_rate_effective))
        ? Number(snap.overtime_rate_effective)
        : null,
    hasMissingRate,
  });
}

function extrasByDayFromRows(
  days: readonly ProjectionDayRow[],
  weekStart: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  let count = 0;
  for (const row of days) {
    if (weekKey(row.week_start) !== weekStart) continue;
    out[weekKey(row.day)] = num(row.overtime_hours);
    count += 1;
  }
  if (count !== 7) {
    throw missingProjectionError(weekStart);
  }
  return out;
}

function flagsFromSnap(snap: ProjectionSnapRow): {
  bag: boolean | null;
  rate: number | null;
} {
  const bag =
    snap.prefer_stock_hours_override === true || snap.prefer_stock_hours_override === false
      ? snap.prefer_stock_hours_override
      : null;
  const rate =
    snap.overtime_price_snapshot != null && Number.isFinite(Number(snap.overtime_price_snapshot))
      ? Number(snap.overtime_price_snapshot)
      : null;
  return { bag, rate };
}

async function loadProjectionWindow(
  supabase: SupabaseClient,
  userId: string,
  fromMonday: string,
  toSunday: string,
): Promise<{
  rawLogs: RawTimeLogForWeek[];
  snapByWeek: Map<string, ProjectionSnapRow>;
  days: ProjectionDayRow[];
}> {
  const toMonday = mondayOnOrBeforeYmd(toSunday);
  const { startIso, endIso } = madridRangeUtcIso(fromMonday, toSunday);
  const [snapsRes, daysRes, logsRes] = await Promise.all([
    supabase
      .from('weekly_snapshots')
      .select(SNAP_SELECT)
      .eq('user_id', userId)
      .gte('week_start', fromMonday)
      .lte('week_start', toMonday),
    supabase
      .from('weekly_snapshot_days')
      .select('week_start, day, overtime_hours, overtime_cost')
      .eq('user_id', userId)
      .gte('week_start', fromMonday)
      .lte('week_start', toMonday),
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
  if (daysRes.error) throw daysRes.error;
  if (logsRes.error) throw logsRes.error;

  const snapByWeek = new Map<string, ProjectionSnapRow>();
  for (const row of (snapsRes.data ?? []) as ProjectionSnapRow[]) {
    snapByWeek.set(weekKey(row.week_start), row);
  }

  return {
    rawLogs: (logsRes.data ?? []) as RawTimeLogForWeek[],
    snapByWeek,
    days: (daysRes.data ?? []) as ProjectionDayRow[],
  };
}

function weekHasAttendance(days: HistoryWeekDto['days']): boolean {
  return days.some(
    (d) => d.hasLog || d.totalHours > 0 || (d.justifiedHours ?? 0) > 0,
  );
}

function emptyCalendarDisplay(): WeekDisplayDto {
  return weekDisplayFromProjectionFields({
    totalHours: 0,
    pendingBalance: 0,
    extrasFooter: 0,
    estimatedValue: 0,
    preferStock: false,
    ordinaryHours: 0,
    carryOut: 0,
    finalBalance: 0,
    isPaid: false,
    limitHours: 0,
    hourlyRate: null,
    hasMissingRate: false,
  });
}

/**
 * Mes / rango: cada semana del calendario. Si hay snapshot, exige v2.
 * Si no hay snapshot y no hay fichajes, es cromo de calendario fuera del
 * horizonte del Writer (no un cero que tape extras). Si hay fichajes sin
 * proyección, falla visible.
 */
function assembleHistoryWeeks(
  mapped: Array<{
    weekNumber?: number;
    startDate: string;
    isCurrentWeek?: boolean;
    days: HistoryWeekDto['days'];
  }>,
  snapByWeek: Map<string, ProjectionSnapRow>,
  dayRows: ProjectionDayRow[],
): HistoryWeekDto[] {
  return mapped.map((week) => {
    const ws = week.startDate.split('T')[0]!;
    const snap = snapByWeek.get(ws);
    if (!snap) {
      if (weekHasAttendance(week.days)) throw missingProjectionError(ws);
      return {
        weekNumber: week.weekNumber ?? getISOWeek(parseISO(ws)),
        startDate: week.startDate,
        isCurrentWeek: week.isCurrentWeek,
        days: week.days,
        summary: {
          ...emptyCalendarDisplay(),
          bagModeOverride: null,
          overtimeRateOverride: null,
        },
      };
    }
    const display = displayFromSnap(snap);
    const extrasByDay = extrasByDayFromRows(dayRows, ws);
    const flags = flagsFromSnap(snap);
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
        ...display,
        bagModeOverride: flags.bag,
        overtimeRateOverride: flags.rate,
      },
    };
  });
}

function isPaidByWeekFromSnaps(snapByWeek: Map<string, ProjectionSnapRow>) {
  return (ws: string) => snapByWeek.get(weekKey(ws))?.is_paid === true;
}

function bagOverrideByWeekFromSnaps(snapByWeek: Map<string, ProjectionSnapRow>) {
  return (ws: string) => {
    const snap = snapByWeek.get(weekKey(ws));
    if (!snap) return null;
    return flagsFromSnap(snap).bag;
  };
}

/**
 * Historial mensual: relojes de las semanas del mes; footer y Ex del día de la proyección.
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

  const { rawLogs, snapByWeek, days } = await loadProjectionWindow(
    supabase,
    userId,
    rangeStart,
    rangeEndSunday,
  );

  const mapped = buildEmployeeWeeksFromTimeLogs({
    filterYear,
    filterMonth,
    logs: rawLogs,
    isPaidByWeek: isPaidByWeekFromSnaps(snapByWeek),
    bagModeOverrideByWeek: bagOverrideByWeekFromSnaps(snapByWeek),
  });

  return assembleHistoryWeeks(mapped, snapByWeek, days);
}

function localDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function historyWeekFromProjection(input: {
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
 * Una semana (mosaico Staff / modal de persona): SELECT de proyección v2 + relojes.
 */
export async function buildEmployeeHistoryWeekFromEngine(
  supabase: SupabaseClient,
  input: { userId: string; weekStart: string },
): Promise<HistoryWeekDto> {
  const weekStart = weekKey(input.weekStart);
  const sunday = addCivilDays(weekStart, 6);
  const { rawLogs, snapByWeek, days } = await loadProjectionWindow(
    supabase,
    input.userId,
    weekStart,
    sunday,
  );
  const snap = snapByWeek.get(weekStart);
  if (!snap) throw missingProjectionError(weekStart);
  const flags = flagsFromSnap(snap);
  const weekLogs = rawLogs.filter((l) => {
    const day = formatYmdInMadrid(l.clock_in as string);
    return day != null && day >= weekStart && day <= sunday;
  });

  return historyWeekFromProjection({
    weekStart,
    rawLogs: weekLogs,
    extrasByDay: extrasByDayFromRows(days, weekStart),
    display: displayFromSnap(snap),
    bagModeOverride: flags.bag,
    overtimeRateOverride: flags.rate,
  });
}

/**
 * Una semana (modal / staff home): footer persistido + relojes.
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
 * Historial en rango (export): misma proyección que el mes.
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

  const { rawLogs, snapByWeek, days } = await loadProjectionWindow(
    supabase,
    userId,
    rangeStartYmd,
    rangeEndYmd,
  );

  const mapped = buildEmployeeWeeksInRange({
    rangeStart,
    rangeEnd,
    logs: rawLogs,
    isPaidByWeek: isPaidByWeekFromSnaps(snapByWeek),
    bagModeOverrideByWeek: bagOverrideByWeekFromSnaps(snapByWeek),
  });

  return assembleHistoryWeeks(mapped, snapByWeek, days);
}
