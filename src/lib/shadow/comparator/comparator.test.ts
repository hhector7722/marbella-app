import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CanonicalComparisonVector } from '../types/canonical-vector.ts';
import { compareCanonicalVectors } from './compare.ts';

function base(
  source: 'he' | 'sql',
  overrides: Partial<CanonicalComparisonVector> = {},
): CanonicalComparisonVector {
  return {
    employeeId: 'e1',
    weekStart: '2026-07-20',
    source,
    computableHours: 40,
    justifiedHours: null,
    physicalHours: null,
    contractedHoursEffective: 40,
    regimeLabel: null,
    ordinaryHours: 40,
    overtimeHours: 0,
    carryIn: 0,
    carryOut: 0,
    weeklyBalance: 0,
    balanceFinal: 0,
    pendingHours: 0,
    payableHours: 0,
    compensatedHours: 0,
    bagModeApplied: true,
    isPaid: false,
    otCost: null,
    laborCost: null,
    ...overrides,
  };
}

describe('compareCanonicalVectors', () => {
  it('exact match cuando vectores alineados', () => {
    const r = compareCanonicalVectors(base('he'), base('sql'));
    assert.equal(r.exact, true);
    assert.equal(r.deltas.length, 0);
  });

  it('detecta diff numérico en overtimeHours', () => {
    const r = compareCanonicalVectors(
      base('he', { overtimeHours: 5 }),
      base('sql', { overtimeHours: 3 }),
    );
    assert.equal(r.exact, false);
    assert.equal(r.deltas.length, 1);
    assert.equal(r.deltas[0]!.field, 'overtimeHours');
    assert.equal(r.deltas[0]!.numericDelta, 2);
    assert.equal(r.deltas[0]!.schemaGap, false);
  });

  it('marca schemaGap si un lado es null', () => {
    const r = compareCanonicalVectors(
      base('he', { ordinaryHours: 40 }),
      base('sql', { ordinaryHours: null }),
    );
    assert.equal(r.deltas[0]!.schemaGap, true);
  });

  it('rechaza subjects distintos', () => {
    assert.throws(
      () =>
        compareCanonicalVectors(
          base('he'),
          base('sql', { employeeId: 'other' }),
        ),
      /subject mismatch/,
    );
  });
});
