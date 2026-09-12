import type { HistoryWeekDto } from '../read-models/week-display-from-engine.ts';

export type HistoryWeekFetchResult = {
  week: HistoryWeekDto;
  workerName: string;
  filterYear: number;
  filterMonth: number;
};

export type HistoryWeekCacheSnapshot = HistoryWeekFetchResult & {
  fetchedAt: number;
  key: string;
};

export const HOME_HISTORY_WEEK_TTL_MS = 30_000;

type HistoryWeekCacheOptions = {
  fetch: (userId: string, weekStart: string) => Promise<HistoryWeekFetchResult>;
  ttlMs?: number;
  now?: () => number;
};

export function historyWeekCacheKey(userId: string, weekStart: string): string {
  return `${userId}|${weekStart.split('T')[0]}`;
}

/**
 * Caché de la tarjeta semanal suelta (mosaico Staff y modal de una persona).
 * No es fuente de verdad: el productor sigue siendo HE + snapshot de esa semana.
 */
export function createHistoryWeekCache(options: HistoryWeekCacheOptions) {
  const ttlMs = options.ttlMs ?? HOME_HISTORY_WEEK_TTL_MS;
  const now = options.now ?? Date.now;

  const cache = new Map<string, HistoryWeekCacheSnapshot>();
  const inFlight = new Map<string, Promise<HistoryWeekCacheSnapshot>>();
  let generation = 0;
  const listeners = new Set<(snapshot: HistoryWeekCacheSnapshot) => void>();

  function emit(snapshot: HistoryWeekCacheSnapshot) {
    for (const listener of listeners) listener(snapshot);
  }

  function peek(userId: string, weekStart: string): HistoryWeekCacheSnapshot | null {
    return cache.get(historyWeekCacheKey(userId, weekStart)) ?? null;
  }

  function subscribe(listener: (snapshot: HistoryWeekCacheSnapshot) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function read(
    userId: string,
    weekStart: string,
    opts?: { force?: boolean },
  ): Promise<HistoryWeekCacheSnapshot> {
    const key = historyWeekCacheKey(userId, weekStart);
    const force = opts?.force === true;
    const pendingExisting = inFlight.get(key);
    if (pendingExisting) {
      return pendingExisting;
    }
    const t = now();
    const hit = cache.get(key);
    if (!force && hit && t - hit.fetchedAt < ttlMs) {
      return hit;
    }

    const myGeneration = ++generation;
    const pending = (async (): Promise<HistoryWeekCacheSnapshot> => {
      try {
        const data = await options.fetch(userId, weekStart);
        const snapshot: HistoryWeekCacheSnapshot = {
          ...data,
          fetchedAt: now(),
          key,
        };
        if (myGeneration !== generation) {
          return cache.get(key) ?? snapshot;
        }
        cache.set(key, snapshot);
        emit(snapshot);
        return snapshot;
      } catch (error) {
        const kept = cache.get(key);
        if (kept) return kept;
        throw error;
      }
    })();

    inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  }

  function invalidate() {
    cache.clear();
    inFlight.clear();
    generation += 1;
  }

  function reset() {
    invalidate();
    listeners.clear();
  }

  return { peek, read, subscribe, invalidate, reset };
}

export type HistoryWeekCache = ReturnType<typeof createHistoryWeekCache>;
