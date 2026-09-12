'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOvertimeData } from '@/app/actions/overtime';
import type { WeeklyStats } from '@/lib/hours-engine/overtime-weeks-ssot';
import { createOvertimeWeeksCache } from '@/lib/overtime/home-overtime-cache';

const overtimeWeeksCache = createOvertimeWeeksCache({
  fetch: async (startDate, endDate) => {
    const result = await getOvertimeData(startDate, endDate);
    return { weeksResult: result?.weeksResult ?? [] };
  },
});

export function invalidateHomeOvertimeCache(): void {
  overtimeWeeksCache.invalidate();
}

function seedWeeks(startDate: string, endDate: string): {
  weeks: WeeklyStats[];
  loading: boolean;
} {
  const cached = overtimeWeeksCache.peek(startDate, endDate);
  if (cached) return { weeks: cached.weeks, loading: false };
  return { weeks: [], loading: true };
}

/**
 * Listado de extras de un mes en las homes Admin/Master y en la columna Ext.
 * Reutiliza el snapshot en memoria; el spinner solo aparece si aún no hay dato.
 */
export function useOvertimeWeeks(
  startDate: string,
  endDate: string,
  options?: { enabled?: boolean; refreshKey?: number },
): {
  weeks: WeeklyStats[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const enabled = options?.enabled !== false;
  const refreshKey = options?.refreshKey ?? 0;
  const prevRefreshKey = useRef(refreshKey);

  const [weeks, setWeeks] = useState<WeeklyStats[]>(() =>
    enabled ? seedWeeks(startDate, endDate).weeks : [],
  );
  const [loading, setLoading] = useState(() =>
    enabled ? seedWeeks(startDate, endDate).loading : false,
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;
    overtimeWeeksCache.invalidate();
    try {
      const snapshot = await overtimeWeeksCache.read(startDate, endDate, { force: true });
      setWeeks(snapshot.weeks);
      setLoading(false);
    } catch (err) {
      console.error(err);
      if (!overtimeWeeksCache.peek(startDate, endDate)) setLoading(false);
    }
  }, [enabled, startDate, endDate]);

  useEffect(() => {
    if (!enabled) {
      setWeeks([]);
      setLoading(false);
      return;
    }

    const unsubscribe = overtimeWeeksCache.subscribe((snapshot) => {
      const current = overtimeWeeksCache.peek(startDate, endDate);
      if (!current || snapshot.key !== current.key) return;
      setWeeks(snapshot.weeks);
      setLoading(false);
    });

    const cached = overtimeWeeksCache.peek(startDate, endDate);
    if (cached) {
      setWeeks(cached.weeks);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const shouldForce = refreshKey !== prevRefreshKey.current;
    prevRefreshKey.current = refreshKey;

    void overtimeWeeksCache.read(startDate, endDate, { force: shouldForce }).then(
      (snapshot) => {
        setWeeks(snapshot.weeks);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        if (!overtimeWeeksCache.peek(startDate, endDate)) setLoading(false);
      },
    );

    return unsubscribe;
  }, [enabled, startDate, endDate, refreshKey]);

  return { weeks, loading, refresh };
}
