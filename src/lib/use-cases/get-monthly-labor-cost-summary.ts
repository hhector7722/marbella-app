/**
 * GetMonthlyLaborCostSummaryUseCase (FASE 10 - Cutover Final).
 *
 * Caso de uso de aplicación Clean Architecture / CQRS para la proyección de periodo / resumen mensual de coste laboral V2:
 * - Sustituye definitivamente a `buildLaborCostPeriodFromSsot`.
 * - Consume el Read Model V2 (`LaborCostMonthReadModelProjector` y `LaborCostDayReadModelProjector`).
 * - Retorna los totales consolidados (`totalFixed`, `totalOvertime`, `totalCost`), `byDate`, estados de nómina y conciliación informativa.
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
  private readonly dayProjector: LaborCostDayReadModelProjector;
  private readonly monthProjector: LaborCostMonthReadModelProjector;

  constructor(private readonly supabase: SupabaseClient) {
    const payrollRepo = new PayrollFactRepository(supabase);
    const contractTermsService = new ContractTermsService(supabase);
    const allocationService = new PayrollAllocationService(payrollRepo, contractTermsService);
    this.dayProjector = new LaborCostDayReadModelProjector(
      supabase,
      allocationService,
      contractTermsService,
      payrollRepo,
    );
    this.monthProjector = new LaborCostMonthReadModelProjector(
      supabase,
      this.dayProjector,
      payrollRepo,
      contractTermsService,
    );
  }

  /**
   * Ejecuta la proyección del periodo para el resumen de coste laboral V2.
   */
  async execute(input: {
    startDate: string;
    endDate: string;
    userId?: string | null;
  }): Promise<MonthlyLaborCostSummaryDTO> {
    const startMonth = input.startDate.slice(0, 7);
    const endMonth = input.endDate.slice(0, 7);

    // Si es un único mes estándar YYYY-MM
    if (startMonth === endMonth) {
      const monthDto = await this.monthProjector.projectMonthSummary(startMonth);
      const byDateFormatted: MonthlyLaborCostSummaryDTO['byDate'] = {};

      for (const [dateKey, cell] of Object.entries(monthDto.byDate)) {
        byDateFormatted[dateKey] = {
          totalCost: cell.totalCost,
          totalFixed: cell.totalFixed,
          totalOvertime: cell.totalOvertime,
          total: cell.totalCost,
          fixed: cell.totalFixed,
          overtime: cell.totalOvertime,
          laborPctOfSales: cell.laborPctOfSales,
        };
      }

      return {
        startDate: input.startDate,
        endDate: input.endDate,
        byDate: byDateFormatted,
        totalFixed: monthDto.totalFixed,
        totalOvertime: monthDto.totalOvertime,
        totalCost: monthDto.totalCost,
        isPayrollPending: monthDto.isPayrollPending,
        missingPayrollMonths: monthDto.missingPayrollMonths,
        reconciliation: monthDto.reconciliation,
      };
    }

    // Para rangos multi-mes
    let current = new Date(input.startDate + 'T00:00:00Z');
    const end = new Date(input.endDate + 'T00:00:00Z');
    const byDate: MonthlyLaborCostSummaryDTO['byDate'] = {};
    let totalFixedMoney = Money.zero();
    let totalOvertimeMoney = Money.zero();
    const missingMonths = new Set<string>();

    while (current <= end) {
      const dayYmd = current.toISOString().split('T')[0]!;
      const dayDto = await this.dayProjector.projectDayDetail(dayYmd, { userId: input.userId });

      byDate[dayYmd] = {
        totalCost: dayDto.totalCost,
        totalFixed: dayDto.totalFixed,
        totalOvertime: dayDto.totalOvertime,
        total: dayDto.totalCost,
        fixed: dayDto.totalFixed,
        overtime: dayDto.totalOvertime,
        laborPctOfSales: dayDto.laborPctOfSales,
      };

      totalFixedMoney = totalFixedMoney.add(Money.from(dayDto.totalFixed));
      totalOvertimeMoney = totalOvertimeMoney.add(Money.from(dayDto.totalOvertime));

      if (dayDto.isPayrollPending) {
        missingMonths.add(dayYmd.slice(0, 7));
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const totalCostMoney = totalFixedMoney.add(totalOvertimeMoney);

    // Conciliación del mes inicial en rangos multi-mes
    const startMonthDto = await this.monthProjector.projectMonthSummary(startMonth);

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      byDate,
      totalFixed: totalFixedMoney.amount,
      totalOvertime: totalOvertimeMoney.amount,
      totalCost: totalCostMoney.amount,
      isPayrollPending: missingMonths.size > 0,
      missingPayrollMonths: Array.from(missingMonths),
      reconciliation: startMonthDto.reconciliation,
    };
  }
}
