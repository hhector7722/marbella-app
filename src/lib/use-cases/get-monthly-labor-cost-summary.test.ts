import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetMonthlyLaborCostSummaryUseCase } from './get-monthly-labor-cost-summary.ts';
import { laborSupabaseFixture, payrollFixture } from '../read-models/labor-cost-test-fixture.ts';

describe('Coste laboral mensual — SSOT gestoría', () => {
  it('conserva la nómina mensual oficial y muestra solo horas fichadas en el calendario', async () => {
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(payrollFixture));
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 4100);
    assert.equal(dto.totalCost, 4100);
    assert.equal(Object.keys(dto.byDate).length, 31);
    assert.ok(Object.values(dto.byDate).reduce((s, c) => s + c.fixed, 0) < 4100);
    assert.equal(dto.byDate['2026-07-15']?.laborPctOfSales !== null, true);
    assert.equal(dto.byDate['2026-07-16']?.totalCost, 0);
    assert.equal(dto.byDate['2026-07-16']?.operationalIncomplete, true);
    assert.equal(dto.byDate['2026-07-16']?.laborPctOfSales, null);
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

  it('mantiene la nómina mensual sin duplicar extras de fichajes o de su proyección', async () => {
    const seed = { ...payrollFixture, weekly_snapshot_days: [
      { user_id: 'usr_active', week_start: '2026-07-13', day: '2026-07-15',
        overtime_hours: 2, overtime_cost: 30 },
    ] };
    const summary = await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(summary.totalFixed, 4100);
    assert.equal(summary.totalOvertime, 30); // informativa, incluida en el control
    assert.equal(summary.totalCost, 4100); // ninguna segunda suma de 30
    assert.equal(summary.byDate['2026-07-15']!.total,
      summary.byDate['2026-07-15']!.fixed + summary.byDate['2026-07-15']!.overtime);
  });


  it('mes en curso sin nómina: acumula coste de octubre como provisional sin sumar hechos parciales de noviembre', async () => {
    const seed = {
      ...payrollFixture,
      employee_payroll_facts: [
        { id: 'oct_a',user_id:'usr_active',period_ym:'2026-10',status:'active',total_company_cost:3100 },
        { id: 'oct_b',user_id:'usr_hidden',period_ym:'2026-10',status:'active',total_company_cost:1000 },
        { id: 'nov_partial',user_id:'usr_active',period_ym:'2026-11',status:'active',total_company_cost:700 },
      ],
      payroll_monthly_totals: [
        { period_ym:'2026-10',period_start:'2026-10-01',period_end:'2026-10-31',total_company_cost:4100 },
      ],
      time_logs: [
        { user_id:'usr_active',clock_in:'2026-11-07T09:00:00Z',clock_out:'2026-11-07T17:00:00Z',total_hours:8 },
      ],
      cash_closings: [{closing_date:'2026-11-07',net_sales:1500}],
    };
    const useCase=new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed));
    const dto=await useCase.execute({
      startDate:'2026-11-01',endDate:'2026-11-30',todayYmd:'2026-11-08',
    });
    assert.equal(dto.totalFixed,4100);
    assert.equal(dto.totalCost,4100);
    assert.equal(dto.isPayrollPending,true);
    assert.deepEqual(dto.missingPayrollMonths,['2026-11']);
    assert.deepEqual(dto.estimatedPayrollMonths,['2026-11']);
    assert.ok((dto.byDate['2026-11-07']?.fixed ?? 0)>0);
    assert.ok((dto.byDate['2026-11-07']?.laborPctOfSales ?? 0)>0);
    assert.equal(dto.byDate['2026-11-08']?.hasActivity,false);
    const filtered=await useCase.execute({
      startDate:'2026-11-01',endDate:'2026-11-30',userId:'usr_active',todayYmd:'2026-11-08',
    });
    assert.equal(filtered.totalFixed,3100);
    assert.equal(filtered.totalCost,3100);
  });

  it('en el mes corriente, cuando llega la nómina oficial sustituye los costes aproximados',async()=>{
    const seed={
      ...payrollFixture,
      employee_payroll_facts:[{id:'nov',user_id:'usr_active',period_ym:'2026-11',status:'active',total_company_cost:5100}],
      payroll_monthly_totals:[{period_ym:'2026-11',period_start:'2026-11-01',period_end:'2026-11-30',total_company_cost:5100}],
      time_logs:[{user_id:'usr_active',clock_in:'2026-11-07T09:00:00Z',clock_out:'2026-11-07T17:00:00Z',total_hours:8}],
    };
    const dto=await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({startDate:'2026-11-01',endDate:'2026-11-30',todayYmd:'2026-11-08'});
    assert.equal(dto.totalFixed,5100);
    assert.equal(dto.totalCost,5100);
    assert.deepEqual(dto.estimatedPayrollMonths,[]);
    assert.deepEqual(dto.missingPayrollMonths,[]);
  });

  it('no inventa costes fijos en meses sin resumen oficial', async () => {
    const seed = { ...payrollFixture, payroll_monthly_totals: [] };
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed));
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 0);
    assert.deepEqual(dto.missingPayrollMonths, ['2026-07']);
  });
});
