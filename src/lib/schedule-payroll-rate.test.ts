import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { payrollMonthContractedHours, rateFromEmployeePayroll, overtimeRateForScheduleDay } from './schedule-payroll-rate.ts';
import type { EmployeeBoundaryFacts } from './hours-engine/types.ts';

const worker = (employeeId: string, weeklyHours: number, hourlyRate: number): EmployeeBoundaryFacts => ({
  employeeId, joiningDate: '2026-01-01', endDate: null,
  terms: [{ effectiveFrom: '2026-01-01', effectiveTo: null,
    weeklyHours, bagMode: false, regime: 'staff', overtimeRatePerHour: hourlyRate }],
});

test('nóminas diferentes producen costes horarios diferentes por empleado', () => {
  const a = worker('a', 40, 10);
  const b = worker('b', 20, 17);
  const ha = payrollMonthContractedHours(a, '2026-10');
  const hb = payrollMonthContractedHours(b, '2026-10');
  const rateA = rateFromEmployeePayroll(a, [{ period_ym: '2026-10', total_company_cost: ha * 15 }]);
  const rateB = rateFromEmployeePayroll(b, [{ period_ym: '2026-10', total_company_cost: hb * 21 }]);
  assert.ok(Math.abs((rateA.rate ?? 0) - 15) < 1e-9);
  assert.ok(Math.abs((rateB.rate ?? 0) - 21) < 1e-9);
  assert.equal(overtimeRateForScheduleDay(a, '2026-11-13', null), 10);
  assert.equal(overtimeRateForScheduleDay(b, '2026-11-13', null), 17);
});

test('cada nómina se divide por su jornada efectiva del mes correspondiente, incluidos contratos parciales', () => {
  const employee = worker('partial', 20, 11);
  employee.terms = [
    { ...employee.terms[0]!, effectiveTo: '2026-10-15' },
    { ...employee.terms[0]!, effectiveFrom: '2026-10-16', weeklyHours: 40 },
  ];
  const hours = (15 * 20 + 16 * 40) / 7;
  assert.ok(Math.abs(payrollMonthContractedHours(employee, '2026-10') - hours) < 1e-8);
  assert.ok(Math.abs((rateFromEmployeePayroll(employee, [
    { period_ym: '2026-10', total_company_cost: hours * 19 },
  ]).rate ?? 0) - 19) < 1e-9);
});

test('no se escoge arbitrariamente entre dos nóminas ordinarias activas distintas', () => {
  const pay = rateFromEmployeePayroll(worker('a', 40, 10), [
    { period_ym: '2026-10', total_company_cost: 2000 },
    { period_ym: '2026-10', total_company_cost: 2200 },
    { period_ym: '2026-09', total_company_cost: 1800 },
  ]);
  assert.equal(pay.rate, null);
  assert.equal(pay.reason, 'ambiguous');
  assert.equal(pay.period, '2026-10');
});

test('una nómina duplicada idéntica no se suma dos veces', () => {
  const employee = worker('a', 40, 10);
  const amount = payrollMonthContractedHours(employee, '2026-10') * 15;
  assert.ok(Math.abs((rateFromEmployeePayroll(employee, [
    { period_ym: '2026-10', total_company_cost: amount },
    { period_ym: '2026-10', total_company_cost: amount },
  ]).rate ?? 0) - 15) < 1e-9);
});

test('la tarifa de extras usa el tramo vigente en el día y el override semanal si existe', () => {
  const employee = worker('a', 8, 12);
  employee.terms = [
    { ...employee.terms[0]!, effectiveTo: '2026-11-11' },
    { ...employee.terms[0]!, effectiveFrom: '2026-11-12', overtimeRatePerHour: 16 },
  ];
  assert.equal(overtimeRateForScheduleDay(employee, '2026-11-09', null), 12);
  assert.equal(overtimeRateForScheduleDay(employee, '2026-11-13', null), 16);
  assert.equal(overtimeRateForScheduleDay(employee, '2026-11-13', 19), 19);
});

test('sin nómina ni tarifa acreditada, no se inventan cifras', () => {
  const employee = worker('a', 8, 12);
  assert.deepEqual(rateFromEmployeePayroll(employee, []), { rate: null, period: null, reason: 'missing' });
  assert.equal(overtimeRateForScheduleDay({ ...employee, terms: [] }, '2026-11-13', null), null);
});
