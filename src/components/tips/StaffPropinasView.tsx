'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import {
  formatLocalIsoDateLabel,
  formatTipMoney,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';
import { StaffTipRepartoPanel } from '@/components/tips/StaffTipRepartoPanel';
import { StaffTipDistributionDetailModal } from '@/components/tips/StaffTipDistributionDetailModal';

export type { StaffTipHistoryEntry };

export default function StaffPropinasView({
  initialHistory,
}: {
  initialHistory: StaffTipHistoryEntry[];
}) {
  const [selectedEntry, setSelectedEntry] = useState<StaffTipHistoryEntry | null>(null);

  const lastEntry = useMemo(() => initialHistory[0] ?? null, [initialHistory]);

  return (
    <div className="min-h-screen bg-[#5B8FB9] pb-24">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#5B8FB9]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <Link
            href="/staff/dashboard"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white active:scale-95"
            aria-label="Volver al inicio"
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black uppercase tracking-wide text-white">
              Propinas
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-[#36606F] px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              Último reparto
            </h2>
          </div>

          <div className="p-4">
            {!lastEntry ? (
              <p className="text-sm font-medium text-zinc-500">
                Aún no tienes repartos confirmados.
              </p>
            ) : (
              <StaffTipRepartoPanel entry={lastEntry} />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-[#36606F] px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">Historial</h2>
          </div>

          <div className="p-4">
            {initialHistory.length === 0 ? (
              <p className="text-sm font-medium text-zinc-500">Sin repartos anteriores.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {initialHistory.map((entry) => (
                  <li key={entry.lineId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 py-4 text-left transition-colors hover:bg-zinc-50/80 active:scale-[0.99] first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900">
                          {formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} –{' '}
                          {formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-base font-black tabular-nums text-emerald-600">
                          {formatTipMoney(entry.totalAmount)}
                        </span>
                        <ChevronRight size={18} className="text-zinc-300" strokeWidth={2.5} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <StaffTipDistributionDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
