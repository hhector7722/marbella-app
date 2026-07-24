import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CANONICAL_COMPARABLE_FIELDS,
  DISCREPANCY_CODES,
  DISCREPANCY_STATUSES,
  DISCREPANCY_TRANSITIONS,
  canTransitionDiscrepancyStatus,
  createHeAdapterStub,
  createSqlAdapterStub,
} from './index.ts';

describe('shadow domain scaffolding', () => {
  it('expone taxonomía D000–D017 completa', () => {
    assert.equal(DISCREPANCY_CODES.length, 18);
    assert.equal(DISCREPANCY_CODES[0], 'D000');
    assert.equal(DISCREPANCY_CODES[17], 'D017');
  });

  it('define ciclo de vida de discrepancias', () => {
    assert.ok(DISCREPANCY_STATUSES.includes('NEW'));
    assert.ok(DISCREPANCY_STATUSES.includes('CLOSED'));
    assert.equal(canTransitionDiscrepancyStatus('NEW', 'CONFIRMED'), true);
    assert.equal(canTransitionDiscrepancyStatus('CLOSED', 'NEW'), false);
    assert.ok(DISCREPANCY_TRANSITIONS.FIXED.includes('VERIFIED'));
  });

  it('define campos canónicos comparables', () => {
    assert.ok(CANONICAL_COMPARABLE_FIELDS.includes('overtimeHours'));
    assert.ok(CANONICAL_COMPARABLE_FIELDS.includes('carryOut'));
  });

  it('adapters stub fallan hasta Commit 2', () => {
    assert.throws(
      () =>
        createHeAdapterStub().toCanonical({
          employeeId: 'x',
          weekStart: '2026-07-20',
          liquidation: {},
        }),
      /Commit 2/,
    );
    assert.throws(
      () =>
        createSqlAdapterStub().toCanonical({
          employeeId: 'x',
          weekStart: '2026-07-20',
          snapshot: {},
        }),
      /Commit 2/,
    );
  });
});
