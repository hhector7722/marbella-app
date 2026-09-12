import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOvertimeWeeksCache, type OvertimeWeeksFetchResult } from './home-overtime-cache.ts';
import type { WeeklyStats } from '../hours-engine/overtime-weeks-ssot.ts';

function week(id: string, amount: number): WeeklyStats {
  return {
    weekId: id,
    label: id,
    startDate: new Date(2026, 8, 7),
    totalAmount: amount,
    totalHours: 0,
    staff: [],
  };
}

function result(amount: number): OvertimeWeeksFetchResult {
  return { weeksResult: [week('2026-09-07', amount)] };
}

describe('createOvertimeWeeksCache', () => {
  it('reutiliza el snapshot dentro del TTL y no vuelve a pedir', async () => {
    let calls = 0;
    const cache = createOvertimeWeeksCache({
      fetch: async () => {
        calls += 1;
        return result(120);
      },
      ttlMs: 30_000,
      now: () => 1_000,
      todayYmd: () => '2026-09-12',
    });

    const first = await cache.read('2026-09-01', '2026-09-30');
    const second = await cache.read('2026-08-31', '2026-10-04');

    assert.equal(calls, 1);
    assert.equal(first.weeks[0]?.totalAmount, 120);
    assert.equal(second.weeks[0]?.totalAmount, 120);
  });

  it('una sola petición en vuelo para lecturas concurrentes del mismo mes', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cache = createOvertimeWeeksCache({
      fetch: async () => {
        calls += 1;
        await gate;
        return result(7);
      },
      ttlMs: 30_000,
      now: () => 1,
      todayYmd: () => '2026-09-12',
    });

    const a = cache.read('2026-09-01', '2026-09-30');
    const b = cache.read('2026-08-31', '2026-10-04');
    release?.();
    const [one, two] = await Promise.all([a, b]);

    assert.equal(calls, 1);
    assert.equal(one.weeks[0]?.totalAmount, 7);
    assert.equal(two.weeks[0]?.totalAmount, 7);
  });

  it('invalidate obliga a volver a pedir', async () => {
    let calls = 0;
    const cache = createOvertimeWeeksCache({
      fetch: async () => {
        calls += 1;
        return result(calls);
      },
      ttlMs: 30_000,
      now: () => 1,
      todayYmd: () => '2026-09-12',
    });

    await cache.read('2026-09-01', '2026-09-30');
    cache.invalidate();
    const next = await cache.read('2026-09-01', '2026-09-30');

    assert.equal(calls, 2);
    assert.equal(next.weeks[0]?.totalAmount, 2);
  });

  it('si falla la red conserva el último snapshot bueno', async () => {
    let calls = 0;
    const cache = createOvertimeWeeksCache({
      fetch: async () => {
        calls += 1;
        if (calls === 1) return result(40);
        throw new Error('red');
      },
      ttlMs: 1,
      now: () => calls * 10,
      todayYmd: () => '2026-09-12',
    });

    await cache.read('2026-09-01', '2026-09-30');
    const kept = await cache.read('2026-09-01', '2026-09-30', { force: true });

    assert.equal(calls, 2);
    assert.equal(kept.weeks[0]?.totalAmount, 40);
  });
});
