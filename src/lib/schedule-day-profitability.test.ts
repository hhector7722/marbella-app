import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { computeScheduleDayLaborCost, computeRequiredBilling, type ScheduleLaborCostContext } from './schedule-day-profitability.ts';

function context(weeklyHours: number, prior: number, overtimeHourlyRate: number | null = 12): ScheduleLaborCostContext {
  return {
    worker: {
      employee: {
        employeeId: 'worker', joiningDate: '2026-01-01', endDate: null,
        terms: [{ effectiveFrom: '2026-01-01', effectiveTo: null, weeklyHours,
          bagMode: false, regime: 'staff', overtimeRatePerHour: overtimeHourlyRate }],
      },
      ordinaryHourlyRate: 15,
      overtimeHourlyRate,
      earlierHoursByDay: { '2026-11-09': prior },
      payrollPeriod: '2026-10',
    },
  };
}

test('8 h semanales: 4 anteriores + 8 hoy = 4 ordinarias + 4 extras', () => {
  const cost = computeScheduleDayLaborCost('2026-11-13', [
    { employeeId: 'worker', start: '09:00', end: '17:00' },
  ], context(8, 4));
  assert.equal(cost.ordinaryHours, 4);
  assert.equal(cost.overtimeHours, 4);
  assert.equal(cost.ordinaryCost, 60);
  assert.equal(cost.overtimeCost, 48);
  assert.equal(cost.totalCost, 108);
  assert.equal(computeRequiredBilling(cost.totalCost), 360);
});

test('el coste de extras es cero si no se supera el contrato', () => {
  const cost = computeScheduleDayLaborCost('2026-11-13', [
    { employeeId: 'worker', start: '09:00', end: '13:00' },
  ], context(8, 0));
  assert.equal(cost.overtimeCost, 0);
  assert.equal(cost.totalCost, 60);
});

test('una tarifa de extras ausente nunca se sustituye por una tarifa inventada', () => {
  const cost = computeScheduleDayLaborCost('2026-11-13', [
    { employeeId: 'worker', start: '09:00', end: '17:00' },
  ], context(8, 8, null));
  assert.equal(cost.totalCost, null);
  assert.equal(cost.overtimeCost, null);
  assert.deepEqual(cost.missingRateEmployeeIds, ['worker']);
});


test('si no hay contrato ni nómina, todas las horas previstas son extras a su tarifa personal', () => {
  const existing = context(8, 0, 12).worker!;
  const result = computeScheduleDayLaborCost('2026-11-13', [
    { employeeId: 'worker', start: '10:00', end: '16:00' },
  ], {
    worker: {
      ...existing,
      employee: { ...existing.employee, terms: [] },
      ordinaryHourlyRate: null,
      overtimeHourlyRate: 12,
    },
  });
  assert.equal(result.ordinaryHours, 0);
  assert.equal(result.overtimeHours, 6);
  assert.equal(result.ordinaryCost, 0);
  assert.equal(result.overtimeCost, 72);
  assert.equal(result.totalCost, 72);
});

test('un contrato histórico ya vencido NO oculta las horas: toda la jornada va a extras', () => {
  const old = context(8, 0, 12).worker!;
  const pastTerm = { ...old.employee.terms[0]!, effectiveTo: '2026-10-31' };
  const result = computeScheduleDayLaborCost('2026-11-14', [
    { employeeId: 'worker', start: '09:00', end: '17:00' },
  ], {
    worker: {
      ...old,
      employee: { ...old.employee, terms: [pastTerm] },
      ordinaryHourlyRate: null,
    },
  });
  assert.equal(result.ordinaryHours, 0);
  assert.equal(result.overtimeHours, 8);
  assert.equal(result.ordinaryCost, 0);
  assert.equal(result.overtimeCost, 96);
  assert.equal(result.totalCost, 96);
  assert.equal(computeRequiredBilling(result.totalCost), 320);
});

test('si la relación laboral terminó, el turno sigue valorándose como extras', () => {
  const old = context(40, 0, 11).worker!;
  const result = computeScheduleDayLaborCost('2026-11-14', [
    { employeeId: 'worker', start: '12:00', end: '16:00' },
  ], {
    worker: {
      ...old,
      employee: { ...old.employee, endDate: '2026-11-10' },
    },
  });
  assert.equal(result.totalCost, 44);
  assert.equal(result.overtimeCost, 44);
});

test('mezcla de contrato + extras puras: siempre suma los tres importes', () => {
  const staff = context(8, 0, 12).worker!;
  const extra = context(0, 0, 10).worker!;
  const result = computeScheduleDayLaborCost('2026-11-14', [
    { employeeId: 'staff', start: '09:00', end: '13:00' },
    { employeeId: 'extra', start: '10:00', end: '16:00' },
  ], {
    staff: { ...staff, employee: { ...staff.employee, employeeId: 'staff' } },
    extra: { ...extra, employee: { ...extra.employee, employeeId: 'extra' }, ordinaryHourlyRate: null },
  });
  assert.equal(result.ordinaryCost, 60);
  assert.equal(result.overtimeCost, 60);
  assert.equal(result.totalCost, 120);
  assert.equal(computeRequiredBilling(result.totalCost), 400);
  assert.deepEqual(result.missingRateEmployeeIds, []);
});
