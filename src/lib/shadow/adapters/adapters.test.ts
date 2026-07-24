import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LiquidationResult } from '../../hours-engine/types.ts';
import {
  createHeAdapter,
  createSqlAdapter,
  heLiquidationToCanonical,
  sqlSnapshotToCanonical,
} from './index.ts';

function minimalLiquidation(
  overrides: Partial<LiquidationResult> = {},
): LiquidationResult {
  return {
    employeeId: 'e1',
    weekStart: '2026-07-20',
    weekEnd: '2026-07-26',
    hoursWorked: 45,
    contractedHoursEffective: 40,
    weeklyBalance: 5,
    carryIn: 2,
    balanceFinal: 7,
    carryOut: 7,
    isPaid: false,
    ordinaryHours: 40,
    overtimeHours: 5,
    segments: [
      {
        days: ['2026-07-20'],
        hoursWorked: 45,
        contractedHours: 40,
        bagMode: true,
        regimeApplied: 'staff',
        weeklyBalancePart: 5,
        ordinaryHours: 40,
        overtimeHours: 5,
        kind: 'term',
      },
    ],
    dailyBreakdown: {
      days: [],
      ordinaryHoursTotal: 40,
      overtimeHoursTotal: 5,
    },
    ...overrides,
  };
}

describe('shadow adapters → CanonicalComparisonVector', () => {
  it('HE adapter proyecta campos de liquidación', () => {
    const v = heLiquidationToCanonical({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      liquidation: minimalLiquidation(),
      facts: { justifiedHoursWeek: 1 },
    });
    assert.equal(v.source, 'he');
    assert.equal(v.computableHours, 45);
    assert.equal(v.justifiedHours, 1);
    assert.equal(v.physicalHours, 44);
    assert.equal(v.overtimeHours, 5);
    assert.equal(v.carryIn, 2);
    assert.equal(v.carryOut, 7);
    assert.equal(v.bagModeApplied, true);
    assert.equal(v.payableHours, 0);
    assert.equal(v.regimeLabel, 'staff');
  });

  it('HE adapter modo pago calcula payable', () => {
    const v = createHeAdapter().toCanonical({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      liquidation: minimalLiquidation({
        segments: [
          {
            days: ['2026-07-20'],
            hoursWorked: 45,
            contractedHours: 40,
            bagMode: false,
            regimeApplied: 'staff',
            weeklyBalancePart: 5,
            ordinaryHours: 40,
            overtimeHours: 5,
            kind: 'term',
          },
        ],
        balanceFinal: 7,
        carryOut: 0,
      }),
      bagModeOverride: false,
    });
    assert.equal(v.bagModeApplied, false);
    assert.equal(v.payableHours, 7);
  });

  it('SQL adapter proyecta weekly_snapshots sin inventar extras', () => {
    const v = sqlSnapshotToCanonical({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      snapshot: {
        user_id: 'e1',
        week_start: '2026-07-20',
        total_hours: 45,
        balance_hours: 5,
        pending_balance: 2,
        final_balance: 7,
        contracted_hours_snapshot: 40,
        is_paid: false,
        prefer_stock_hours_override: true,
        total_cost: 0,
      },
    });
    assert.equal(v.source, 'sql');
    assert.equal(v.computableHours, 45);
    assert.equal(v.overtimeHours, null);
    assert.equal(v.justifiedHours, null);
    assert.equal(v.carryIn, 2);
    assert.equal(v.balanceFinal, 7);
    assert.equal(v.bagModeApplied, true);
    assert.equal(v.otCost, 0);
  });

  it('SQL adapter usa profilePreferStock si override null', () => {
    const v = createSqlAdapter().toCanonical({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      snapshot: {
        week_start: '2026-07-20',
        prefer_stock_hours_override: null,
        final_balance: 3,
      },
      profilePreferStock: false,
    });
    assert.equal(v.bagModeApplied, false);
    assert.equal(v.payableHours, 3);
  });

  it('rechaza mismatch de identidad', () => {
    assert.throws(
      () =>
        heLiquidationToCanonical({
          employeeId: 'other',
          weekStart: '2026-07-20',
          liquidation: minimalLiquidation(),
        }),
      /employeeId mismatch/,
    );
  });
});
