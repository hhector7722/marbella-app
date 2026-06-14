'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { deriveUsageLabel } from '@/lib/usage/labels';
import { trackUsageClientPageView, trackUsagePageDwell } from '@/lib/usage/client';

const MIN_PAGE_VIEW_MS = 800;

/** Registra vistas de página y tiempo en pantalla (cliente). */
export function usePageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const searchSuffix = search ? `?${search}` : '';

  const previousRef = useRef<{
    path: string;
    search: string;
    label: string;
    startedAt: number;
  } | null>(null);

  useEffect(() => {
    const now = Date.now();
    const previous = previousRef.current;
    const label = deriveUsageLabel(pathname);

    if (previous) {
      const durationMs = now - previous.startedAt;
      if (previous.path !== pathname || previous.search !== search) {
        trackUsagePageDwell(previous.path, previous.search, previous.label, durationMs);
      }
    }

    const referrerPath = previous
      ? `${previous.path}${previous.search ? `?${previous.search}` : ''}`
      : null;

    trackUsageClientPageView(pathname, searchSuffix, label, referrerPath);

    previousRef.current = {
      path: pathname,
      search,
      label,
      startedAt: now,
    };
  }, [pathname, search, searchSuffix]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      const current = previousRef.current;
      if (!current) return;

      const durationMs = Date.now() - current.startedAt;
      if (durationMs >= MIN_PAGE_VIEW_MS) {
        trackUsagePageDwell(current.path, current.search, current.label, durationMs);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}
