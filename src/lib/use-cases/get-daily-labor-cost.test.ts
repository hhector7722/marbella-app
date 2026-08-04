import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetDailyLaborCostUseCase } from './get-daily-labor-cost.ts';

describe('FASE 5: GetDailyLaborCostUseCase (Clean Architecture Use Case)', () => {
  it('ejecuta el Caso de Uso y retorna el DTO del Read Model V2', async () => {
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

    const useCase = new GetDailyLaborCostUseCase(mockSupabase);
    const dto = await useCase.execute('2026-07-15', { includeAllContracted: true });

    assert.equal(dto.dateYmd, '2026-07-15');
    assert.equal(dto.netSales, 1200);
    assert.ok(Array.isArray(dto.workers));
  });
});
