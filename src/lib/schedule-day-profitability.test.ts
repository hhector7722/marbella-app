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
