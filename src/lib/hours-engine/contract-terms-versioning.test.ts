import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyContractualChange,
  assertContractTermInvariants,
  rewriteHistoricalTerm,
  snapshotFromProfileFields,
  snapshotsEqual,
  termToSnapshot,
} from './contract-terms-versioning.ts';
import type { ContractTermFact } from './types.ts';

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
    bagMode: opts.bagMode ?? true,
    regime: opts.regime ?? 'staff',
    overtimeRatePerHour: opts.overtimeRatePerHour ?? null,
  };
}

describe('contract-terms-versioning', () => {
  it('crear empleado → primer tramo', () => {
    const r = applyContractualChange(
      [],
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 12 },
      '2026-03-01',
    );
    assert.equal(r.kind, 'created');
    assert.equal(r.terms.length, 1);
    assert.equal(r.terms[0]!.effectiveFrom, '2026-03-01');
    assert.equal(r.terms[0]!.effectiveTo, null);
    assertContractTermInvariants(r.terms);
  });

  it('cambiar jornada → cierra y abre', () => {
    const base = [term('2026-01-01', null, 16)];
    const r = applyContractualChange(
      base,
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: null },
      '2026-03-02',
    );
    assert.equal(r.kind, 'appended');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[0]!.effectiveTo, '2026-03-01');
    assert.equal(r.terms[1]!.weeklyHours, 40);
    assert.equal(r.terms[1]!.effectiveFrom, '2026-03-02');
    assertContractTermInvariants(r.terms);
  });

  it('cambiar tarifa OT', () => {
    const base = [term('2026-01-01', null, 40, { overtimeRatePerHour: 10 })];
    const r = applyContractualChange(
      base,
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 15 },
      '2026-04-01',
    );
    assert.equal(r.kind, 'appended');
    assert.equal(r.terms[1]!.overtimeRatePerHour, 15);
    assert.equal(r.terms[0]!.overtimeRatePerHour, 10);
  });

  it('cambiar régimen staff → fixed', () => {
    const base = [term('2026-01-01', null, 40)];
    const r = applyContractualChange(
      base,
      { weeklyHours: 0, bagMode: false, regime: 'fixed', overtimeRatePerHour: null },
      '2026-05-01',
    );
    assert.equal(r.kind, 'appended');
    assert.equal(r.terms[1]!.regime, 'fixed');
    assert.equal(r.terms[1]!.weeklyHours, 0);
  });

  it('cambiar bolsa ↔ pago', () => {
    const base = [term('2026-01-01', null, 40, { bagMode: true })];
    const r = applyContractualChange(
      base,
      { weeklyHours: 40, bagMode: false, regime: 'staff', overtimeRatePerHour: null },
      '2026-06-01',
    );
    assert.equal(r.kind, 'appended');
    assert.equal(r.terms[0]!.bagMode, true);
    assert.equal(r.terms[1]!.bagMode, false);
  });

  it('cambiar salario fijo (is_fixed vía snapshotFromProfileFields)', () => {
    const snap = snapshotFromProfileFields({
      contracted_hours_weekly: 40,
      is_fixed_salary: true,
      role: 'staff',
      prefer_stock_hours: false,
      overtime_cost_per_hour: 0,
    });
    assert.equal(snap.regime, 'fixed');
    assert.equal(snap.weeklyHours, 0);
    const r = applyContractualChange([], snap, '2026-01-01');
    assert.equal(r.terms[0]!.regime, 'fixed');
  });

  it('modificar contrato varias veces', () => {
    let terms: readonly ContractTermFact[] = [];
    terms = applyContractualChange(
      terms,
      { weeklyHours: 16, bagMode: false, regime: 'staff', overtimeRatePerHour: null },
      '2026-01-01',
    ).terms;
    terms = applyContractualChange(
      terms,
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: null },
      '2026-02-01',
    ).terms;
    terms = applyContractualChange(
      terms,
      { weeklyHours: 28, bagMode: true, regime: 'staff', overtimeRatePerHour: 11 },
      '2026-03-01',
    ).terms;
    assert.equal(terms.length, 3);
    assertContractTermInvariants(terms);
    assert.equal(terms[0]!.effectiveTo, '2026-01-31');
    assert.equal(terms[1]!.effectiveTo, '2026-02-28');
    assert.equal(terms[2]!.effectiveTo, null);
  });

  it('modificar contrato histórico no toca posteriores', () => {
    const base = [
      term('2026-01-01', '2026-01-31', 16),
      term('2026-02-01', '2026-02-28', 40),
      term('2026-03-01', null, 28),
    ];
    const r = rewriteHistoricalTerm(base, '2026-01-01', {
      weeklyHours: 20,
      bagMode: true,
      regime: 'staff',
      overtimeRatePerHour: null,
    });
    assert.equal(r.kind, 'rewritten');
    assert.equal(r.terms[0]!.weeklyHours, 20);
    assert.equal(r.terms[1]!.weeklyHours, 40);
    assert.equal(r.terms[2]!.weeklyHours, 28);
    assertContractTermInvariants(r.terms);
  });

  it('evitar solapamientos (abort)', () => {
    assert.throws(() =>
      assertContractTermInvariants([
        term('2026-01-01', '2026-01-31', 16),
        term('2026-01-15', null, 40),
      ]),
    );
  });

  it('evitar huecos (abort)', () => {
    assert.throws(() =>
      assertContractTermInvariants([
        term('2026-01-01', '2026-01-31', 16),
        term('2026-02-02', null, 40), // falta 2026-02-01
      ]),
    );
  });

  it('evitar crear tramos idénticos sin cambios', () => {
    const base = [term('2026-01-01', null, 40, { bagMode: true })];
    const r = applyContractualChange(
      base,
      termToSnapshot(base[0]!),
      '2026-06-01',
    );
    assert.equal(r.kind, 'noop');
    assert.equal(r.terms.length, 1);
  });

  it('mismo día: actualiza abierto in-place', () => {
    const base = [term('2026-03-01', null, 16)];
    const r = applyContractualChange(
      base,
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: null },
      '2026-03-01',
    );
    assert.equal(r.kind, 'updated_open');
    assert.equal(r.terms.length, 1);
    assert.equal(r.terms[0]!.weeklyHours, 40);
  });

  it('snapshotsEqual', () => {
    assert.ok(
      snapshotsEqual(
        { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: null },
        { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: null },
      ),
    );
    assert.ok(
      !snapshotsEqual(
        { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 1 },
        { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 2 },
      ),
    );
  });

  it('manager vía snapshotFromProfileFields', () => {
    const snap = snapshotFromProfileFields({
      role: 'manager',
      contracted_hours_weekly: 40,
      prefer_stock_hours: true,
    });
    assert.equal(snap.regime, 'manager');
    assert.equal(snap.weeklyHours, 0);
  });
});
