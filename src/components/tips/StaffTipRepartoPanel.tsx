'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatLocalIsoDateLabel,
  formatTipInt,
  formatTipMoney,
  formatTipPct,
  tjiColorClass,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';
import {
  formatTipAdjustmentValue,
  getTipAdjustmentKind,
  getTipAdjustmentLabel,
  staffEntryHoursTotal,
  staffEntryPropinaSinPen,
  tipAdjustmentValueClass,
} from '@/lib/staff-tip-entry-display';
import { SanctionedTipMoney } from '@/components/tips/SanctionedTipMoney';
import { StaffTipDetailHintIcon } from '@/components/tips/StaffTipDetailHintIcon';
import { StaffTipBreakdownModal } from '@/components/tips/StaffTipBreakdownModal';
import { StaffTipModalColumnGrid } from '@/components/tips/StaffTipModalColumnGrid';

const fmtHours = (val: number) =>
  Math.abs(val) < 0.005 ? ' ' : val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);

const METRIC_VALUE_SLOT = 'flex h-8 w-full shrink-0 items-center justify-center';
const METRIC_LABEL_TEXT =
  'text-[8px] font-bold uppercase leading-tight tracking-wide text-zinc-500 sm:text-[9px]';
const METRIC_LABEL_SLOT =
  'flex min-h-[2.75rem] w-full shrink-0 items-start justify-center pt-0.5';

type DetailKind = 'hours' | 'propina' | 'penalizacion' | null;

function MetricCell({
  label,
  value,
  valueClassName,
  onOpenDetail,
  detailHintAlignPlusToLens = false,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  onOpenDetail?: () => void;
  detailHintAlignPlusToLens?: boolean;
}) {
  const body = (
    <>
      <div className={METRIC_VALUE_SLOT}>
        <span className={cn('text-sm font-black tabular-nums leading-tight', valueClassName)}>
          {value}
        </span>
      </div>
      <div className={METRIC_LABEL_SLOT}>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className={METRIC_LABEL_TEXT}>{label}</span>
          {onOpenDetail ? (
            <StaffTipDetailHintIcon alignPlusToLens={detailHintAlignPlusToLens} />
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden />
          )}
        </div>
      </div>
    </>
  );

  if (onOpenDetail) {
    return (
      <button
        type="button"
        onClick={onOpenDetail}
        className="flex min-w-0 flex-1 flex-col items-center px-0.5 py-1 transition-opacity active:opacity-70"
      >
        {body}
      </button>
    );
  }

  return <div className="flex min-w-0 flex-1 flex-col items-center px-0.5 py-1">{body}</div>;
}

export function StaffTipRepartoPanel({ entry }: { entry: StaffTipHistoryEntry }) {
  const [detail, setDetail] = useState<DetailKind>(null);

  const periodLabel = `${formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} – ${formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}`;
  const sinPen = staffEntryPropinaSinPen(entry);
  const hTotal = staffEntryHoursTotal(entry);
  const pen = entry.penalizacionPct ?? 0;
  const finalAmount = entry.totalAmount ?? 0;

  const adjustmentKind = useMemo(
    () => getTipAdjustmentKind(sinPen.total, finalAmount),
    [sinPen.total, finalAmount]
  );
  const adjustmentLabel = getTipAdjustmentLabel(adjustmentKind);
  const adjustmentValue = formatTipAdjustmentValue(adjustmentKind, pen, sinPen.total, finalAmount);
  const adjustmentValueClass = tipAdjustmentValueClass(adjustmentKind, pen);

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

      <div className="mt-3 flex items-start gap-0.5">
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
          label={adjustmentLabel}
          value={adjustmentValue}
          valueClassName={adjustmentValueClass}
          onOpenDetail={() => setDetail('penalizacion')}
          detailHintAlignPlusToLens
        />
        <MetricCell
          label="Propina final"
          value={
            <SanctionedTipMoney
              amount={entry.totalAmount}
              isSanctioned={entry.isSanctioned}
              className="text-sm font-black text-emerald-600"
              formatFn={formatTipMoney}
            />
          }
        />
      </div>

      {detail === 'hours' ? (
        <StaffTipBreakdownModal title="Horas trabajadas" onClose={() => setDetail(null)}>
          <StaffTipModalColumnGrid
            columns={[
              { label: 'Lun – Vie', value: fmtHours(entry.weekdayHours) },
              { label: 'Sáb – Dom', value: fmtHours(entry.weekendHours) },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}

      {detail === 'propina' ? (
        <StaffTipBreakdownModal title="Propina" onClose={() => setDetail(null)}>
          <StaffTipModalColumnGrid
            columns={[
              {
                label: 'Lun – Vie',
                value: formatTipMoney(sinPen.weekday),
                valueClassName: 'text-[#36606F]',
              },
              {
                label: 'Sáb – Dom',
                value: formatTipMoney(sinPen.weekend),
                valueClassName: 'text-[#36606F]',
              },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}

      {detail === 'penalizacion' ? (
        <StaffTipBreakdownModal title={adjustmentLabel} onClose={() => setDetail(null)}>
          <StaffTipModalColumnGrid
            columns={[
              {
                label: 'Días trabajados',
                value: formatTipInt(entry.jornadasTotales),
              },
              {
                label: 'Días sin fichar',
                value: formatTipInt(entry.jornadasConOlvido),
                valueClassName: tjiColorClass(entry.tjiPct),
              },
              {
                label: 'Tasa de error',
                value: formatTipPct(entry.tjiPct),
                valueClassName: tjiColorClass(entry.tjiPct),
              },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}
    </>
  );
}
