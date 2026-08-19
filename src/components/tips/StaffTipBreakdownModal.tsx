'use client';

import type { ReactNode } from 'react';
import type { ModalLayer } from '@/components/ui/modal';
import { StaffTipModalShell } from '@/components/tips/StaffTipModalShell';

export function StaffTipBreakdownModal({
  title,
  onClose,
  children,
  layer = 'base',
  parentInstance,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `base` si abre desde la página; `derived` si abre encima de otro Modal. */
  layer?: ModalLayer;
  parentInstance?: string;
}) {
  return (
    <StaffTipModalShell
      title={title}
      onClose={onClose}
      layer={layer}
      instance="staff-tip-breakdown"
      parentInstance={parentInstance}
      usageId="staff-tip-breakdown"
      usageLabel="Desglose propina"
    >
      {children}
    </StaffTipModalShell>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{label}</span>
      <span className="text-sm font-black tabular-nums text-zinc-800">{value}</span>
    </div>
  );
}

export function StaffTipBreakdownRows({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <BreakdownRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}
