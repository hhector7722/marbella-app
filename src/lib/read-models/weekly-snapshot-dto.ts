/**
 * Read-models de asistencia / extras / coste OT.
 * SOLO lectura de hechos persistidos (weekly_snapshots + time_logs para relojes).
 * PROHIBIDO: liquidateWeek*, price*Overtime, resolveOpeningCarryIn, HE/Cost Engine.
 */

import { addDays, endOfWeek, format, getISOWeek, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatMadridHmFromIso,
  formatYmdInMadrid,
  madridRangeUtcIso,
} from '@/lib/madrid-date-bounds';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import { allocatePayrollToNaturalDays, monthKeysCovering } from '@/lib/hours-engine/payroll-ordinary-daily';
import { buildEmployeeWeeksFromTimeLogs } from '@/lib/staff/build-employee-weeks-from-logs';
import { buildEmployeeWeeksInRange } from '@/lib/staff/build-employee-weeks-from-logs';

export type SnapshotWeekRow = {
  user_id: string;
  week_start: string;
  week_end?: string | null;
  total_hours: number | null;
  ordinary_hours: number | null;
  extra_hours: number | null;
  balance_hours: number | null;
  pending_balance: number | null;
  final_balance: number | null;
  contracted_hours_snapshot: number | null;
  total_cost: number | null;
  is_paid: boolean | null;
  prefer_stock_hours_override: boolean | null;
  overtime_price_snapshot: number | null;
};

export type WeekFooterDto = {
  totalHours: number;
  startBalance: number;
  weeklyBalance: number;
  finalBalance: number;
  estimatedValue: number;
  isPaid: boolean;
  preferStock: boolean;
  limitHours: number;
  hourlyRate: number;
};

export function weekStartKey(raw: string): string {
  return String(raw).split('T')[0]!;
}

export function footerFromSnapshot(row: SnapshotWeekRow): WeekFooterDto {
  const preferStock = row.prefer_stock_hours_override === true;
  const extra = Number(row.extra_hours) || 0;
  const balance = Number(row.balance_hours) || 0;
  // EXTRAS UI: crédito positivo de la semana (extra_hours; si 0, balance_hours > 0).
  const weeklyBalance = Math.max(0, extra > 0.005 ? extra : balance);
  const rate =
    row.overtime_price_snapshot != null && Number.isFinite(Number(row.overtime_price_snapshot))
      ? Number(row.overtime_price_snapshot)
      : 0;
  return {
    totalHours: Number(row.total_hours) || 0,
    startBalance: Number(row.pending_balance) || 0,
    weeklyBalance,
    finalBalance: Number(row.final_balance) || 0,
    estimatedValue: Number(row.total_cost) || 0,
    isPaid: row.is_paid === true,
    preferStock,
    limitHours: Number(row.contracted_hours_snapshot) || 0,
    hourlyRate: rate,
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

function listMondaysInRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = mondayOnOrBeforeYmd(startYmd);
  const end = endYmd.split('T')[0]!;
  const rangeStart = startYmd.split('T')[0]!;
  while (cur <= end) {
    const sunday = format(addDays(parseISO(cur), 6), 'yyyy-MM-dd');
    if (sunday >= rangeStart && cur <= end) out.push(cur);
    cur = format(addDays(parseISO(cur), 7), 'yyyy-MM-dd');
  }
  return out;
}

function todayMadridYmd(): string {
  return formatYmdInMadrid(new Date().toISOString());
}

function isCompletedWeekMonday(weekMondayYmd: string, todayMadridYmdStr: string): boolean {
  const sunday = format(addDays(parseISO(weekMondayYmd), 6), 'yyyy-MM-dd');
  return sunday < todayMadridYmdStr;
}

export type StaffWeeklyStatsDto = {
  id: string;
  name: string;
  role: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  totalCost: number;
  regularCost: number;
  overtimeCost: number;
  isPaid: boolean;
  preferStock?: boolean;
};

export type WeeklyStatsDto = {
  weekId: string;
  label: string;
  startDate: Date;
  totalAmount: number;
  totalHours: number;
  staff: StaffWeeklyStatsDto[];
};

/**
 * Overtime / dashboards: solo weekly_snapshots (+ profiles para nombre).
 */
export async function buildOvertimeWeeksFromSnapshots(
  supabase: SupabaseClient,
  options: {
    startDate: string;
    endDate: string;
    userId?: string | null;
    onlyCompletedWeeks?: boolean;
  },
): Promise<{
  weeksResult: WeeklyStatsDto[];
  summary: { totalCost: number; totalHours: number; totalOvertimeCost: number };
}> {
  const startDate = options.startDate.split('T')[0]!;
  const endDate = options.endDate.split('T')[0]!;
  const onlyCompleted = options.onlyCompletedWeeks !== false;
  const today = todayMadridYmd();

  let mondays = listMondaysInRange(startDate, endDate);
  if (onlyCompleted) {
    mondays = mondays.filter((m) => isCompletedWeekMonday(m, today));
  }
  if (mondays.length === 0) {
    return {
      weeksResult: [],
      summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 },
    };
  }

  const firstMonday = mondays[0]!;
  const lastMonday = mondays[mondays.length - 1]!;

  const overtimeProfileSelect =
    'id, first_name, last_name, avatar_url, role, visible_in_plantilla' as const;

  let profilesQuery = supabase
    .from('profiles')
    .select(overtimeProfileSelect)
    .eq('visible_in_plantilla', true)
    .order('first_name');

  if (options.userId) {
    profilesQuery = supabase
      .from('profiles')
      .select(overtimeProfileSelect)
      .eq('id', options.userId);
  }

  const { data: profileRows, error: profileErr } = await profilesQuery;
  if (profileErr) throw profileErr;

  const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  let snapsQuery = supabase
    .from('weekly_snapshots')
    .select(
      'user_id, week_start, week_end, total_hours, ordinary_hours, extra_hours, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, total_cost, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
    )
    .gte('week_start', firstMonday)
    .lte('week_start', lastMonday);

  if (options.userId) {
    snapsQuery = snapsQuery.eq('user_id', options.userId);
  } else {
    const ids = profiles.map((p) => p.id);
    if (ids.length === 0) {
      return {
        weeksResult: [],
        summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 },
      };
    }
    snapsQuery = snapsQuery.in('user_id', ids);
  }

  const { data: snaps, error: snapsErr } = await snapsQuery;
  if (snapsErr) throw snapsErr;

  const mondaySet = new Set(mondays);
  const staffByWeek = new Map<string, StaffWeeklyStatsDto[]>();
  for (const m of mondays) staffByWeek.set(m, []);

  for (const raw of snaps ?? []) {
    const row = raw as SnapshotWeekRow;
    const weekId = weekStartKey(row.week_start);
    if (!mondaySet.has(weekId)) continue;
    const profile = profileById.get(row.user_id);
    if (!profile && !options.userId) continue;

    const footer = footerFromSnapshot(row);
    const name = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—'
      : '—';
    const role = profile?.role ?? 'staff';

    const hasActivity =
      Math.abs(footer.totalHours) > 0.005 ||
      Math.abs(footer.estimatedValue) > 0.005 ||
      Math.abs(footer.weeklyBalance) > 0.005 ||
      Math.abs(footer.finalBalance) > 0.005 ||
      Math.abs(footer.startBalance) > 0.005;

    if (!hasActivity) continue;

    staffByWeek.get(weekId)!.push({
      id: row.user_id,
      name,
      role,
      totalHours: footer.totalHours,
      regularHours: Math.max(0, footer.totalHours - footer.weeklyBalance),
      overtimeHours: footer.weeklyBalance,
      totalCost: footer.estimatedValue,
      regularCost: 0,
      overtimeCost: footer.estimatedValue,
      isPaid: footer.isPaid,
      preferStock: footer.preferStock,
    });
  }

  const weeksResult: WeeklyStatsDto[] = [...mondays]
    .reverse()
    .map((weekStart) => {
      const staff = (staffByWeek.get(weekStart) ?? []).sort(
        (a, b) => b.totalCost - a.totalCost,
      );
      const totalAmount = staff.reduce((s, x) => s + x.totalCost, 0);
      const totalHours = staff.reduce((s, x) => s + x.totalHours, 0);
      const monday = parseISO(weekStart);
      return {
        weekId: weekStart,
        label: `Semana del ${format(monday, "dd 'de' MMMM", { locale: es })}`,
        startDate: monday,
        totalAmount,
        totalHours,
        staff,
      };
    })
    .filter((w) => w.staff.length > 0);

  const summary = {
    totalCost: weeksResult.reduce((s, w) => s + w.totalAmount, 0),
    totalHours: weeksResult.reduce((s, w) => s + w.totalHours, 0),
    totalOvertimeCost: weeksResult.reduce((s, w) => s + w.totalAmount, 0),
  };

  return { weeksResult, summary };
}

export type LaborDayCellDto = { total: number; fixed: number; overtime: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Labor: fijo = nómina; extras = Σ total_cost de snapshots (importe en lunes de cada semana).
 * Sin HE / sin prorrateo por extrasByDay.
 */
export async function buildLaborCostPeriodFromSnapshots(
  supabase: SupabaseClient,
  options: { startDate: string; endDate: string; userId?: string | null },
): Promise<{
  byDate: Record<string, LaborDayCellDto>;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
  missingPayrollMonths: string[];
}> {
  const startDate = options.startDate.split('T')[0]!;
  const endDate = options.endDate.split('T')[0]!;
  const today = todayMadridYmd();
  const effectiveEnd = endDate > today ? today : endDate;

  const byDate: Record<string, LaborDayCellDto> = {};
  const ensure = (iso: string) => {
    if (!byDate[iso]) byDate[iso] = { total: 0, fixed: 0, overtime: 0 };
    return byDate[iso]!;
  };

  const firstMonday = mondayOnOrBeforeYmd(startDate);
  const lastMonday = mondayOnOrBeforeYmd(effectiveEnd);

  let snapsQuery = supabase
    .from('weekly_snapshots')
    .select('user_id, week_start, total_cost')
    .gte('week_start', firstMonday)
    .lte('week_start', lastMonday);

  if (options.userId) {
    snapsQuery = snapsQuery.eq('user_id', options.userId);
  } else {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT)
      .eq('visible_in_plantilla', true);
    if (pErr) throw pErr;
    const ids = filterVisiblePlantillaEmployees(profiles ?? []).map((p) => p.id);
    if (ids.length === 0) {
      // sigue con nómina
    } else {
      snapsQuery = snapsQuery.in('user_id', ids);
    }
  }

  const { data: snaps, error: snapsErr } = await snapsQuery;
  if (snapsErr) throw snapsErr;

  for (const row of snaps ?? []) {
    const weekStart = weekStartKey(String(row.week_start));
    const cost = Number(row.total_cost) || 0;
    if (Math.abs(cost) < 0.005) continue;
    // Importe semanal persistido → día lunes (sin cálculo HE de prorrateo).
    if (weekStart < startDate || weekStart > effectiveEnd || weekStart > today) continue;
    const cell = ensure(weekStart);
    cell.overtime = round2(cell.overtime + cost);
    cell.total = round2(cell.fixed + cell.overtime);
  }

  const { data: payroll, error: payErr } = await supabase
    .from('payroll_monthly_totals')
    .select('period_ym, period_start, period_end, total_company_cost')
    .lte('period_start', effectiveEnd)
    .gte('period_end', startDate);
  if (payErr) throw payErr;

  const found = new Set<string>();
  for (const row of payroll ?? []) {
    found.add(String(row.period_ym));
    const total = Number(row.total_company_cost) || 0;
    const ps = String(row.period_start).split('T')[0]!;
    const pe = String(row.period_end).split('T')[0]!;
    const dayMap = allocatePayrollToNaturalDays(total, ps, pe);
    for (const [iso, amount] of Object.entries(dayMap)) {
      if (iso < startDate || iso > effectiveEnd || iso > today) continue;
      const cell = ensure(iso);
      cell.fixed = round2(cell.fixed + amount);
      cell.total = round2(cell.fixed + cell.overtime);
    }
  }

  const missingPayrollMonths = monthKeysCovering(startDate, effectiveEnd).filter(
    (ym) => !found.has(ym),
  );

  let totalOvertime = 0;
  let totalFixed = 0;
  for (const c of Object.values(byDate)) {
    totalOvertime = round2(totalOvertime + c.overtime);
    totalFixed = round2(totalFixed + c.fixed);
  }

  return {
    byDate,
    totalFixed,
    totalOvertime,
    totalCost: round2(totalFixed + totalOvertime),
    missingPayrollMonths,
  };
}

export type LaborDayWorkerDto = {
  id: string;
  name: string;
  fixed: number;
  overtime: number;
  total: number;
};

export const PAYROLL_ORDINARY_ROW_ID = '__payroll_ordinary__';

export async function buildLaborCostDayDetailFromSnapshots(
  supabase: SupabaseClient,
  dateYmd: string,
  userId?: string | null,
): Promise<{
  totalCost: number;
  totalFixed: number;
  totalOvertime: number;
  workers: LaborDayWorkerDto[];
  missingPayroll: boolean;
}> {
  const day = dateYmd.split('T')[0]!;
  const weekStart = mondayOnOrBeforeYmd(day);

  const period = await buildLaborCostPeriodFromSnapshots(supabase, {
    startDate: day,
    endDate: day,
    userId: userId ?? null,
  });

  const cell = period.byDate[day] ?? { total: 0, fixed: 0, overtime: 0 };

  // Trabajadores: snapshots de esa semana con total_cost (solo si el día es el lunes
  // o si queremos mostrar OT de la semana en cualquier día — mostramos en todos los
  // días de la semana el mismo OT semanal solo cuando day === weekStart para no duplicar).
  const workers: LaborDayWorkerDto[] = [];

  if (day === weekStart) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, visible_in_plantilla')
      .eq('visible_in_plantilla', true);
    const visible = filterVisiblePlantillaEmployees(profiles ?? []);
    const nameById = new Map(
      visible.map((p) => [
        p.id,
        `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || '—',
      ]),
    );

    let snapsQuery = supabase
      .from('weekly_snapshots')
      .select('user_id, total_cost')
      .eq('week_start', weekStart);

    if (userId) {
      snapsQuery = snapsQuery.eq('user_id', userId);
    } else {
      const ids = [...nameById.keys()];
      if (ids.length > 0) snapsQuery = snapsQuery.in('user_id', ids);
    }

    const { data: snaps } = await snapsQuery;
    for (const row of snaps ?? []) {
      const cost = Number(row.total_cost) || 0;
      if (Math.abs(cost) < 0.005) continue;
      const uid = String(row.user_id);
      workers.push({
        id: uid,
        name: nameById.get(uid) ?? '—',
        fixed: 0,
        overtime: cost,
        total: cost,
      });
    }
    workers.sort((a, b) => b.total - a.total);
  }

  if (Math.abs(cell.fixed) >= 0.005) {
    workers.unshift({
      id: PAYROLL_ORDINARY_ROW_ID,
      name: 'Nómina empresa',
      fixed: cell.fixed,
      overtime: 0,
      total: cell.fixed,
    });
  }

  return {
    totalCost: cell.total,
    totalFixed: cell.fixed,
    totalOvertime: cell.overtime,
    workers,
    missingPayroll: period.missingPayrollMonths.length > 0,
  };
}

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
  summary: WeekFooterDto & {
    bagModeOverride?: boolean | null;
    overtimeRateOverride?: number | null;
  };
};

/**
 * Historial mensual: relojes desde time_logs; footer/OT desde weekly_snapshots.
 * Sin Hours Engine.
 */
export async function buildEmployeeHistoryMonthFromSnapshots(
  supabase: SupabaseClient,
  input: {
    userId: string;
    filterYear: number;
    filterMonth: number; // 0-11
  },
): Promise<HistoryWeekDto[]> {
  const { userId, filterYear, filterMonth } = input;
  const monthStart = new Date(filterYear, filterMonth, 1);
  const monthEnd = new Date(filterYear, filterMonth + 1, 0);
  // Ampliar a semanas ISO que tocan el mes (como buildEmployeeWeeksFromTimeLogs)
  const rangeStart = mondayOnOrBeforeYmd(format(monthStart, 'yyyy-MM-dd'));
  const rangeEndSunday = format(
    addDays(parseISO(mondayOnOrBeforeYmd(format(monthEnd, 'yyyy-MM-dd'))), 6),
    'yyyy-MM-dd',
  );

  const { startIso, endIso } = madridRangeUtcIso(rangeStart, rangeEndSunday);

  const [logsRes, snapsRes] = await Promise.all([
    supabase
      .from('time_logs')
      .select(
        'clock_in, clock_out, total_hours, justified_hours, event_type, clock_out_show_no_registrada',
      )
      .eq('user_id', userId)
      .gte('clock_in', startIso)
      .lte('clock_in', endIso),
    supabase
      .from('weekly_snapshots')
      .select(
        'user_id, week_start, week_end, total_hours, ordinary_hours, extra_hours, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, total_cost, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
      )
      .eq('user_id', userId)
      .gte('week_start', rangeStart)
      .lte('week_start', mondayOnOrBeforeYmd(rangeEndSunday)),
  ]);

  if (logsRes.error) throw logsRes.error;
  if (snapsRes.error) throw snapsRes.error;

  const snapByWeek = new Map<string, SnapshotWeekRow>();
  for (const s of snapsRes.data ?? []) {
    const row = s as SnapshotWeekRow;
    snapByWeek.set(weekStartKey(row.week_start), row);
  }

  const isPaidByWeek = (ws: string) => snapByWeek.get(ws)?.is_paid === true;
  const bagModeOverrideByWeek = (ws: string) => {
    const v = snapByWeek.get(ws)?.prefer_stock_hours_override;
    if (v === true || v === false) return v;
    return null;
  };

  const mapped = buildEmployeeWeeksFromTimeLogs({
    filterYear,
    filterMonth,
    logs: logsRes.data ?? [],
    isPaidByWeek,
    bagModeOverrideByWeek,
  });

  return mapped.map((week) => {
    const snap = snapByWeek.get(week.startDate);
    const footer = snap
      ? footerFromSnapshot(snap)
      : {
          totalHours: 0,
          startBalance: 0,
          weeklyBalance: 0,
          finalBalance: 0,
          estimatedValue: 0,
          isPaid: isPaidByWeek(week.startDate),
          preferStock: bagModeOverrideByWeek(week.startDate) === true,
          limitHours: 0,
          hourlyRate: 0,
        };

    const override = snap?.overtime_price_snapshot;
    const bag = snap?.prefer_stock_hours_override;

    return {
      weekNumber: week.weekNumber ?? getISOWeek(parseISO(week.startDate)),
      startDate: week.startDate,
      isCurrentWeek: week.isCurrentWeek,
      days: week.days.map((d) => ({
        ...d,
        // Sin extras diarias persistidas: no inventar; footer lleva el semanal.
        extraHours: 0,
      })),
      summary: {
        ...footer,
        bagModeOverride: bag === true || bag === false ? bag : null,
        overtimeRateOverride:
          override != null && Number.isFinite(Number(override))
            ? Number(override)
            : null,
      },
    };
  });
}

/**
 * Una semana para modal / staff home: snapshot + grid de relojes (RPC display).
 */
export async function buildWeekDetailFromSnapshots(
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
  summary: WeekFooterDto;
}> {
  const weekStart = input.weekStart.split('T')[0]!;
  const sunday = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

  const [{ data: profile }, snapRes, logsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, role, is_fixed_salary')
      .eq('id', input.userId)
      .maybeSingle(),
    supabase
      .from('weekly_snapshots')
      .select(
        'user_id, week_start, total_hours, ordinary_hours, extra_hours, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, total_cost, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
      )
      .eq('user_id', input.userId)
      .eq('week_start', weekStart)
      .maybeSingle(),
    supabase
      .from('time_logs')
      .select('clock_in, clock_out, total_hours, event_type, clock_out_show_no_registrada')
      .eq('user_id', input.userId)
      .gte('clock_in', madridRangeUtcIso(weekStart, sunday).startIso)
      .lte('clock_in', madridRangeUtcIso(weekStart, sunday).endIso),
  ]);

  if (logsRes.error) throw logsRes.error;

  const name =
    `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || '—';

  const footer = snapRes.data
    ? footerFromSnapshot(snapRes.data as SnapshotWeekRow)
    : {
        totalHours: 0,
        startBalance: 0,
        weeklyBalance: 0,
        finalBalance: 0,
        estimatedValue: 0,
        isPaid: false,
        preferStock: false,
        limitHours: 0,
        hourlyRate: 0,
      };

  // Grid días desde logs (solo relojes; extraHours = 0)
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
    const dayLogs = (logsRes.data ?? []).filter(
      (l) => formatYmdInMadrid(l.clock_in) === d,
    );
    const first = dayLogs[0];
    days.push({
      date: d,
      hasLog: dayLogs.length > 0,
      clockIn: first?.clock_in ? formatMadridHmFromIso(first.clock_in) : null,
      clockOut: first?.clock_out ? formatMadridHmFromIso(first.clock_out) : null,
      totalHours: dayLogs.reduce((s, l) => s + (Number(l.total_hours) || 0), 0),
      extraHours: 0,
    });
  }

  return { workerName: name, days, summary: footer };
}

/**
 * Historial en rango arbitrario (export YTD): relojes + footers desde snapshots.
 */
export async function buildEmployeeHistoryRangeFromSnapshots(
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
  const { startIso, endIso } = madridRangeUtcIso(rangeStartYmd, rangeEndYmd);

  const [logsRes, snapsRes] = await Promise.all([
    supabase
      .from('time_logs')
      .select(
        'clock_in, clock_out, total_hours, justified_hours, event_type, clock_out_show_no_registrada',
      )
      .eq('user_id', userId)
      .gte('clock_in', startIso)
      .lte('clock_in', endIso),
    supabase
      .from('weekly_snapshots')
      .select(
        'user_id, week_start, week_end, total_hours, ordinary_hours, extra_hours, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, total_cost, is_paid, prefer_stock_hours_override, overtime_price_snapshot',
      )
      .eq('user_id', userId)
      .gte('week_start', rangeStartYmd)
      .lte('week_start', mondayOnOrBeforeYmd(rangeEndYmd)),
  ]);

  if (logsRes.error) throw logsRes.error;
  if (snapsRes.error) throw snapsRes.error;

  const snapByWeek = new Map<string, SnapshotWeekRow>();
  for (const s of snapsRes.data ?? []) {
    const row = s as SnapshotWeekRow;
    snapByWeek.set(weekStartKey(row.week_start), row);
  }

  const isPaidByWeek = (ws: string) => snapByWeek.get(ws)?.is_paid === true;
  const bagModeOverrideByWeek = (ws: string) => {
    const v = snapByWeek.get(ws)?.prefer_stock_hours_override;
    if (v === true || v === false) return v;
    return null;
  };

  const mapped = buildEmployeeWeeksInRange({
    rangeStart,
    rangeEnd,
    logs: logsRes.data ?? [],
    isPaidByWeek,
    bagModeOverrideByWeek,
  });

  return mapped.map((week) => {
    const snap = snapByWeek.get(week.startDate);
    const footer = snap
      ? footerFromSnapshot(snap)
      : {
          totalHours: 0,
          startBalance: 0,
          weeklyBalance: 0,
          finalBalance: 0,
          estimatedValue: 0,
          isPaid: isPaidByWeek(week.startDate),
          preferStock: bagModeOverrideByWeek(week.startDate) === true,
          limitHours: 0,
          hourlyRate: 0,
        };

    const override = snap?.overtime_price_snapshot;
    const bag = snap?.prefer_stock_hours_override;

    return {
      weekNumber: week.weekNumber ?? getISOWeek(parseISO(week.startDate)),
      startDate: week.startDate,
      isCurrentWeek: week.isCurrentWeek,
      days: week.days.map((d) => ({
        ...d,
        extraHours: 0,
      })),
      summary: {
        ...footer,
        bagModeOverride: bag === true || bag === false ? bag : null,
        overtimeRateOverride:
          override != null && Number.isFinite(Number(override))
            ? Number(override)
            : null,
      },
    };
  });
}

/**
 * Tarifa ordinaria para barra horario: lectura profiles + tramo del día.
 * Sin resolveEffectiveContract / liquidateWeek.
 */
export async function ordinaryHourlyRateFromTerms(
  supabase: SupabaseClient,
  userId: string,
  onDateYmd: string,
): Promise<number> {
  const day = onDateYmd.split('T')[0]!;
  const [{ data: profile }, { data: terms }] = await Promise.all([
    supabase.from('profiles').select('monthly_cost').eq('id', userId).maybeSingle(),
    supabase
      .from('hours_contract_terms')
      .select('effective_from, effective_to, weekly_hours')
      .eq('user_id', userId)
      .order('effective_from', { ascending: true }),
  ]);

  const monthly = Number(profile?.monthly_cost) || 0;
  if (monthly <= 0) return 0;

  let weeklyHours = 40;
  for (const t of terms ?? []) {
    const from = String(t.effective_from).split('T')[0]!;
    const to = t.effective_to ? String(t.effective_to).split('T')[0]! : null;
    if (day < from) continue;
    if (to != null && day > to) continue;
    const wh = Number(t.weekly_hours) || 0;
    if (wh > 0) {
      weeklyHours = wh;
      break;
    }
  }

  const denom = weeklyHours * (52 / 12) * 0.85;
  if (denom <= 0) return 0;
  return monthly / denom;
}
