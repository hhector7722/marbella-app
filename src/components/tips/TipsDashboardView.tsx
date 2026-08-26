'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, RefreshCw } from 'lucide-react';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import {
  formatTimeFilterPeriodLabel,
  shiftTimeFilterValue,
  timeFilterBounds,
  type TimeFilterValue,
} from '@/components/time/time-filter-types';
import { CashDenominationForm, TIP_POOL_CASH_FORM_ID } from '@/components/CashDenominationForm';
import { TipOverrideModal, type TipOverrideDraft } from '@/components/tips/TipOverrideModal';
import { TipConfirmDistributionModal } from '@/components/tips/TipConfirmDistributionModal';
import { TipDistributionHistorySection } from '@/components/tips/TipDistributionHistorySection';
import { SanctionedTipMoney } from '@/components/tips/SanctionedTipMoney';
import { TipExpandBadge, TipSinRegHeaderBadge } from '@/components/tips/TipColumnToggleBadge';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { Surface } from '@/components/ui/Surface';
import { EmptyState } from '@/components/ui/EmptyState';
import { TABLE_COMPONENT_ID } from '@/lib/design-system';
import {
  formatLocalIsoDateLabel,
  formatTipInt,
  penalizacionColorClass,
  roundTipToHalfEuro,
  tjiColorClass,
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

/** Columnas desplegables (desglose H/€, Sin reg) vs fijas (nombre, H, PEN, PROP). */
const TIP_EXPAND_TH = 'bg-[#4a7583]';
const TIP_EXPAND_TD = 'bg-ds-marca/[0.07] hover:bg-ds-marca/[0.11]';

const TIP_TABLE_TH = 'whitespace-nowrap px-1 py-1 align-middle leading-none';
const TIP_TABLE_TH_TEXT =
  'text-[10px] font-black uppercase tracking-wide md:text-[8px]';
const TIP_TABLE_TH_BTN =
  'inline-flex w-full max-w-full items-center gap-0.5 py-0 leading-none active:scale-95';
const TIP_TABLE_BODY_TEXT = 'text-[10px] font-black leading-none md:text-[11px]';
const TIP_TABLE_DATA_CELL = cn(
  'whitespace-nowrap px-1 py-1.5 text-center align-middle tabular-nums',
  TIP_TABLE_BODY_TEXT
);
const TIP_TABLE_COMPACT_TH = 'px-0.5 py-0.5';
const TIP_TABLE_COMPACT_TH_TEXT = 'text-[7px] tracking-tight md:text-[8px]';
const TIP_TABLE_COMPACT_DATA_CELL = 'px-0.5 py-1 text-[8px] md:text-[9px]';
const TIP_TABLE_COMPACT_NAME = 'px-1 py-1 text-[8px] md:text-[9px]';
const TIP_TABLE_NAME_TH =
  'sticky left-0 z-[1] max-w-none whitespace-nowrap bg-ds-marca px-1.5 text-left align-middle';
const TIP_TABLE_NAME_TD = cn(
  'sticky left-0 z-[1] max-w-none whitespace-nowrap bg-white px-1.5 py-1.5 cursor-pointer align-middle',
  TIP_TABLE_BODY_TEXT,
  'text-left text-zinc-900'
);

function staffTableDisplayName(name: string): string {
  const n = (name || '').trim();
  if (!n) return ' ';
  return n.split(/\s+/)[0] ?? ' ';
}

type TipTableColKey =
  | 'name'
  | 'h'
  | 'hLv'
  | 'hSd'
  | 'pen'
  | 'sinReg'
  | 'propF'
  | 'prop'
  | 'eLv'
  | 'eSd'
  | 'sinPen';

/** Reparte el 100% del ancho según columnas visibles (más columnas → más estrechas). */
function buildTipTableColWidths(flags: {
  showHoursDetail: boolean;
  showSinRegCol: boolean;
  showPropDetail: boolean;
}): Record<TipTableColKey, string> {
  const compact = flags.showPropDetail;
  const nameWeight = compact ? 1.15 : 2.5;
  const cols: { key: TipTableColKey; weight: number }[] = [
    { key: 'name', weight: nameWeight },
    { key: 'h', weight: compact ? 0.65 : 1 },
  ];
  if (flags.showHoursDetail) {
    cols.push({ key: 'hLv', weight: compact ? 0.65 : 0.85 }, { key: 'hSd', weight: compact ? 0.65 : 0.85 });
  }
  cols.push({ key: 'pen', weight: compact ? 0.65 : flags.showPropDetail ? 0.85 : 1 });
  if (flags.showSinRegCol) cols.push({ key: 'sinReg', weight: compact ? 0.65 : 0.85 });
  cols.push({ key: 'propF', weight: compact ? 0.85 : flags.showPropDetail ? 1 : 1.2 });
  if (flags.showPropDetail) {
    cols.push(
      { key: 'prop', weight: 0.8 },
      { key: 'sinPen', weight: 0.75 },
      { key: 'eLv', weight: 0.75 },
      { key: 'eSd', weight: 0.85 }
    );
  }
  const total = cols.reduce((sum, c) => sum + c.weight, 0);
  return Object.fromEntries(cols.map((c) => [c.key, `${(c.weight / total) * 100}%`])) as Record<
    TipTableColKey,
    string
  >;
}

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
  const [filterValue, setFilterValue] = useState<TimeFilterValue>({
    kind: 'range',
    startDate: initialStartDate,
    endDate: initialEndDate,
  });
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const [cashModal, setCashModal] = useState<{ open: boolean; poolType: PoolType } | null>(null);
  const [cashModalTotal, setCashModalTotal] = useState(0);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean;
    poolType: PoolType;
    staffId: string;
    staffName: string;
  } | null>(null);

  const [showHoursDetail, setShowHoursDetail] = useState(false);
  const [showSinRegCol, setShowSinRegCol] = useState(false);
  const [showPropDetail, setShowPropDetail] = useState(false);

  const tableColCount =
    5 + (showHoursDetail ? 2 : 0) + (showSinRegCol ? 1 : 0) + (showPropDetail ? 4 : 0);

  const colWidths = useMemo(
    () =>
      buildTipTableColWidths({
        showHoursDetail,
        showSinRegCol,
        showPropDetail,
      }),
    [showHoursDetail, showSinRegCol, showPropDetail]
  );

  const tableCompact = showPropDetail;

  const tipThClass = cn(TIP_TABLE_TH, tableCompact && TIP_TABLE_COMPACT_TH);
  const tipThTextClass = cn(TIP_TABLE_TH_TEXT, tableCompact && TIP_TABLE_COMPACT_TH_TEXT);
  const tipThBtnClass = cn(TIP_TABLE_TH_BTN, tableCompact && 'gap-0');
  const tipDataCellClass = cn(TIP_TABLE_DATA_CELL, tableCompact && TIP_TABLE_COMPACT_DATA_CELL);
  const tipNameThClass = cn(TIP_TABLE_NAME_TH, tipThClass, tipThTextClass);
  const tipNameTdClass = cn(TIP_TABLE_NAME_TD, tableCompact && TIP_TABLE_COMPACT_NAME);
  const tipBodyTextClass = cn(TIP_TABLE_BODY_TEXT, tableCompact && 'text-[8px] md:text-[9px]');

  const cashModalInitialCounts = useMemo(() => {
    if (!cashModal?.open) return {};
    return breakdownToInitialCounts(
      cashModal.poolType === 'weekday'
        ? preview?.pools?.weekday?.cashBreakdown
        : preview?.pools?.weekend?.cashBreakdown
    );
  }, [
    cashModal?.open,
    cashModal?.poolType,
    preview?.pools?.weekday?.cashBreakdown,
    preview?.pools?.weekend?.cashBreakdown,
  ]);

  const applyTimeFilter = useCallback((v: TimeFilterValue) => {
    const bounds = timeFilterBounds(v);
    if (!bounds) return;
    setFilterValue(v);
    setStartDate(bounds.startDate);
    setEndDate(bounds.endDate);
  }, []);

  const rangeLabel = useMemo(() => formatTimeFilterPeriodLabel(filterValue), [filterValue]);

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
        p_override_amount: draft.overrideAmount,
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
    <EmptyState
      instance="tips-history-none"
      variant="none"
      title="Aún no hay ningún reparto confirmado en el historial."
    />
  );

  return (
    <>
    <DashboardDetailLayout
      title="Propinas"
      showBackButton={false}
      maxWidthClass="max-w-6xl"
      template="list"
      contentClassName="space-y-1.5 min-w-0"
      periodSlot={
        <PeriodNav
          label={rangeLabel}
          onPrev={() => applyTimeFilter(shiftTimeFilterValue(filterValue, -1))}
          onNext={() => applyTimeFilter(shiftTimeFilterValue(filterValue, 1))}
          onLabelClick={() => setIsTimeFilterOpen(true)}
          prevAriaLabel="Periodo anterior"
          nextAriaLabel="Periodo siguiente"
        />
      }
      rightSlot={
              <div className="flex items-center gap-1.5 md:gap-2 shrink-0 text-white">
                <PeriodFilterButton instance="tips-period-filter" onClick={() => setIsTimeFilterOpen(true)} />
                <Button
                  type="button"
                  variant="tertiary"
                  instance="tips-recalculate"
                  onClick={() => void fetchPreview()}
                  aria-label="Recalcular"
                  className="shrink-0"
                  icon={<RefreshCw size={16} strokeWidth={3} />}
                />
              </div>
      }
    >
            {lastDistBanner}

            <div className="-mx-4 md:-mx-6">
              <div className="overflow-x-auto overscroll-x-contain px-4 md:px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max min-w-full flex-nowrap items-center gap-x-2 pe-2">
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-emerald-800/80 whitespace-nowrap">
                      <span className="md:hidden">L-V</span>
                      <span className="hidden md:inline">Lun – Vie</span>
                    </span>
                    <Button
                      type="button"
                      variant="primary"
                      layout="hug"
                      instance="tips-pool-weekday-open"
                      aria-label="Introducir cantidades entre semana"
                      onClick={() => openCash('weekday')}
                    >
                      {(weekdayPool?.cashTotal ?? 0) > 0.005
                        ? `${weekdayPool!.cashTotal.toFixed(2)} €`
                        : ' '}
                    </Button>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-emerald-800/80 whitespace-nowrap">
                      <span className="md:hidden">S-D</span>
                      <span className="hidden md:inline">Sáb – Dom</span>
                    </span>
                    <Button
                      type="button"
                      variant="primary"
                      layout="hug"
                      instance="tips-pool-weekend-open"
                      aria-label="Introducir cantidades fin de semana"
                      onClick={() => openCash('weekend')}
                    >
                      {(weekendPool?.cashTotal ?? 0) > 0.005
                        ? `${weekendPool!.cashTotal.toFixed(2)} €`
                        : ' '}
                    </Button>
                  </div>

                  {canConfirmDistribution ? (
                    <Button
                      type="button"
                      variant="primary"
                      layout="hug"
                      instance="tips-confirm-distribution-open"
                      className="shrink-0"
                      disabled={loading || !preview || staffWithWorkedHours.length === 0}
                      onClick={() => setConfirmModalOpen(true)}
                    >
                      CONFIRMAR
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <Surface variant="block" instance="tips-matrix" className="overflow-hidden">
              {loading && (
                <div className="px-4 py-2 flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                  <RefreshCw className="animate-spin shrink-0" size={12} strokeWidth={3} />
                  Calculando…
                </div>
              )}
              <div className="isolate overflow-x-hidden touch-pan-y overscroll-y-auto md:overflow-x-visible">
                <table data-component={TABLE_COMPONENT_ID} data-instance="propinas-reparto" className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="align-middle">
                      <th
                        style={{ width: colWidths.name }}
                        className={tipNameThClass}
                      />
                      <th style={{ width: colWidths.h }} className={cn('text-center', tipThClass)}>
                        <button
                          type="button"
                          onClick={() => setShowHoursDetail((v) => !v)}
                          className={cn(
                            tipThBtnClass,
                            'justify-center',
                            tipThTextClass
                          )}
                          title={showHoursDetail ? 'Ocultar desglose de horas' : 'Mostrar H Lun–Vie y H Sáb–Dom'}
                        >
                          <span>H</span>
                          <TipExpandBadge size={8} />
                        </button>
                      </th>
                      {showHoursDetail && (
                        <>
                          <th
                            style={{ width: colWidths.hLv }}
                            className={cn(
                              'text-center',
                              tipThClass,
                              tipThTextClass,
                              TIP_EXPAND_TH
                            )}
                          >
                            <span
                              className={cn(
                                'inline-flex items-center justify-center gap-0.5',
                                tipThTextClass
                              )}
                            >
                              <Clock size={8} strokeWidth={2.5} className="shrink-0" aria-hidden />
                              <span>L - V</span>
                            </span>
                          </th>
                          <th
                            style={{ width: colWidths.hSd }}
                            className={cn(
                              'text-center',
                              tipThClass,
                              tipThTextClass,
                              TIP_EXPAND_TH
                            )}
                          >
                            <span
                              className={cn(
                                'inline-flex items-center justify-center gap-0.5',
                                tipThTextClass
                              )}
                            >
                              <Clock size={8} strokeWidth={2.5} className="shrink-0" aria-hidden />
                              <span>S - D</span>
                            </span>
                          </th>
                        </>
                      )}
                      <th style={{ width: colWidths.pen }} className={cn('text-center', tipThClass)}>
                        <button
                          type="button"
                          onClick={() => setShowSinRegCol((v) => !v)}
                          className={cn(
                            tipThBtnClass,
                            'justify-center',
                            tipThTextClass
                          )}
                          title={showSinRegCol ? 'Ocultar Sin reg' : 'Mostrar jornadas sin registro'}
                        >
                          <span>PEN</span>
                          <TipSinRegHeaderBadge size={8} />
                        </button>
                      </th>
                      {showSinRegCol && (
                        <th
                          style={{ width: colWidths.sinReg }}
                          className={cn(
                            'text-center',
                            tipThClass,
                            tipThTextClass,
                            TIP_EXPAND_TH
                          )}
                        >
                          Sin reg
                        </th>
                      )}
                      <th style={{ width: colWidths.propF }} className={cn('text-right', tipThClass)}>
                        <button
                          type="button"
                          onClick={() => setShowPropDetail((v) => !v)}
                          className={cn(
                            tipThBtnClass,
                            'justify-end',
                            tipThTextClass
                          )}
                          title={
                            showPropDetail
                              ? 'Ocultar PROP, Sin pen, € Lun–Vie y € Sáb–Dom'
                              : 'Mostrar desglose de propinas'
                          }
                        >
                          <span>PROP F</span>
                          <TipExpandBadge size={8} />
                        </button>
                      </th>
                      {showPropDetail && (
                        <>
                          <th
                            style={{ width: colWidths.prop }}
                            className={cn(
                              'text-right',
                              tipThClass,
                              tipThTextClass,
                              TIP_EXPAND_TH
                            )}
                          >
                            PROP
                          </th>
                          <th
                            style={{ width: colWidths.sinPen }}
                            className={cn(
                              'text-center',
                              tipThClass,
                              tipThTextClass,
                              TIP_EXPAND_TH
                            )}
                          >
                            Sin pen
                          </th>
                          <th
                            style={{ width: colWidths.eLv }}
                            className={cn(
                              'text-center',
                              tipThClass,
                              tipThTextClass,
                              TIP_EXPAND_TH
                            )}
                          >
                            € L-V
                          </th>
                          <th
                            style={{ width: colWidths.eSd }}
                            className={cn(
                              'text-center',
                              tipThClass,
                              tipThTextClass,
                              TIP_EXPAND_TH
                            )}
                          >
                            € S-D
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {!preview || staffWithWorkedHours.length === 0 ? (
                      <tr>
                        <td
                          colSpan={tableColCount}
                          className="px-4 py-10 text-center text-zinc-400 font-bold text-sm"
                        >
                          {loading ? ' ' : 'Sin datos'}
                        </td>
                      </tr>
                    ) : (
                      staffWithWorkedHours.map((s) => {
                        const isSanc = s.isSanctioned;
                        const strikeClass = isSanc ? 'opacity-40' : '';
                        const tji = s.tjiPct ?? 0;
                        const pen = s.penalizacionPct ?? 0;
                        const teor = tipTheoreticalPoolAmounts(s);
                        const wdAmtTeor = teor.weekday;
                        const weAmtTeor = teor.weekend;
                        const totSinPen = teor.total;
                        const hTotal = (s.weekdayHoursRaw ?? 0) + (s.weekendHoursRaw ?? 0);
                        const penLabel = pen > 0 ? `${pen}%` : ' ';
                        const openRow = () => openOverride('weekday', s.id, s.name);

                        return (
                          <tr
                            key={s.id}
                            className="align-middle hover:bg-zinc-50/60 transition-colors border-y border-zinc-200/70"
                          >
                            <td
                              style={{ width: colWidths.name }}
                              className={cn(tipNameTdClass, strikeClass)}
                              onClick={openRow}
                            >
                              {staffTableDisplayName(s.name)}
                            </td>
                            <td
                              style={{ width: colWidths.h }}
                              className={cn(
                                tipDataCellClass,
                                'text-zinc-700 cursor-pointer',
                                strikeClass
                              )}
                              onClick={openRow}
                            >
                              {fmtHours(hTotal)}
                            </td>
                            {showHoursDetail && (
                              <>
                                <td
                                  style={{ width: colWidths.hLv }}
                                  className={cn(
                                    tipDataCellClass,
                                    'text-zinc-600 cursor-pointer',
                                    TIP_EXPAND_TD,
                                    strikeClass
                                  )}
                                  onClick={openRow}
                                >
                                  {fmtHours(s.weekdayHoursRaw)}
                                </td>
                                <td
                                  style={{ width: colWidths.hSd }}
                                  className={cn(
                                    tipDataCellClass,
                                    'text-zinc-600 cursor-pointer',
                                    TIP_EXPAND_TD,
                                    strikeClass
                                  )}
                                  onClick={() => openOverride('weekend', s.id, s.name)}
                                >
                                  {fmtHours(s.weekendHoursRaw)}
                                </td>
                              </>
                            )}
                            <td
                              style={{ width: colWidths.pen }}
                              className={cn(
                                tipDataCellClass,
                                'cursor-pointer',
                                penalizacionColorClass(pen),
                                strikeClass
                              )}
                              onClick={openRow}
                            >
                              {penLabel}
                            </td>
                            {showSinRegCol && (
                              <td
                                style={{ width: colWidths.sinReg }}
                                className={cn(
                                  tipDataCellClass,
                                  'cursor-pointer',
                                  TIP_EXPAND_TD,
                                  tjiColorClass(tji),
                                  strikeClass
                                )}
                                onClick={openRow}
                              >
                                {formatTipInt(s.jornadasConOlvido ?? 0)}
                              </td>
                            )}
                            <td
                              style={{ width: colWidths.propF }}
                              className={cn(
                                tipDataCellClass,
                                'text-right text-emerald-600',
                                strikeClass
                              )}
                            >
                              <SanctionedTipMoney
                                amount={roundTipToHalfEuro(s.totalAmount)}
                                shadowAmount={
                                  isSanc && s.shadowAmount != null
                                    ? roundTipToHalfEuro(s.shadowAmount)
                                    : null
                                }
                                isSanctioned={isSanc}
                                className={cn(tipBodyTextClass, 'text-emerald-600')}
                                formatFn={fmtMoney}
                              />
                            </td>
                            {showPropDetail && (
                              <>
                                <td
                                  style={{ width: colWidths.prop }}
                                  className={cn(
                                    tipDataCellClass,
                                    'text-right text-emerald-600',
                                    TIP_EXPAND_TD,
                                    strikeClass
                                  )}
                                >
                                  <SanctionedTipMoney
                                    amount={s.totalAmount}
                                    shadowAmount={s.shadowAmount ?? null}
                                    isSanctioned={isSanc}
                                    className={cn(tipBodyTextClass, 'text-emerald-600')}
                                    formatFn={fmtMoney}
                                  />
                                </td>
                                <td
                                  style={{ width: colWidths.sinPen }}
                                  className={cn(
                                    tipDataCellClass,
                                    'text-zinc-500 cursor-pointer',
                                    TIP_EXPAND_TD,
                                    strikeClass
                                  )}
                                  onClick={openRow}
                                >
                                  {fmtZeroBlank(totSinPen)}
                                </td>
                                <td
                                  style={{ width: colWidths.eLv }}
                                  className={cn(
                                    tipDataCellClass,
                                    'text-ds-marca cursor-pointer',
                                    TIP_EXPAND_TD,
                                    strikeClass
                                  )}
                                  onClick={openRow}
                                >
                                  {fmtZeroBlank(wdAmtTeor)}
                                </td>
                                <td
                                  style={{ width: colWidths.eSd }}
                                  className={cn(
                                    tipDataCellClass,
                                    'text-ds-marca cursor-pointer',
                                    TIP_EXPAND_TD,
                                    strikeClass
                                  )}
                                  onClick={() => openOverride('weekend', s.id, s.name)}
                                >
                                  {fmtZeroBlank(weAmtTeor)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Surface>

        <TipDistributionHistorySection refreshToken={historyRefreshToken} />
        <div className="scroll-end-touch" aria-hidden />
    </DashboardDetailLayout>

      {cashModal?.open ? (
        <Modal
          open
          onClose={() => {
            setCashModal(null);
            setCashModalTotal(0);
          }}
          title={cashModal.poolType === 'weekday' ? 'Propina entre semana' : 'Propina fin de semana'}
          variant="amplify"
          layer="base"
          instance={cashModal.poolType === 'weekday' ? 'tips-cash-weekday' : 'tips-cash-weekend'}
          headerTone="petroleum"
          usageId={`tips-cash-${cashModal.poolType}`}
          usageLabel={
            cashModal.poolType === 'weekday' ? 'Bote propina entre semana' : 'Bote propina fin de semana'
          }
          footer={
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <div className="mr-auto flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total</span>
                <span className="text-base font-black tabular-nums text-zinc-800">
                  {cashModalTotal > 0.005 ? `${cashModalTotal.toFixed(2)}€` : ' '}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                instance={`tips-cash-${cashModal.poolType}-cancel`}
                onClick={() => {
                  setCashModal(null);
                  setCashModalTotal(0);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                instance={`tips-cash-${cashModal.poolType}-submit`}
                form={TIP_POOL_CASH_FORM_ID}
              >
                Guardar
              </Button>
            </div>
          }
        >
          <CashDenominationForm
            key={`tip-cash-${cashModal.poolType}-${startDate}-${endDate}`}
            type="in"
            boxName={cashModal.poolType === 'weekday' ? 'Propina entre semana' : 'Propina fin de semana'}
            onCancel={() => {
              setCashModal(null);
              setCashModalTotal(0);
            }}
            onSubmit={(total, breakdown, notes) => handleSaveCash(cashModal.poolType, total, breakdown, notes)}
            onTotalChange={setCashModalTotal}
            initialCounts={cashModalInitialCounts}
            availableStock={{}}
            submitLabel="Guardar bote"
            variant="tipPool"
          />
        </Modal>
      ) : null}

      {overrideModal?.open && (
        <TipOverrideModal
          isOpen={overrideModal.open}
          onClose={() => setOverrideModal(null)}
          staffId={overrideModal.staffId}
          employeeName={overrideModal.staffName}
          poolType={overrideModal.poolType}
          poolId={
            overrideModal.poolType === 'weekday'
              ? preview?.pools.weekday.id ?? null
              : preview?.pools.weekend.id ?? null
          }
          onSave={handleSaveOverride}
          initial={{
            isSanctioned: preview?.staff.find((x) => x.id === overrideModal.staffId)?.isSanctioned ?? false,
            overrideAmount: null,
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
          totalAmount: roundTipToHalfEuro(s.totalAmount),
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
        initialValue={filterValue}
        onApply={(v) => {
          applyTimeFilter(v);
        }}
      />
    </>
  );
}
