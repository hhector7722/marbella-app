import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveWeekCardCarryIn } from './week-card-carry-in.ts';
import { liquidateWeek } from './liquidation-engine.ts';
import type { EmployeeBoundaryFacts, TimeLogFact } from './types.ts';

function emp(bag: boolean): EmployeeBoundaryFacts {
  return {
    employeeId: 'test',
    joiningDate: '2025-01-06',
    endDate: null,
    terms: [
      {
        effectiveFrom: '2025-01-06',
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

const THIS_WEEK = '2026-07-20';
const PREV_WEEK = '2026-07-13';

describe('resolveWeekCardCarryIn', () => {
  it('usa pending_balance de esta semana, incluso si es 0', () => {
    const resolved = resolveWeekCardCarryIn({
      weekStart: THIS_WEEK,
      employee: emp(true),
      thisWeekSnapshot: { pendingBalance: 0 },
      previousWeek: {
        snapshot: { pendingBalance: -29.5 },
        logs: logs40(PREV_WEEK),
        isPaid: false,
        bagModeOverride: null,
      },
    });

    assert.equal(resolved.source, 'this-week-snapshot');
    assert.equal(resolved.source === 'this-week-snapshot' ? resolved.carryIn : null, 0);
  });

  it('respeta un pending_balance negativo ya persistido', () => {
    const resolved = resolveWeekCardCarryIn({
      weekStart: THIS_WEEK,
      employee: emp(true),
      thisWeekSnapshot: { pendingBalance: -29.5 },
      previousWeek: null,
    });

    assert.equal(resolved.source, 'this-week-snapshot');
    assert.equal(resolved.source === 'this-week-snapshot' ? resolved.carryIn : null, -29.5);
  });

  it('sin fila de esta semana liquida solo la anterior', () => {
    const prevLogs = logs40(PREV_WEEK);
    const prev = liquidateWeek({
      employee: emp(true),
      weekStart: PREV_WEEK,
      logs: prevLogs,
      isPaid: false,
      carryIn: -29.5,
      bagModeOverride: null,
    });

    const resolved = resolveWeekCardCarryIn({
      weekStart: THIS_WEEK,
      employee: emp(true),
      thisWeekSnapshot: null,
      previousWeek: {
        snapshot: { pendingBalance: -29.5 },
        logs: prevLogs,
        isPaid: false,
        bagModeOverride: null,
      },
    });

    assert.equal(resolved.source, 'previous-week-liquidation');
    assert.equal(
      resolved.source === 'previous-week-liquidation' ? resolved.carryIn : null,
      prev.carryOut,
    );
  });

  it('primera semana del empleado: carryIn 0 sin replay', () => {
    const resolved = resolveWeekCardCarryIn({
      weekStart: '2025-01-06',
      employee: emp(true),
      thisWeekSnapshot: null,
      previousWeek: null,
    });

    assert.equal(resolved.source, 'timeline-start');
    assert.equal(resolved.source === 'timeline-start' ? resolved.carryIn : 1, 0);
  });

  it('sin esta semana ni la anterior pide replay completo', () => {
    const resolved = resolveWeekCardCarryIn({
      weekStart: THIS_WEEK,
      employee: emp(true),
      thisWeekSnapshot: null,
      previousWeek: null,
    });

    assert.equal(resolved.source, 'needs-full-replay');
  });
});
