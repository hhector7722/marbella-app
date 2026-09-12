import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHomeTreasuryCache, type HomeTreasuryFetchResult } from './home-treasury-cache.ts';

function result(balance: number): HomeTreasuryFetchResult {
    return {
        actualBalance: balance,
        boxes: [
            {
                id: 'op',
                name: 'Caja inicial',
                type: 'operational',
                current_balance: balance,
            },
        ],
    };
}

describe('createHomeTreasuryCache', () => {
    it('reutiliza el snapshot dentro del TTL y no vuelve a pedir', async () => {
        let calls = 0;
        const now = 1_000;
        const cache = createHomeTreasuryCache({
            fetch: async () => {
                calls += 1;
                return result(12.5);
            },
            ttlMs: 30_000,
            now: () => now,
        });

        const first = await cache.read();
        const second = await cache.read();

        assert.equal(calls, 1);
        assert.equal(first.actualBalance, 12.5);
        assert.equal(second.actualBalance, 12.5);
        assert.equal(cache.peek()?.actualBalance, 12.5);
    });

    it('vuelve a pedir cuando el TTL caduca o se fuerza', async () => {
        let calls = 0;
        let now = 1_000;
        const cache = createHomeTreasuryCache({
            fetch: async () => {
                calls += 1;
                return result(calls);
            },
            ttlMs: 30_000,
            now: () => now,
        });

        await cache.read();
        now = 31_000;
        const stale = await cache.read();
        const forced = await cache.read({ force: true });

        assert.equal(calls, 3);
        assert.equal(stale.actualBalance, 2);
        assert.equal(forced.actualBalance, 3);
    });

    it('una sola petición en vuelo para lecturas concurrentes', async () => {
        let calls = 0;
        let release: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const cache = createHomeTreasuryCache({
            fetch: async () => {
                calls += 1;
                await gate;
                return result(7);
            },
            ttlMs: 30_000,
            now: () => 1,
        });

        const a = cache.read();
        const b = cache.read();
        release?.();
        const [one, two] = await Promise.all([a, b]);

        assert.equal(calls, 1);
        assert.equal(one.actualBalance, 7);
        assert.equal(two.actualBalance, 7);
    });

    it('si falla la red conserva el último snapshot bueno', async () => {
        let calls = 0;
        const cache = createHomeTreasuryCache({
            fetch: async () => {
                calls += 1;
                if (calls === 1) return result(40);
                throw new Error('red');
            },
            ttlMs: 1,
            now: () => calls * 10,
        });

        await cache.read();
        const kept = await cache.read({ force: true });

        assert.equal(calls, 2);
        assert.equal(kept.actualBalance, 40);
    });

    it('notifica a los suscriptores solo tras un snapshot nuevo', async () => {
        const seen: number[] = [];
        let calls = 0;
        const cache = createHomeTreasuryCache({
            fetch: async () => {
                calls += 1;
                return result(calls * 10);
            },
            ttlMs: 30_000,
            now: () => 1,
        });
        cache.subscribe((snapshot) => {
            seen.push(snapshot.actualBalance);
        });

        await cache.read();
        await cache.read();
        await cache.read({ force: true });

        assert.deepEqual(seen, [10, 20]);
    });
});
