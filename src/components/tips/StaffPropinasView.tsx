'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Coins, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  estimateTjiPenaltyCostEur,
  formatLocalIsoDateLabel,
  formatPenalizacionPct,
  formatTipInt,
  formatTipMoney,
  formatTipPct,
  tjiColorClass,
  type TipDistributionHistoryRow,
} from '@/lib/tip-distribution-display';

type TipPreviewStaffRow = {
  id: string;
  name: string;
  weekdayAmount: number;
  weekendAmount: number;
  totalAmount: number;
  weekdayHoursRaw: number;
  weekendHoursRaw: number;
  weekdayHoursEffective?: number;
  weekendHoursEffective?: number;
  jornadasTotales?: number;
  jornadasConOlvido?: number;
  tjiPct?: number;
  penalizacionPct?: number;
  isSanctioned?: boolean;
};

type TipPreview = {
  range: { startDate: string; endDate: string };
  staff: TipPreviewStaffRow[];
};

export type StaffTipHistoryEntry = {
  lineId: string;
  totalAmount: number;
  weekdayAmount: number;
  weekendAmount: number;
  tjiPct: number;
  penalizacionPct: number;
  periodStart: string;
  periodEnd: string;
  confirmedAt: string;
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
  initialStartDate,
  initialEndDate,
  initialHistory,
}: {
  userId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialHistory: StaffTipHistoryEntry[];
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TipPreview | null>(null);

  const rangeLabel = useMemo(() => {
    const start = formatLocalIsoDateLabel(initialStartDate, 'd MMM');
    const end = formatLocalIsoDateLabel(initialEndDate, 'd MMM yyyy');
    return `${start} – ${end}`;
  }, [initialStartDate, initialEndDate]);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_tip_pool_preview', {
        p_start_date: initialStartDate,
        p_end_date: initialEndDate,
      });
      if (error) throw error;
      setPreview((data as unknown) as TipPreview);
    } catch (e: unknown) {
      console.error(e);
      toast.error('Error crítico de base de datos al calcular propinas.');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, initialStartDate, initialEndDate]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  const myRow = useMemo(() => {
    if (!preview?.staff?.length) return null;
    return preview.staff.find((s) => s.id === userId) ?? null;
  }, [preview, userId]);

  const penaltyCostEur = useMemo(() => {
    if (!myRow) return 0;
    const weekdayEff =
      myRow.weekdayHoursEffective ?? myRow.weekdayHoursRaw ?? 0;
    const weekendEff =
      myRow.weekendHoursEffective ?? myRow.weekendHoursRaw ?? 0;
    return estimateTjiPenaltyCostEur({
      totalAmount: myRow.totalAmount,
      weekdayHoursRaw: myRow.weekdayHoursRaw,
      weekendHoursRaw: myRow.weekendHoursRaw,
      weekdayHoursEffective: weekdayEff,
      weekendHoursEffective: weekendEff,
      penalizacionPct: myRow.penalizacionPct ?? 0,
    });
  }, [myRow]);

  const tjiPct = myRow?.tjiPct ?? 0;
  const jornadasTotales = myRow?.jornadasTotales ?? 0;
  const jornadasConOlvido = myRow?.jornadasConOlvido ?? 0;
  const penalizacionPct = myRow?.penalizacionPct ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <Link
            href="/staff/dashboard"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50 text-[#36606F] active:scale-95"
            aria-label="Volver al inicio"
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black uppercase tracking-wide text-[#36606F]">
              Mis propinas
            </h1>
            <p className="truncate text-xs font-medium text-zinc-500">{rangeLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchPreview()}
            disabled={loading}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50 text-[#36606F] active:scale-95 disabled:opacity-50"
            aria-label="Actualizar"
          >
            <RefreshCw size={20} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {loading && !preview ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : null}

        {!loading && !myRow ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
            No apareces en el reparto de este período (sin horas registradas o perfil
            fuera del cálculo).
          </div>
        ) : null}

        {myRow ? (
          <>
            {/* SECCIÓN 1 — REPARTO ACTUAL */}
            <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start gap-2">
                <Coins className="mt-0.5 h-5 w-5 shrink-0 text-[#36606F]" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">
                    Tu propina estimada
                  </h2>
                  <p className="text-xs text-zinc-500">{rangeLabel}</p>
                </div>
              </div>

              {myRow.isSanctioned ? (
                <div
                  className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
                  role="alert"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <span>Estás marcado como sin propina en este período</span>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Lun–Vie
                  </p>
                  <p className="mt-1 text-lg font-black text-zinc-800 tabular-nums">
                    {formatTipMoney(myRow.weekdayAmount)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Fin de semana
                  </p>
                  <p className="mt-1 text-lg font-black text-zinc-800 tabular-nums">
                    {formatTipMoney(myRow.weekendAmount)}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-[#36606F] px-4 py-5 text-center text-white">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Total estimado
                </p>
                <p className="mt-1 text-4xl font-black tabular-nums tracking-tight">
                  {formatTipMoney(myRow.totalAmount)}
                </p>
              </div>
            </section>

            {/* SECCIÓN 2 — FICHAJE TJI */}
            <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-800">
                Tu fichaje (desglose TJI)
              </h2>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Jornadas</p>
                  <p className="mt-1 text-xl font-black text-zinc-800 tabular-nums">
                    {formatTipInt(jornadasTotales)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Olvidos</p>
                  <p className="mt-1 text-xl font-black text-zinc-800 tabular-nums">
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
                ). Esto reduce tus horas efectivas un{' '}
                <span className="font-bold text-zinc-900">
                  {penalizacionPct > 0 ? `${penalizacionPct}%` : ' '}
                </span>
                .
              </p>

              {penaltyCostEur > 0.005 ? (
                <p className="mt-3 rounded-xl border border-orange-100 bg-orange-50/80 p-3 text-sm font-semibold text-orange-900">
                  Esta penalización te ha costado aproximadamente{' '}
                  <span className="tabular-nums">{formatTipMoney(penaltyCostEur)}</span> en
                  este período
                </p>
              ) : null}
            </section>
          </>
        ) : null}

        {/* SECCIÓN 3 — HISTORIAL */}
        <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-800">
            Historial de repartos
          </h2>

          {initialHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">Aún no tienes repartos confirmados.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {initialHistory.map((entry) => (
                <li key={entry.lineId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900">
                        {formatLocalIsoDateLabel(
                          entry.confirmedAt.slice(0, 10),
                          'd MMM yyyy'
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} –{' '}
                        {formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-black tabular-nums text-[#36606F]">
                      {formatTipMoney(entry.totalAmount)}
                    </p>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-600">
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-400">TJI</dt>
                      <dd className={cn('font-semibold tabular-nums', tjiColorClass(entry.tjiPct))}>
                        {formatTipPct(entry.tjiPct)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-400">Penalización</dt>
                      <dd className="font-semibold tabular-nums text-zinc-800">
                        {formatPenalizacionPct(entry.penalizacionPct)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-400">Lun–Vie</dt>
                      <dd className="font-semibold tabular-nums text-zinc-800">
                        {formatTipMoney(entry.weekdayAmount)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-400">Fin de semana</dt>
                      <dd className="font-semibold tabular-nums text-zinc-800">
                        {formatTipMoney(entry.weekendAmount)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
