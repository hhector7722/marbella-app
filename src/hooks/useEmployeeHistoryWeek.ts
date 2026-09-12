'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEmployeeHistoryWeek, type HistoryWeekDto } from '@/app/actions/history-read';
import { createHistoryWeekCache } from '@/lib/staff/history-week-cache';

const historyWeekCache = createHistoryWeekCache({
  fetch: async (userId, weekStart) => {
    const result = await getEmployeeHistoryWeek({ userId, weekStart });
    if (!result.success) {
      throw new Error(result.error || 'No se pudo cargar el resumen semanal');
    }
    return {
      week: result.week,
      workerName: result.workerName,
      filterYear: result.filterYear,
      filterMonth: result.filterMonth,
    };
  },
});

export function invalidateHomeHistoryWeekCache(): void {
  historyWeekCache.invalidate();
}

function seedWeek(userId: string, weekStart: string): {
  week: HistoryWeekDto | null;
  workerName: string;
  filterYear: number;
  filterMonth: number;
  loading: boolean;
} {
  const cached = historyWeekCache.peek(userId, weekStart);
  if (cached) {
    return {
      week: cached.week,
      workerName: cached.workerName,
      filterYear: cached.filterYear,
      filterMonth: cached.filterMonth,
      loading: false,
    };
  }
  return {
    week: null,
    workerName: '',
    filterYear: 0,
    filterMonth: 0,
    loading: true,
  };
}

/**
 * Tarjeta semanal de una persona. Reutiliza el snapshot en memoria;
 * el spinner solo aparece si aún no hay dato.
 */
export function useEmployeeHistoryWeek(
  userId: string | null,
  weekStart: string,
  options?: { enabled?: boolean; refreshKey?: number },
): {
  week: HistoryWeekDto | null;
  workerName: string;
  filterYear: number;
  filterMonth: number;
  loading: boolean;
  error: string | null;
} {
  const enabled = options?.enabled !== false && Boolean(userId) && Boolean(weekStart);
  const refreshKey = options?.refreshKey ?? 0;
  const prevRefreshKey = useRef(refreshKey);

  const [week, setWeek] = useState<HistoryWeekDto | null>(() =>
    enabled && userId ? seedWeek(userId, weekStart).week : null,
  );
  const [workerName, setWorkerName] = useState(() =>
    enabled && userId ? seedWeek(userId, weekStart).workerName : '',
  );
  const [filterYear, setFilterYear] = useState(() =>
    enabled && userId ? seedWeek(userId, weekStart).filterYear : 0,
  );
  const [filterMonth, setFilterMonth] = useState(() =>
    enabled && userId ? seedWeek(userId, weekStart).filterMonth : 0,
  );
  const [loading, setLoading] = useState(() =>
    enabled && userId ? seedWeek(userId, weekStart).loading : false,
  );
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((snapshot: {
    week: HistoryWeekDto;
    workerName: string;
    filterYear: number;
    filterMonth: number;
  }) => {
    setWeek(snapshot.week);
    setWorkerName(snapshot.workerName);
    setFilterYear(snapshot.filterYear);
    setFilterMonth(snapshot.filterMonth);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      setWeek(null);
      setWorkerName('');
      setLoading(false);
      return;
    }

    const unsubscribe = historyWeekCache.subscribe((snapshot) => {
      const current = historyWeekCache.peek(userId, weekStart);
      if (!current || snapshot.key !== current.key) return;
      apply(snapshot);
    });

    const cached = historyWeekCache.peek(userId, weekStart);
    if (cached) {
      apply(cached);
    } else {
      setLoading(true);
    }

    const shouldForce = refreshKey !== prevRefreshKey.current;
    prevRefreshKey.current = refreshKey;

    void historyWeekCache.read(userId, weekStart, { force: shouldForce }).then(
      apply,
      (err: unknown) => {
        console.error(err);
        setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen semanal');
        if (!historyWeekCache.peek(userId, weekStart)) setLoading(false);
      },
    );

    return unsubscribe;
  }, [apply, enabled, refreshKey, userId, weekStart]);

  return { week, workerName, filterYear, filterMonth, loading, error };
}
