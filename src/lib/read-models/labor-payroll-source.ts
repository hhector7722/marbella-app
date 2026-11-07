/**
 * Resuelve la nómina que usa el coste laboral:
 * - Oficial, cuando existe el resumen del mes.
 * - Solo en el mes en curso sin resumen: estimación con el coste empresa
 *   y las nóminas individuales del mes natural inmediatamente anterior.
 *
 * No escribe hechos contables, no sustituye nóminas individuales actuales
 * incompletas ni presenta una estimación como una nómina oficial.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import type { EmployeePayrollFactRow } from '../../types/payroll-facts.ts';

type MonthlySummaryRow = {
  period_ym: string;
  period_start: string;
  period_end: string;
  total_company_cost: number | string | null;
};

export type LaborPayrollSource = {
  officialFacts: EmployeePayrollFactRow[];
  calculationFacts: EmployeePayrollFactRow[];
  officialSummary: MonthlySummaryRow | null;
  estimatedCompanyCost: number | null;
  isPayrollPending: boolean;
  isPayrollEstimated: boolean;
};

export function previousLaborMonthYm(periodYm: string): string {
  const [year, month] = periodYm.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Mes de nómina inválido');
  }
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export async function resolveLaborPayrollSource(
  supabase: SupabaseClient,
  payrollRepo: PayrollFactRepository,
  periodYm: string,
  todayYmd: string = formatYmdInMadrid(new Date()) ?? '',
): Promise<LaborPayrollSource> {
  const [officialFacts, summaryResult] = await Promise.all([
    payrollRepo.getActiveFactsForPeriod(periodYm),
    supabase.from('payroll_monthly_totals')
      .select('period_ym,period_start,period_end,total_company_cost')
      .eq('period_ym', periodYm).maybeSingle(),
  ]);
  if (summaryResult.error) {
    throw new Error('payroll_monthly_totals: ' + summaryResult.error.message);
  }

  const officialSummary = summaryResult.data as MonthlySummaryRow | null;
  const isPayrollPending = officialSummary?.total_company_cost == null;
  if (!isPayrollPending || periodYm !== todayYmd.slice(0, 7)) {
    return {
      officialFacts, calculationFacts: officialFacts, officialSummary,
      estimatedCompanyCost: null, isPayrollPending, isPayrollEstimated: false,
    };
  }

  const previousYm = previousLaborMonthYm(periodYm);
  const [previousSummaryResult, previousFacts] = await Promise.all([
    supabase.from('payroll_monthly_totals')
      .select('total_company_cost')
      .eq('period_ym', previousYm).maybeSingle(),
    payrollRepo.getActiveFactsForPeriod(previousYm),
  ]);
  if (previousSummaryResult.error) {
    throw new Error('payroll_monthly_totals (mes anterior): ' + previousSummaryResult.error.message);
  }

  const previousCost = previousSummaryResult.data?.total_company_cost;
  const estimate = previousCost == null ? null : Number(previousCost);
  const isPayrollEstimated = estimate !== null && Number.isFinite(estimate) && estimate >= 0;
  return {
    officialFacts,
    calculationFacts: isPayrollEstimated ? previousFacts : officialFacts,
    officialSummary,
    estimatedCompanyCost: isPayrollEstimated ? estimate : null,
    isPayrollPending,
    isPayrollEstimated,
  };
}
