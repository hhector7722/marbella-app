/**
 * Listados de horas extras (overtime / dashboards) desde Hours Engine.
 * Misma liquidación que WorkerWeeklyHistoryModal / WeekCard — una sola verdad.
 *
 * NO usa get_weekly_worker_stats ni perfiles como jornada.
 */

import { addDays, format, getISOWeek, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  loadEmployeeBoundaryFacts,
  liquidateWeekForCard,
  resolveOpeningCarryIn,
  type EmployeeBoundaryFacts,
} from '@/lib/hours-engine';
import { formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import { filterVisiblePlantillaEmployees } from '@/lib/staff/plantilla-employees';
import { weekDisplayFromEngine } from '@/lib/read-models/week-display-from-engine';

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

function mondayOnOrBeforeYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay(); // 0=dom … 1=lun
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return format(dt, 'yyyy-MM-dd');
}

function listMondaysInRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = mondayOnOrBeforeYmd(startYmd);
  const end = endYmd.split('T')[0]!;
  // Si el lunes de start es anterior al start, avanzamos si hace falta
  // (igual: incluimos toda semana que solape el rango por su lunes en [start,end]
  //  o cuyo domingo caiga en rango — alineado a generate_series del RPC).
  const rangeStart = startYmd.split('T')[0]!;
  while (cur <= end) {
    const sunday = format(addDays(parseISO(cur), 6), 'yyyy-MM-dd');
    if (sunday >= rangeStart && cur <= end) {
      out.push(cur);
    }
    cur = format(addDays(parseISO(cur), 7), 'yyyy-MM-dd');
  }
  return out;
}

/** Domingo (lunes+6) estrictamente anterior al día civil Madrid de hoy. */
function isCompletedWeekMonday(weekMondayYmd: string, todayMadridYmd: string): boolean {
  const sunday = format(addDays(parseISO(weekMondayYmd), 6), 'yyyy-MM-dd');
  return sunday < todayMadridYmd;
}

function todayMadridYmd(): string {
  return formatYmdInMadrid(new Date().toISOString());
}

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  visible_in_plantilla?: boolean | null;
};

export type BuildOvertimeWeeksOptions = {
  startDate: string;
  endDate: string;
  userId?: string | null;
  onlyCompletedWeeks?: boolean;
};

/**
 * Construye weeksResult + summary con liquidateWeekForCard (HE).
 * Forma idéntica a la que consumen /dashboard/overtime y paneles manager/master.
 */
export async function buildOvertimeWeeksFromSsot(
  supabase: SupabaseClient,
  options: BuildOvertimeWeeksOptions,
): Promise<{
  weeksResult: WeeklyStats[];
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
  const lastSunday = format(addDays(parseISO(lastMonday), 6), 'yyyy-MM-dd');

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

  const profiles = filterVisiblePlantillaEmployees(
    (profileRows ?? []) as unknown as ProfileRow[],
  );

  // weekId → staff[]
  const staffByWeek = new Map<string, StaffWeeklyStats[]>();
  for (const m of mondays) staffByWeek.set(m, []);

  for (const profile of profiles) {
    let employee: EmployeeBoundaryFacts;
    try {
      employee = await loadEmployeeBoundaryFacts(supabase, profile.id);
    } catch {
      continue;
    }

    const timelineStart = employeeTimelineStartWeek(employee);
    const logsFromYmd =
      timelineStart && timelineStart < firstMonday ? timelineStart : firstMonday;
    const { startIso, endIso } = madridRangeUtcIso(logsFromYmd, lastSunday);

    const [snapsRes, logsRes] = await Promise.all([
      supabase
        .from('weekly_snapshots')
        .select('week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot')
        .eq('user_id', profile.id)
        .gte('week_start', logsFromYmd)
        .lte('week_start', lastMonday),
      supabase
        .from('time_logs')
        .select('clock_in, clock_out, total_hours')
        .eq('user_id', profile.id)
        .gte('clock_in', startIso)
        .lte('clock_in', endIso),
    ]);

    if (snapsRes.error || logsRes.error) continue;

    const engineLogs = (logsRes.data ?? []).map((l) => ({
      clockInIso: l.clock_in as string,
      clockOutIso: l.clock_out as string | null,
      totalHours: l.total_hours as number | null,
    }));

    const isPaidByWeek = isPaidLookupFromRows(snapsRes.data ?? []);
    const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapsRes.data ?? []);
    const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(
      snapsRes.data ?? [],
    );
    const displayName =
      `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—';
    const role = profile.role ?? 'staff';

    // Cadena HE: opening carry en la primera semana del listado (o timeline)
    let carryIn = resolveOpeningCarryIn({
      employee,
      chainStart: firstMonday,
      logs: engineLogs,
      isPaidByWeek,
      bagModeOverrideByWeek,
    });

    for (const weekStart of mondays) {
      const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');
      const weekLogs = engineLogs.filter((l) => {
        const day = formatYmdInMadrid(l.clockInIso);
        return day >= weekStart && day <= weekEnd;
      });

      const isPaid = isPaidByWeek(weekStart);
      const bagModeOverride = bagModeOverrideByWeek(weekStart);
      const overrideRate = overtimeRateOverrideByWeek(weekStart);

      const { result, summary } = liquidateWeekForCard({
        employee,
        weekStart,
        logs: weekLogs,
        isPaid,
        carryIn,
        bagModeOverride,
        overrideRate,
      });

      // Invariantes display (carryOut<0 → extras/importe 0; bolsa → importe 0)
      const display = weekDisplayFromEngine(result, summary, bagModeOverride);

      carryIn = result.carryOut;

      const hasActivity =
        weekLogs.length > 0 ||
        Math.abs(display.estimatedValue) > 0.005 ||
        Math.abs(display.weeklyBalance) > 0.005 ||
        Math.abs(display.finalBalance) > 0.005 ||
        (snapsRes.data ?? []).some(
          (s) => String(s.week_start).split('T')[0] === weekStart,
        );

      if (!hasActivity) continue;

      const row: StaffWeeklyStats = {
        id: profile.id,
        name: displayName,
        role,
        totalHours: display.totalHours,
        regularHours: Math.max(
          0,
          display.totalHours - Math.max(0, display.weeklyBalance),
        ),
        overtimeHours: Math.max(0, display.weeklyBalance),
        totalCost: display.estimatedValue,
        regularCost: 0,
        overtimeCost: display.estimatedValue,
        isPaid: display.isPaid,
        preferStock: display.preferStock,
      };

      staffByWeek.get(weekStart)!.push(row);
    }
  }

  const weeksResult: WeeklyStats[] = [...mondays]
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
