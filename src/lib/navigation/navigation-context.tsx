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
import { usePathname, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type NavigationContextValue = {
  isNavigating: boolean;
  startNavigation: () => void;
  endNavigation: () => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

/** Solo mostrar overlay si la navegación supera este umbral (evita flash en rutas rápidas). */
const OVERLAY_DELAY_MS = 180;
/** Si la URL no cambia tras un intento de navegación, quitar overlay. */
const NO_ROUTE_CHANGE_MS = 600;
/** Tope absoluto por si algo falla. */
const NAVIGATION_STUCK_MS = 8_000;

function isInternalNavigationAnchor(anchor: HTMLAnchorElement): boolean {
  if (anchor.dataset.noNavFeedback === 'true') return false;

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

function currentRouteKey(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [showOverlay, setShowOverlay] = useState(false);
  const overlayDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noChangeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeAtStartRef = useRef(routeKey);
  const pendingCountRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (overlayDelayRef.current) {
      clearTimeout(overlayDelayRef.current);
      overlayDelayRef.current = null;
    }
    if (noChangeRef.current) {
      clearTimeout(noChangeRef.current);
      noChangeRef.current = null;
    }
    if (stuckRef.current) {
      clearTimeout(stuckRef.current);
      stuckRef.current = null;
    }
  }, []);

  const endNavigation = useCallback(() => {
    pendingCountRef.current = 0;
    clearTimers();
    setShowOverlay(false);
  }, [clearTimers]);

  const startNavigation = useCallback(() => {
    routeAtStartRef.current = currentRouteKey();
    pendingCountRef.current += 1;

    clearTimers();

    overlayDelayRef.current = setTimeout(() => {
      if (pendingCountRef.current > 0) {
        setShowOverlay(true);
      }
    }, OVERLAY_DELAY_MS);

    noChangeRef.current = setTimeout(() => {
      if (pendingCountRef.current > 0 && currentRouteKey() === routeAtStartRef.current) {
        endNavigation();
      }
    }, NO_ROUTE_CHANGE_MS);

    stuckRef.current = setTimeout(endNavigation, NAVIGATION_STUCK_MS);
  }, [clearTimers, endNavigation]);

  useEffect(() => {
    if (pendingCountRef.current > 0) {
      endNavigation();
    }
  }, [routeKey, endNavigation]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor || !isInternalNavigationAnchor(anchor)) return;

      startNavigation();
    };

    // Bubble (no capture): respeta preventDefault de modales / CTAs en la barra inferior.
    document.addEventListener('click', onClick, false);
    return () => document.removeEventListener('click', onClick, false);
  }, [startNavigation]);

  useEffect(() => () => endNavigation(), [endNavigation]);

  return (
    <NavigationContext.Provider
      value={{ isNavigating: showOverlay, startNavigation, endNavigation }}
    >
      {children}
      {showOverlay ? (
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
