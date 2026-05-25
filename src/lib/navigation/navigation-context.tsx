'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type NavigationContextValue = {
  isNavigating: boolean;
  startNavigation: () => void;
  endNavigation: () => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

const NAVIGATION_STUCK_MS = 30_000;

function isInternalNavigationAnchor(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target === '_blank') return false;

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    const nextPath = `${url.pathname}${url.search}`;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    return nextPath !== currentPath;
  } catch {
    return false;
  }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const stuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endNavigation = useCallback(() => {
    setIsNavigating(false);
    if (stuckTimeoutRef.current) {
      clearTimeout(stuckTimeoutRef.current);
      stuckTimeoutRef.current = null;
    }
  }, []);

  const startNavigation = useCallback(() => {
    setIsNavigating(true);
    if (stuckTimeoutRef.current) clearTimeout(stuckTimeoutRef.current);
    stuckTimeoutRef.current = setTimeout(endNavigation, NAVIGATION_STUCK_MS);
  }, [endNavigation]);

  useEffect(() => {
    endNavigation();
  }, [pathname, endNavigation]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor || !isInternalNavigationAnchor(anchor)) return;

      startNavigation();
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [startNavigation]);

  useEffect(() => () => endNavigation(), [endNavigation]);

  return (
    <NavigationContext.Provider value={{ isNavigating, startNavigation, endNavigation }}>
      {children}
      {isNavigating ? (
        <div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-3 bg-white/55 backdrop-blur-[2px] pointer-events-none"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Cargando página"
        >
          <LoadingSpinner size="xl" className="text-[#5B8FB9]" />
        </div>
      ) : null}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation debe usarse dentro de NavigationProvider');
  }
  return ctx;
}
