'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { firstNameOnly } from '@/lib/usage/display-name';
import type { UsageUserSummary as UsageUserSummaryType } from '@/lib/usage/queries';

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

type UsageUserSummaryProps = {
  summaries: UsageUserSummaryType[];
};

export function UsageUserSummary({ summaries }: UsageUserSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded-xl border border-zinc-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
          Resumen por usuario
          {summaries.length > 0 ? (
            <span className="ml-2 font-semibold text-zinc-500">({summaries.length})</span>
          ) : null}
        </h2>
        <ChevronDown
          className={cn(
            'size-5 shrink-0 text-[#36606F] transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="border-t border-zinc-100 px-4 pb-4">
          {summaries.length === 0 ? (
            <p className="pt-3 text-xs text-zinc-500">Sin datos todavía.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {summaries.map((user) => (
                <div
                  key={user.profileId}
                  className="flex min-h-12 items-center gap-2 py-2 text-xs"
                >
                  <p className="min-w-0 flex-1 truncate font-semibold text-zinc-800">
                    {firstNameOnly(user.displayName)}
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
        </div>
      ) : null}
    </section>
  );
}
