/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Supabase usados exclusivamente en pruebas */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LaborCostDayReadModelProjector } from './labor-cost-day-projector.ts';
import { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import { laborSupabaseFixture, payrollFixture } from './labor-cost-test-fixture.ts';

function projector(seed = payrollFixture as Record<string, Array<Record<string, any>>>) {
  const supabase = laborSupabaseFixture(seed);
  return new LaborCostDayReadModelProjector(
    supabase, {} as any, new ContractTermsService(supabase),
    new PayrollFactRepository(supabase),
  );
}

describe('Coste laboral diario desde nómina oficial', () => {
  it('mantiene la nómina de antiguos empleados incluso sin fichajes', async () => {
    const dto = await projector().projectDayDetail('2026-07-15', { includeAllContracted: true });
    assert.equal(dto.netSales, 1500);
    assert.equal(dto.isPayrollPending, false);
    assert.ok(dto.totalFixed > 132 && dto.totalFixed < 133);
    assert.equal(dto.workers.length, 2);
    assert.ok(dto.workers.every((worker) => worker.name !== 'Nómina empresa'));
    assert.equal(Number(dto.workers.reduce((s, row) => s + row.fixed, 0).toFixed(2)), dto.totalFixed);
  });

  it('el interruptor OFF sólo oculta las filas inactivas, nunca el coste total de empresa', async () => {
    const dto = await projector().projectDayDetail('2026-07-15', { includeAllContracted: false });
    assert.equal(dto.workers.length, 0);
    assert.ok(dto.totalFixed > 0);
  });

  it('señala nómina pendiente cuando falta el resumen oficial', async () => {
    const seed = { ...payrollFixture, payroll_monthly_totals: [], employee_payroll_facts: [] };
    const dto = await projector(seed).projectDayDetail('2026-07-15');
    assert.equal(dto.isPayrollPending, true);
    assert.equal(dto.pctStatus, 'incomplete_payroll_pending');
    assert.equal(dto.totalFixed, 0);
  });
});
