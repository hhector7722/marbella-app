import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDiscrepancyFingerprint,
  createInMemoryDiscrepancyStore,
  createShadowDiscrepancy,
  transitionDiscrepancy,
  upsertObservedDiscrepancy,
  InvalidDiscrepancyTransitionError,
} from '../index.ts';

describe('shadow discrepancy lifecycle', () => {
  it('fingerprint estable para mismos campos', () => {
    const a = buildDiscrepancyFingerprint({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      discrepancyCode: 'D005',
      affectedFields: ['overtimeHours', 'carryOut'],
    });
    const b = buildDiscrepancyFingerprint({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      discrepancyCode: 'D005',
      affectedFields: ['carryOut', 'overtimeHours'],
    });
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it('crea NEW y permite transición a CONFIRMED', () => {
    const d = createShadowDiscrepancy({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      discrepancyCode: 'D001',
      affectedFields: ['contractedHoursEffective'],
      severity: 'CRITICAL',
      owner: 'Contract',
      nowIso: '2026-07-24T10:00:00.000Z',
    });
    assert.equal(d.status, 'NEW');
    assert.equal(d.occurrences, 1);
    const next = transitionDiscrepancy(d, 'CONFIRMED', '2026-07-24T11:00:00.000Z');
    assert.equal(next.status, 'CONFIRMED');
  });

  it('rechaza transición inválida CLOSED → NEW', () => {
    const d = createShadowDiscrepancy({
      employeeId: 'e1',
      weekStart: '2026-07-20',
      discrepancyCode: 'D004',
      affectedFields: ['weeklyBalance'],
      severity: 'MEDIUM',
      owner: 'Liquidation',
    });
    const closed = transitionDiscrepancy(
      transitionDiscrepancy(
        transitionDiscrepancy(d, 'CONFIRMED'),
        'FIXED',
      ),
      'VERIFIED',
    );
    const done = transitionDiscrepancy(closed, 'CLOSED');
    assert.throws(
      () => transitionDiscrepancy(done, 'NEW'),
      InvalidDiscrepancyTransitionError,
    );
  });

  it('upsert por fingerprint incrementa occurrences', async () => {
    const store = createInMemoryDiscrepancyStore();
    const input = {
      employeeId: 'e1',
      weekStart: '2026-07-20',
      discrepancyCode: 'D002' as const,
      affectedFields: ['carryIn' as const],
      severity: 'CRITICAL' as const,
      owner: 'Liquidation' as const,
      nowIso: '2026-07-24T10:00:00.000Z',
    };
    const first = await upsertObservedDiscrepancy(store, input);
    assert.equal(first.wasExisting, false);
    assert.equal(first.discrepancy.occurrences, 1);

    const second = await upsertObservedDiscrepancy(store, {
      ...input,
      nowIso: '2026-07-25T10:00:00.000Z',
    });
    assert.equal(second.wasExisting, true);
    assert.equal(second.isRegression, false);
    assert.equal(second.discrepancy.occurrences, 2);
    assert.equal(second.discrepancy.id, first.discrepancy.id);
    assert.equal(store.list().length, 1);
  });

  it('detecta regresión si reaparece tras CLOSED', async () => {
    const store = createInMemoryDiscrepancyStore();
    const input = {
      employeeId: 'e1',
      weekStart: '2026-07-20',
      discrepancyCode: 'D006' as const,
      affectedFields: ['overtimeHours' as const],
      severity: 'CRITICAL' as const,
      owner: 'Architecture' as const,
    };
    const created = (await upsertObservedDiscrepancy(store, input)).discrepancy;
    const closed = transitionDiscrepancy(
      transitionDiscrepancy(
        transitionDiscrepancy(created, 'CONFIRMED'),
        'FIXED',
      ),
      'VERIFIED',
    );
    await store.upsert(transitionDiscrepancy(closed, 'CLOSED'));

    const again = await upsertObservedDiscrepancy(store, input);
    assert.equal(again.isRegression, true);
    assert.equal(again.discrepancy.status, 'INVESTIGATING');
    assert.ok(again.discrepancy.occurrences >= 2);
  });
});
