'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  formatLocalIsoDateLabel,
  formatPenalizacionPct,
  formatTipInt,
  formatTipMoney,
  formatTipPct,
  tjiColorClass,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';
import { StaffTipDistributionDetailModal } from '@/components/tips/StaffTipDistributionDetailModal';

export type { StaffTipHistoryEntry };

type TjiPreviewRow = {
  id: string;
  jornadasTotales?: number;
  jornadasConOlvido?: number;
  tjiPct?: number;
  penalizacionPct?: number;
  isSanctioned?: boolean;
};

type TjiPreview = {
  staff: TjiPreviewRow[];
};

function TjiThresholdBar({ tjiPct }: { tjiPct: number }) {
  const clamped = Math.min(100, Math.max(0, tjiPct));
  const markerLeft = `${clamped}%`;

  return (
    <div className="space-y-2">
      <div className="relative h-4 w-full overflow-hidden rounded-full border border-zinc-100 bg-zinc-50">
        <div className="absolute inset-0 flex">
          <div className="h-full w-[5%] bg-emerald-300/80" title="0–5%" />
          <div className="h-full w-[10%] bg-amber-300/80" title="5–15%" />
          <div className="h-full w-[10%] bg-orange-300/80" title="15–25%" />
          <div className="h-full flex-1 bg-rose-300/80" title=">25%" />
        </div>
        <div
          className="absolute top-0 bottom-0 w-1 -translate-x-1/2 rounded-full bg-zinc-900 shadow-sm"
          style={{ left: markerLeft }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-zinc-400">
        <span>0%</span>
        <span className="text-emerald-600">5%</span>
        <span className="text-amber-600">15%</span>
        <span className="text-orange-600">25%</span>
        <span className="text-rose-600">+</span>
      </div>
    </div>
  );
}

export default function StaffPropinasView({
  userId,
  periodStart,
  periodEnd,
  hasConfirmedDistribution,
  initialHistory,
}: {
  userId: string;
  periodStart: string;
  periodEnd: string;
  hasConfirmedDistribution: boolean;
  initialHistory: StaffTipHistoryEntry[];
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [tjiPreview, setTjiPreview] = useState<TjiPreview | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<StaffTipHistoryEntry | null>(null);

  const periodLabel = useMemo(() => {
    const start = formatLocalIsoDateLabel(periodStart, 'd MMM');
    const end = formatLocalIsoDateLabel(periodEnd, 'd MMM yyyy');
    return `${start} – ${end}`;
  }, [periodStart, periodEnd]);

  const fetchTjiPreview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_tip_pool_preview', {
        p_start_date: periodStart,
        p_end_date: periodEnd,
      });
      if (error) throw error;
      setTjiPreview((data as unknown) as TjiPreview);
    } catch (e: unknown) {
      console.error(e);
      toast.error('Error crítico de base de datos al cargar el desglose TJI.');
      setTjiPreview(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, periodStart, periodEnd]);

  useEffect(() => {
    void fetchTjiPreview();
  }, [fetchTjiPreview]);

  const myTji = useMemo(() => {
    if (!tjiPreview?.staff?.length) return null;
    return tjiPreview.staff.find((s) => s.id === userId) ?? null;
  }, [tjiPreview, userId]);

  const tjiPct = myTji?.tjiPct ?? 0;
  const jornadasTotales = myTji?.jornadasTotales ?? 0;
  const jornadasConOlvido = myTji?.jornadasConOlvido ?? 0;
  const penalizacionPct = myTji?.penalizacionPct ?? 0;

  const tjiPeriodHint = hasConfirmedDistribution
    ? `Contador a cero desde el último reparto confirmado (${periodLabel})`
    : `Sin reparto previo: contador desde inicio de mes (${periodLabel})`;

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
              Mis propinas
            </h1>
            <p className="truncate text-xs font-medium text-white/70">Historial y fichaje</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchTjiPreview()}
            disabled={loading}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white active:scale-95 disabled:opacity-50"
            aria-label="Actualizar"
          >
            <RefreshCw size={20} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {loading && !tjiPreview ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner className="text-white" />
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-[#36606F] px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              Olvidos de fichaje (TJI)
            </h2>
            <p className="mt-1 text-[10px] font-medium leading-snug text-white/75">
              {tjiPeriodHint}
            </p>
          </div>

          <div className="p-4">
            {!loading && !myTji ? (
              <p className="text-sm font-medium text-zinc-500">
                No hay datos de fichaje para este período.
              </p>
            ) : null}

            {myTji?.isSanctioned ? (
              <div
                className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
                role="alert"
              >
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>Estás marcado como sin propina en el próximo reparto</span>
              </div>
            ) : null}

            {myTji ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Jornadas</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-zinc-800">
                      {formatTipInt(jornadasTotales)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Olvidos</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-zinc-800">
                      {formatTipInt(jornadasConOlvido)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">TJI</p>
                    <p
                      className={cn(
                        'mt-1 text-xl font-black tabular-nums',
                        tjiColorClass(tjiPct)
                      )}
                    >
                      {formatTipPct(tjiPct)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <TjiThresholdBar tjiPct={tjiPct} />
                </div>

                <p className="mt-4 text-sm leading-relaxed text-zinc-600">
                  Has olvidado fichar en{' '}
                  <span className="font-bold text-zinc-900">
                    {jornadasConOlvido > 0 ? jornadasConOlvido : ' '}
                  </span>{' '}
                  de tus{' '}
                  <span className="font-bold text-zinc-900">
                    {jornadasTotales > 0 ? jornadasTotales : ' '}
                  </span>{' '}
                  jornadas (
                  <span className={cn('font-bold', tjiColorClass(tjiPct))}>
                    {formatTipPct(tjiPct)}
                  </span>
                  ). Penalización en horas efectivas:{' '}
                  <span className="font-bold text-zinc-900">
                    {formatPenalizacionPct(penalizacionPct)}
                  </span>
                  .
                </p>
              </>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">
              Repartos confirmados
            </h2>
          </div>

          <div className="p-4">
            {initialHistory.length === 0 ? (
              <p className="text-sm text-zinc-500">Aún no tienes repartos confirmados.</p>
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
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Confirmado{' '}
                          {formatLocalIsoDateLabel(
                            entry.confirmedAt.slice(0, 10),
                            'd MMM yyyy'
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-base font-black tabular-nums text-[#36606F]">
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
