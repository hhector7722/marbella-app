import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetMonthlyLaborCostSummaryUseCase } from './get-monthly-labor-cost-summary.ts';

describe('FASE 10: GetMonthlyLaborCostSummaryUseCase', () => {
  it('proyecta el resumen mensual con byDate y totales V2', async () => {
    const mockSupabase: any = {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          gte: () => chain,
          lte: () => chain,
          or: () => Promise.resolve({ data: [{ id: 'term_1' }], error: null }),
          maybeSingle: () => Promise.resolve({ data: { total_net_amount: 1200 } }),
          order: () => Promise.resolve({ data: [], error: null }),
        };

        if (table === 'daily_sales') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { total_net_amount: 1200 } }) }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => Promise.resolve({
              data: [{ id: 'usr_test', first_name: 'Test', last_name: 'Worker', visible_in_plantilla: true }],
            }),
          };
        }
        if (table === 'employee_payroll_facts') {
          const factsChain: any = {
            select: () => factsChain,
            eq: () => factsChain,
            then: (resolve: any) => resolve({
              data: [{ id: 'fact_1', user_id: 'usr_test', period_ym: '2026-07', total_company_cost: 3100, status: 'active' }],
              error: null,
            }),
          };
          return factsChain;
        }
        return chain;
      },
    };

    const useCase = new GetMonthlyLaborCostSummaryUseCase(mockSupabase);
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });

    assert.equal(dto.startDate, '2026-07-01');
    assert.ok(dto.byDate);
    assert.equal(typeof dto.totalCost, 'number');
  });
});
