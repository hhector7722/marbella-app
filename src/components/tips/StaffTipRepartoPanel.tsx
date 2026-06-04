'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatLocalIsoDateLabel,
  formatTipInt,
  formatTipMoney,
  formatTipPct,
  penalizacionColorClass,
  tjiColorClass,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';
import {
  staffEntryHoursTotal,
  staffEntryPropinaSinPen,
} from '@/lib/staff-tip-entry-display';
import { SanctionedTipMoney } from '@/components/tips/SanctionedTipMoney';
import { StaffTipBreakdownModal, StaffTipBreakdownRows } from '@/components/tips/StaffTipBreakdownModal';

const fmtHours = (val: number) =>
  Math.abs(val) < 0.005 ? ' ' : val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);

const fmtPen = (pen: number) => (pen > 0 ? `${pen}%` : ' ');

type DetailKind = 'hours' | 'propina' | 'penalizacion' | null;

function SummaryRow({
  label,
  value,
  valueClassName,
  onOpenDetail,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  onOpenDetail: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-zinc-100 py-3 text-left transition-colors last:border-0 hover:bg-zinc-50/80 active:scale-[0.99]"
    >
      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={cn('text-sm font-black tabular-nums', valueClassName)}>{value}</span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-[#36606F]">
          <ChevronRight size={18} strokeWidth={2.5} aria-hidden />
        </span>
      </span>
    </button>
  );
}

export function StaffTipRepartoPanel({ entry }: { entry: StaffTipHistoryEntry }) {
  const [detail, setDetail] = useState<DetailKind>(null);

  const periodLabel = `${formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} – ${formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}`;
  const sinPen = staffEntryPropinaSinPen(entry);
  const hTotal = staffEntryHoursTotal(entry);
  const pen = entry.penalizacionPct ?? 0;

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Período</p>
      <p className="mt-1 text-base font-black text-zinc-900">{periodLabel}</p>

      {entry.isSanctioned ? (
        <div
          className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>Sin propina en este período (sanción)</span>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/30 px-3">
        <SummaryRow
          label="Horas"
          value={fmtHours(hTotal)}
          onOpenDetail={() => setDetail('hours')}
        />
        <SummaryRow
          label="Propina"
          value={formatTipMoney(sinPen.total)}
          valueClassName="text-[#36606F]"
          onOpenDetail={() => setDetail('propina')}
        />
        <SummaryRow
          label="Penalización"
          value={fmtPen(pen)}
          valueClassName={penalizacionColorClass(pen)}
          onOpenDetail={() => setDetail('penalizacion')}
        />
        <div className="flex min-h-12 items-center justify-between gap-3 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Propina final
          </span>
          <SanctionedTipMoney
            amount={entry.totalAmount}
            isSanctioned={entry.isSanctioned}
            className="text-sm font-black text-emerald-600"
            formatFn={formatTipMoney}
          />
        </div>
      </div>

      {detail === 'hours' ? (
        <StaffTipBreakdownModal title="Horas trabajadas" onClose={() => setDetail(null)}>
          <StaffTipBreakdownRows
            rows={[
              { label: 'Lun – Vie', value: fmtHours(entry.weekdayHours) },
              { label: 'Sáb – Dom', value: fmtHours(entry.weekendHours) },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}

      {detail === 'propina' ? (
        <StaffTipBreakdownModal title="Propina sin penalización" onClose={() => setDetail(null)}>
          <StaffTipBreakdownRows
            rows={[
              { label: 'Lun – Vie', value: formatTipMoney(sinPen.weekday) },
              { label: 'Sáb – Dom', value: formatTipMoney(sinPen.weekend) },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}

      {detail === 'penalizacion' ? (
        <StaffTipBreakdownModal title="Penalización" onClose={() => setDetail(null)}>
          <p className="text-center text-xs font-bold uppercase tracking-wide text-zinc-400">
            Jornadas con fichaje «no registrada»
          </p>
          <p
            className={cn(
              'mt-3 text-center text-3xl font-black tabular-nums',
              tjiColorClass(entry.tjiPct)
            )}
          >
            {formatTipInt(entry.jornadasConOlvido)}
          </p>
          <p className="mt-2 text-center text-sm font-medium text-zinc-500">
            de {formatTipInt(entry.jornadasTotales)} jornadas (
            <span className={cn('font-bold', tjiColorClass(entry.tjiPct))}>
              {formatTipPct(entry.tjiPct)}
            </span>
            )
          </p>
        </StaffTipBreakdownModal>
      ) : null}
    </>
  );
}
