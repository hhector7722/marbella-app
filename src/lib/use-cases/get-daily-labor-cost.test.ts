import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetDailyLaborCostUseCase } from './get-daily-labor-cost.ts';
import { laborSupabaseFixture, payrollFixture } from '../read-models/labor-cost-test-fixture.ts';

describe('Detalle diario del coste laboral', () => {
  it('usa ventas netas y solo las horas fichadas valoradas según la nómina oficial', async () => {
    const useCase = new GetDailyLaborCostUseCase(laborSupabaseFixture(payrollFixture));
    const dto = await useCase.execute('2026-07-15', { includeAllContracted: true });
    assert.equal(dto.dateYmd, '2026-07-15');
    assert.equal(dto.netSales, 1500);
    assert.ok(dto.totalFixed > 0);
    assert.ok(Array.isArray(dto.workers));
  });
});
