import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { liquidateWeekForCard } from '../hours-engine/week-card-from-liquidation.ts';
import type { EmployeeBoundaryFacts, TimeLogFact } from '../hours-engine/types.ts';
import {
  assertWeekDisplayInvariants,
  displayFromSnap,
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

  it('historial mensual: semana sin proyección y sin fichajes no grita', () => {
    const src = readFileSync(
      new URL('./week-display-from-engine.ts', import.meta.url),
      'utf8',
    );
    assert.match(src, /weekHasAttendance/);
    assert.match(src, /emptyCalendarDisplay/);
    assert.match(
      src,
      /if \(weekHasAttendance\(week\.days\)\) throw missingProjectionError/,
    );
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

describe('Asistencia — crédito de anticipo y compensación de extras', () => {
  function snapshotFor(weekStart: string, pending: number, compensated: number, rawExtraHours: number) {
    return {
      week_start: weekStart,
      is_paid: false,
      prefer_stock_hours_override: null,
      overtime_price_snapshot: null,
      pending_balance: 0,
      balance_hours: rawExtraHours,
      final_balance: rawExtraHours,
      total_hours: 16 + rawExtraHours,
      ordinary_hours: 16,
      extra_hours: rawExtraHours,
      contracted_hours_snapshot: 16,
      total_cost: 0,
      carry_out: 0,
      prefer_stock_effective: false,
      has_missing_rate: false,
      overtime_rate_effective: 12,
      overtime_advance_pending_hours: pending,
      overtime_advance_compensated_hours: compensated,
    };
  }

  it('semanas 42–44: Pendientes 1 rojo y Extras 0', () => {
    for (const weekStart of ['2026-10-12', '2026-10-19', '2026-10-26']) {
      const week = displayFromSnap(snapshotFor(weekStart, 1, 0, 0));
      assert.equal(week.startBalance, -1, weekStart);
      assert.equal(week.weeklyBalance, 0, weekStart);
      assert.equal(week.estimatedValue, 0, weekStart);
    }
  });

  it('semana 45: Pendientes 1 rojo, Extras sin 1 e importe 0 €', () => {
    const week = displayFromSnap(snapshotFor('2026-11-02', 1, 1, 1));
    assert.equal(week.startBalance, -1);
    assert.equal(week.displayPendingBalance, -1);
    assert.equal(week.weeklyBalance, 0);
    assert.equal(week.displayExtras, 0);
    assert.equal(week.estimatedValue, 0);
    assert.equal(week.totalHours, 17);
  });

  it('semana 46: desaparece Pendientes al liquidarse el anticipo', () => {
    const week = displayFromSnap(snapshotFor('2026-11-09', 0, 0, 0));
    assert.equal(week.startBalance, 0);
    assert.equal(week.weeklyBalance, 0);
  });

  it('sin anticipo: respeta el saldo original y las extras habituales', () => {
    const week = displayFromSnap(snapshotFor('2026-11-02', 0, 0, 1));
    assert.equal(week.startBalance, 0);
    assert.equal(week.weeklyBalance, 1);
  });
});
