/**
 * LaborCostMonthReadModelProjector (FASE 4).
 *
 * Proyector encargado de construir el resumen mensual para el calendario del Dashboard.
 * Reutiliza LaborCostDayReadModelProjector para garantizar consistencia sin duplicar código.
 */

import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { LaborCostDayReadModelProjector } from './labor-cost-day-projector.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import type { LaborCostMonthSummaryDTO } from './labor-cost-dtos.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';

export class LaborCostMonthReadModelProjector {
  constructor(
    private readonly dayProjector: LaborCostDayReadModelProjector,
    private readonly payrollRepo: PayrollFactRepository,
  ) {}

  /**
   * Proyecta el calendario mensual con fijos, extras, totales y porcentajes por día.
   */
  async projectMonthSummary(
    periodYm: string,
    options?: { includeAllContracted?: boolean },
  ): Promise<LaborCostMonthSummaryDTO> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const isPayrollPending = activeFacts.length === 0;

    const byDate: LaborCostMonthSummaryDTO['byDate'] = {};
    let totalFixedMoney = Money.zero();
    let totalOvertimeMoney = Money.zero();

    for (const dayYmd of monthDays) {
      const dayDetail = await this.dayProjector.projectDayDetail(dayYmd, options);

      byDate[dayYmd] = {
        totalCost: dayDetail.totalCost,
        totalFixed: dayDetail.totalFixed,
        totalOvertime: dayDetail.totalOvertime,
        laborPctOfSales: dayDetail.laborPctOfSales,
      };

      totalFixedMoney = totalFixedMoney.add(Money.from(dayDetail.totalFixed));
      totalOvertimeMoney = totalOvertimeMoney.add(Money.from(dayDetail.totalOvertime));
    }

    const totalCostMoney = totalFixedMoney.add(totalOvertimeMoney);

    return {
      periodYm,
      byDate,
      totalFixed: totalFixedMoney.amount,
      totalOvertime: totalOvertimeMoney.amount,
      totalCost: totalCostMoney.amount,
      isPayrollPending,
      missingPayrollMonths: isPayrollPending ? [periodYm] : [],
    };
  }
}
