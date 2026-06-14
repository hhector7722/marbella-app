'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trackUsageModalDwell, trackUsageModalOpen } from '@/lib/usage/client';

export type ModalUsageTrackingOptions = {
  open: boolean;
  usageId: string;
  usageLabel: string;
  disabled?: boolean;
};

/** Registra apertura y tiempo en modal (para UIs custom que no usan `<Modal />`). */
export function useModalUsageTracking({
  open,
  usageId,
  usageLabel,
  disabled = false,
}: ModalUsageTrackingOptions): void {
  const pathname = usePathname();
  const openedAtRef = useRef<number | null>(null);
  const trackedLabelRef = useRef<string | null>(null);

  useEffect(() => {
    if (disabled) return;

    if (!open) {
      if (openedAtRef.current != null && trackedLabelRef.current) {
        trackUsageModalDwell(
          usageId,
          trackedLabelRef.current,
          pathname,
          Date.now() - openedAtRef.current
        );
      }
      openedAtRef.current = null;
      trackedLabelRef.current = null;
      return;
    }

    const now = Date.now();
    if (
      openedAtRef.current != null &&
      trackedLabelRef.current &&
      trackedLabelRef.current !== usageLabel
    ) {
      trackUsageModalDwell(
        usageId,
        trackedLabelRef.current,
        pathname,
        now - openedAtRef.current
      );
      trackUsageModalOpen(usageId, usageLabel, pathname);
      openedAtRef.current = now;
    } else if (openedAtRef.current == null) {
      trackUsageModalOpen(usageId, usageLabel, pathname);
      openedAtRef.current = now;
    }

    trackedLabelRef.current = usageLabel;
  }, [disabled, open, pathname, usageId, usageLabel]);
}
