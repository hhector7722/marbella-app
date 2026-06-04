'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { TipOverrideModal, type TipOverrideDraft } from '@/components/tips/TipOverrideModal';
import { TipConfirmDistributionModal } from '@/components/tips/TipConfirmDistributionModal';
import { TipDistributionHistorySection } from '@/components/tips/TipDistributionHistorySection';
import { SanctionedTipMoney } from '@/components/tips/SanctionedTipMoney';
import { FichajeNoRegistradaMark } from '@/components/tips/FichajeNoRegistradaMark';
import {
  formatLocalIsoDateLabel,
  formatSinRegCell,
  tipTheoreticalPoolAmounts,
  type TipDistributionHistoryRow,
} from '@/lib/tip-distribution-display';

type PoolType = 'weekday' | 'weekend';

type TipPreviewStaffRow = {
  id: string;
  name: string;
  role: string;
  weekdayHours: number;
  weekendHours: number;
  weekdayHoursRaw: number;
  weekendHoursRaw: number;
  weekdayHoursEffective?: number;
  weekendHoursEffective?: number;
  jornadasTotales?: number;
  jornadasConOlvido?: number;
  tjiPct?: number;
  penalizacionPct?: number;
  penaltyAmount?: number;
  weekdayAmount: number;
  weekendAmount: number;
  totalAmount: number;
  shadowAmount?: number | null;
  shadowWeekdayAmount?: number | null;
  shadowWeekendAmount?: number | null;
  isSanctioned?: boolean;
  hasOverrides: boolean;
};

type TipPreview = {
  range: { startDate: string; endDate: string };
  pools: {
    weekday: { id: string | null; cashTotal: number; cashBreakdown: Record<string, number>; notes: string | null };
    weekend: { id: string | null; cashTotal: number; cashBreakdown: Record<string, number>; notes: string | null };
  };
  totals: {
    weekdayHours: number;
    weekendHours: number;
    weekdayCash: number;
    weekendCash: number;
    grandCash: number;
  };
  staff: TipPreviewStaffRow[];
};

const fmtZeroBlank = (val: number, digits = 2) => (Math.abs(val) < 0.005 ? ' ' : val.toFixed(digits));
const fmtMoney = (val: number) => (Math.abs(val) < 0.005 ? ' ' : `${val.toFixed(2)}€`);
const fmtHours = (val: number) => (Math.abs(val) < 0.005 ? ' ' : (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)));

function breakdownToInitialCounts(b: Record<string, number> | null | undefined): Record<number, number> {
  if (!b || typeof b !== 'object') return {};
  return Object.fromEntries(
    Object.entries(b).map(([k, v]) => [Number(k), Number(v)]).filter(([k]) => !isNaN(k))
  );
}

export default function TipsDashboardView({
  canEditPools = true,
  canEditOverrides = false,
  canConfirmDistribution = false,
  initialStartDate,
  initialEndDate,
  lastDistribution = null,
}: {
  canEditPools?: boolean;
  canEditOverrides?: boolean;
  canConfirmDistribution?: boolean;
  initialStartDate: string;
  initialEndDate: string;
  lastDistribution?: TipDistributionHistoryRow | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TipPreview | null>(null);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const [cashModal, setCashModal] = useState<{ open: boolean; poolType: PoolType } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean;
    poolType: PoolType;
    staffId: string;
    staffName: string;
  } | null>(null);

  const rangeLabel = useMemo(() => {
    try {
      const s = new Date(startDate + 'T00:00:00');
      const e = new Date(endDate + 'T00:00:00');
      return `${format(s, 'd MMM', { locale: es })} - ${format(e, 'd MMM yyyy', { locale: es })}`;
    } catch {
      return `${startDate} - ${endDate}`;
    }
  }, [startDate, endDate]);

  const defaultFilterActive = useMemo(
    () => startDate === initialStartDate && endDate === initialEndDate,
    [startDate, endDate, initialStartDate, initialEndDate]
  );

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_tip_pool_preview', {
        p_start_date: startDate,
        p_end_date: endDate,
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
  }, [supabase, startDate, endDate]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    const ensurePools = async () => {
      if (!preview) return;
      const missingWeekday = !preview.pools.weekday.id;
      const missingWeekend = !preview.pools.weekend.id;
      if (!missingWeekday && !missingWeekend) return;
      try {
        if (missingWeekday) {
          await supabase.rpc('upsert_tip_pool', {
            p_pool_type: 'weekday',
            p_cash_total: preview.pools.weekday.cashTotal ?? 0,
            p_cash_breakdown: preview.pools.weekday.cashBreakdown ?? {},
            p_notes: preview.pools.weekday.notes ?? null,
          });
        }
        if (missingWeekend) {
          await supabase.rpc('upsert_tip_pool', {
            p_pool_type: 'weekend',
            p_cash_total: preview.pools.weekend.cashTotal ?? 0,
            p_cash_breakdown: preview.pools.weekend.cashBreakdown ?? {},
            p_notes: preview.pools.weekend.notes ?? null,
          });
        }
        await fetchPreview();
      } catch (e: unknown) {
        console.error(e);
      }
    };
    void ensurePools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.pools.weekday.id, preview?.pools.weekend.id]);

  const openCash = (poolType: PoolType) => {
    if (!canEditPools) {
      toast.error('Acceso denegado: no puedes editar botes de propinas.');
      return;
    }
    setCashModal({ open: true, poolType });
  };

  const handleSaveCash = async (poolType: PoolType, total: number, breakdown: Record<string, number>, notes: string) => {
    try {
      const normalizedTotal = Number.isFinite(total) ? Number(total.toFixed(2)) : 0;
      const normalizedBreakdown = breakdown ?? {};
      const normalizedNotes = (notes || '').trim() || null;

      await supabase.rpc('upsert_tip_pool', {
        p_pool_type: poolType,
        p_cash_total: normalizedTotal,
        p_cash_breakdown: normalizedBreakdown,
        p_notes: normalizedNotes,
      });

      setPreview((prev) => {
        if (!prev) return prev;
        const poolKey = poolType;
        const existingPool = prev.pools[poolKey];
        return {
          ...prev,
          pools: {
            ...prev.pools,
            [poolKey]: {
              ...existingPool,
              cashTotal: normalizedTotal,
              cashBreakdown: normalizedBreakdown,
              notes: normalizedNotes,
            },
          },
        };
      });

      toast.success('Bote guardado correctamente');
      setCashModal(null);
      await fetchPreview();
    } catch (e: unknown) {
      console.error(e);
      toast.error('Error crítico guardando propina en BD (permiso o validación).');
    }
  };

  const handleSaveOverride = async (draft: TipOverrideDraft) => {
    if (!preview || !overrideModal) return;
    const poolId =
      overrideModal.poolType === 'weekday' ? preview.pools.weekday.id : preview.pools.weekend.id;

    if (!poolId) {
      toast.error('BLOQUEO: No existe el bote en BD para este rango.');
      return;
    }

    try {
      await supabase.rpc('upsert_tip_override', {
        p_pool_id: poolId,
        p_user_id: overrideModal.staffId,
        p_override_hours: null,
        p_override_amount: null,
        p_is_sanctioned: draft.isSanctioned,
        p_notes: draft.notes || null,
      });
      toast.success('Override guardado');
      await fetchPreview();
    } catch (e: unknown) {
      console.error(e);
      toast.error('Error crítico guardando override en BD (permiso o validación).');
    }
  };

  const handleConfirmDistribution = async () => {
    setConfirming(true);
    try {
      const { error } = await supabase.rpc('confirm_tip_distribution', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_notes: null,
      });
      if (error) throw error;
      toast.success('Reparto confirmado y guardado en el historial.');
      setConfirmModalOpen(false);
      setHistoryRefreshToken((t) => t + 1);
      router.refresh();
      await fetchPreview();
    } catch (e: unknown) {
      console.error(e);
      toast.error('Error al confirmar el reparto (permiso o validación).');
    } finally {
      setConfirming(false);
    }
  };

  const weekdayPool = preview?.pools.weekday;
  const weekendPool = preview?.pools.weekend;
  const staffWithWorkedHours = useMemo(
    () =>
      (preview?.staff ?? []).filter(
        (s) => Math.abs((s.weekdayHoursRaw ?? 0) + (s.weekendHoursRaw ?? 0)) > 0.005
      ),
    [preview?.staff]
  );

  const openOverride = (poolType: PoolType, staffId: string, staffName: string) => {
    if (!canEditOverrides) {
      toast.error('Acceso denegado: no puedes editar overrides de empleados y horas.');
      return;
    }
    setOverrideModal({ open: true, poolType, staffId, staffName });
  };

  const lastDistBanner = lastDistribution ? (
    <div className="rounded-xl md:rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 md:px-4 md:py-3 text-[10px] md:text-xs font-bold text-emerald-900 leading-relaxed">
      <span className="font-black uppercase tracking-wider text-emerald-700">Último reparto: </span>
      {format(new Date(lastDistribution.confirmed_at), 'd MMM yyyy', { locale: es })}
      <span className="text-emerald-800/80"> | Período: </span>
      {formatLocalIsoDateLabel(lastDistribution.period_start, 'd MMM')} →{' '}
      {formatLocalIsoDateLabel(lastDistribution.period_end, 'd MMM yyyy')}
      <span className="text-emerald-800/80"> | Weekday: </span>
      <span className="font-black tabular-nums">{Number(lastDistribution.weekday_total).toFixed(2)}€</span>
      <span className="text-emerald-800/80"> | Weekend: </span>
      <span className="font-black tabular-nums">{Number(lastDistribution.weekend_total).toFixed(2)}€</span>
    </div>
  ) : (
    <div className="rounded-xl md:rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 md:px-4 md:py-3 text-[10px] md:text-xs font-bold text-zinc-500">
      Aún no hay ningún reparto confirmado en el historial.
    </div>
  );

  return (
    <div className="min-h-screen bg-[#5B8FB9] p-2 sm:p-4 md:p-8 pb-24 text-zinc-900 overflow-x-hidden">
      <div className="max-w-6xl mx-auto space-y-3 md:space-y-6 min-w-0">
        <div className="bg-white rounded-xl md:rounded-[2.5rem] shadow-xl md:shadow-2xl overflow-hidden min-w-0">
          <div className="bg-[#36606F] p-3 md:p-6 relative">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-sm md:text-4xl font-black text-white uppercase tracking-tight italic truncate">
                  Propinas
                </h1>
                <p className="text-white text-[7px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] mt-0.5 md:mt-1 truncate">
                  Rango manual • {rangeLabel}
                </p>
              </div>
              <div className="flex items-center gap-1.5 md:gap-2 shrink-0 text-white">
                <TimeFilterButton
                  onClick={() => setIsTimeFilterOpen(true)}
                  hasActiveFilter={!defaultFilterActive}
                  onClear={() => {
                    setStartDate(initialStartDate);
                    setEndDate(initialEndDate);
                  }}
                />
                <button
                  type="button"
                  onClick={() => void fetchPreview()}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center text-white shrink-0 min-h-[48px]"
                  aria-label="Recalcular"
                >
                  <RefreshCw size={16} strokeWidth={3} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-2.5 md:p-6 space-y-3 md:space-y-4">
            {lastDistBanner}

            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="bg-emerald-600 rounded-xl md:rounded-3xl shadow-md px-2.5 py-1.5 md:px-3 md:py-2 flex flex-row items-center justify-between gap-2 text-white border-b-2 border-emerald-800">
                <div className="flex flex-row items-baseline gap-1.5 min-w-0">
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-white/70 whitespace-nowrap">
                    Lun – Vie
                  </span>
                  {(weekdayPool?.cashTotal ?? 0) > 0.005 ? (
                    <span className="text-xs md:text-base font-black tabular-nums truncate">
                      {fmtZeroBlank(weekdayPool!.cashTotal, 2)}
                      <span className="text-[8px] font-black ml-0.5 opacity-80">€</span>
                    </span>
                  ) : (
                    <span className="text-xs md:text-base font-black text-white/30"> </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openCash('weekday')}
                  className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 active:scale-95 transition-all min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                  title="Introducir cantidades"
                >
                  <Plus size={15} strokeWidth={3.5} className="text-white" />
                </button>
              </div>

              <div className="bg-emerald-600 rounded-xl md:rounded-3xl shadow-md px-2.5 py-1.5 md:px-3 md:py-2 flex flex-row items-center justify-between gap-2 text-white border-b-2 border-emerald-800">
                <div className="flex flex-row items-baseline gap-1.5 min-w-0">
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-white/70 whitespace-nowrap">
                    Sáb – Dom
                  </span>
                  {(weekendPool?.cashTotal ?? 0) > 0.005 ? (
                    <span className="text-xs md:text-base font-black tabular-nums truncate">
                      {fmtZeroBlank(weekendPool!.cashTotal, 2)}
                      <span className="text-[8px] font-black ml-0.5 opacity-80">€</span>
                    </span>
                  ) : (
                    <span className="text-xs md:text-base font-black text-white/30"> </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openCash('weekend')}
                  className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 active:scale-95 transition-all min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                  title="Introducir cantidades"
                >
                  <Plus size={15} strokeWidth={3.5} className="text-white" />
                </button>
              </div>
            </div>

            {canConfirmDistribution && (
              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                disabled={loading || !preview || staffWithWorkedHours.length === 0}
                className={cn(
                  'w-full min-h-[48px] rounded-xl md:rounded-2xl font-black text-[11px] md:text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
                  loading || !preview || staffWithWorkedHours.length === 0
                    ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                    : 'bg-[#36606F] text-white hover:bg-[#2d505c] shadow-md'
                )}
              >
                <CheckCircle2 size={18} strokeWidth={2.5} />
                Confirmar reparto
              </button>
            )}

            <div className="bg-white rounded-xl md:rounded-3xl shadow-sm overflow-hidden">
              {loading && (
                <div className="px-4 py-2 flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                  <RefreshCw className="animate-spin shrink-0" size={12} strokeWidth={3} />
                  Calculando…
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="bg-[#36606F] text-white">
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-10 bg-[#36606F] px-2 py-2 text-left text-[8px] font-black uppercase tracking-widest md:text-[10px]"
                      />
                      <th
                        colSpan={2}
                        className="px-1 py-2 text-center text-[8px] font-black uppercase md:text-[10px]"
                      >
                        Lun – Vie
                      </th>
                      <th
                        colSpan={2}
                        className="px-1 py-2 text-center text-[8px] font-black uppercase md:text-[10px]"
                      >
                        Sáb – Dom
                      </th>
                      <th rowSpan={2} className="px-1 py-2 text-center text-[8px] font-black uppercase">
                        TOT
                      </th>
                      <th
                        rowSpan={2}
                        className="px-1 py-2 text-center text-[8px] font-black uppercase"
                      >
                        <span className="inline-flex flex-col items-center justify-center gap-0.5">
                          <FichajeNoRegistradaMark size={10} variant="badge" />
                          <span>SIN REG</span>
                        </span>
                      </th>
                      <th rowSpan={2} className="px-2 py-2 text-right text-[8px] font-black uppercase md:text-[10px]">
                        PROP TOT
                      </th>
                    </tr>
                    <tr className="bg-[#36606F] text-white">
                      <th className="px-0.5 py-1 text-center text-[7px] font-black uppercase">H</th>
                      <th className="px-0.5 py-1 text-center text-[7px] font-black uppercase">€</th>
                      <th className="px-0.5 py-1 text-center text-[7px] font-black uppercase">H</th>
                      <th className="px-0.5 py-1 text-center text-[7px] font-black uppercase">€</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!preview || staffWithWorkedHours.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-zinc-400 font-bold text-sm">
                          {loading ? ' ' : 'Sin datos'}
                        </td>
                      </tr>
                    ) : (
                      staffWithWorkedHours.map((s) => {
                        const isSanc = s.isSanctioned;
                        const strikeClass = isSanc ? 'opacity-40' : '';
                        const tji = s.tjiPct ?? 0;
                        const teor = tipTheoreticalPoolAmounts(s);
                        const wdAmtTeor = teor.weekday;
                        const weAmtTeor = teor.weekend;
                        const totTeor = wdAmtTeor + weAmtTeor;
                        const sinRegLabel = formatSinRegCell(s.jornadasConOlvido ?? 0, tji);

                        return (
                          <tr
                            key={s.id}
                            className="hover:bg-zinc-50/60 transition-colors border-y border-zinc-200/70"
                          >
                            <td
                              className="px-2 py-2 cursor-pointer sticky left-0 bg-white z-[1]"
                              onClick={() => openOverride('weekday', s.id, s.name)}
                            >
                              <div className="text-[10px] md:text-[12px] font-black text-zinc-900 truncate">
                                {(s.name || '').trim().split(/\s+/)[0] || s.name}
                              </div>
                            </td>
                            <td
                              className={cn('px-0.5 py-2 text-center text-[9px] font-black tabular-nums text-zinc-600 cursor-pointer', strikeClass)}
                              onClick={() => openOverride('weekday', s.id, s.name)}
                            >
                              {fmtHours(s.weekdayHoursRaw)}
                            </td>
                            <td
                              className={cn('px-0.5 py-2 text-center text-[9px] font-black tabular-nums text-[#36606F] cursor-pointer', strikeClass)}
                              onClick={() => openOverride('weekday', s.id, s.name)}
                            >
                              {fmtZeroBlank(wdAmtTeor)}
                            </td>
                            <td
                              className={cn('px-0.5 py-2 text-center text-[9px] font-black tabular-nums text-zinc-600 cursor-pointer bg-zinc-50/80', strikeClass)}
                              onClick={() => openOverride('weekend', s.id, s.name)}
                            >
                              {fmtHours(s.weekendHoursRaw)}
                            </td>
                            <td
                              className={cn('px-0.5 py-2 text-center text-[9px] font-black tabular-nums text-[#36606F] cursor-pointer bg-zinc-50/80', strikeClass)}
                              onClick={() => openOverride('weekend', s.id, s.name)}
                            >
                              {fmtZeroBlank(weAmtTeor)}
                            </td>
                            <td
                              className={cn('px-1 py-2 text-center text-[9px] font-black tabular-nums text-zinc-800', strikeClass)}
                              onClick={() => openOverride('weekday', s.id, s.name)}
                            >
                              {fmtZeroBlank(totTeor)}
                            </td>
                            <td
                              className={cn('px-1 py-2 text-center text-[9px] font-black tabular-nums text-zinc-700', strikeClass)}
                              onClick={() => openOverride('weekday', s.id, s.name)}
                            >
                              <span className="inline-flex items-center justify-center gap-1">
                                <FichajeNoRegistradaMark size={9} variant="badge" />
                                <span>{sinRegLabel}</span>
                              </span>
                            </td>
                            <td className={cn('px-2 py-2 text-right text-[10px] font-black tabular-nums text-emerald-600', strikeClass)}>
                              <SanctionedTipMoney
                                amount={s.totalAmount}
                                shadowAmount={s.shadowAmount ?? null}
                                isSanctioned={isSanc}
                                className="text-[10px] font-black text-emerald-600"
                                formatFn={fmtMoney}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <TipDistributionHistorySection refreshToken={historyRefreshToken} />
      </div>

      {cashModal?.open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[220] p-2 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setCashModal(null)}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <CashDenominationForm
              key={`tip-cash-${cashModal.poolType}-${startDate}-${endDate}`}
              type="in"
              boxName={cashModal.poolType === 'weekday' ? 'Propina entre semana' : 'Propina fin de semana'}
              onCancel={() => setCashModal(null)}
              onSubmit={(total, breakdown, notes) => handleSaveCash(cashModal.poolType, total, breakdown, notes)}
              initialCounts={breakdownToInitialCounts(
                cashModal.poolType === 'weekday'
                  ? preview?.pools?.weekday?.cashBreakdown
                  : preview?.pools?.weekend?.cashBreakdown
              )}
              availableStock={{}}
              submitLabel="Guardar bote"
              variant="tipPool"
            />
          </div>
        </div>
      )}

      {overrideModal?.open && (
        <TipOverrideModal
          isOpen={overrideModal.open}
          onClose={() => setOverrideModal(null)}
          staffId={overrideModal.staffId}
          employeeName={overrideModal.staffName}
          poolType={overrideModal.poolType}
          onSave={handleSaveOverride}
          initial={{
            isSanctioned: preview?.staff.find((x) => x.id === overrideModal.staffId)?.isSanctioned ?? false,
            notes: '',
          }}
        />
      )}

      <TipConfirmDistributionModal
        isOpen={confirmModalOpen}
        onClose={() => !confirming && setConfirmModalOpen(false)}
        startDate={startDate}
        endDate={endDate}
        weekdayTotal={weekdayPool?.cashTotal ?? 0}
        weekendTotal={weekendPool?.cashTotal ?? 0}
        staff={staffWithWorkedHours.map((s) => ({
          id: s.id,
          name: s.name,
          totalAmount: s.totalAmount,
          weekdayAmount: s.weekdayAmount,
          weekendAmount: s.weekendAmount,
          isSanctioned: s.isSanctioned,
        }))}
        confirming={confirming}
        onConfirm={() => void handleConfirmDistribution()}
      />

      <TimeFilterModal
        isOpen={isTimeFilterOpen}
        onClose={() => setIsTimeFilterOpen(false)}
        allowedKinds={['date', 'range', 'week', 'month', 'year']}
        initialValue={{ kind: 'range', startDate, endDate } satisfies TimeFilterValue}
        onApply={(v) => {
          if (v.kind === 'date') {
            setStartDate(v.date);
            setEndDate(v.date);
            return;
          }
          if (v.kind === 'range' || v.kind === 'week') {
            setStartDate(v.startDate);
            setEndDate(v.endDate);
            return;
          }
          if (v.kind === 'month') {
            const s = startOfMonth(new Date(v.year, v.month - 1, 1));
            const e = endOfMonth(new Date(v.year, v.month - 1, 1));
            setStartDate(format(s, 'yyyy-MM-dd'));
            setEndDate(format(e, 'yyyy-MM-dd'));
            return;
          }
          if (v.kind === 'year') {
            setStartDate(format(new Date(v.year, 0, 1), 'yyyy-MM-dd'));
            setEndDate(format(new Date(v.year, 11, 31), 'yyyy-MM-dd'));
          }
        }}
      />
    </div>
  );
}
