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
      titleId="tip-distribution-detail-title"
      onClose={onClose}
    >
      <StaffTipRepartoPanel entry={entry} />
    </StaffTipModalShell>
  );
}
