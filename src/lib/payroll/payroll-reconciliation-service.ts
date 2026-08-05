/**
 * PayrollReconciliationService.
 *
 * Servicio de conciliación contable de coste laboral SSOT:
 * - Conciliación Colectiva Informativa (payroll_monthly_totals vs employee_payroll_facts).
 * - Garantiza strictly non-blocking behavior (jamás lanza excepciones ni bloquea flujos).
 * - Calcula automáticamente los estados: NO_SUMMARY, WAITING_PAYROLLS, RECONCILED, PENDING_RECONCILIATION.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayrollFactRepository } from './payroll-fact-repository.ts';
import { ContractTermsService } from './contract-terms-service.ts';
import type { PayrollAllocationService } from './payroll-allocation-service.ts';
import { Money } from './value-objects.ts';
import type {
  PayrollReconciliationStatus,
  PayrollReconciliationSummaryDTO,
} from '../../types/payroll-import.ts';

export type ReconciliationLevelResult = {
  level: number;
  name: string;
  isBalanced: boolean;
  expectedAmount: Money;
  actualAmount: Money;
  difference: Money;
  details: string;
};

export type PayrollReconciliationReportDTO = {
  periodYm: string;
  isFullyBalanced: boolean;
  level1: ReconciliationLevelResult;
  level2: ReconciliationLevelResult[];
  level3: ReconciliationLevelResult;
  level4: {
    hasFullCoverage: boolean;
    uncoveredUserIds: string[];
    details: string;
  };
};

/**
 * Función pura estricta para calcular la conciliación informativa entre el resumen oficial de empresa
 * y la suma de nóminas individuales activas.
 *
 * Invariante: Jamás lanza excepciones ni modifica datos.
 */
export function computePeriodReconciliation(input: {
  summaryCost: number | null | undefined;
  activeFacts: Array<{ user_id: string; total_company_cost: number }>;
}): PayrollReconciliationSummaryDTO {
  const activeFacts = input.activeFacts ?? [];
  const totalPayrolls = Number(
    activeFacts.reduce((sum, f) => sum + (Number(f.total_company_cost) || 0), 0).toFixed(2),
  );
  const importedCount = new Set(activeFacts.map((f) => f.user_id)).size;

  if (input.summaryCost === null || input.summaryCost === undefined) {
    return {
      status: 'NO_SUMMARY',
      totalSummary: 0,
      totalPayrolls,
      difference: 0,
      importedCount,
    };
  }

  const totalSummary = Number(Number(input.summaryCost).toFixed(2));
  const diffRaw = Number((totalSummary - totalPayrolls).toFixed(2));
  const isZeroDiff = Math.abs(diffRaw) < 0.01;

  let status: PayrollReconciliationStatus = 'PENDING_RECONCILIATION';
  if (activeFacts.length === 0) {
    status = 'WAITING_PAYROLLS';
  } else if (isZeroDiff) {
    status = 'RECONCILED';
  } else {
    status = 'PENDING_RECONCILIATION';
  }

  return {
    status,
    totalSummary,
    totalPayrolls,
    difference: isZeroDiff ? 0 : diffRaw,
    importedCount,
  };
}

export class PayrollReconciliationService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService: ContractTermsService,
    private readonly allocationService: PayrollAllocationService,
  ) {}

  /**
   * Obtiene la conciliación colectiva rápida (Nivel 1 Informativo) de forma segura sin lanzar.
   */
  async getQuickReconciliation(periodYm: string): Promise<PayrollReconciliationSummaryDTO> {
    try {
      const [activeFacts, summaryRes] = await Promise.all([
        this.payrollRepo.getActiveFactsForPeriod(periodYm),
        this.supabase
          .from('payroll_monthly_totals')
          .select('total_company_cost')
          .eq('period_ym', periodYm)
          .maybeSingle(),
      ]);

      const summaryCost =
        summaryRes.data?.total_company_cost != null
          ? Number(summaryRes.data.total_company_cost)
          : null;

      return computePeriodReconciliation({ summaryCost, activeFacts });
    } catch {
      return {
        status: 'NO_SUMMARY',
        totalSummary: 0,
        totalPayrolls: 0,
        difference: 0,
        importedCount: 0,
      };
    }
  }

  /**
   * Ejecuta el informe completo de auditoría y conciliación de 4 niveles para un mes.
   */
  async reconcilePeriod(periodYm: string): Promise<PayrollReconciliationReportDTO> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);

    // Lista única de user_ids con hecho contable activo en el mes
    const userIdsWithFacts = Array.from(new Set(activeFacts.map((f) => f.user_id)));

    // --- NIVEL 1: Colectivo (payroll_monthly_totals vs sum(employee_payroll_facts)) ---
    const { data: summaryData } = await this.supabase
      .from('payroll_monthly_totals')
      .select('total_company_cost')
      .eq('period_ym', periodYm)
      .maybeSingle();

    const expectedLevel1 = Money.from(Number(summaryData?.total_company_cost) || 0);
    const actualLevel1Sum = Money.from(
      activeFacts.reduce((sum, f) => sum + Number(f.total_company_cost), 0),
    );
    const diffLevel1 = expectedLevel1.subtract(actualLevel1Sum);

    const level1: ReconciliationLevelResult = {
      level: 1,
      name: 'Conciliación Colectiva (Empresa vs Nóminas Individuales)',
      isBalanced: diffLevel1.isZero(),
      expectedAmount: expectedLevel1,
      actualAmount: actualLevel1Sum,
      difference: diffLevel1,
      details: diffLevel1.isZero()
        ? 'Nóminas individuales 100% coincidentes con el total de gestoría'
        : `Diferencia de gestoría: ${diffLevel1.amount} €`,
    };

    // --- NIVEL 2: Individual (Suma de fijos diarios vs Nómina mensual consolidada por trabajador) ---
    const level2Results: ReconciliationLevelResult[] = [];
    let sumLevel3Actual = Money.zero();
    let sumLevel3Expected = Money.zero();

    for (const userId of userIdsWithFacts) {
      const monthlyCost = await this.payrollRepo.getMonthlyCompanyCostConsolidated(
        userId,
        periodYm,
      );
      sumLevel3Expected = sumLevel3Expected.add(monthlyCost);

      let workerDailySum = Money.zero();
      for (const dayYmd of monthDays) {
        const dailyCost = await this.allocationService.getDailyPayrollCost(userId, dayYmd);
        workerDailySum = workerDailySum.add(dailyCost.dailyFixedCost);
      }

      sumLevel3Actual = sumLevel3Actual.add(workerDailySum);
      const diffWorker = monthlyCost.subtract(workerDailySum);

      level2Results.push({
        level: 2,
        name: `Conciliación Individual (Usuario ${userId})`,
        isBalanced: diffWorker.isZero(),
        expectedAmount: monthlyCost,
        actualAmount: workerDailySum,
        difference: diffWorker,
        details: diffWorker.isZero()
          ? 'Suma de fijos diarios coincide al 100% con la nómina del trabajador'
          : `Diferencia por redondeo/días: ${diffWorker.amount} €`,
      });
    }

    // --- NIVEL 3: Colectivo Diario (Suma fijos diarios plantilla vs Total nóminas individuales) ---
    const diffLevel3 = sumLevel3Expected.subtract(sumLevel3Actual);
    const level3: ReconciliationLevelResult = {
      level: 3,
      name: 'Conciliación Colectiva Diaria (Plantilla)',
      isBalanced: diffLevel3.isZero(),
      expectedAmount: sumLevel3Expected,
      actualAmount: sumLevel3Actual,
      difference: diffLevel3,
      details: diffLevel3.isZero()
        ? 'Ningún céntimo de la plantilla se ha creado o perdido en el reparto diario'
        : `Diferencia de reparto colectivo: ${diffLevel3.amount} €`,
    };

    // --- NIVEL 4: Cobertura Contractual ---
    const uncoveredUserIds: string[] = [];
    for (const userId of userIdsWithFacts) {
      const activeDays = await this.contractTermsService.getActiveContractDays(
        userId,
        periodYm,
      );
      if (activeDays === 0) {
        uncoveredUserIds.push(userId);
      }
    }

    const hasFullCoverage = uncoveredUserIds.length === 0;
    const level4 = {
      hasFullCoverage,
      uncoveredUserIds,
      details: hasFullCoverage
        ? 'Todos los trabajadores con nómina poseen tramos en hours_contract_terms'
        : `${uncoveredUserIds.length} trabajadores con nómina sin tramos contractuales`,
    };

    const isFullyBalanced =
      level1.isBalanced && level3.isBalanced && level4.hasFullCoverage;

    return {
      periodYm,
      isFullyBalanced,
      level1,
      level2: level2Results,
      level3,
      level4,
    };
  }
}
