'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Edit3, Plus, RefreshCw } from 'lucide-react';
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

export default function TipsDashboardView() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TipPreview | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  });

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
            p_start_date: startDate,
            p_end_date: endDate,
            p_pool_type: 'weekday',
            p_cash_total: preview.pools.weekday.cashTotal ?? 0,
            p_cash_breakdown: preview.pools.weekday.cashBreakdown ?? {},
            p_notes: preview.pools.weekday.notes ?? null,
          });
        }
        if (missingWeekend) {
          await supabase.rpc('upsert_tip_pool', {
            p_start_date: startDate,
            p_end_date: endDate,
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
    setCashModal({ open: true, poolType });
  };

  const handleSaveCash = async (poolType: PoolType, total: number, breakdown: any, notes: string) => {
    try {
      await supabase.rpc('upsert_tip_pool', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_pool_type: poolType,
        p_cash_total: total,
        p_cash_breakdown: breakdown ?? {},
        p_notes: (notes || '').trim() || null,
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
        p_override_hours: draft.overrideHours,
        p_override_amount: draft.overrideAmount,
        p_notes: draft.notes || null,
      });
      toast.success('Override guardado');
      await fetchPreview();
    } catch (e: any) {
      console.error(e);
      toast.error('Error crítico guardando override en BD (permiso o validación).');
    }
  };

  const weekdayPool = preview?.pools.weekday;
  const weekendPool = preview?.pools.weekend;

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
              <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="min-h-[44px] h-9 md:h-11 rounded-lg md:rounded-xl px-2 md:px-3 text-xs md:text-sm font-black bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none [color-scheme:dark]"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="min-h-[44px] h-9 md:h-11 rounded-lg md:rounded-xl px-2 md:px-3 text-xs md:text-sm font-black bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none [color-scheme:dark]"
                />
                <button
                  onClick={fetchPreview}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center text-white shrink-0 min-h-[44px]"
                >
                  <RefreshCw size={16} strokeWidth={3} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-2.5 md:p-6 space-y-3 md:space-y-4">
            {/* Fila 1: etiquetas de contenido */}
            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="text-center py-1 md:py-2">
                <p className="text-[10px] md:text-[13px] font-black text-zinc-600 uppercase tracking-widest">
                  Lun – Vie
                </p>
              </div>
              <div className="text-center py-1 md:py-2">
                <p className="text-[10px] md:text-[13px] font-black text-zinc-600 uppercase tracking-widest">
                  Sáb – Dom
                </p>
              </div>
            </div>

            {/* Fila 2: tarjetas verdes con total y botón + */}
            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="bg-emerald-600 rounded-xl md:rounded-2xl shadow-sm p-2.5 md:p-4 flex items-center justify-between gap-2 min-h-[48px]">
                <div className="min-w-0 text-white">
                  <span className="text-base md:text-2xl font-black tabular-nums">
                    {weekdayPool ? fmtZeroBlank(weekdayPool.cashTotal, 2) : ' '}
                  </span>
                  <span className="text-[10px] md:text-sm font-black opacity-90 ml-0.5 md:ml-1">€</span>
                </div>
                <button
                  onClick={() => openCash('weekday')}
                  className="min-h-[48px] min-w-[48px] rounded-xl md:rounded-2xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0 active:scale-95 transition-all"
                  title="Introducir cantidades"
                >
                  <Plus size={24} strokeWidth={3} />
                </button>
              </div>
              <div className="bg-emerald-600 rounded-xl md:rounded-2xl shadow-sm p-2.5 md:p-4 flex items-center justify-between gap-2 min-h-[48px]">
                <div className="min-w-0 text-white">
                  <span className="text-base md:text-2xl font-black tabular-nums">
                    {weekendPool ? fmtZeroBlank(weekendPool.cashTotal, 2) : ' '}
                  </span>
                  <span className="text-[10px] md:text-sm font-black opacity-90 ml-0.5 md:ml-1">€</span>
                </div>
                <button
                  onClick={() => openCash('weekend')}
                  className="min-h-[48px] min-w-[48px] rounded-xl md:rounded-2xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0 active:scale-95 transition-all"
                  title="Introducir cantidades"
                >
                  <Plus size={24} strokeWidth={3} />
                </button>
              </div>
            </div>

            {/* Tabla sin bordes interiores, cabecera petroleo, subcabecera H/€/T */}
            <div className="bg-white rounded-xl md:rounded-3xl shadow-sm overflow-hidden">
              {loading && (
                <div className="px-4 py-2 flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                  <RefreshCw className="animate-spin shrink-0" size={12} strokeWidth={3} />
                  Calculando…
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 border-collapse">
                  <thead>
                    <tr className="bg-[#36606F] text-white">
                      <th className="text-left px-3 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest w-[20%] min-w-0">
                        Staff
                      </th>
                      <th colSpan={3} className="text-center px-1 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest">
                        Lun – Vie
                      </th>
                      <th colSpan={3} className="text-center px-1 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest">
                        Sáb – Dom
                      </th>
                      <th className="text-right px-3 md:px-4 py-2 md:py-3 text-[9px] md:text-[11px] font-black uppercase tracking-widest w-[12%]">
                        Total
                      </th>
                    </tr>
                    <tr className="bg-[#36606F]/90 text-white/90">
                      <th className="text-left px-3 md:px-4 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest" />
                      <th className="text-center px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">H</th>
                      <th className="text-center px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">€</th>
                      <th className="text-center px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">T</th>
                      <th className="text-center px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">H</th>
                      <th className="text-center px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">€</th>
                      <th className="text-center px-1 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest w-[8%]">T</th>
                      <th className="text-right px-3 md:px-4 py-1.5 md:py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest" />
                    </tr>
                  </thead>
                  <tbody>
                    {!preview || preview.staff.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-zinc-400 font-bold text-sm">
                          {loading ? ' ' : 'Sin datos'}
                        </td>
                      </tr>
                    ) : (
                      preview.staff.map((s) => (
                        <tr key={s.id} className="hover:bg-zinc-50/60 transition-colors">
                          <td className="px-3 md:px-4 py-2 md:py-3">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="min-w-0">
                                <div className="text-[11px] md:text-[13px] font-black text-zinc-900 truncate">
                                  {s.name}
                                  {s.hasOverrides && (
                                    <span className="ml-1 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-orange-500">
                                      OVERRIDE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[8px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                  {s.role}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() =>
                                    setOverrideModal({
                                      open: true,
                                      poolType: 'weekday',
                                      staffId: s.id,
                                      staffName: s.name,
                                    })
                                  }
                                  className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center active:scale-95 transition-all"
                                  title="Editar Lun–Vie"
                                >
                                  <Edit3 size={14} strokeWidth={3} />
                                </button>
                                <button
                                  onClick={() =>
                                    setOverrideModal({
                                      open: true,
                                      poolType: 'weekend',
                                      staffId: s.id,
                                      staffName: s.name,
                                    })
                                  }
                                  className="min-h-[44px] min-w-[44px] rounded-xl bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center active:scale-95 transition-all"
                                  title="Editar Sáb–Dom"
                                >
                                  <Edit3 size={14} strokeWidth={3} />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-[11px] md:text-[12px] font-black tabular-nums text-[#36606F]">
                            {fmtHours(s.weekdayHours)}
                          </td>
                          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-[11px] md:text-[12px] font-black tabular-nums text-emerald-600">
                            {fmtZeroBlank(s.weekdayAmount, 2)}
                          </td>
                          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-[11px] md:text-[12px] font-black tabular-nums text-zinc-700">
                            {fmtZeroBlank(s.weekdayAmount, 2)}
                          </td>
                          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-[11px] md:text-[12px] font-black tabular-nums text-[#36606F]">
                            {fmtHours(s.weekendHours)}
                          </td>
                          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-[11px] md:text-[12px] font-black tabular-nums text-orange-600">
                            {fmtZeroBlank(s.weekendAmount, 2)}
                          </td>
                          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-[11px] md:text-[12px] font-black tabular-nums text-zinc-700">
                            {fmtZeroBlank(s.weekendAmount, 2)}
                          </td>
                          <td className="px-3 md:px-4 py-2 md:py-3 text-right text-[12px] md:text-[13px] font-black tabular-nums text-zinc-900">
                            {fmtMoney(s.totalAmount)}
                          </td>
                        </tr>
                      ))
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
            />
          </div>
        </div>
      )}

      {overrideModal?.open && (
        <TipOverrideModal
          isOpen={overrideModal.open}
          onClose={() => setOverrideModal(null)}
          employeeName={overrideModal.staffName}
          poolType={overrideModal.poolType}
          onSave={handleSaveOverride}
          initial={{
            overrideHours: null,
            overrideAmount: null,
            notes: '',
          }}
        />
      )}
    </div>
  );
}

