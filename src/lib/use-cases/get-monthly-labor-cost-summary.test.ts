import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetMonthlyLaborCostSummaryUseCase } from './get-monthly-labor-cost-summary.ts';
import { laborSupabaseFixture, payrollFixture } from '../read-models/labor-cost-test-fixture.ts';

describe('Coste laboral mensual — SSOT gestoría', () => {
  it('concilia el calendario al céntimo sin fichajes y con trabajadores ocultos', async () => {
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(payrollFixture));
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 4100);
    assert.equal(dto.totalCost, 4100);
    assert.equal(Object.keys(dto.byDate).length, 31);
    assert.equal(Number(Object.values(dto.byDate).reduce((s, c) => s + c.fixed, 0).toFixed(2)), 4100);
    assert.equal(dto.byDate['2026-07-15']?.laborPctOfSales !== null, true);
    assert.equal(dto.missingPayrollMonths.length, 0);
  });

  it('el filtro por trabajador y el intervalo parcial prorratean correctamente', async () => {
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(payrollFixture));
    const individual = await useCase.execute({
      startDate: '2026-07-01', endDate: '2026-07-31', userId: 'usr_active',
    });
    assert.equal(individual.totalFixed, 3100);

    const partial = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-15' });
    assert.equal(Object.keys(partial.byDate).length, 15);
    assert.equal(partial.totalFixed, 1983.75);
    assert.ok(partial.totalFixed < 4100);
  });

  it('no inventa costes fijos en meses sin resumen oficial', async () => {
    const seed = { ...payrollFixture, payroll_monthly_totals: [] };
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed));
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 0);
    assert.deepEqual(dto.missingPayrollMonths, ['2026-07']);
  });
});
