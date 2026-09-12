import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHistoryWeekCache, type HistoryWeekFetchResult } from './history-week-cache.ts';
import type { HistoryWeekDto } from '../read-models/week-display-from-engine.ts';

function weekDto(hours: number): HistoryWeekDto {
  return {
    weekNumber: 37,
    startDate: '2026-09-07',
    days: [],
    summary: {
      displayHours: hours,
      displayPendingBalance: 0,
      displayExtras: 0,
      displayEstimatedValue: 0,
      displayPreferStock: false,
      displayOrdinaryHours: hours,
      displayCarryOut: 0,
      displayFinalBalance: 0,
      displayIsPaid: false,
      displayLimitHours: 28,
      displayHourlyRate: 10,
      totalHours: hours,
      startBalance: 0,
      weeklyBalance: 0,
      finalBalance: 0,
      estimatedValue: 0,
      preferStock: false,
      isPaid: false,
      limitHours: 28,
      hourlyRate: 10,
    },
  };
}

function result(hours: number): HistoryWeekFetchResult {
  return {
    week: weekDto(hours),
    workerName: 'Ana',
    filterYear: 2026,
    filterMonth: 8,
  };
}

describe('createHistoryWeekCache', () => {
  it('reutiliza el snapshot dentro del TTL y no vuelve a pedir', async () => {
    let calls = 0;
    const cache = createHistoryWeekCache({
      fetch: async () => {
        calls += 1;
        return result(12);
      },
      ttlMs: 30_000,
      now: () => 1_000,
    });

    const first = await cache.read('u1', '2026-09-07');
    const second = await cache.read('u1', '2026-09-07T00:00:00');

    assert.equal(calls, 1);
    assert.equal(first.week.summary.totalHours, 12);
    assert.equal(second.week.summary.totalHours, 12);
  });

  it('una sola petición en vuelo para lecturas concurrentes', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cache = createHistoryWeekCache({
      fetch: async () => {
        calls += 1;
        await gate;
        return result(7);
      },
      ttlMs: 30_000,
      now: () => 1,
    });

    const a = cache.read('u1', '2026-09-07');
    const b = cache.read('u1', '2026-09-07');
    release?.();
    const [one, two] = await Promise.all([a, b]);

    assert.equal(calls, 1);
    assert.equal(one.week.summary.totalHours, 7);
    assert.equal(two.week.summary.totalHours, 7);
  });

  it('invalidate obliga a volver a pedir', async () => {
    let calls = 0;
    const cache = createHistoryWeekCache({
      fetch: async () => {
        calls += 1;
        return result(calls);
      },
      ttlMs: 30_000,
      now: () => 1,
    });

    await cache.read('u1', '2026-09-07');
    cache.invalidate();
    const next = await cache.read('u1', '2026-09-07');

    assert.equal(calls, 2);
    assert.equal(next.week.summary.totalHours, 2);
  });

  it('si falla la red conserva el último snapshot bueno', async () => {
    let calls = 0;
    const cache = createHistoryWeekCache({
      fetch: async () => {
        calls += 1;
        if (calls === 1) return result(40);
        throw new Error('red');
      },
      ttlMs: 1,
      now: () => calls * 10,
    });

    await cache.read('u1', '2026-09-07');
    const kept = await cache.read('u1', '2026-09-07', { force: true });

    assert.equal(calls, 2);
    assert.equal(kept.week.summary.totalHours, 40);
  });
});
