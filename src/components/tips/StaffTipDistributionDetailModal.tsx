'use client';

import type { StaffTipHistoryEntry } from '@/lib/tip-distribution-display';
import { StaffTipRepartoPanel } from '@/components/tips/StaffTipRepartoPanel';
import { StaffTipModalShell } from '@/components/tips/StaffTipModalShell';

export function StaffTipDistributionDetailModal({
  entry,
  onClose,
}: {
  entry: StaffTipHistoryEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;

  return (
    <StaffTipModalShell
      title="Reparto"
      onClose={onClose}
      layer="base"
      instance="staff-tip-distribution-detail"
      usageId="staff-tip-distribution-detail"
      usageLabel="Detalle reparto propinas"
    >
      <StaffTipRepartoPanel entry={entry} breakdownLayer="derived" />
    </StaffTipModalShell>
  );
}
