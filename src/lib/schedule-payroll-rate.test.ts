import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { payrollMonthContractedHours, rateFromEmployeePayroll, overtimeRateForScheduleDay, mostCommonCompanyHourlyRate, versionedOvertimeRateForDay, resolveOrdinaryScheduleHourlyRate, hasActiveOrdinaryContract, fallbackProfileOvertimeRate } from './schedule-payroll-rate.ts';
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


test('sin nómina propia, la referencia es el coste €/h más frecuente, no una nómina de 40h aplicada a un contrato de 8h', () => {
  const employees = {
    a: worker('a', 40, 10),
    b: worker('b', 20, 12),
    c: worker('c', 8, 11),
    d: worker('d', 40, 15),
  };
  const amounts = { a: 13.7, b: 14.1, c: 14.2, d: 17.9 };
  const rows = (Object.keys(employees) as Array<keyof typeof employees>).map(id => ({
    user_id: id, period_ym: '2026-10',
    total_company_cost: payrollMonthContractedHours(employees[id], '2026-10') * amounts[id],
  }));
  const typical = mostCommonCompanyHourlyRate(rows, employees);
  assert.ok(typical);
  assert.ok(Math.abs(typical.rate - 14.1) < 1e-9);
  assert.equal(typical.employeesSampled, 4);
  assert.equal(typical.employeesInModalBand, 3);
  assert.equal(typical.period, '2026-10');
  assert.ok(Math.abs(typical.rate * (8 * 52 / 12) - 488.8) < 1e-9);
});

test('un único coste no es una moda empresarial; usar mes anterior con muestra suficiente', () => {
  const employees = { a: worker('a', 40, 10), b: worker('b', 20, 10) };
  const common = mostCommonCompanyHourlyRate([
    { user_id: 'a', period_ym: '2026-11', total_company_cost: 999 },
    { user_id: 'a', period_ym: '2026-10', total_company_cost: payrollMonthContractedHours(employees.a, '2026-10') * 14 },
    { user_id: 'b', period_ym: '2026-10', total_company_cost: payrollMonthContractedHours(employees.b, '2026-10') * 14 },
  ], employees);
  assert.equal(common?.period, '2026-10');
  assert.ok(Math.abs((common?.rate ?? 0) - 14) < 1e-9);
  assert.equal(mostCommonCompanyHourlyRate([], employees), null);
});

test('no se duplica ni se usan importes ambiguos como referencia de empresa', () => {
  const employees = { a: worker('a', 40, 10), b: worker('b', 20, 10) };
  const common = mostCommonCompanyHourlyRate([
    { user_id: 'a', period_ym: '2026-10', total_company_cost: 2000 },
    { user_id: 'a', period_ym: '2026-10', total_company_cost: 2400 },
    { user_id: 'b', period_ym: '2026-10', total_company_cost: 1400 },
  ], employees);
  assert.equal(common, null);
});

test('sin contrato de horas, la tarifa versionada de extras sigue disponible', () => {
  assert.equal(versionedOvertimeRateForDay([
    { valid_from: '2026-09-01', valid_to: '2026-10-31', overtime_cost_per_hour: 11 },
    { valid_from: '2026-11-01', valid_to: null, overtime_cost_per_hour: 16 },
  ], '2026-11-13'), 16);
  assert.equal(versionedOvertimeRateForDay([], '2026-11-13'), null);
});


test('el pie del horario recupera coste ordinario si la nómina está ausente, ambigua o inutilizable', () => {
  assert.equal(resolveOrdinaryScheduleHourlyRate(18.5, true, 14.1), 18.5);
  assert.equal(resolveOrdinaryScheduleHourlyRate(null, true, 14.1), 14.1);
  assert.equal(resolveOrdinaryScheduleHourlyRate(0, true, 14.1), 14.1);
  assert.equal(resolveOrdinaryScheduleHourlyRate(null, false, 14.1), null);
  assert.equal(resolveOrdinaryScheduleHourlyRate(null, true, null), null);
});


test('contrato vigente distingue altas, bajas y tramos históricos', () => {
  const employee = worker('w', 8, 12);
  assert.equal(hasActiveOrdinaryContract(employee, '2026-11-14'), true);
  assert.equal(hasActiveOrdinaryContract({ ...employee, joiningDate: '2026-11-15' }, '2026-11-14'), false);
  assert.equal(hasActiveOrdinaryContract({ ...employee, endDate: '2026-11-13' }, '2026-11-14'), false);
  assert.equal(hasActiveOrdinaryContract({ ...employee, terms: [{ ...employee.terms[0]!, effectiveTo: '2026-10-31' }] }, '2026-11-14'), false);
  assert.equal(hasActiveOrdinaryContract({ ...employee, terms: [{ ...employee.terms[0]!, weeklyHours: 0 }] }, '2026-11-14'), false);
});

test('tarifa personal es el último respaldo para extras cuando el tramo contractual no tiene tarifa', () => {
  assert.equal(fallbackProfileOvertimeRate(12), 12);
  assert.equal(fallbackProfileOvertimeRate('14.50'), 14.5);
  assert.equal(fallbackProfileOvertimeRate(null), null);
  assert.equal(fallbackProfileOvertimeRate(undefined), null);
});
