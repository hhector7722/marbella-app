'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Edit3, Plus, RefreshCw } from 'lucide-react';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { TipOverrideModal, type TipOverrideDraft } from '@/components/tips/TipOverrideModal';

type PoolType = 'weekday' | 'weekend';

type TipPreviewStaffRow = {
  id: string;
  name: string;
  role: string;
  weekdayHours: number;
  weekendHours: number;
  weekdayHoursRaw: number;
  weekendHoursRaw: number;
  weekdayAmount: number;
  weekendAmount: number;
  totalAmount: number;
  isSanctioned?: boolean;
  hasOverrides: boolean;
};

type TipPreview = {
  range: { startDate: string; endDate: string };
  pools: {
    weekday: { id: string | null; cashTotal: number; cashBreakdown: any; notes: string | null };
    weekend: { id: string | null; cashTotal: number; cashBreakdown: any; notes: string | null };
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

/** Convierte cashBreakdown de JSON (claves string) a Record<number, number> para CashDenominationForm */
function breakdownToInitialCounts(b: Record<string, number> | null | undefined): Record<number, number> {
  if (!b || typeof b !== 'object') return {};
  return Object.fromEntries(
    Object.entries(b).map(([k, v]) => [Number(k), Number(v)]).filter(([k]) => !isNaN(k))
  );
}

export default function TipsDashboardView({
  canEditPools = true,
  canEditOverrides = false,
}: {
  canEditPools?: boolean;
  canEditOverrides?: boolean;
}) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TipPreview | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return format(startOfMonth(now), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return format(endOfMonth(now), 'yyyy-MM-dd');
  });

  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const [cashModal, setCashModal] = useState<{ open: boolean; poolType: PoolType } | null>(null);
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

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_tip_pool_preview', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      setPreview((data as unknown) as TipPreview);
    } catch (e: any) {
      console.error(e);
      toast.error('Error crítico de base de datos al calcular propinas.');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, startDate, endDate]);

  // Carga inicial + recarga al cambiar rango
  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  // Si faltan pools (no existe fila), inicializar a 0 (solo manager/admin, validación en RPC)
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
      } catch (e: any) {
        // No silenciar: si no eres manager, esta operación fallará y debe quedar claro
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

  const handleSaveCash = async (poolType: PoolType, total: number, breakdown: any, notes: string) => {
    try {
      const normalizedTotal = Number.isFinite(total) ? Number(total.toFixed(2)) : 0;
      const normalizedBreakdown = breakdown ?? {};
      const normalizedNotes = (notes || '').trim() || null;

      await supabase.rpc('upsert_tip_pool', {
        p_pool_type: poolType,
        // Debe poder guardarse también 0 (no bloquear, no convertir a null)
        p_cash_total: normalizedTotal,
        p_cash_breakdown: normalizedBreakdown,
        p_notes: normalizedNotes,
      });

      // Optimistic UI: actualizar el importe del bote ya mismo
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
    } catch (e: any) {
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
      // Recalcula el reparto para todos los empleados (get_tip_pool_preview usa overrides y horas y reparte de nuevo)
      await fetchPreview();
    } catch (e: any) {
      console.error(e);
      toast.error('Error crítico guardando override en BD (permiso o validación).');
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

  return (
    <div className="min-h-screen bg-[#5B8FB9] p-2 sm:p-4 md:p-8 pb-24 text-zinc-900 overflow-x-hidden">
      <div className="max-w-5xl mx-auto space-y-3 md:space-y-6 min-w-0">
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
                  hasActiveFilter={(() => {
                    const now = new Date();
                    const start = format(startOfMonth(now), 'yyyy-MM-dd');
                    const end = format(endOfMonth(now), 'yyyy-MM-dd');
                    return startDate !== start || endDate !== end;
                  })()}
                  onClear={() => {
                    const now = new Date();
                    const start = format(startOfMonth(now), 'yyyy-MM-dd');
                    const end = format(endOfMonth(now), 'yyyy-MM-dd');
                    setStartDate(start);
                    setEndDate(end);
                  }}
                />
                <button
                  onClick={fetchPreview}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center text-white shrink-0 min-h-[48px]"
                >
                  <RefreshCw size={16} strokeWidth={3} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-2.5 md:p-6 space-y-3 md:space-y-4">
            {/* Fila 1: etiquetas de contenido */}
            {/* Fila Única: Contenedores bote combinados (Verde Marbella) */}
            <div className="grid grid-cols-2 gap-2 md:gap-4">
              {/* LUN - VIE */}
              <div className="bg-emerald-600 rounded-xl md:rounded-3xl shadow-md p-3 md:p-5 flex items-center justify-between gap-3 text-white border-b-4 border-emerald-800">
                <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-3 min-w-0">
                  <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest text-white/70 whitespace-nowrap leading-none">
                    Lun – Vie
                  </span>
                  <div className="min-w-0 leading-none">
                    {(weekdayPool?.cashTotal ?? 0) > 0.005 ? (
                      <span className="text-lg md:text-3xl font-black tabular-nums truncate">
                        {fmtZeroBlank(weekdayPool!.cashTotal, 2)}
                        <span className="text-[10px] md:text-sm font-black ml-0.5 md:ml-1 opacity-80">€</span>
                      </span>
                    ) : (
                      <span className="text-lg md:text-3xl font-black tabular-nums text-white/30 truncate"> </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openCash('weekday')}
                  className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm group"
                  title="Introducir cantidades"
                >
                  <Plus size={22} strokeWidth={4} className="md:w-7 md:h-7 text-white group-hover:rotate-90 transition-transform duration-300" />
                </button>
              </div>

              {/* SÁB - DOM */}
              <div className="bg-emerald-600 rounded-xl md:rounded-3xl shadow-md p-3 md:p-5 flex items-center justify-between gap-3 text-white border-b-4 border-emerald-800">
                <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-3 min-w-0">
                  <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest text-white/70 whitespace-nowrap leading-none">
                    Sáb – Dom
                  </span>
                  <div className="min-w-0 leading-none">
                    {(weekendPool?.cashTotal ?? 0) > 0.005 ? (
                      <span className="text-lg md:text-3xl font-black tabular-nums truncate">
                        {fmtZeroBlank(weekendPool!.cashTotal, 2)}
                        <span className="text-[10px] md:text-sm font-black ml-0.5 md:ml-1 opacity-80">€</span>
                      </span>
                    ) : (
                      <span className="text-lg md:text-3xl font-black tabular-nums text-white/30 truncate"> </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openCash('weekend')}
                  className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm group"
                  title="Introducir cantidades"
                >
                  <Plus size={22} strokeWidth={4} className="md:w-7 md:h-7 text-white group-hover:rotate-90 transition-transform duration-300" />
                </button>
              </div>
            </div>

            {/* Tabla sin bordes interiores, cabecera petroleo, subcabecera H/€ */}
            <div className="bg-white rounded-xl md:rounded-3xl shadow-sm overflow-hidden">
              {loading && (
                <div className="px-4 py-2 flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                  <RefreshCw className="animate-spin shrink-0" size={12} strokeWidth={3} />
                  Calculando…
                </div>
              )}
              <div>
                <table className="w-full min-w-0 border-collapse table-fixed">
                  <thead>
                    <tr className="bg-[#36606F] text-white">
                      <th className="text-left px-3 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest w-[20%] min-w-0">
                        Staff
                      </th>
                      <th colSpan={2} className="text-center px-1 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest">
                        Lun – Vie
                      </th>
                      <th colSpan={2} className="text-center px-1 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest bg-white/5">
                        Sáb – Dom
                      </th>
                      <th className="text-right px-3 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest w-[12%]">
                        Tot
                      </th>
                    </tr>
                    <tr className="bg-[#36606F]/90 text-white/90">
                      <th className="text-left px-3 md:px-4 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest" />
                      <th className="text-center px-0.5 md:px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">H</th>
                      <th className="text-center px-0.5 md:px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">€</th>
                      <th className="text-center px-0.5 md:px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%] bg-white/5">H</th>
                      <th className="text-center px-0.5 md:px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%] bg-white/5">€</th>
                      <th className="text-right px-3 md:px-4 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest" />
                    </tr>
                  </thead>
                  <tbody>
                    {!preview || staffWithWorkedHours.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-zinc-400 font-bold text-sm">
                          {loading ? ' ' : 'Sin datos'}
                        </td>
                      </tr>
                    ) : (
                      staffWithWorkedHours.map((s) => {
                        const isSanc = s.isSanctioned;
                        const strikeClass = isSanc ? 'opacity-40' : '';
                        return (
                        <tr key={s.id} className="group relative hover:bg-zinc-50/60 transition-colors border-y border-zinc-200/70">
                          {isSanc && (
                            <td className="absolute inset-0 pointer-events-none z-10 flex items-center px-2 md:px-4">
                              <div className="w-full h-[1px] bg-black/60" />
                            </td>
                          )}
                          <td
                            className="px-2 md:px-4 py-2 md:py-3 cursor-pointer"
                            onClick={() => openOverride('weekday', s.id, s.name)}
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] md:text-[13px] font-black text-zinc-900 truncate flex items-center gap-1.5 md:gap-2">
                                {(s.name || '').trim().split(/\s+/)[0] || s.name}
                                {s.hasOverrides && !isSanc && (
                                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-orange-500 shrink-0">
                                    OVERRIDE
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td
                            className={cn("px-0 md:px-1 py-2 md:py-3 text-center text-[10px] md:text-[12px] font-black tabular-nums text-zinc-600 cursor-pointer", strikeClass)}
                            onClick={() => openOverride('weekday', s.id, s.name)}
                          >
                            {fmtHours(s.weekdayHours)}
                          </td>
                          <td
                            className={cn("px-0 md:px-1 py-2 md:py-3 text-center text-[10px] md:text-[12px] font-black tabular-nums text-[#36606F] cursor-pointer", strikeClass)}
                            onClick={() => openOverride('weekday', s.id, s.name)}
                          >
                            {fmtZeroBlank(s.weekdayAmount, 2)}
                          </td>
                          <td
                            className={cn("px-0 md:px-1 py-2 md:py-3 text-center text-[10px] md:text-[12px] font-black tabular-nums text-zinc-600 cursor-pointer bg-zinc-50/80", strikeClass)}
                            onClick={() => openOverride('weekend', s.id, s.name)}
                          >
                            {fmtHours(s.weekendHours)}
                          </td>
                          <td
                            className={cn("px-0 md:px-1 py-2 md:py-3 text-center text-[10px] md:text-[12px] font-black tabular-nums text-[#36606F] cursor-pointer bg-zinc-50/80", strikeClass)}
                            onClick={() => openOverride('weekend', s.id, s.name)}
                          >
                            {fmtZeroBlank(s.weekendAmount, 2)}
                          </td>
                          <td className={cn("px-2 md:px-4 py-2 md:py-3 text-right text-[10px] md:text-[13px] font-black tabular-nums text-emerald-600", strikeClass)}>
                            {fmtMoney(s.totalAmount)}
                          </td>
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
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
              initialCounts={breakdownToInitialCounts(cashModal.poolType === 'weekday' ? preview?.pools?.weekday?.cashBreakdown : preview?.pools?.weekend?.cashBreakdown)}
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
            isSanctioned: preview?.staff.find(x => x.id === overrideModal.staffId)?.isSanctioned ?? false,
            notes: '',
          }}
        />
      )}

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
            const s = new Date(v.year, 0, 1);
            const e = new Date(v.year, 11, 31);
            setStartDate(format(s, 'yyyy-MM-dd'));
            setEndDate(format(e, 'yyyy-MM-dd'));
          }
        }}
      />
    </div>
  );
}

