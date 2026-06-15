'use client';

import { usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { trackUsageModalApply } from '@/lib/usage/client';

/** Devuelve una función estable para registrar selección/filtro aplicado en un modal. */
export function useTrackModalApply(modalId: string, modalLabel: string) {
  const pathname = usePathname();

  return useCallback(
    (applySummary: string, extra?: Record<string, string | null | undefined>) => {
      trackUsageModalApply(modalId, modalLabel, pathname, applySummary, extra);
    },
    [modalId, modalLabel, pathname]
  );
}
