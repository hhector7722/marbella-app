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

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from './opening-carry.ts';
import { loadEmployeeBoundaryFacts } from './load-employee-facts.ts';
import type { CivilDate, EmployeeBoundaryFacts, TimeLogFact } from './types.ts';
import {
  allocatePayrollToNaturalDays,
  monthKeysCovering,
} from './payroll-ordinary-daily.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import {
  hoursWindowBounds,
  listMondaysInclusive,
  overtimeMoneyByDayFromChain,
  resolveWindowOpeningCarry,
  WEEKLY_SNAPSHOT_WINDOW_SELECT,
  type WindowSnapRow,
} from './window-hours-chain.ts';
import { mondayOnOrBefore } from './week-dates.ts';

export { allocatePayrollToNaturalDays } from './payroll-ordinary-daily.ts';
export { allocateWeekCostToDays } from './allocate-week-cost-to-days.ts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

function mondayOf(ymd: string): CivilDate {
  return mondayOnOrBefore(ymd.split('T')[0]! as CivilDate);
}

function listMondaysCovering(startYmd: string, endYmd: string): CivilDate[] {
  return listMondaysInclusive(mondayOf(startYmd), mondayOf(endYmd));
}

function toEngineLogs(
  rows: Array<{ clock_in: string; clock_out: string | null; total_hours: number | null }>,
): TimeLogFact[] {
  return rows.map((l) => ({
    clockInIso: l.clock_in,
    clockOutIso: l.clock_out,
    totalHours: l.total_hours,
  }));
}

async function loadEmployeeOvertimeByDay(
  supabase: SupabaseClient,
  userId: string,
  employee: EmployeeBoundaryFacts,
  firstMonday: CivilDate,
  lastMonday: CivilDate,
): Promise<Record<string, number> | null> {
  const weekStarts = listMondaysInclusive(firstMonday, lastMonday);
  const { logsFrom, lastSunday, snapsTo } = hoursWindowBounds(firstMonday, lastMonday);

  const load = async (fromYmd: string) => {
    const { startIso, endIso } = madridRangeUtcIso(fromYmd, lastSunday);
    const [snapsRes, logsRes] = await Promise.all([
      supabase
        .from('weekly_snapshots')
        .select(WEEKLY_SNAPSHOT_WINDOW_SELECT)
        .eq('user_id', userId)
        .gte('week_start', fromYmd)
        .lte('week_start', snapsTo),
      supabase
        .from('time_logs')
        .select('clock_in, clock_out, total_hours')
        .eq('user_id', userId)
        .gte('clock_in', startIso)
        .lte('clock_in', endIso),
    ]);
    if (snapsRes.error || logsRes.error) return null;
    return {
      snaps: (snapsRes.data ?? []) as WindowSnapRow[],
      logs: toEngineLogs((logsRes.data ?? []) as Array<{
        clock_in: string;
        clock_out: string | null;
        total_hours: number | null;
      }>),
    };
  };

  const short = await load(logsFrom);
  if (!short) return null;

  let snaps = short.snaps;
  let logs = short.logs;
  let opening = resolveWindowOpeningCarry({
    employee,
    firstWeekStart: firstMonday,
    snaps,
    logs,
  });

  if ('needsFullReplay' in opening) {
    const timelineStart = employeeTimelineStartWeek(employee);
    const fromYmd =
      timelineStart && timelineStart < firstMonday ? timelineStart : firstMonday;
    const full = await load(fromYmd);
    if (!full) return null;
    snaps = full.snaps;
    logs = full.logs;
    opening = {
      carryIn: resolveOpeningCarryIn({
        employee,
        chainStart: firstMonday,
        logs,
        isPaidByWeek: isPaidLookupFromRows(snaps),
        bagModeOverrideByWeek: bagModeOverrideLookupFromRows(snaps),
      }),
    };
  }

  return overtimeMoneyByDayFromChain({
    employee,
    weekStarts,
    snaps,
    logs,
    openingCarryIn: opening.carryIn,
  });
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

      const byDay = await loadEmployeeOvertimeByDay(
        supabase,
        profile.id,
        employee,
        firstMonday,
        lastMonday,
      );
      if (!byDay) continue;
      for (const [iso, amount] of Object.entries(byDay)) {
        bumpOt(iso, amount);
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

    const byDay = await loadEmployeeOvertimeByDay(
      supabase,
      profile.id,
      employee,
      weekStart,
      weekStart,
    );
    const overtime = byDay?.[day] ?? 0;
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
