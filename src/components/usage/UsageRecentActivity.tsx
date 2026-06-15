'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { firstNameOnly } from '@/lib/usage/display-name';
import { serializeProfileIdsForUrl, USAGE_RECENT_PAGE_SIZE } from '@/lib/usage/filters';
import type { UsageDashboardFilters, UsageRecentEvent } from '@/lib/usage/queries';

type UsageRecentActivityProps = {
  initialEvents: UsageRecentEvent[];
  initialHasMore: boolean;
  filters: UsageDashboardFilters;
};

function buildRecentQuery(filters: UsageDashboardFilters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.day) params.set('dia', filters.day);
  const usuarios = serializeProfileIdsForUrl(filters.profileIds);
  if (usuarios !== null) params.set('usuarios', usuarios);
  params.set('offset', String(offset));
  params.set('limit', String(USAGE_RECENT_PAGE_SIZE));
  return params.toString();
}

export function UsageRecentActivity({
  initialEvents,
  initialHasMore,
  filters,
}: UsageRecentActivityProps) {
  const [events, setEvents] = useState(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const query = buildRecentQuery(filters, events.length);
      const response = await fetch(`/api/usage/recent?${query}`);
      if (!response.ok) throw new Error('No se pudo cargar más actividad');
      const data = (await response.json()) as {
        events: UsageRecentEvent[];
        hasMore: boolean;
      };
      setEvents((prev) => [...prev, ...data.events]);
      setHasMore(data.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
        Actividad reciente
      </h2>

      {events.length === 0 ? (
        <p className="text-xs text-zinc-500">Sin eventos recientes.</p>
      ) : (
        <div>
          {events.map((event, index) => {
            const prev = index > 0 ? events[index - 1] : null;
            const showUserHeader = !prev || prev.profileId !== event.profileId;

            return (
              <div key={event.id}>
                {showUserHeader ? (
                  <div
                    className={cn(
                      'flex min-h-10 items-center border-b border-zinc-100 bg-zinc-50/80 px-2',
                      index > 0 && 'mt-1 border-t'
                    )}
                  >
                    <p className="truncate text-xs font-bold uppercase tracking-wide text-[#36606F]">
                      {firstNameOnly(event.displayName)}
                    </p>
                  </div>
                ) : null}
                <div className="flex min-h-10 items-center gap-2 border-b border-zinc-50 py-1.5 pl-3 pr-1 text-xs">
                  <p className="min-w-0 flex-1 truncate font-medium text-zinc-800">{event.title}</p>
                  <p className="w-28 shrink-0 text-right tabular-nums text-zinc-500">
                    {event.timeLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className={cn(
            'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-semibold text-[#36606F]',
            'hover:border-[#36606F]/40 hover:bg-zinc-50 disabled:opacity-60'
          )}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando…
            </>
          ) : (
            'Ver más'
          )}
        </button>
      ) : null}
    </section>
  );
}
