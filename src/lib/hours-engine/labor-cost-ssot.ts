/**
 * Coste laboral diario / periodo — fuentes oficiales:
 *
 * ORDINARIO (Fijo):
 *   `payroll_monthly_totals.total_company_cost` prorrateado por
 *   **días naturales** del periodo de nómina (`period_end - period_start + 1`).
 *   Misma regla que `get_financial_statement` (nóminas).
 *   NO usa `fn_labor_*`, `profile_labor_cost_terms` ni tarifas horarias.
 *
 *   coste_ordinario_dia = total_company_cost / días_naturales_periodo
 *
 * EXTRAS:
 *   Hours Engine (`liquidateWeekForCard` → `estimatedValue`), misma liquidación
 *   que Staff History y Dashboard Overtime. Prorrateo diario por `extrasByDay`.
 *
 * TOTAL:
 *   coste_total_dia = coste_ordinario_dia + coste_extras_dia
 */

import { addDays, format, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from './opening-carry.ts';
import { loadEmployeeBoundaryFacts } from './load-employee-facts.ts';
import { liquidateWeekForCard } from './week-card-from-liquidation.ts';
import type { EmployeeBoundaryFacts } from './types.ts';
import {
  allocatePayrollToNaturalDays,
  monthKeysCovering,
} from './payroll-ordinary-daily.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';

export { allocatePayrollToNaturalDays } from './payroll-ordinary-daily.ts';
export type LaborDayCell = { total: number; fixed: number; overtime: number };

export type LaborDayWorker = {
  id: string;
  name: string;
  fixed: number;
  overtime: number;
  total: number;
};

/** Fila sintética en detalle diario: nómina empresa prorrateada (no es un empleado). */
export const PAYROLL_ORDINARY_ROW_ID = '__payroll_ordinary__';

export type LaborCostPeriodResult = {
  byDate: Record<string, LaborDayCell>;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
  /** Meses YYYY-MM del rango sin fila en payroll_monthly_totals */
  missingPayrollMonths: string[];
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

function listYmdInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd.split('T')[0]!;
  const end = endYmd.split('T')[0]!;
  while (d <= end) {
    out.push(d);
    d = format(addDays(parseISO(d), 1), 'yyyy-MM-dd');
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

  const days = listYmdInclusive(weekStart, weekEnd);
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
        ? round2(estimatedValue - allocated)
        : round2((estimatedValue * weights[i]!) / sumW);
    if (Math.abs(share) >= 0.005) {
      out[days[i]!] = (out[days[i]!] ?? 0) + share;
      allocated = round2(allocated + share);
    }
  }
  return out;
}

/**
 * Ordinario diario desde nómina oficial (empresa).
 * El filtro por trabajador NO aplica: la nómina es agregada de empresa.
 */
async function loadOrdinaryByDateFromPayroll(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<{ byDate: Record<string, number>; missingPayrollMonths: string[] }> {
  const { data, error } = await supabase
    .from('payroll_monthly_totals')
    .select('period_ym, period_start, period_end, total_company_cost')
    .lte('period_start', endDate)
    .gte('period_end', startDate);

  if (error) throw error;

  const byDate: Record<string, number> = {};
  const found = new Set<string>();

  for (const row of data ?? []) {
    const ym = String(row.period_ym);
    found.add(ym);
    const total = Number(row.total_company_cost) || 0;
    const ps = String(row.period_start).split('T')[0]!;
    const pe = String(row.period_end).split('T')[0]!;
    const dayMap = allocatePayrollToNaturalDays(total, ps, pe);
    for (const [iso, amount] of Object.entries(dayMap)) {
      if (iso < startDate || iso > endDate) continue;
      byDate[iso] = (byDate[iso] ?? 0) + amount;
    }
  }

  const missingPayrollMonths = monthKeysCovering(startDate, endDate).filter(
    (ym) => !found.has(ym),
  );

  return { byDate, missingPayrollMonths };
}

export async function buildLaborCostPeriodFromSsot(
  supabase: SupabaseClient,
  options: {
    startDate: string;
    endDate: string;
    userId?: string | null;
  },
): Promise<LaborCostPeriodResult> {
  const startDate = options.startDate.split('T')[0]!;
  const endDate = options.endDate.split('T')[0]!;
  const today = formatYmdInMadrid(new Date().toISOString());
  const effectiveEnd = endDate > today ? today : endDate;

  const ordinaryPromise = loadOrdinaryByDateFromPayroll(
    supabase,
    startDate,
    effectiveEnd,
  );

  const mondays = listMondaysCovering(startDate, effectiveEnd);
  const byDate: Record<string, LaborDayCell> = {};

  const ensure = (iso: string) => {
    if (!byDate[iso]) byDate[iso] = { total: 0, fixed: 0, overtime: 0 };
    return byDate[iso]!;
  };

  const bumpOt = (iso: string, overtime: number) => {
    if (iso < startDate || iso > effectiveEnd || iso > today) return;
    const cell = ensure(iso);
    cell.overtime = round2(cell.overtime + overtime);
    cell.total = round2(cell.fixed + cell.overtime);
  };

  // --- EXTRAS (HE SSOT) ---
  if (mondays.length > 0) {
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
      const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(
        snapsRes.data ?? [],
      );

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
          bumpOt(iso, amount);
        }
      }
    }
  }

  // --- ORDINARIO (nómina / días naturales) ---
  // Siempre a nivel empresa (no se filtra por trabajador).
  const { byDate: ordinaryByDate, missingPayrollMonths } =
    await ordinaryPromise;

  for (const [iso, fixed] of Object.entries(ordinaryByDate)) {
    if (iso < startDate || iso > effectiveEnd || iso > today) continue;
    const cell = ensure(iso);
    cell.fixed = round2(fixed);
    cell.total = round2(cell.fixed + cell.overtime);
  }

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

export async function buildLaborCostDayDetailFromSsot(
  supabase: SupabaseClient,
  dateYmd: string,
  userId?: string | null,
): Promise<{
  totalCost: number;
  totalFixed: number;
  totalOvertime: number;
  workers: LaborDayWorker[];
  missingPayroll: boolean;
}> {
  const day = dateYmd.split('T')[0]!;
  const weekStart = mondayOf(day);
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

  const ordinaryPromise = loadOrdinaryByDateFromPayroll(supabase, day, day);

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
    const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(
      snapsRes.data ?? [],
    );

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

  const { byDate: ordinaryByDate, missingPayrollMonths } =
    await ordinaryPromise;
  const totalFixed = round2(ordinaryByDate[day] ?? 0);

  // Fila de nómina empresa (ordinario) — no atribuible a un empleado.
  if (totalFixed > 0.005) {
    workers.unshift({
      id: PAYROLL_ORDINARY_ROW_ID,
      name: 'Nómina empresa',
      fixed: totalFixed,
      overtime: 0,
      total: totalFixed,
    });
  }

  workers.sort((a, b) => {
    if (a.id === PAYROLL_ORDINARY_ROW_ID) return -1;
    if (b.id === PAYROLL_ORDINARY_ROW_ID) return 1;
    return b.total - a.total;
  });

  const totalOvertime = round2(
    workers
      .filter((w) => w.id !== PAYROLL_ORDINARY_ROW_ID)
      .reduce((s, w) => s + w.overtime, 0),
  );

  return {
    totalCost: round2(totalFixed + totalOvertime),
    totalFixed,
    totalOvertime,
    workers,
    missingPayroll: missingPayrollMonths.length > 0,
  };
}
