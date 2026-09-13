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
 *   `weekly_snapshot_days.overtime_cost` (proyección persistida). Sin Hours Engine.
 *
 * TOTAL:
 *   coste_total_dia = coste_ordinario_dia + coste_extras_dia
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  allocatePayrollToNaturalDays,
  monthKeysCovering,
} from './payroll-ordinary-daily.ts';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import { loadOvertimeCostByDay } from '@/lib/read-models/overtime-cost-from-projection';

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

async function loadVisibleProfiles(
  supabase: SupabaseClient,
  userId?: string | null,
) {
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

  const { data: profileRows, error: profileErr } = await profilesQuery;
  if (profileErr) throw profileErr;
  return filterVisiblePlantillaEmployees(profileRows ?? []);
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

  const profiles = await loadVisibleProfiles(supabase, options.userId);
  const overtimeByUser = await loadOvertimeCostByDay(
    supabase,
    profiles.map((profile) => profile.id),
    startDate,
    effectiveEnd,
  );
  for (const perDay of overtimeByUser.values()) {
    for (const [iso, cell] of perDay) {
      bumpOt(iso, cell.overtimeCost);
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

  const ordinaryPromise = loadOrdinaryByDateFromPayroll(supabase, day, day);
  const profiles = await loadVisibleProfiles(supabase, userId);
  const overtimeByUser = await loadOvertimeCostByDay(
    supabase,
    profiles.map((profile) => profile.id),
    day,
    day,
  );

  const workers: LaborDayWorker[] = [];

  for (const profile of profiles) {
    const overtime = overtimeByUser.get(profile.id)?.get(day)?.overtimeCost ?? 0;
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
