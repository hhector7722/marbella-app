'use client';

import { Suspense } from 'react';
import { UsagePageTracker } from '@/components/usage/UsagePageTracker';

export function UsageAuthenticatedTracker({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <UsagePageTracker />
    </Suspense>
  );
}
