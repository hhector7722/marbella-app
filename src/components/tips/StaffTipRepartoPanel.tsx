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

function MetricCell({
  label,
  value,
  valueClassName,
  onOpenDetail,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  onOpenDetail?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          'w-full text-center text-sm font-black tabular-nums leading-tight',
          valueClassName
        )}
      >
        {value}
      </span>
      <span className="w-full text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-zinc-500 sm:text-[9px]">
        {label}
      </span>
      {onOpenDetail ? (
        <ChevronRight
          size={14}
          strokeWidth={2.5}
          className="mt-0.5 shrink-0 text-[#36606F]/60"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (onOpenDetail) {
    return (
      <button
        type="button"
        onClick={onOpenDetail}
        className="flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 transition-colors hover:bg-zinc-50/80 active:scale-[0.98]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2">
      {content}
    </div>
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
      <p className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        Período
      </p>
      <p className="mt-0.5 text-center text-sm font-black leading-snug text-zinc-900">
        {periodLabel}
      </p>

      {entry.isSanctioned ? (
        <div
          className="mt-3 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-800"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Sin propina en este período (sanción)</span>
        </div>
      ) : null}

      <div className="mt-3 flex items-stretch divide-x divide-zinc-100 rounded-xl border border-zinc-100 bg-zinc-50/30">
        <MetricCell
          label="Horas"
          value={fmtHours(hTotal)}
          onOpenDetail={() => setDetail('hours')}
        />
        <MetricCell
          label="Propina"
          value={formatTipMoney(sinPen.total)}
          valueClassName="text-[#36606F]"
          onOpenDetail={() => setDetail('propina')}
        />
        <MetricCell
          label={
            <>
              <span className="block">Penalización</span>
              <span className="block">/ bonificación</span>
            </>
          }
          value={fmtPen(pen)}
          valueClassName={penalizacionColorClass(pen)}
          onOpenDetail={() => setDetail('penalizacion')}
        />
        <div className="flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2">
          <SanctionedTipMoney
            amount={entry.totalAmount}
            isSanctioned={entry.isSanctioned}
            className="w-full text-center text-sm font-black text-emerald-600"
            formatFn={formatTipMoney}
          />
          <span className="w-full text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-zinc-500">
            <span className="block">Propina</span>
            <span className="block">final</span>
          </span>
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
        <StaffTipBreakdownModal
          title="Penalización / bonificación"
          onClose={() => setDetail(null)}
        >
          <p className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-400">
            Jornadas con fichaje «no registrada»
          </p>
          <p
            className={cn(
              'mt-2 text-center text-2xl font-black tabular-nums',
              tjiColorClass(entry.tjiPct)
            )}
          >
            {formatTipInt(entry.jornadasConOlvido)}
          </p>
          <p className="mt-1.5 text-center text-xs font-medium text-zinc-500">
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
