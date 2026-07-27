import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liquidateWeekForCard } from '../hours-engine/week-card-from-liquidation.ts';
import type { EmployeeBoundaryFacts, TimeLogFact } from '../hours-engine/types.ts';
import {
  assertWeekDisplayInvariants,
  weekDisplayFromEngine,
} from './week-display-from-engine.ts';

function emp(bag: boolean): EmployeeBoundaryFacts {
  return {
    employeeId: 'test',
    joiningDate: '2025-01-01',
    endDate: null,
    terms: [
      {
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
        weeklyHours: 28,
        bagMode: bag,
        regime: 'staff',
        overtimeRatePerHour: 10,
      },
    ],
  };
}

function logs40(weekMonday: string): TimeLogFact[] {
  // Lun–vie 8h cada día en UTC aproximado Madrid
  const days = [0, 1, 2, 3, 4];
  return days.map((i) => {
    const [y, m, d] = weekMonday.split('-').map(Number);
    const dt = new Date(y!, m! - 1, d! + i, 10, 0, 0);
    const out = new Date(dt.getTime() + 8 * 3600 * 1000);
    return {
      clockInIso: dt.toISOString(),
      clockOutIso: out.toISOString(),
      totalHours: 8,
    };
  });
}

describe('week-display-from-engine invariantes', () => {
  it('deuda + bolsa: extras=0 e importe=0 (caso tipo Pere W30)', () => {
    const { result, summary } = liquidateWeekForCard({
      employee: emp(true),
      weekStart: '2026-07-20',
      logs: logs40('2026-07-20'),
      isPaid: false,
      carryIn: -29.5,
      bagModeOverride: null,
      overrideRate: null,
    });

    assert.ok(result.carryOut < 0);
    assert.equal(result.balanceFinal, -17.5);
    assert.equal(summary.weeklyBalance, 0);
    assert.equal(summary.estimatedValue, 0);
    assert.equal(summary.preferStock, true);
    assert.equal(summary.startBalance, -29.5);
    assert.equal(summary.totalHours, 40);

    assert.doesNotThrow(() =>
      assertWeekDisplayInvariants(result, summary, null),
    );
    const dto = weekDisplayFromEngine(result, summary, null);
    assert.equal(dto.displayExtras, 0);
    assert.equal(dto.displayEstimatedValue, 0);
    assert.equal(dto.displayPendingBalance, -29.5);
    assert.equal(dto.displayHours, 40);
  });

  it('assert falla si se fuerza extras>0 con carryOut<0', () => {
    const { result, summary } = liquidateWeekForCard({
      employee: emp(true),
      weekStart: '2026-07-20',
      logs: logs40('2026-07-20'),
      isPaid: false,
      carryIn: -29.5,
    });
    const broken = { ...summary, weeklyBalance: 12 };
    assert.throws(() => assertWeekDisplayInvariants(result, broken, null));
  });
});
