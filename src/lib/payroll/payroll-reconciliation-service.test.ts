import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PayrollReconciliationService,
  computePeriodReconciliation,
} from './payroll-reconciliation-service.ts';
import { Money } from './value-objects.ts';

describe('FASE 3: PayrollReconciliationService (4 Niveles de Conciliación)', () => {
  it('calcula los estados de conciliación informativa estrictamente no bloqueantes (computePeriodReconciliation)', () => {
    // 1. NO_SUMMARY: Sin resumen de gestoría
    const resNoSummary = computePeriodReconciliation({
      summaryCost: null,
      activeFacts: [{ user_id: 'usr_1', total_company_cost: 1000 }],
    });
    assert.equal(resNoSummary.status, 'NO_SUMMARY');
    assert.equal(resNoSummary.totalSummary, 0);
    assert.equal(resNoSummary.totalPayrolls, 1000);
    assert.equal(resNoSummary.difference, 0);

    // 2. WAITING_PAYROLLS: Existe resumen gestoría pero 0 hechos contables activos
    const resWaiting = computePeriodReconciliation({
      summaryCost: 12843.19,
      activeFacts: [],
    });
    assert.equal(resWaiting.status, 'WAITING_PAYROLLS');
    assert.equal(resWaiting.totalSummary, 12843.19);
    assert.equal(resWaiting.totalPayrolls, 0);
    assert.equal(resWaiting.difference, 12843.19);

    // 3. PENDING_RECONCILIATION: Existe resumen gestoría y nóminas parciales importadas (diferencia != 0)
    const resPending = computePeriodReconciliation({
      summaryCost: 12843.19,
      activeFacts: [
        { user_id: 'usr_1', total_company_cost: 6000 },
        { user_id: 'usr_2', total_company_cost: 5052.44 },
      ],
    });
    assert.equal(resPending.status, 'PENDING_RECONCILIATION');
    assert.equal(resPending.totalSummary, 12843.19);
    assert.equal(resPending.totalPayrolls, 11052.44);
    assert.equal(resPending.difference, 1790.75);
    assert.equal(resPending.importedCount, 2);

    // 4. RECONCILED: Resumen coincide exactamente con la suma de hechos activos
    const resReconciled = computePeriodReconciliation({
      summaryCost: 12843.19,
      activeFacts: [
        { user_id: 'usr_1', total_company_cost: 6000 },
        { user_id: 'usr_2', total_company_cost: 6843.19 },
      ],
    });
    assert.equal(resReconciled.status, 'RECONCILED');
    assert.equal(resReconciled.totalSummary, 12843.19);
    assert.equal(resReconciled.totalPayrolls, 12843.19);
    assert.equal(resReconciled.difference, 0);
    assert.equal(resReconciled.importedCount, 2);
  });

  it('ejecuta los 4 niveles de conciliación y confirma estado balanceado', async () => {
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'payroll_monthly_totals') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { total_company_cost: 3100 },
                  }),
              }),
            }),
          };
        }
        return {};
      },
    };

    const mockPayrollRepo: any = {
      getActiveFactsForPeriod: () =>
        Promise.resolve([{ user_id: 'usr_1', total_company_cost: 3100 }]),
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.from(3100)),
      getActiveFactsForUser: () =>
        Promise.resolve([{ user_id: 'usr_1', total_company_cost: 3100 }]),
    };

    const mockContractService: any = {
      getActiveContractDays: () => Promise.resolve(31),
    };

    const mockAllocationService: any = {
      getDailyPayrollCost: () =>
        Promise.resolve({
          userId: 'usr_1',
          dailyFixedCost: Money.from(100), // 3100 / 31 = 100
        }),
    };

    const reconciliationService = new PayrollReconciliationService(
      mockSupabase,
      mockPayrollRepo,
      mockContractService,
      mockAllocationService,
    );

    const report = await reconciliationService.reconcilePeriod('2026-07');

    assert.equal(report.isFullyBalanced, true);
    assert.equal(report.level1.isBalanced, true);
    assert.equal(report.level1.expectedAmount.amount, 3100);
    assert.equal(report.level1.actualAmount.amount, 3100);

    assert.equal(report.level3.isBalanced, true);
    assert.equal(report.level3.expectedAmount.amount, 3100);
    assert.equal(report.level3.actualAmount.amount, 3100);

    assert.equal(report.level4.hasFullCoverage, true);
    assert.equal(report.level4.uncoveredUserIds.length, 0);
  });
});
