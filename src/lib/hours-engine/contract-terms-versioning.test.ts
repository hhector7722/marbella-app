import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyContractualChange,
  assertContractTermInvariants,
  coalesceIdenticalConsecutiveTerms,
  rewriteHistoricalTerm,
  rescheduleTermBounds,
  rescheduleTermEnd,
  rescheduleTermStart,
  deleteContractTerm,
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

  it('cambiar jornada → cierra y abre (splice sobre abierto)', () => {
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

  it('rescheduleTermStart: mueve inicio más tarde (deja hueco)', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    const r = rescheduleTermStart(
      base,
      '2026-03-01',
      '2026-04-01',
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 10 },
    );
    assert.equal(r.kind, 'rescheduled');
    assert.equal(r.terms[0]!.effectiveFrom, '2026-01-01');
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-28');
    assert.equal(r.terms[1]!.effectiveFrom, '2026-04-01');
    assert.equal(r.terms[1]!.effectiveTo, null);
    assertContractTermInvariants(r.terms);
  });

  it('rescheduleTermStart: mueve inicio más temprano (solape -> aborta)', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    assert.throws(() =>
      rescheduleTermStart(
        base,
        '2026-03-01',
        '2026-02-15',
        { weeklyHours: 32, bagMode: false, regime: 'staff', overtimeRatePerHour: 12 },
      ),
      /solapa/i
    );
  });

  it('rescheduleTermStart: primer tramo solo cambia su from', () => {
    const base = [term('2026-03-01', null, 40)];
    const r = rescheduleTermStart(
      base,
      '2026-03-01',
      '2026-02-01',
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: null },
    );
    assert.equal(r.kind, 'rescheduled');
    assert.equal(r.terms[0]!.effectiveFrom, '2026-02-01');
    assertContractTermInvariants(r.terms);
  });

  it('rescheduleTermEnd: cierra el vigente y sincroniza frontera', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    const r = rescheduleTermEnd(
      base,
      '2026-03-01',
      '2026-06-30',
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 10 },
    );
    assert.equal(r.kind, 'rescheduled');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[1]!.effectiveFrom, '2026-03-01');
    assert.equal(r.terms[1]!.effectiveTo, '2026-06-30');
    assertContractTermInvariants(r.terms);
  });

  it('rescheduleTermEnd: mueve fin más temprano (deja hueco)', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    const r = rescheduleTermEnd(
      base,
      '2026-01-01',
      '2026-02-15',
      { weeklyHours: 16, bagMode: false, regime: 'staff', overtimeRatePerHour: 10 },
    );
    assert.equal(r.kind, 'rescheduled');
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-15');
    assert.equal(r.terms[1]!.effectiveFrom, '2026-03-01');
    assert.equal(r.terms[1]!.effectiveTo, null);
    assertContractTermInvariants(r.terms);
  });

  it('rescheduleTermEnd: reabre el último (fin vacío → vigente)', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', '2026-06-30', 40),
    ];
    const r = rescheduleTermEnd(
      base,
      '2026-03-01',
      null,
      { weeklyHours: 40, bagMode: true, regime: 'staff', overtimeRatePerHour: 10 },
    );
    assert.equal(r.kind, 'rescheduled');
    assert.equal(r.terms[1]!.effectiveTo, null);
    assertContractTermInvariants(r.terms);
  });

  it('rescheduleTermEnd: aborta vigente en tramo intermedio', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    assert.throws(() =>
      rescheduleTermEnd(
        base,
        '2026-01-01',
        null,
        { weeklyHours: 16, bagMode: false, regime: 'staff', overtimeRatePerHour: 10 },
      ),
    );
  });

  it('rescheduleTermBounds: mueve inicio y fin a la vez (dejando huecos)', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-15', '2026-05-31', 32),
      term('2026-06-15', null, 40),
    ];
    const r = rescheduleTermBounds(
      base,
      '2026-03-15',
      '2026-04-01',
      '2026-05-15',
      { weeklyHours: 24, bagMode: false, regime: 'staff', overtimeRatePerHour: 12 },
    );
    assert.equal(r.kind, 'rescheduled');
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-28');
    assert.equal(r.terms[1]!.effectiveFrom, '2026-04-01');
    assert.equal(r.terms[1]!.effectiveTo, '2026-05-15');
    assert.equal(r.terms[1]!.weeklyHours, 24);
    assert.equal(r.terms[2]!.effectiveFrom, '2026-06-15');
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

  it('permitir huecos (no abort)', () => {
    assert.doesNotThrow(() =>
      assertContractTermInvariants([
        term('2026-01-01', '2026-01-31', 16),
        term('2026-02-05', null, 40),
      ]),
    );
  });

  it('evitar crear tramos idénticos sin cambios', () => {
    const base = [term('2026-01-01', null, 40, { bagMode: true })];
    const r = applyContractualChange(base, termToSnapshot(base[0]!), '2026-06-01');
    assert.equal(r.kind, 'noop');
    assert.equal(r.terms.length, 1);
  });

  it('mismo día: actualiza in-place', () => {
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

describe('contract-terms-versioning — splice histórico v2', () => {
  const snap = (h: number, rate: number | null = 10): Parameters<typeof applyContractualChange>[1] => ({
    weeklyHours: h,
    bagMode: false,
    regime: 'staff',
    overtimeRatePerHour: rate,
  });

  it('splice sobre tramo cerrado (ejemplo aprobado)', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const r = applyContractualChange(base, snap(32), '2026-05-01');
    assert.equal(r.kind, 'spliced');
    assert.equal(r.terms.length, 3);
    assert.deepEqual(
      r.terms.map((t) => ({
        from: t.effectiveFrom,
        to: t.effectiveTo,
        h: t.weeklyHours,
      })),
      [
        { from: '2026-02-11', to: '2026-04-30', h: 16 },
        { from: '2026-05-01', to: '2026-07-15', h: 32 },
        { from: '2026-07-16', to: null, h: 40 },
      ],
    );
    assertContractTermInvariants(r.terms);
  });

  it('splice sobre tramo abierto', () => {
    const base = [term('2026-02-11', null, 16, { bagMode: false, overtimeRatePerHour: 10 })];
    const r = applyContractualChange(base, snap(40), '2026-05-01');
    assert.equal(r.kind, 'appended');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[0]!.effectiveTo, '2026-04-30');
    assert.equal(r.terms[1]!.weeklyHours, 40);
    assert.equal(r.terms[1]!.effectiveTo, null);
    assertContractTermInvariants(r.terms);
  });

  it('splice exactamente en el inicio de un tramo', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const r = applyContractualChange(base, snap(32), '2026-07-16');
    assert.equal(r.kind, 'updated_open');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[0]!.weeklyHours, 16);
    assert.equal(r.terms[1]!.weeklyHours, 32);
    assert.equal(r.terms[1]!.effectiveFrom, '2026-07-16');
    assertContractTermInvariants(r.terms);
  });

  it('splice último día de un tramo', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const r = applyContractualChange(base, snap(32), '2026-07-15');
    assert.equal(r.kind, 'spliced');
    assert.equal(r.terms.length, 3);
    assert.equal(r.terms[0]!.effectiveTo, '2026-07-14');
    assert.equal(r.terms[1]!.effectiveFrom, '2026-07-15');
    assert.equal(r.terms[1]!.effectiveTo, '2026-07-15');
    assert.equal(r.terms[1]!.weeklyHours, 32);
    assert.equal(r.terms[2]!.weeklyHours, 40);
    assertContractTermInvariants(r.terms);
  });

  it('múltiples splices históricos consecutivos', () => {
    let terms: readonly ContractTermFact[] = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    terms = applyContractualChange(terms, snap(32), '2026-05-01').terms;
    terms = applyContractualChange(terms, snap(28), '2026-06-01').terms;
    assert.equal(terms.length, 4);
    assert.equal(terms[1]!.weeklyHours, 32);
    assert.equal(terms[1]!.effectiveTo, '2026-05-31');
    assert.equal(terms[2]!.weeklyHours, 28);
    assert.equal(terms[2]!.effectiveFrom, '2026-06-01');
    assert.equal(terms[2]!.effectiveTo, '2026-07-15');
    assert.equal(terms[3]!.weeklyHours, 40);
    assertContractTermInvariants(terms);
  });

  it('noop si snapshot igual al tramo que contiene la fecha', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const r = applyContractualChange(base, snap(16), '2026-05-01');
    assert.equal(r.kind, 'noop');
    assert.equal(r.terms.length, 2);
  });

  it('mismo día con modificación distinta → updated', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const r = applyContractualChange(base, snap(20), '2026-02-11');
    assert.equal(r.kind, 'updated');
    assert.equal(r.terms[0]!.weeklyHours, 20);
    assert.equal(r.terms[0]!.effectiveTo, '2026-07-15');
    assert.equal(r.terms[1]!.weeklyHours, 40);
  });

  it('coalescencia automática de vecinos idénticos', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    // Reescribir el abierto a 16h → coalesce con el cerrado previo
    const r = applyContractualChange(base, snap(16), '2026-07-16');
    assert.equal(r.kind, 'updated_open');
    assert.equal(r.terms.length, 1);
    assert.equal(r.terms[0]!.effectiveFrom, '2026-02-11');
    assert.equal(r.terms[0]!.effectiveTo, null);
    assert.equal(r.terms[0]!.weeklyHours, 16);
    assertContractTermInvariants(r.terms);
  });

  it('coalesceIdenticalConsecutiveTerms puro', () => {
    const merged = coalesceIdenticalConsecutiveTerms([
      term('2026-01-01', '2026-01-31', 40, { bagMode: false }),
      term('2026-02-01', null, 40, { bagMode: false }),
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.effectiveFrom, '2026-01-01');
    assert.equal(merged[0]!.effectiveTo, null);
  });

  it('crea tramo si fecha anterior al primer contrato', () => {
    const base = [term('2026-02-11', null, 16, { bagMode: false })];
    const r = applyContractualChange(base, snap(40), '2026-01-01');
    assert.equal(r.kind, 'spliced');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[0]!.effectiveFrom, '2026-01-01');
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-10');
  });

  it('crea tramo en un hueco intermedio', () => {
    const base = [
      term('2026-01-01', '2026-01-31', 16, { bagMode: false }),
      term('2026-03-01', '2026-03-31', 40, { bagMode: false }),
    ];
    const r = applyContractualChange(base, snap(32), '2026-02-15');
    assert.equal(r.kind, 'spliced');
    assert.equal(r.terms.length, 3);
    assert.equal(r.terms[1]!.effectiveFrom, '2026-02-15');
    assert.equal(r.terms[1]!.effectiveTo, '2026-02-28');
  });

  it('mantiene invariantes del dominio tras splice', () => {
    const base = [
      term('2026-02-11', '2026-07-15', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-07-16', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ];
    const r = applyContractualChange(base, snap(32), '2026-05-01');
    assert.doesNotThrow(() => assertContractTermInvariants(r.terms));
  });

  it('deleteContractTerm: intermedio → deja hueco', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', '2026-05-31', 32),
      term('2026-06-01', null, 40),
    ];
    const r = deleteContractTerm(base, '2026-03-01');
    assert.equal(r.kind, 'deleted');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[0]!.effectiveFrom, '2026-01-01');
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-28');
    assert.equal(r.terms[0]!.weeklyHours, 16);
    assert.equal(r.terms[1]!.effectiveFrom, '2026-06-01');
    assertContractTermInvariants(r.terms);
  });

  it('deleteContractTerm: último abierto → deja hueco al final', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    const r = deleteContractTerm(base, '2026-03-01');
    assert.equal(r.kind, 'deleted');
    assert.equal(r.terms.length, 1);
    assert.equal(r.terms[0]!.effectiveFrom, '2026-01-01');
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-28');
    assert.equal(r.terms[0]!.weeklyHours, 16);
    assertContractTermInvariants(r.terms);
  });

  it('deleteContractTerm: primero → siguiente pasa a ser el primero', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 16),
      term('2026-03-01', null, 40),
    ];
    const r = deleteContractTerm(base, '2026-01-01');
    assert.equal(r.kind, 'deleted');
    assert.equal(r.terms.length, 1);
    assert.equal(r.terms[0]!.effectiveFrom, '2026-03-01');
    assert.equal(r.terms[0]!.weeklyHours, 40);
    assertContractTermInvariants(r.terms);
  });

  it('deleteContractTerm: rechaza borrar el único tramo', () => {
    assert.throws(
      () => deleteContractTerm([term('2026-01-01', null, 40)], '2026-01-01'),
      /único tramo/,
    );
  });

  it('deleteContractTerm: NO coalesce vecinos idénticos separados por un hueco', () => {
    const base = [
      term('2026-01-01', '2026-02-28', 40, { bagMode: false }),
      term('2026-03-01', '2026-04-30', 16, { bagMode: true }),
      term('2026-05-01', null, 40, { bagMode: false }),
    ];
    const r = deleteContractTerm(base, '2026-03-01');
    assert.equal(r.kind, 'deleted');
    assert.equal(r.terms.length, 2);
    assert.equal(r.terms[0]!.effectiveTo, '2026-02-28');
    assert.equal(r.terms[1]!.effectiveFrom, '2026-05-01');
    assertContractTermInvariants(r.terms);
  });
});
