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

describe('Coste laboral operativo diario sobre nómina oficial', () => {
  it('imputa coste solo al trabajador fichado sin perder el salario del antiguo en el mes', async () => {
    const dto = await projector().projectDayDetail('2026-07-15', { includeAllContracted: true });
    assert.equal(dto.netSales, 1500);
    assert.equal(dto.isPayrollPending, false);
    assert.ok(dto.totalFixed > 0);
    assert.equal(dto.workers.length, 2);
    assert.ok(dto.workers.every((worker) => worker.name !== 'Nómina empresa'));
    assert.ok(dto.workers.find(w => w.id === 'usr_active')!.fixed > 0);
    assert.equal(dto.workers.find(w => w.id === 'usr_hidden')!.fixed, 0);
    assert.equal(Number(dto.workers.reduce((s, row) => s + row.fixed, 0).toFixed(2)), dto.totalFixed);
  });

  it('el selector oculta inactivos sin imputar el sueldo de sus días de descanso', async () => {
    const dto = await projector().projectDayDetail('2026-07-15', { includeAllContracted: false });
    assert.equal(dto.workers.length, 1);
    assert.ok(dto.totalFixed > 0);
    const off = await projector().projectDayDetail('2026-07-16', { includeAllContracted: false });
    assert.equal(off.workers.length, 0);
    assert.equal(off.totalCost, 0);
    assert.equal(off.laborPctOfSales, null);
    assert.equal(off.operationalIncomplete, true);
  });

  it('valora el día de noviembre con la nómina de octubre sin presentarla como oficial', async () => {
    const seed={
      ...payrollFixture,
      employee_payroll_facts:[
        {id:'oct',user_id:'usr_active',period_ym:'2026-10',status:'active',total_company_cost:3100},
        {id:'nov_partial',user_id:'usr_active',period_ym:'2026-11',status:'active',total_company_cost:300},
      ],
      payroll_monthly_totals:[
        {period_ym:'2026-10',period_start:'2026-10-01',period_end:'2026-10-31',total_company_cost:4100},
      ],
      cash_closings:[{closing_date:'2026-11-07',net_sales:1500}],
      time_logs:[{user_id:'usr_active',clock_in:'2026-11-07T09:00:00Z',clock_out:'2026-11-07T17:00:00Z',total_hours:8}],
    };
    const dto=await projector(seed).projectDayDetail('2026-11-07',{
      todayYmd:'2026-11-08',includeAllContracted:false,
    });
    assert.equal(dto.isPayrollPending,true);
    assert.equal(dto.isPayrollEstimated,true);
    assert.equal(dto.pctStatus,'complete');
    assert.ok(dto.totalFixed>100);
    assert.ok(dto.laborPctOfSales!==null);
  });

  it('señala nómina pendiente cuando no hay ninguna tarifa positiva', async () => {
    const seed = { ...payrollFixture, payroll_monthly_totals: [], employee_payroll_facts: [] };
    const dto = await projector(seed).projectDayDetail('2026-07-15');
    assert.equal(dto.isPayrollPending, true);
    assert.equal(dto.pctStatus, 'incomplete_payroll_pending');
    assert.equal(dto.totalFixed, 0);
    assert.equal(dto.operationalIncomplete, true);
  });

  it('con extras a 10 €/h y sin nómina individual calcula el día, ordinarias a 0 €', async () => {
    const seed = {
      ...payrollFixture,
      employee_payroll_facts: [],
      hours_contract_terms: payrollFixture.hours_contract_terms.map(t =>
        t.user_id === 'usr_active' ? { ...t, overtime_rate_per_hour: 10 } : t),
    };
    const dto = await projector(seed).projectDayDetail('2026-07-15');
    assert.equal(dto.isPayrollPending, false);
    assert.equal(dto.pctStatus, 'complete');
    assert.equal(dto.operationalIncomplete, false);
    assert.equal(dto.totalCost, 0);
    assert.equal(dto.laborPctOfSales, 0);
    assert.equal(dto.operationalMissingWorkers, 1);
  });

  it('con nómina oficial pendiente mantiene el aviso, pero calcula el día si hay extras positivas', async () => {
    const seed = {
      ...payrollFixture,
      payroll_monthly_totals: [],
      employee_payroll_facts: [],
      hours_contract_terms: payrollFixture.hours_contract_terms.map(t =>
        t.user_id === 'usr_active' ? { ...t, overtime_rate_per_hour: 10 } : t),
    };
    const dto = await projector(seed).projectDayDetail('2026-07-15');
    assert.equal(dto.isPayrollPending, true);
    assert.equal(dto.pctStatus, 'complete');
    assert.equal(dto.operationalIncomplete, false);
    assert.equal(dto.totalCost, 0);
    assert.equal(dto.laborPctOfSales, 0);
  });
});
