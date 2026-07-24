import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareCanonicalVectors } from '../comparator/compare.ts';
import type { CanonicalComparisonVector } from '../types/canonical-vector.ts';
import { classifyCompareResult, classifyFieldDelta } from './classify.ts';

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
    regimeLabel: 'staff',
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

describe('shadow classifier', () => {
  it('D000 en schema gap', () => {
    const d = classifyFieldDelta({
      field: 'ordinaryHours',
      heValue: 40,
      sqlValue: null,
      schemaGap: true,
      numericDelta: null,
      equal: false,
    });
    assert.equal(d.discrepancyCode, 'D000');
  });

  it('D003 en computableHours', () => {
    const d = classifyFieldDelta({
      field: 'computableHours',
      heValue: 45,
      sqlValue: 40,
      schemaGap: false,
      numericDelta: 5,
      equal: false,
    });
    assert.equal(d.discrepancyCode, 'D003');
    assert.equal(d.owner, 'Attendance');
  });

  it('D004 en redondeo pequeño', () => {
    const d = classifyFieldDelta({
      field: 'weeklyBalance',
      heValue: 1.02,
      sqlValue: 1.0,
      schemaGap: false,
      numericDelta: 0.02,
      equal: false,
    });
    assert.equal(d.discrepancyCode, 'D004');
  });

  it('classifyCompareResult elige primary crítico', () => {
    const raw = compareCanonicalVectors(
      base('he', { overtimeHours: 5, carryOut: 2 }),
      base('sql', { overtimeHours: 3, carryOut: 2 }),
    );
    const c = classifyCompareResult(raw);
    assert.equal(c.exact, false);
    assert.equal(c.primaryCode, 'D006');
    assert.ok(c.fieldDiffs.some((f) => f.field === 'overtimeHours'));
  });
});
