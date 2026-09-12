import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleOvertimeWeeks,
  completedMondaysInRange,
  isCompletedWeekMonday,
  overtimeWeeksCacheKey,
  staffStatsFromProjection,
  type OvertimeSnapshotRow,
} from './overtime-weeks-ssot.ts';

const profile = {
  id: 'u1',
  first_name: 'Ana',
  last_name: 'López',
  role: 'staff',
  visible_in_plantilla: true,
};

describe('completedMondaysInRange', () => {
  it('excluye la semana en curso y las futuras', () => {
    const mondays = completedMondaysInRange(
      '2026-09-01',
      '2026-09-30',
      '2026-09-14',
    );
    assert.deepEqual(mondays, ['2026-08-31', '2026-09-07']);
    assert.equal(isCompletedWeekMonday('2026-09-07', '2026-09-14'), true);
    assert.equal(isCompletedWeekMonday('2026-09-14', '2026-09-14'), false);
  });

  it('la rejilla del calendario y el mes civil comparten las mismas semanas cerradas', () => {
    const today = '2026-09-14';
    const grid = completedMondaysInRange('2026-08-31', '2026-10-04', today);
    const month = completedMondaysInRange('2026-09-01', '2026-09-30', today);
    assert.deepEqual(grid, month);
    assert.equal(
      overtimeWeeksCacheKey('2026-08-31', '2026-10-04', today),
      overtimeWeeksCacheKey('2026-09-01', '2026-09-30', today),
    );
  });
});

describe('staffStatsFromProjection', () => {
  it('pinta el importe persistido y no recalcula', () => {
    const row: OvertimeSnapshotRow = {
      user_id: 'u1',
      week_start: '2026-09-07',
      total_cost: '84.50',
      total_hours: 42,
      ordinary_hours: 40,
      extra_hours: 2,
      is_paid: true,
      prefer_stock_hours_override: false,
    };
    const stats = staffStatsFromProjection(profile, row);
    assert.equal(stats.totalCost, 84.5);
    assert.equal(stats.overtimeCost, 84.5);
    assert.equal(stats.isPaid, true);
    assert.equal(stats.preferStock, false);
    assert.equal(stats.overtimeHours, 2);
  });

  it('bolsa solo si el override está a true', () => {
    const row: OvertimeSnapshotRow = {
      user_id: 'u1',
      week_start: '2026-09-07',
      total_cost: 0,
      total_hours: 40,
      ordinary_hours: 40,
      extra_hours: 0,
      is_paid: false,
      prefer_stock_hours_override: true,
    };
    assert.equal(staffStatsFromProjection(profile, row).preferStock, true);
  });
});

describe('assembleOvertimeWeeks', () => {
  it('agrupa por lunes y omite semanas sin proyección', () => {
    const { weeksResult, summary } = assembleOvertimeWeeks({
      mondays: ['2026-08-31', '2026-09-07'],
      profiles: [profile],
      snapshots: [
        {
          user_id: 'u1',
          week_start: '2026-09-07T00:00:00+00:00',
          total_cost: 120,
          total_hours: 44,
          ordinary_hours: 40,
          extra_hours: 4,
          is_paid: false,
          prefer_stock_hours_override: null,
        },
      ],
    });

    assert.equal(weeksResult.length, 1);
    assert.equal(weeksResult[0]?.weekId, '2026-09-07');
    assert.equal(weeksResult[0]?.staff[0]?.name, 'Ana López');
    assert.equal(weeksResult[0]?.totalAmount, 120);
    assert.equal(summary.totalOvertimeCost, 120);
  });

  it('ignora snapshots de quien no está en plantilla', () => {
    const { weeksResult } = assembleOvertimeWeeks({
      mondays: ['2026-09-07'],
      profiles: [profile],
      snapshots: [
        {
          user_id: 'hidden',
          week_start: '2026-09-07',
          total_cost: 999,
          total_hours: 10,
          ordinary_hours: 0,
          extra_hours: 10,
          is_paid: false,
          prefer_stock_hours_override: null,
        },
      ],
    });
    assert.equal(weeksResult.length, 0);
  });
});
