/**
 * PayrollAllocationService (FASE 3 - Núcleo del Dominio).
 *
 * Implementa la regla oficial inviolable de reparto de coste fijo diario:
 *
 *   coste_fijo_diario = coste_empresa_consolidado_mes / D_vigentes
 *
 * La división siempre utiliza los días de contrato realmente vigentes en el mes (D_vigentes).
 * NUNCA días naturales del mes, NUNCA horas semanales, NUNCA estimaciones.
 *
 * Consume exclusivamente repositorios y servicios de dominio. Cero consultas directas a BD.
 */

import type { PayrollFactRepository } from './payroll-fact-repository.ts';
import type { ContractTermsService } from './contract-terms-service.ts';
import { Money } from './value-objects.ts';

export type DailyPayrollCostDTO = {
  userId: string;
  dateYmd: string;
  periodYm: string;
  dailyFixedCost: Money;
  monthlyCompanyCost: Money;
  activeContractDays: number;
  isContractActiveOnDate: boolean;
  traceability: {
    periodYm: string;
    settlementsCount: number;
    formula: string;
  };
};

export class PayrollAllocationService {
  constructor(
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService: ContractTermsService,
  ) {}

  /**
   * Calcula el coste fijo diario para un trabajador en una fecha determinada.
   */
  async getDailyPayrollCost(userId: string, dateYmd: string): Promise<DailyPayrollCostDTO> {
    const batchResults = await this.getDailyPayrollCostBatch([userId], dateYmd);
    return (
      batchResults[userId] ?? {
        userId,
        dateYmd,
        periodYm: dateYmd.substring(0, 7),
        dailyFixedCost: Money.zero(),
        monthlyCompanyCost: Money.zero(),
        activeContractDays: 0,
        isContractActiveOnDate: false,
        traceability: {
          periodYm: dateYmd.substring(0, 7),
          settlementsCount: 0,
          formula: '0 / 0 = 0.00 € (Sin datos)',
        },
      }
    );
  }

  /**
   * Calcula en lote el coste fijo diario para múltiples trabajadores en una fecha.
   */
  async getDailyPayrollCostBatch(
    userIds: string[],
    dateYmd: string,
  ): Promise<Record<string, DailyPayrollCostDTO>> {
    if (userIds.length === 0) return {};

    const day = dateYmd.split('T')[0]!;
    const periodYm = day.substring(0, 7);

    // 1. Obtener D_vigentes para todos los usuarios en lote vía ContractTermsService
    const activeDaysBatch = await this.contractTermsService.getActiveContractDaysBatch(
      userIds,
      periodYm,
    );

    const result: Record<string, DailyPayrollCostDTO> = {};

    for (const userId of userIds) {
      // 2. Obtener coste mensual consolidado vía PayrollFactRepository
      const monthlyCost = await this.payrollRepo.getMonthlyCompanyCostConsolidated(
        userId,
        periodYm,
      );
      const activeFacts = await this.payrollRepo.getActiveFactsForUser(userId, periodYm);

      const activeContractDays = activeDaysBatch[userId] ?? 0;
      const isContractActive = await this.contractTermsService.isContractActiveOn(
        userId,
        day,
      );

      let dailyFixedCost = Money.zero();
      let formula = `${monthlyCost.amount} € / ${activeContractDays} días (Sin contrato activo en fecha)`;

      // Regla Oficial: Solo si el día cae dentro del rango de contrato activo y D_vigentes > 0
      if (isContractActive && activeContractDays > 0 && !monthlyCost.isZero()) {
        dailyFixedCost = monthlyCost.divide(activeContractDays);
        formula = `${monthlyCost.amount} € / ${activeContractDays} días vigentes = ${dailyFixedCost.amount} €/día`;
      } else if (activeContractDays === 0) {
        formula = `0 € (Eventual / Sin tramos en hours_contract_terms)`;
      }

      result[userId] = {
        userId,
        dateYmd: day,
        periodYm,
        dailyFixedCost,
        monthlyCompanyCost: monthlyCost,
        activeContractDays,
        isContractActiveOnDate: isContractActive,
        traceability: {
          periodYm,
          settlementsCount: activeFacts.length,
          formula,
        },
      };
    }

    return result;
  }
}
