/**
 * Listados de horas extras (overtime / dashboards) desde la proyección persistida.
 *
 * Importe = `weekly_snapshots.total_cost` (Cost Engine vía Writer).
 * No liquida en lectura. Semana en curso y futuras no entran.
 *
 * Historial de una persona y pie de tarjeta semanal leen weekly_snapshots + weekly_snapshot_days.
 */

import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import { filterVisiblePlantillaEmployees } from '../staff/plantilla-employees.ts';

export interface StaffWeeklyStats {
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
}

export interface WeeklyStats {
  weekId: string;
  label: string;
  startDate: Date;
  totalAmount: number;
  totalHours: number;
  staff: StaffWeeklyStats[];
}

export type BuildOvertimeWeeksOptions = {
  startDate: string;
  endDate: string;
  userId?: string | null;
  onlyCompletedWeeks?: boolean;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  visible_in_plantilla?: boolean | null;
};

export type OvertimeSnapshotRow = {
  user_id: string;
  week_start: string;
  total_cost: number | string | null;
  total_hours: number | string | null;
  ordinary_hours: number | string | null;
  extra_hours: number | string | null;
  is_paid: boolean | null;
  prefer_stock_hours_override: boolean | null;
};

function asFiniteNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function civilYmd(value: string): string {
  return value.split('T')[0]!;
}

function mondayOnOrBeforeYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return format(dt, 'yyyy-MM-dd');
}

export function listMondaysInRange(startYmd: string, endYmd: string): string[] {
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

/** Domingo (lunes+6) estrictamente anterior al día civil Madrid de hoy. */
export function isCompletedWeekMonday(weekMondayYmd: string, todayMadridYmd: string): boolean {
  const sunday = format(addDays(parseISO(weekMondayYmd), 6), 'yyyy-MM-dd');
  return sunday < todayMadridYmd;
}

export function todayMadridYmd(): string {
  return formatYmdInMadrid(new Date().toISOString());
}

export function completedMondaysInRange(
  startDate: string,
  endDate: string,
  todayYmd: string,
  onlyCompleted = true,
): string[] {
  const start = startDate.split('T')[0]!;
  const end = endDate.split('T')[0]!;
  let mondays = listMondaysInRange(start, end);
  if (onlyCompleted) mondays = mondays.filter((m) => isCompletedWeekMonday(m, todayYmd));
  return mondays;
}

export function overtimeWeeksCacheKey(
  startDate: string,
  endDate: string,
  todayYmd: string,
  userId?: string | null,
): string {
  const mondays = completedMondaysInRange(startDate, endDate, todayYmd);
  const who = userId ?? '*';
  return `${who}|${mondays.join(',') || `${civilYmd(startDate)}:${civilYmd(endDate)}:none`}`;
}

export function staffStatsFromProjection(
  profile: ProfileRow,
  row: OvertimeSnapshotRow,
): StaffWeeklyStats {
  const totalCost = asFiniteNumber(row.total_cost);
  const totalHours = asFiniteNumber(row.total_hours);
  const regularHours = asFiniteNumber(row.ordinary_hours);
  const overtimeHours = asFiniteNumber(row.extra_hours);
  const displayName =
    `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—';
  return {
    id: profile.id,
    name: displayName,
    role: profile.role ?? 'staff',
    totalHours,
    regularHours,
    overtimeHours,
    totalCost,
    regularCost: 0,
    overtimeCost: totalCost,
    isPaid: row.is_paid === true,
    preferStock: row.prefer_stock_hours_override === true,
  };
}

export function assembleOvertimeWeeks(input: {
  mondays: string[];
  profiles: ProfileRow[];
  snapshots: OvertimeSnapshotRow[];
}): {
  weeksResult: WeeklyStats[];
  summary: { totalCost: number; totalHours: number; totalOvertimeCost: number };
} {
  const profileById = new Map(input.profiles.map((p) => [p.id, p]));
  const staffByWeek = new Map<string, StaffWeeklyStats[]>();
  for (const monday of input.mondays) staffByWeek.set(monday, []);

  for (const row of input.snapshots) {
    const weekStart = civilYmd(row.week_start);
    const bucket = staffByWeek.get(weekStart);
    if (!bucket) continue;
    const profile = profileById.get(row.user_id);
    if (!profile) continue;
    bucket.push(staffStatsFromProjection(profile, row));
  }

  const weeksResult: WeeklyStats[] = [...input.mondays]
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

const EMPTY_OVERTIME = {
  weeksResult: [] as WeeklyStats[],
  summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 },
};

const OVERTIME_PROFILE_SELECT =
  'id, first_name, last_name, avatar_url, role, visible_in_plantilla' as const;

const OVERTIME_SNAPSHOT_SELECT =
  'user_id, week_start, total_cost, total_hours, ordinary_hours, extra_hours, is_paid, prefer_stock_hours_override' as const;

/**
 * weeksResult + summary desde weekly_snapshots (proyección del Writer).
 * Forma idéntica a la que consumen /dashboard/overtime y paneles manager/master.
 */
export async function buildOvertimeWeeksFromSsot(
  supabase: SupabaseClient,
  options: BuildOvertimeWeeksOptions,
): Promise<{
  weeksResult: WeeklyStats[];
  summary: { totalCost: number; totalHours: number; totalOvertimeCost: number };
}> {
  const onlyCompleted = options.onlyCompletedWeeks !== false;
  const mondays = completedMondaysInRange(
    options.startDate,
    options.endDate,
    todayMadridYmd(),
    onlyCompleted,
  );
  if (mondays.length === 0) return EMPTY_OVERTIME;

  let profilesQuery = supabase
    .from('profiles')
    .select(OVERTIME_PROFILE_SELECT)
    .eq('visible_in_plantilla', true)
    .order('first_name');

  if (options.userId) {
    profilesQuery = supabase
      .from('profiles')
      .select(OVERTIME_PROFILE_SELECT)
      .eq('id', options.userId);
  }

  const { data: profileRows, error: profileErr } = await profilesQuery;
  if (profileErr) throw profileErr;

  const profiles = filterVisiblePlantillaEmployees(
    (profileRows ?? []) as unknown as ProfileRow[],
  );
  const workerIds = profiles.map((profile) => profile.id);
  if (workerIds.length === 0) return EMPTY_OVERTIME;

  const firstMonday = mondays[0]!;
  const lastMonday = mondays[mondays.length - 1]!;

  const { data: snapshotRows, error: snapshotErr } = await supabase
    .from('weekly_snapshots')
    .select(OVERTIME_SNAPSHOT_SELECT)
    .in('user_id', workerIds)
    .gte('week_start', firstMonday)
    .lte('week_start', lastMonday);

  if (snapshotErr) throw snapshotErr;

  return assembleOvertimeWeeks({
    mondays,
    profiles,
    snapshots: (snapshotRows ?? []) as OvertimeSnapshotRow[],
  });
}
