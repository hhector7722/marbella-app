/**
 * Resumen de coste laboral para mes o rango.
 *
 * Cada mes usa exactamente la misma proyección oficial; las selecciones
 * parciales suman únicamente sus días, evitando volver a calcular costes
 * por fichajes y evitando N consultas por cada día del rango.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LaborCostDayReadModelProjector } from '../read-models/labor-cost-day-projector.ts';
import { LaborCostMonthReadModelProjector } from '../read-models/labor-cost-month-projector.ts';
import { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { Money } from '../payroll/value-objects.ts';
import type { PayrollReconciliationSummaryDTO } from '../../types/payroll-import.ts';

export interface MonthlyLaborCostSummaryDTO {
  startDate: string;
  endDate: string;
  byDate: Record<
    string,
    {
      totalCost: number;
      totalFixed: number;
      totalOvertime: number;
      total: number;
      fixed: number;
      overtime: number;
      laborPctOfSales: number | null;
    }
  >;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
  isPayrollPending: boolean;
  missingPayrollMonths: string[];
  reconciliation: PayrollReconciliationSummaryDTO;
}

export class GetMonthlyLaborCostSummaryUseCase {
  private readonly monthProjector: LaborCostMonthReadModelProjector;

  constructor(supabase: SupabaseClient) {
    const payrollRepo = new PayrollFactRepository(supabase);
    const contractTermsService = new ContractTermsService(supabase);
    const allocationService = new PayrollAllocationService(payrollRepo, contractTermsService);
    const dayProjector = new LaborCostDayReadModelProjector(
      supabase, allocationService, contractTermsService, payrollRepo,
    );
    this.monthProjector = new LaborCostMonthReadModelProjector(
      supabase, dayProjector, payrollRepo, contractTermsService,
    );
  }

  async execute(input: {
    startDate: string;
    endDate: string;
    userId?: string | null;
  }): Promise<MonthlyLaborCostSummaryDTO> {
    const startDate = input.startDate.slice(0, 10);
    const endDate = input.endDate.slice(0, 10);
    if (endDate < startDate) throw new Error('Rango de coste laboral inválido');

    const byDate: MonthlyLaborCostSummaryDTO['byDate'] = {};
    const missingMonths = new Set<string>();
    let totalFixed = Money.zero();
    let totalOvertime = Money.zero();
    let reconciliation: PayrollReconciliationSummaryDTO | null = null;

    let [year, month] = startDate.slice(0, 7).split('-').map(Number) as [number, number];
    const lastMonth = endDate.slice(0, 7);

    while (`${year}-${String(month).padStart(2, '0')}` <= lastMonth) {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const monthDto = await this.monthProjector.projectMonthSummary(ym, {
        userId: input.userId ?? null,
      });
      if (!reconciliation) reconciliation = monthDto.reconciliation;
      for (const [date, cell] of Object.entries(monthDto.byDate)) {
        if (date < startDate || date > endDate) continue;
        byDate[date] = {
          totalCost: cell.totalCost,
          totalFixed: cell.totalFixed,
          totalOvertime: cell.totalOvertime,
          total: cell.totalCost,
          fixed: cell.totalFixed,
          overtime: cell.totalOvertime,
          laborPctOfSales: cell.laborPctOfSales,
        };
        totalFixed = totalFixed.add(Money.from(cell.totalFixed));
        totalOvertime = totalOvertime.add(Money.from(cell.totalOvertime));
      }
      for (const missing of monthDto.missingPayrollMonths) missingMonths.add(missing);
      if (++month === 13) { year++; month = 1; }
    }

    if (!reconciliation) throw new Error('No se pudo calcular la conciliación de nóminas');
    return {
      startDate,
      endDate,
      byDate,
      totalFixed: totalFixed.amount,
      totalOvertime: totalOvertime.amount,
      totalCost: totalFixed.add(totalOvertime).amount,
      isPayrollPending: missingMonths.size > 0,
      missingPayrollMonths: Array.from(missingMonths),
      reconciliation,
    };
  }
}
