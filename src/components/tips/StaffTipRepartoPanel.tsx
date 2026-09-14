'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatLocalIsoDateLabel,
  formatRoundedTipMoney,
  formatTipInt,
  formatTipMoney,
  formatTipPct,
  tjiColorClass,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';
import {
  formatTipAdjustmentValue,
  getStaffTipAdjustmentKind,
  getTipAdjustmentLabel,
  staffEntryHoursTotal,
  staffEntryPropinaSinPen,
  tipAdjustmentValueClass,
} from '@/lib/staff-tip-entry-display';
import type { ModalLayer } from '@/components/ui/modal';
import { SanctionedTipMoney } from '@/components/tips/SanctionedTipMoney';
import { StaffTipDetailVerButton } from '@/components/tips/StaffTipDetailVerButton';
import { StaffTipBreakdownModal } from '@/components/tips/StaffTipBreakdownModal';
import { StaffTipModalColumnGrid } from '@/components/tips/StaffTipModalColumnGrid';

const fmtHours = (val: number) =>
  Math.abs(val) < 0.005 ? ' ' : val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);

const METRIC_VALUE_SLOT = 'flex h-9 w-full min-w-0 shrink-0 items-center justify-center px-0.5';
const METRIC_LABEL_TEXT =
  'max-w-full truncate whitespace-nowrap text-[9px] font-bold uppercase leading-none tracking-wide text-zinc-500 sm:text-[10px]';
const METRIC_VALUE_DESCRIPTIVE =
  'max-w-full truncate whitespace-nowrap px-0.5 text-center text-[8px] font-medium leading-none text-zinc-400 sm:text-[9px]';
const METRIC_LABEL_SLOT =
  'flex min-h-[2.5rem] w-full min-w-0 shrink-0 items-start justify-center pt-0.5';
const METRICS_GRID = 'mt-3 grid w-full grid-cols-4 gap-x-1 gap-y-0';

type DetailKind = 'hours' | 'propina' | 'penalizacion' | null;

function MetricCell({
  label,
  value,
  valueClassName,
  valueTypography = 'metric',
  detailInstance,
  onOpenDetail,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  /** Texto secundario (p. ej. «Sin penalización») en lugar de cifra principal. */
  valueTypography?: 'metric' | 'descriptive';
  detailInstance?: string;
  onOpenDetail?: () => void;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col items-center px-0 py-1">
      <div className={METRIC_VALUE_SLOT}>
        <span
          className={cn(
            valueTypography === 'descriptive'
              ? METRIC_VALUE_DESCRIPTIVE
              : 'max-w-full truncate whitespace-nowrap text-sm font-black tabular-nums leading-none',
            valueClassName,
          )}
        >
          {value}
        </span>
      </div>
      <div className={METRIC_LABEL_SLOT}>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className={METRIC_LABEL_TEXT}>{label}</span>
          {onOpenDetail && detailInstance ? (
            <StaffTipDetailVerButton instance={detailInstance} onClick={onOpenDetail} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function StaffTipRepartoPanel({
  entry,
  breakdownLayer = 'base',
  breakdownParentInstance,
}: {
  entry: StaffTipHistoryEntry;
  /** Layer del desglose: `base` en página; `derived` encima del detalle (ADR-0007). */
  breakdownLayer?: ModalLayer;
  breakdownParentInstance?: string;
}) {
  const [detail, setDetail] = useState<DetailKind>(null);

  const periodLabel = `${formatLocalIsoDateLabel(entry.periodStart, 'd MMM')} – ${formatLocalIsoDateLabel(entry.periodEnd, 'd MMM yyyy')}`;
  const sinPen = staffEntryPropinaSinPen(entry);
  const hTotal = staffEntryHoursTotal(entry);
  const pen = entry.penalizacionPct ?? 0;
  const finalAmount = entry.totalAmount ?? 0;

  const adjustmentKind = useMemo(
    () => getStaffTipAdjustmentKind(entry, sinPen.total, finalAmount),
    [entry, sinPen.total, finalAmount]
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

      <div className={METRICS_GRID}>
        <MetricCell
          label="Horas"
          value={fmtHours(hTotal)}
          detailInstance="staff-tip-reparto-ver-horas"
          onOpenDetail={() => setDetail('hours')}
        />
        <MetricCell
          label="Propina"
          value={formatTipMoney(sinPen.total)}
          valueClassName="text-zinc-900"
          detailInstance="staff-tip-reparto-ver-propina"
          onOpenDetail={() => setDetail('propina')}
        />
        <MetricCell
          label={adjustmentLabel}
          value={adjustmentValue}
          valueTypography={adjustmentKind === 'ninguna' ? 'descriptive' : 'metric'}
          valueClassName={adjustmentKind === 'ninguna' ? undefined : adjustmentValueClass}
          detailInstance="staff-tip-reparto-ver-ajuste"
          onOpenDetail={() => setDetail('penalizacion')}
        />
        <MetricCell
          label="Propina final"
          value={
            entry.isSanctioned ? (
              <SanctionedTipMoney
                amount={entry.totalAmount}
                isSanctioned={entry.isSanctioned}
                className="text-sm font-black text-emerald-600"
                formatFn={formatTipMoney}
              />
            ) : (
              formatRoundedTipMoney(finalAmount)
            )
          }
          valueClassName={entry.isSanctioned ? undefined : 'text-emerald-600'}
        />
      </div>

      {detail === 'hours' ? (
        <StaffTipBreakdownModal
          title="Horas trabajadas"
          onClose={() => setDetail(null)}
          layer={breakdownLayer}
          parentInstance={breakdownParentInstance}
        >
          <StaffTipModalColumnGrid
            columns={[
              { label: 'Lun – Vie', value: fmtHours(entry.weekdayHours) },
              { label: 'Sáb – Dom', value: fmtHours(entry.weekendHours) },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}

      {detail === 'propina' ? (
        <StaffTipBreakdownModal title="Propina" onClose={() => setDetail(null)} layer={breakdownLayer} parentInstance={breakdownParentInstance}>
          <StaffTipModalColumnGrid
            columns={[
              {
                label: 'Lun – Vie',
                value: formatTipMoney(sinPen.weekday),
                valueClassName: 'text-zinc-900',
              },
              {
                label: 'Sáb – Dom',
                value: formatTipMoney(sinPen.weekend),
                valueClassName: 'text-zinc-900',
              },
            ]}
          />
        </StaffTipBreakdownModal>
      ) : null}

      {detail === 'penalizacion' ? (
        <StaffTipBreakdownModal
          title={adjustmentLabel}
          onClose={() => setDetail(null)}
          layer={breakdownLayer}
          parentInstance={breakdownParentInstance}
        >
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
