'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  formatLocalIsoDateLabel,
  formatTipLossPct,
  tipLossColorClass,
  tipLossPctFromAmounts,
  type StaffTipHistoryEntry,
  type TipDistributionHistoryRow,
} from '@/lib/tip-distribution-display';
import { staffEntryTheoreticalPayout } from '@/lib/staff-tip-entry-display';

type DistributionLine = {
  id: string;
  distribution_id: string;
  user_id: string;
  weekday_hours: number;
  weekend_hours: number;
  jornadas_totales: number;
  jornadas_con_olvido: number;
  tji_pct: number;
  penalizacion_pct: number;
  weekday_hours_effective: number;
  weekend_hours_effective: number;
  weekday_amount: number;
  weekend_amount: number;
  total_amount: number;
  weekday_bonus: number;
  weekend_bonus: number;
  is_sanctioned: boolean;
};

type ProfileName = { id: string; first_name: string | null; last_name: string | null };

const fmtMoney = (val: number) => (Math.abs(val) < 0.005 ? ' ' : `${Number(val).toFixed(2)}€`);

function distributionLineLoss(l: DistributionLine): { lossPct: number; label: string } {
  const entry = {
    weekdayAmount: Number(l.weekday_amount),
    weekendAmount: Number(l.weekend_amount),
    weekdayHours: Number(l.weekday_hours),
    weekendHours: Number(l.weekend_hours),
    weekdayHoursEffective: Number(l.weekday_hours_effective),
    weekendHoursEffective: Number(l.weekend_hours_effective),
    penalizacionPct: Number(l.penalizacion_pct),
    totalAmount: Number(l.total_amount),
    isSanctioned: l.is_sanctioned,
    jornadasTotales: Number(l.jornadas_totales),
    jornadasConOlvido: Number(l.jornadas_con_olvido),
    tjiPct: Number(l.tji_pct),
    weekdayBonus: Number(l.weekday_bonus),
    weekendBonus: Number(l.weekend_bonus),
  } as StaffTipHistoryEntry;
  const theoretical = staffEntryTheoreticalPayout(entry);
  const finalPaid = l.is_sanctioned ? 0 : Number(l.total_amount);
  let lossPct = tipLossPctFromAmounts(theoretical, finalPaid);
  let label = formatTipLossPct(theoretical, finalPaid);
  if (
    l.is_sanctioned &&
    label === ' ' &&
    Number(l.weekday_hours_effective) + Number(l.weekend_hours_effective) > 0.005
  ) {
    lossPct = 100;
    label = '100%';
  }
  return { lossPct, label };
}

type Props = {
  refreshToken?: number;
};

export function TipDistributionHistorySection({ refreshToken = 0 }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [histories, setHistories] = useState<TipDistributionHistoryRow[]>([]);
  const [linesByDistribution, setLinesByDistribution] = useState<Record<string, DistributionLine[]>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadHistories = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tip_distribution_history')
        .select('id, period_start, period_end, weekday_total, weekend_total, confirmed_at, notes')
        .order('confirmed_at', { ascending: false })
        .limit(40);

      if (error) throw error;
      setHistories((data ?? []) as TipDistributionHistoryRow[]);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar historial de repartos.');
      setHistories([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (open) void loadHistories();
  }, [open, loadHistories, refreshToken]);

  const loadLines = useCallback(
    async (distributionId: string) => {
      if (linesByDistribution[distributionId]) return;

      try {
        const { data: lines, error: linesError } = await supabase
          .from('tip_distribution_lines')
          .select('*')
          .eq('distribution_id', distributionId)
          .order('total_amount', { ascending: false });

        if (linesError) throw linesError;

        const rows = (lines ?? []) as DistributionLine[];
        const userIds = [...new Set(rows.map((l) => l.user_id))];

        let names: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles, error: profError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);

          if (profError) throw profError;

          names = Object.fromEntries(
            ((profiles ?? []) as ProfileName[]).map((p) => [
              p.id,
              `${(p.first_name ?? '').trim()} ${(p.last_name ?? '').trim()}`.trim() || '—',
            ])
          );
        }

        setLinesByDistribution((prev) => ({ ...prev, [distributionId]: rows }));
        setNameByUserId((prev) => ({ ...prev, ...names }));
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar detalle del reparto.');
      }
    },
    [supabase, linesByDistribution]
  );

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    void loadLines(id);
  };

  const countLabel = useMemo(() => {
    if (histories.length === 0) return 'Sin repartos confirmados';
    return `${histories.length} reparto${histories.length === 1 ? '' : 's'}`;
  }, [histories.length]);

  return (
    <div className="bg-white rounded-xl md:rounded-3xl shadow-sm overflow-hidden border border-zinc-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 md:py-4 min-h-[48px] text-left hover:bg-zinc-50/80 transition-colors"
      >
        <div>
          <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-[#36606F]">
            Historial de repartos
          </p>
          <p className="text-[11px] text-zinc-500 font-bold mt-0.5">{countLabel}</p>
        </div>
        <ChevronDown
          className={cn('w-5 h-5 text-zinc-400 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-2 pb-3 md:px-4 md:pb-4">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-zinc-400 text-[10px] font-black uppercase">
              <RefreshCw className="animate-spin" size={14} />
              Cargando…
            </div>
          )}

          {!loading && histories.length === 0 && (
            <p className="py-6 text-center text-zinc-400 font-bold text-sm">Aún no hay repartos confirmados</p>
          )}

          <ul className="space-y-2">
            {histories.map((h) => {
              const isExpanded = expandedId === h.id;
              const lines = linesByDistribution[h.id] ?? [];
              return (
                <li key={h.id} className="rounded-xl border border-zinc-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(h.id)}
                    className="w-full text-left px-3 py-3 min-h-[48px] hover:bg-zinc-50 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-zinc-800">
                        {format(new Date(h.confirmed_at), 'd MMM yyyy HH:mm', { locale: es })}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-bold mt-0.5">
                        {formatLocalIsoDateLabel(h.period_start, 'd MMM')} →{' '}
                        {formatLocalIsoDateLabel(h.period_end, 'd MMM yyyy')}
                      </p>
                      <p className="text-[10px] text-zinc-600 font-bold mt-1 tabular-nums">
                        LV {Number(h.weekday_total).toFixed(2)}€ · SD {Number(h.weekend_total).toFixed(2)}€
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-zinc-400 shrink-0 mt-1 transition-transform',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-zinc-100 bg-zinc-50/50 overflow-x-auto">
                      {lines.length === 0 ? (
                        <p className="px-3 py-4 text-[11px] text-zinc-400 font-bold">Cargando detalle…</p>
                      ) : (
                        <table className="w-full min-w-[520px] text-[10px] border-collapse">
                          <thead>
                            <tr className="text-zinc-500 font-black uppercase tracking-wider">
                              <th className="text-left px-2 py-2">Staff</th>
                              <th
                                className="text-center px-1"
                                title="% menos respecto a la propina sin penalización"
                              >
                                PEN
                              </th>
                              <th className="text-right px-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l) => {
                              const loss = distributionLineLoss(l);
                              return (
                              <tr key={l.id} className="border-t border-zinc-100/80">
                                <td className="px-2 py-2 font-black text-zinc-800 truncate max-w-[120px]">
                                  {(nameByUserId[l.user_id] ?? '—').split(/\s+/)[0]}
                                  {l.is_sanctioned ? (
                                    <span className="text-rose-500 ml-1">SIN</span>
                                  ) : null}
                                </td>
                                <td
                                  className={cn(
                                    'text-center px-1 py-2 tabular-nums',
                                    tipLossColorClass(loss.lossPct)
                                  )}
                                >
                                  {loss.label === ' ' ? '—' : loss.label}
                                </td>
                                <td className="text-right px-2 py-2 font-black tabular-nums text-emerald-700">
                                  {fmtMoney(Number(l.total_amount))}
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
