'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { WebAnalyticsDashboardFilters } from '@/lib/web-analytics/types';

type WebAnalyticsFiltersProps = {
  filters: WebAnalyticsDashboardFilters;
};

export function WebAnalyticsFilters({ filters }: WebAnalyticsFiltersProps) {
  const router = useRouter();
  const [day, setDay] = useState(filters.day ?? '');

  useEffect(() => {
    setDay(filters.day ?? '');
  }, [filters.day]);

  function applyFilters(nextDay: string) {
    const params = new URLSearchParams();
    if (nextDay) params.set('dia', nextDay);
    const query = params.toString();
    router.push(query ? `/dashboard/web?${query}` : '/dashboard/web');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(day);
  }

  return (
    <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2">
      <input
        id="web-analytics-day"
        name="dia"
        type="date"
        aria-label="Día"
        value={day}
        onChange={(event) => setDay(event.target.value)}
        className={cn(
          'box-border h-12 w-[7rem] max-w-[7rem] shrink-0 rounded-xl border border-zinc-200 bg-white px-2 text-xs text-zinc-800 outline-none',
          'focus:border-[var(--color-envolvente)] focus:ring-1 focus:ring-[var(--color-envolvente)]/30'
        )}
      />
      <Button type="submit" variant="primary" instance="web-analytics-filters-ok">
        OK
      </Button>
      <button
        type="button"
        onClick={() => {
          setDay('');
          router.push('/dashboard/web');
        }}
        className={cn(
          'inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 px-3 text-xs text-zinc-500',
          'hover:border-[var(--color-envolvente)]/40 hover:text-[var(--color-envolvente)]'
        )}
      >
        ×
      </button>
    </form>
  );
}
