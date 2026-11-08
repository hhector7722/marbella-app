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

  it('el resumen suma nóminas y extras sin alterar el desglose diario de fichajes', async () => {
    const seed = { ...payrollFixture, weekly_snapshot_days: [
      { user_id: 'usr_active', week_start: '2026-07-13', day: '2026-07-15',
        overtime_hours: 2, overtime_cost: 30 },
    ] };
    const summary = await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(summary.totalFixed, 4100);
    assert.equal(summary.totalOvertime, 30); // informativa, incluida en el control
    assert.equal(summary.totalCost, 4130); // 4100 nóminas + 30 extras
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


  it('aplica 1000 € mensuales de Héctor en Extras y agrupa semanas por empleado sin mezclar el fijo', async () => {
    const hector = {
      id: 'usr_hector', first_name: 'Hector', last_name: 'Sanchez Arranz',
      email: 'hhector7722@gmail.com', visible_in_plantilla: true, staffing_mode: 'regular',
    };
    const seed = {
      ...payrollFixture,
      profiles: [...payrollFixture.profiles, hector],
      weekly_snapshot_days: [
        { user_id: 'usr_active', week_start: '2026-07-13', day: '2026-07-15',
          overtime_hours: 2, overtime_cost: 30 },
        { user_id: 'usr_hector', week_start: '2026-07-13', day: '2026-07-15',
          overtime_hours: 2, overtime_cost: 20 },
        { user_id: 'usr_active', week_start: '2026-07-20', day: '2026-07-20',
          overtime_hours: 1, overtime_cost: 10 },
      ],
    };
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed));
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 4100);
    assert.equal(dto.totalOvertime, 1060);
    assert.equal(dto.totalCost, 5160);
    assert.equal(dto.hectorMonthlyExtra, 1000);
    assert.equal(dto.payrollBreakdown.reduce((sum, row) => sum + row.amount, 0), dto.totalFixed);
    assert.equal(dto.overtimeWeeks.length, 2);
    assert.deepEqual(dto.overtimeWeeks.map(week => [week.weekStart, week.weekNumber, week.amount]), [
      ['2026-07-13', 29, 50],
      ['2026-07-20', 30, 10],
    ]);
    assert.equal(dto.overtimeWeeks[0]?.employees.length, 2);
    assert.equal(dto.overtimeWeeks[0]?.employees.find(w => w.userId === 'usr_hector')?.amount, 20);
    assert.equal(dto.overtimeWeeks.reduce((s, week) => s + week.amount, 0) + dto.hectorMonthlyExtra,
      dto.totalOvertime);

    const filtered = await useCase.execute({
      startDate: '2026-07-01', endDate: '2026-07-31', userId: 'usr_hector',
    });
    assert.equal(filtered.totalFixed, 0);
    assert.equal(filtered.totalOvertime, 1020);
    assert.equal(filtered.totalCost, 1020);
    assert.equal(filtered.hectorMonthlyExtra, 1000);
    assert.equal(filtered.overtimeWeeks[0]?.employees[0]?.userId, 'usr_hector');

    const partial = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-15' });
    assert.equal(partial.totalFixed, 1983.75);
    assert.equal(partial.hectorMonthlyExtra, 483.75);
    assert.equal(partial.totalOvertime, 533.75);
    assert.equal(partial.totalCost, 2517.50);
    assert.equal(partial.payrollBreakdown.reduce((sum, row) => sum + row.amount, 0),
      partial.totalFixed);
    assert.equal(partial.overtimeWeeks.length, 1);
  });

  it('cuadra el resumen oficial aunque falte asociar un coste de nómina a un empleado', async () => {
    const seed = {
      ...payrollFixture,
      employee_payroll_facts: payrollFixture.employee_payroll_facts.filter(f => f.user_id === 'usr_active'),
    };
    const dto = await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 4100);
    assert.equal(dto.payrollBreakdown.find(row => row.userId === 'unassigned')?.amount, 1000);
    assert.equal(dto.payrollBreakdown.reduce((sum, row) => sum + row.amount, 0), 4100);
  });

  it('mantiene el extra mensual de Héctor también en meses sin extras semanales', async () => {
    const seed = {
      ...payrollFixture,
      profiles: [...payrollFixture.profiles, {
        id: 'usr_hector', first_name: 'Hector', last_name: 'Sanchez Arranz',
        email: 'hhector7722@gmail.com', visible_in_plantilla: true,
      }],
    };
    const dto = await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalOvertime, 1000);
    assert.equal(dto.totalCost, 5100);
    assert.equal(dto.hectorMonthlyExtra, 1000);
    assert.deepEqual(dto.overtimeWeeks, []);
  });


  it('incluye extras de exempleados ocultos en plantilla en el resumen y las semanas', async () => {
    const seed = {
      ...payrollFixture,
      weekly_snapshot_days: [
        { user_id: 'usr_hidden', week_start: '2026-07-13', day: '2026-07-15',
          overtime_hours: 3, overtime_cost: 55 },
      ],
    };
    const dto = await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 4100);
    assert.equal(dto.totalOvertime, 55);
    assert.equal(dto.totalCost, 4155);
    assert.equal(dto.overtimeWeeks[0]?.employees[0]?.userId, 'usr_hidden');
    assert.equal(dto.overtimeWeeks[0]?.employees[0]?.amount, 55);
  });

  it('contabiliza el extra de Héctor una vez en cada mes de un filtro plurimensual', async () => {
    const seed = {
      ...payrollFixture,
      profiles: [...payrollFixture.profiles, {
        id: 'usr_hector', first_name: 'Hector', last_name: 'Sanchez Arranz',
        email: 'hhector7722@gmail.com', visible_in_plantilla: true,
      }],
      payroll_monthly_totals: [
        ...payrollFixture.payroll_monthly_totals,
        { period_ym: '2026-08', period_start: '2026-08-01', period_end: '2026-08-31',
          total_company_cost: 5000 },
      ],
      employee_payroll_facts: [
        ...payrollFixture.employee_payroll_facts,
        { id: 'aug', user_id: 'usr_active', period_ym: '2026-08',
          status: 'active', total_company_cost: 5000 },
      ],
    };
    const dto = await new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed))
      .execute({ startDate: '2026-07-01', endDate: '2026-08-31' });
    assert.equal(dto.totalFixed, 9100);
    assert.equal(dto.hectorMonthlyExtra, 2000);
    assert.equal(dto.totalOvertime, 2000);
    assert.equal(dto.totalCost, 11100);
    assert.equal(dto.payrollBreakdown.reduce((s, w) => s + w.amount, 0), 9100);
  });

  it('no inventa costes fijos en meses sin resumen oficial', async () => {
    const seed = { ...payrollFixture, payroll_monthly_totals: [] };
    const useCase = new GetMonthlyLaborCostSummaryUseCase(laborSupabaseFixture(seed));
    const dto = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });
    assert.equal(dto.totalFixed, 0);
    assert.deepEqual(dto.missingPayrollMonths, ['2026-07']);
  });
});
