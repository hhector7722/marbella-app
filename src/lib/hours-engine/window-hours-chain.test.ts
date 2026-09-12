import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hoursWindowBounds,
  listMondaysInclusive,
  overtimeMoneyByDayFromChain,
  resolveWindowOpeningCarry,
} from './window-hours-chain.ts';
import type { EmployeeBoundaryFacts, TimeLogFact } from './types.ts';

function emp(): EmployeeBoundaryFacts {
  return {
    employeeId: 'test',
    joiningDate: '2025-01-06',
    endDate: null,
    terms: [
      {
        effectiveFrom: '2025-01-06',
        effectiveTo: null,
        weeklyHours: 28,
        bagMode: false,
        regime: 'staff',
        overtimeRatePerHour: 10,
      },
    ],
  };
}

function logsHours(weekMonday: string, hoursPerDay: number[]): TimeLogFact[] {
  return hoursPerDay.map((hours, i) => {
    const [y, m, d] = weekMonday.split('-').map(Number);
    const dt = new Date(y!, m! - 1, d! + i, 10, 0, 0);
    const out = new Date(dt.getTime() + hours * 3600 * 1000);
    return {
      clockInIso: dt.toISOString(),
      clockOutIso: out.toISOString(),
      totalHours: hours,
    };
  });
}

describe('window-hours-chain', () => {
  it('acota la ventana a la semana previa y el domingo final', () => {
    const bounds = hoursWindowBounds('2026-07-13', '2026-08-03');
    assert.equal(bounds.logsFrom, '2026-07-06');
    assert.equal(bounds.lastSunday, '2026-08-09');
    assert.equal(bounds.snapsTo, '2026-08-03');
    assert.deepEqual(listMondaysInclusive('2026-07-13', '2026-07-27'), [
      '2026-07-13',
      '2026-07-20',
      '2026-07-27',
    ]);
  });

  it('lee el arrastre del snapshot de la primera semana', () => {
    const opening = resolveWindowOpeningCarry({
      employee: emp(),
      firstWeekStart: '2026-07-13',
      snaps: [{ week_start: '2026-07-13', pending_balance: -8, is_paid: false }],
      logs: [],
    });
    assert.equal('carryIn' in opening && opening.carryIn, -8);
  });

  it('sin snapshots pide replay completo', () => {
    const opening = resolveWindowOpeningCarry({
      employee: emp(),
      firstWeekStart: '2026-07-13',
      snaps: [],
      logs: [],
    });
    assert.deepEqual(opening, { needsFullReplay: true });
  });

  it('reparte euros, no horas extra, entre los días de la semana', () => {
    const weekStart = '2026-07-13';
    const byDay = overtimeMoneyByDayFromChain({
      employee: emp(),
      weekStarts: [weekStart],
      snaps: [
        {
          week_start: weekStart,
          pending_balance: 0,
          is_paid: false,
          overtime_price_snapshot: 10,
        },
      ],
      logs: logsHours(weekStart, [8, 8, 8, 8, 8]),
      openingCarryIn: 0,
    });

    const sum = Object.values(byDay).reduce((a, b) => a + b, 0);
    assert.equal(sum, 120);
  });
});
