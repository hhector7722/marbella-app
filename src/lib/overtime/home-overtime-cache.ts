import type { WeeklyStats } from '../hours-engine/overtime-weeks-ssot.ts';
import { overtimeWeeksCacheKey, todayMadridYmd } from '../hours-engine/overtime-weeks-ssot.ts';

export type OvertimeWeeksFetchResult = {
  weeksResult: WeeklyStats[];
};

export type OvertimeWeeksSnapshot = {
  weeks: WeeklyStats[];
  fetchedAt: number;
  key: string;
};

export const HOME_OVERTIME_TTL_MS = 30_000;

type OvertimeWeeksCacheOptions = {
  fetch: (startDate: string, endDate: string) => Promise<OvertimeWeeksFetchResult>;
  ttlMs?: number;
  now?: () => number;
  todayYmd?: () => string;
};

/**
 * Caché de listados de extras en las homes.
 * Clave = semanas cerradas (la rejilla del horario y el mes civil coinciden).
 * No es fuente de verdad: el productor sigue siendo weekly_snapshots vía getOvertimeData.
 */
export function createOvertimeWeeksCache(options: OvertimeWeeksCacheOptions) {
  const ttlMs = options.ttlMs ?? HOME_OVERTIME_TTL_MS;
  const now = options.now ?? Date.now;
  const todayYmd = options.todayYmd ?? todayMadridYmd;

  const cache = new Map<string, OvertimeWeeksSnapshot>();
  const inFlight = new Map<string, Promise<OvertimeWeeksSnapshot>>();
  let generation = 0;
  const listeners = new Set<(snapshot: OvertimeWeeksSnapshot) => void>();

  function keyFor(startDate: string, endDate: string): string {
    return overtimeWeeksCacheKey(startDate, endDate, todayYmd());
  }

  function emit(snapshot: OvertimeWeeksSnapshot) {
    for (const listener of listeners) listener(snapshot);
  }

  function peek(startDate: string, endDate: string): OvertimeWeeksSnapshot | null {
    return cache.get(keyFor(startDate, endDate)) ?? null;
  }

  function subscribe(listener: (snapshot: OvertimeWeeksSnapshot) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function read(
    startDate: string,
    endDate: string,
    opts?: { force?: boolean },
  ): Promise<OvertimeWeeksSnapshot> {
    const key = keyFor(startDate, endDate);
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
    const pending = (async (): Promise<OvertimeWeeksSnapshot> => {
      try {
        const data = await options.fetch(startDate, endDate);
        const snapshot: OvertimeWeeksSnapshot = {
          weeks: data.weeksResult ?? [],
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

export type OvertimeWeeksCache = ReturnType<typeof createOvertimeWeeksCache>;
