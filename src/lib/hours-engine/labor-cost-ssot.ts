/**
 * Coste laboral diario/periodo desde Hours Engine (SSOT).
 * Extras € = misma liquidación que overtime / historial (estimatedValue).
 * Fijo: no existe en el modelo HE de liquidación → 0 (Zero-Display).
 *
 * No usa fn_labor_*, profile_labor_cost_terms ni event_type=overtime.
 */

import { addDays, format, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  loadEmployeeBoundaryFacts,
  liquidateWeekForCard,
  resolveOpeningCarryIn,
  type EmployeeBoundaryFacts,
} from '@/lib/hours-engine';
import { formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';

export type LaborDayCell = { total: number; fixed: number; overtime: number };

export type LaborDayWorker = {
  id: string;
  name: string;
  fixed: number;
  overtime: number;
  total: number;
};

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return format(dt, 'yyyy-MM-dd');
}

function listMondaysCovering(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = mondayOf(startYmd);
  const end = endYmd.split('T')[0]!;
  while (cur <= end) {
    out.push(cur);
    cur = format(addDays(parseISO(cur), 7), 'yyyy-MM-dd');
  }
  return out;
}

/**
 * Prorratea estimatedValue semanal a días según extrasByDay (HE).
 * Si no hay extras diarias pero hay importe, reparte en el lunes (fallback).
 */
function allocateWeekCostToDays(
  extrasByDay: Readonly<Record<string, number>>,
  estimatedValue: number,
  weekStart: string,
  weekEnd: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (Math.abs(estimatedValue) < 0.005) return out;

  const days: string[] = [];
  let d = weekStart;
  while (d <= weekEnd) {
    days.push(d);
    d = format(addDays(parseISO(d), 1), 'yyyy-MM-dd');
  }

  const weights = days.map((day) => Math.max(0, extrasByDay[day] ?? 0));
  const sumW = weights.reduce((a, b) => a + b, 0);

  if (sumW <= 0) {
    out[weekStart] = estimatedValue;
    return out;
  }

  let allocated = 0;
  for (let i = 0; i < days.length; i++) {
    const share =
      i === days.length - 1
        ? estimatedValue - allocated
        : Math.round(((estimatedValue * weights[i]!) / sumW) * 100) / 100;
    if (Math.abs(share) >= 0.005) {
      out[days[i]!] = (out[days[i]!] ?? 0) + share;
      allocated += share;
    }
  }
  return out;
}

export async function buildLaborCostPeriodFromSsot(
  supabase: SupabaseClient,
  options: {
    startDate: string;
    endDate: string;
    userId?: string | null;
  },
): Promise<{
  byDate: Record<string, LaborDayCell>;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
}> {
  const startDate = options.startDate.split('T')[0]!;
  const endDate = options.endDate.split('T')[0]!;
  const today = formatYmdInMadrid(new Date().toISOString());
  const effectiveEnd = endDate > today ? today : endDate;

  const mondays = listMondaysCovering(startDate, effectiveEnd);
  if (mondays.length === 0) {
    return { byDate: {}, totalFixed: 0, totalOvertime: 0, totalCost: 0 };
  }

  const firstMonday = mondays[0]!;
  const lastMonday = mondays[mondays.length - 1]!;
  const lastSunday = format(addDays(parseISO(lastMonday), 6), 'yyyy-MM-dd');

  let profilesQuery = supabase
    .from('profiles')
    .select(PLANTILLA_EMPLOYEE_SELECT)
    .eq('visible_in_plantilla', true);

  if (options.userId) {
    profilesQuery = supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT)
      .eq('id', options.userId);
  }

  const { data: profileRows, error: profileErr } = await profilesQuery;
  if (profileErr) throw profileErr;
  const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);

  const byDate: Record<string, LaborDayCell> = {};
  const bump = (iso: string, overtime: number) => {
    if (iso < startDate || iso > effectiveEnd || iso > today) return;
    if (!byDate[iso]) byDate[iso] = { total: 0, fixed: 0, overtime: 0 };
    byDate[iso]!.overtime += overtime;
    byDate[iso]!.total = byDate[iso]!.fixed + byDate[iso]!.overtime;
  };

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
        .select('week_start, is_paid, prefer_stock_hours_override')
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

      const { result, extrasByDay, summary } = liquidateWeekForCard({
        employee,
        weekStart,
        logs: weekLogs,
        isPaid: isPaidByWeek(weekStart),
        carryIn,
        bagModeOverride: bagModeOverrideByWeek(weekStart),
      });
      carryIn = result.carryOut;

      const dayCosts = allocateWeekCostToDays(
        extrasByDay,
        summary.estimatedValue,
        weekStart,
        weekEnd,
      );
      for (const [iso, amount] of Object.entries(dayCosts)) {
        bump(iso, amount);
      }
    }
  }

  let totalOvertime = 0;
  let totalFixed = 0;
  for (const c of Object.values(byDate)) {
    totalOvertime += c.overtime;
    totalFixed += c.fixed;
  }

  return {
    byDate,
    totalFixed,
    totalOvertime,
    totalCost: totalFixed + totalOvertime,
  };
}

export async function buildLaborCostDayDetailFromSsot(
  supabase: SupabaseClient,
  dateYmd: string,
  userId?: string | null,
): Promise<{
  totalCost: number;
  totalFixed: number;
  totalOvertime: number;
  workers: LaborDayWorker[];
}> {
  const day = dateYmd.split('T')[0]!;
  const weekStart = mondayOf(day);
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

  let profilesQuery = supabase
    .from('profiles')
    .select(PLANTILLA_EMPLOYEE_SELECT)
    .eq('visible_in_plantilla', true);
  if (userId) {
    profilesQuery = supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT)
      .eq('id', userId);
  }
  const { data: profileRows, error } = await profilesQuery;
  if (error) throw error;
  const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);

  const workers: LaborDayWorker[] = [];

  for (const profile of profiles) {
    let employee: EmployeeBoundaryFacts;
    try {
      employee = await loadEmployeeBoundaryFacts(supabase, profile.id);
    } catch {
      continue;
    }

    const timelineStart = employeeTimelineStartWeek(employee);
    const logsFromYmd =
      timelineStart && timelineStart < weekStart ? timelineStart : weekStart;
    const { startIso, endIso } = madridRangeUtcIso(logsFromYmd, weekEnd);

    const [snapsRes, logsRes] = await Promise.all([
      supabase
        .from('weekly_snapshots')
        .select('week_start, is_paid, prefer_stock_hours_override')
        .eq('user_id', profile.id)
        .gte('week_start', logsFromYmd)
        .lte('week_start', weekStart),
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

    const carryIn = resolveOpeningCarryIn({
      employee,
      chainStart: weekStart,
      logs: engineLogs,
      isPaidByWeek,
      bagModeOverrideByWeek,
    });

    const weekLogs = engineLogs.filter((l) => {
      const d = formatYmdInMadrid(l.clockInIso);
      return d >= weekStart && d <= weekEnd;
    });

    const { extrasByDay, summary } = liquidateWeekForCard({
      employee,
      weekStart,
      logs: weekLogs,
      isPaid: isPaidByWeek(weekStart),
      carryIn,
      bagModeOverride: bagModeOverrideByWeek(weekStart),
    });

    const dayCosts = allocateWeekCostToDays(
      extrasByDay,
      summary.estimatedValue,
      weekStart,
      weekEnd,
    );
    const overtime = dayCosts[day] ?? 0;
    if (Math.abs(overtime) < 0.005) continue;

    const name =
      `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—';
    workers.push({
      id: profile.id,
      name,
      fixed: 0,
      overtime,
      total: overtime,
    });
  }

  workers.sort((a, b) => b.total - a.total);
  const totalOvertime = workers.reduce((s, w) => s + w.overtime, 0);

  return {
    totalCost: totalOvertime,
    totalFixed: 0,
    totalOvertime,
    workers,
  };
}
