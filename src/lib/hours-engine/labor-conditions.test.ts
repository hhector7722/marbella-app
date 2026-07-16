import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyContractualChange } from './contract-terms-versioning.ts';
import {
  bagLabel,
  laborChangeIsNoop,
  laborChangeIsNoopAt,
  openTermSnapshot,
  parseCivilYmd,
  regimeLabel,
  snapshotToProfileMirror,
  validateLaborConditionsForm,
} from './labor-conditions.ts';
import type { ContractTermFact } from './types.ts';
import { isMasterDashboardUser, MASTER_DASHBOARD_EMAIL } from '../staff/simulation-identity.ts';

function term(
  from: string,
  to: string | null,
  weeklyHours: number,
  opts: Partial<ContractTermFact> = {},
): ContractTermFact {
  return {
    effectiveFrom: from,
    effectiveTo: to,
    weeklyHours,
    bagMode: opts.bagMode ?? false,
    regime: opts.regime ?? 'staff',
    overtimeRatePerHour: opts.overtimeRatePerHour ?? 10,
  };
}

describe('labor-conditions v1', () => {
  it('acceso: solo Héctor (MASTER_DASHBOARD_EMAIL)', () => {
    assert.equal(isMasterDashboardUser(MASTER_DASHBOARD_EMAIL), true);
    assert.equal(isMasterDashboardUser('hhector7722@gmail.com'), true);
    assert.equal(isMasterDashboardUser('otro@gmail.com'), false);
    assert.equal(isMasterDashboardUser(null), false);
  });

  it('validación: horas y tarifa >= 0', () => {
    const badHours = validateLaborConditionsForm({
      weeklyHours: -1,
      regime: 'staff',
      bagMode: false,
      overtimeRatePerHour: 10,
    });
    assert.equal(badHours.ok, false);

    const badRate = validateLaborConditionsForm({
      weeklyHours: 40,
      regime: 'staff',
      bagMode: false,
      overtimeRatePerHour: -5,
    });
    assert.equal(badRate.ok, false);
  });

  it('validación: manager/fixed → horas = 0', () => {
    const mgr = validateLaborConditionsForm({
      weeklyHours: 40,
      regime: 'manager',
      bagMode: false,
      overtimeRatePerHour: 10,
    });
    assert.equal(mgr.ok, true);
    if (mgr.ok) assert.equal(mgr.snapshot.weeklyHours, 0);

    const fixed = validateLaborConditionsForm({
      weeklyHours: 16,
      regime: 'fixed',
      bagMode: true,
      overtimeRatePerHour: null,
    });
    assert.equal(fixed.ok, true);
    if (fixed.ok) {
      assert.equal(fixed.snapshot.weeklyHours, 0);
      assert.equal(fixed.snapshot.regime, 'fixed');
    }
  });

  it('resumen del contrato vigente (openTermSnapshot)', () => {
    const terms = [
      term('2026-01-01', '2026-07-11', 40),
      term('2026-07-12', null, 16, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const open = openTermSnapshot(terms);
    assert.ok(open);
    assert.equal(open!.weeklyHours, 16);
    assert.equal(open!.bagMode, false);
    assert.equal(open!.overtimeRatePerHour, 10);
    assert.equal(regimeLabel(open!.regime), 'Staff');
    assert.equal(bagLabel(open!.bagMode), 'Pago mensual');
  });

  it('no crear tramo si no cambia nada', () => {
    const terms = [term('2026-07-12', null, 40, { bagMode: false, overtimeRatePerHour: 10 })];
    const next = {
      weeklyHours: 40,
      bagMode: false,
      regime: 'staff' as const,
      overtimeRatePerHour: 10,
    };
    assert.equal(laborChangeIsNoop(terms, next), true);
    assert.equal(laborChangeIsNoopAt(terms, next, '2026-07-16'), true);
    const plan = applyContractualChange(terms, next, '2026-07-16');
    assert.equal(plan.kind, 'noop');
    assert.equal(plan.terms.length, 1);
  });

  it('parseCivilYmd valida fechas', () => {
    assert.equal(parseCivilYmd('2026-05-01'), '2026-05-01');
    assert.equal(parseCivilYmd('2026-02-30'), null);
    assert.equal(parseCivilYmd('nope'), null);
  });

  it('crear nuevo tramo al cambiar condiciones', () => {
    const terms = [term('2026-01-01', null, 40, { bagMode: false, overtimeRatePerHour: 10 })];
    const validated = validateLaborConditionsForm({
      weeklyHours: 16,
      regime: 'staff',
      bagMode: false,
      overtimeRatePerHour: 10,
    });
    assert.equal(validated.ok, true);
    if (!validated.ok) return;

    assert.equal(laborChangeIsNoop(terms, validated.snapshot), false);
    const plan = applyContractualChange(terms, validated.snapshot, '2026-07-16');
    assert.equal(plan.kind, 'appended');
    assert.equal(plan.terms.length, 2);
    assert.equal(plan.terms[0]!.effectiveTo, '2026-07-15');
    assert.equal(plan.terms[1]!.weeklyHours, 16);
    assert.equal(plan.terms[1]!.effectiveTo, null);
  });

  it('espejo profiles (snapshotToProfileMirror)', () => {
    const staff = snapshotToProfileMirror(
      { weeklyHours: 16, bagMode: false, regime: 'staff', overtimeRatePerHour: 10 },
      'staff',
    );
    assert.deepEqual(staff, {
      contracted_hours_weekly: 16,
      prefer_stock_hours: false,
      is_fixed_salary: false,
      overtime_cost_per_hour: 10,
      role: 'staff',
    });

    const mgr = snapshotToProfileMirror(
      { weeklyHours: 0, bagMode: false, regime: 'manager', overtimeRatePerHour: null },
      'staff',
    );
    assert.equal(mgr.role, 'manager');
    assert.equal(mgr.contracted_hours_weekly, 0);

    const demote = snapshotToProfileMirror(
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 12 },
      'manager',
    );
    assert.equal(demote.role, 'staff');
    assert.equal(demote.prefer_stock_hours, true);
  });
});
