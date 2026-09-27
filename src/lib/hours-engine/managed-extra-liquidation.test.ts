import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liquidateWeekForCard } from './week-card-from-liquidation.ts';
import type { ContractTermFact, EmployeeBoundaryFacts, TimeLogFact } from './types.ts';

function extraTerm(): ContractTermFact {
  return {
    effectiveFrom: '2020-01-06',
    effectiveTo: null,
    weeklyHours: 0,
    bagMode: false,
    regime: 'staff',
    overtimeRatePerHour: 10,
  };
}

function extraEmployee(): EmployeeBoundaryFacts {
  return {
    employeeId: 'extra-1',
    joiningDate: '2020-01-06',
    endDate: null,
    terms: [extraTerm()],
  };
}

function dayLog(day: string, hours: number): TimeLogFact {
  return {
    clockInIso: `${day}T08:00:00.000Z`,
    clockOutIso: `${day}T${String(8 + Math.floor(hours)).padStart(2, '0')}:00:00.000Z`,
    totalHours: hours,
  };
}

describe('extra gestionado en el Hours Engine', () => {
  it('sin trabajar: contrato 0, trabajadas 0, deuda 0, coste 0', () => {
    const { result, summary } = liquidateWeekForCard({
      carryIn: 0,
      employee: extraEmployee(),
      weekStart: '2026-03-02',
      logs: [],
    });
    assert.equal(result.contractedHoursEffective, 0);
    assert.equal(result.hoursWorked, 0);
    assert.equal(result.ordinaryHours, 0);
    assert.equal(result.overtimeHours, 0);
    assert.equal(result.carryOut, 0);
    assert.equal(summary.estimatedValue, 0);
  });

  it('8 h a 10 €/h: ordinarias 0, extras 8, coste 80', () => {
    const { result, summary } = liquidateWeekForCard({
      carryIn: 0,
      employee: extraEmployee(),
      weekStart: '2026-03-02',
      logs: [dayLog('2026-03-02', 8)],
    });
    assert.equal(result.ordinaryHours, 0);
    assert.equal(result.overtimeHours, 8);
    assert.equal(result.carryOut, 0);
    assert.equal(summary.estimatedValue, 80);
  });

  it('dos días de 6 h: extras 12, coste 120', () => {
    const { result, summary } = liquidateWeekForCard({
      carryIn: 0,
      employee: extraEmployee(),
      weekStart: '2026-03-02',
      logs: [dayLog('2026-03-02', 6), dayLog('2026-03-03', 6)],
    });
    assert.equal(result.ordinaryHours, 0);
    assert.equal(result.overtimeHours, 12);
    assert.equal(result.carryOut, 0);
    assert.equal(summary.estimatedValue, 120);
  });
});
