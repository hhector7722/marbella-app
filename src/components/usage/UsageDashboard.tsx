import Link from 'next/link';
import { Suspense } from 'react';
import { UsageFilters } from '@/components/usage/UsageFilters';
import type { UsageDashboardData } from '@/lib/usage/queries';

function formatDateTimeMadrid(iso: string | null): string {
  if (!iso) return ' ';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function UsageDashboard({ data }: { data: UsageDashboardData }) {
  const userFiltered = Boolean(data.filters.profileId);

  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="h-12 rounded-xl border border-zinc-100 bg-white" aria-hidden />
        }
      >
        <UsageFilters filters={data.filters} users={data.filterUsers} />
      </Suspense>

      <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
          Resumen por usuario
        </h2>
        {data.summaries.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin datos todavía.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {data.summaries.map((user) => (
              <div
                key={user.profileId}
                className="flex min-h-12 items-center gap-2 py-2 text-xs"
              >
                <p className="min-w-0 flex-1 truncate font-semibold text-zinc-800">
                  {user.displayName}
                </p>
                <p className="shrink-0 text-zinc-500">{user.pageViewCount} pag</p>
                <p className="shrink-0 text-zinc-500">{user.actionCount} acc</p>
                <p className="shrink-0 tabular-nums text-zinc-500">
                  {formatDateTimeMadrid(user.lastSeenAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
          Actividad reciente
        </h2>
        {data.recentEvents.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin eventos recientes.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {data.recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex min-h-10 items-center gap-2 py-1.5 text-xs"
              >
                {!userFiltered ? (
                  <p className="w-24 shrink-0 truncate text-zinc-500">{event.displayName}</p>
                ) : null}
                <p className="min-w-0 flex-1 truncate font-medium text-zinc-800">{event.title}</p>
                <p className="w-28 shrink-0 text-right tabular-nums text-zinc-500">
                  {event.timeLabel}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Link href="/master/dashboard" className="inline-block text-xs font-medium text-[#36606F]">
        Volver al hub master
      </Link>
    </div>
  );
}
