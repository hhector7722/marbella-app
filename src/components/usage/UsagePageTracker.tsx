'use client';

import { Suspense } from 'react';
import { usePageView } from '@/lib/usage/usePageView';

function UsagePageTrackerInner() {
  usePageView();
  return null;
}

/** Monta el tracking de navegación cliente en el shell autenticado. */
export function UsagePageTracker() {
  return (
    <Suspense fallback={null}>
      <UsagePageTrackerInner />
    </Suspense>
  );
}
