import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollReconciliationService } from './payroll-reconciliation-service.ts';
import { Money } from './value-objects.ts';

describe('FASE 3: PayrollReconciliationService (4 Niveles de Conciliación)', () => {
  it('ejecuta los 4 niveles de conciliación y confirma estado balanceado', async () => {
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'payroll_monthly_totals') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
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
      getActiveFactsForPeriod: () => Promise.resolve([
        { user_id: 'usr_1', total_company_cost: 3100 },
      ]),
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.from(3100)),
      getActiveFactsForUser: () => Promise.resolve([
        { user_id: 'usr_1', total_company_cost: 3100 },
      ]),
    };

    const mockContractService: any = {
      getActiveContractDays: () => Promise.resolve(31),
    };

    const mockAllocationService: any = {
      getDailyPayrollCost: () => Promise.resolve({
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

  it('detecta descalibres de gestoría en Nivel 1 si la suma individual no coincide', async () => {
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { total_company_cost: 3200 }, // Difiere: gestoría 3200 vs personas 3100
            }),
          }),
        }),
      }),
    };

    const mockPayrollRepo: any = {
      getActiveFactsForPeriod: () => Promise.resolve([
        { user_id: 'usr_1', total_company_cost: 3100 },
      ]),
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.from(3100)),
      getActiveFactsForUser: () => Promise.resolve([
        { user_id: 'usr_1', total_company_cost: 3100 },
      ]),
    };

    const mockContractService: any = {
      getActiveContractDays: () => Promise.resolve(31),
    };

    const mockAllocationService: any = {
      getDailyPayrollCost: () => Promise.resolve({
        userId: 'usr_1',
        dailyFixedCost: Money.from(100),
      }),
    };

    const reconciliationService = new PayrollReconciliationService(
      mockSupabase,
      mockPayrollRepo,
      mockContractService,
      mockAllocationService,
    );

    const report = await reconciliationService.reconcilePeriod('2026-07');

    assert.equal(report.isFullyBalanced, false);
    assert.equal(report.level1.isBalanced, false);
    assert.equal(report.level1.difference.amount, 100); // 3200 - 3100 = 100
  });
});
