'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatEffectiveHours,
  formatLocalIsoDateLabel,
  formatPenalizacionPct,
  formatTipInt,
  formatTipMoney,
  formatTipPct,
  tjiColorClass,
} from '@/lib/tip-distribution-display';
import type { StaffTipHistoryEntry } from '@/lib/tip-distribution-display';

type StaffTipDistributionDetailModalProps = {
  entry: StaffTipHistoryEntry | null;
  onClose: () => void;
};

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className={cn('text-sm font-black tabular-nums text-zinc-800', valueClassName)}>{value}</dd>
    </div>
  );
}

export function StaffTipDistributionDetailModal({
  entry,
  onClose,
}: StaffTipDistributionDetailModalProps) {
  if (!entry) return null;

  const periodLabel = `${formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} – ${formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}`;
  const confirmedLabel = formatLocalIsoDateLabel(
    entry.confirmedAt.slice(0, 10),
    'd MMM yyyy'
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-200 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tip-distribution-detail-title"
      >
        <div className="flex shrink-0 items-center justify-between bg-[#36606F] px-4 py-4 text-white">
          <div className="min-w-0">
            <h2
              id="tip-distribution-detail-title"
              className="text-sm font-black uppercase tracking-wide"
            >
              Reparto confirmado
            </h2>
            <p className="mt-0.5 truncate text-xs font-medium text-white/80">{periodLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-all hover:bg-white/20 active:scale-95"
            aria-label="Cerrar"
          >
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {entry.isSanctioned ? (
            <div
              className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
              role="alert"
            >
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>Sin propina en este período (sanción)</span>
            </div>
          ) : null}

          <dl className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3">
            <DetailRow label="Confirmado" value={confirmedLabel} />
            <DetailRow
              label="Total"
              value={formatTipMoney(entry.totalAmount)}
              valueClassName="text-[#36606F]"
            />
            <DetailRow label="Lun–Vie" value={formatTipMoney(entry.weekdayAmount)} />
            <DetailRow label="Fin de semana" value={formatTipMoney(entry.weekendAmount)} />
            {Math.abs(entry.weekdayBonus) > 0.005 ? (
              <DetailRow label="Bonus L–V" value={formatTipMoney(entry.weekdayBonus)} />
            ) : null}
            {Math.abs(entry.weekendBonus) > 0.005 ? (
              <DetailRow label="Bonus finde" value={formatTipMoney(entry.weekendBonus)} />
            ) : null}
          </dl>

          <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wide text-zinc-500">
            Horas del período
          </h3>
          <dl className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3">
            <DetailRow
              label="Horas L–V"
              value={formatEffectiveHours(entry.weekdayHours, 0)}
            />
            <DetailRow
              label="Horas finde"
              value={formatEffectiveHours(0, entry.weekendHours)}
            />
            <DetailRow
              label="Horas efectivas L–V"
              value={formatEffectiveHours(entry.weekdayHoursEffective, 0)}
            />
            <DetailRow
              label="Horas efectivas finde"
              value={formatEffectiveHours(0, entry.weekendHoursEffective)}
            />
          </dl>

          <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wide text-zinc-500">
            Penalización por olvidos (TJI)
          </h3>
          <dl className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3">
            <DetailRow label="Jornadas" value={formatTipInt(entry.jornadasTotales)} />
            <DetailRow label="Olvidos" value={formatTipInt(entry.jornadasConOlvido)} />
            <DetailRow
              label="TJI"
              value={formatTipPct(entry.tjiPct)}
              valueClassName={tjiColorClass(entry.tjiPct)}
            />
            <DetailRow
              label="Penalización"
              value={formatPenalizacionPct(entry.penalizacionPct)}
              valueClassName={entry.penalizacionPct > 0 ? 'text-rose-600' : undefined}
            />
          </dl>
        </div>
      </div>
    </div>
  );
}
