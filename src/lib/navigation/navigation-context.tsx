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
  /** true solo cuando la pantalla de carga retrasada está visible */
  isLoading: boolean;
  /** Llamar antes de router.push/replace/back programático (no bloquea la navegación) */
  notifyNavigationStart: () => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

/** Esperar antes de mostrar la pantalla de carga (rutas rápidas no parpadean). */
const LOADING_DELAY_MS = 280;
/** Si la URL no cambia, ocultar (clic en modal, misma ruta, etc.). */
const NO_ROUTE_CHANGE_MS = 550;
const MAX_LOADING_MS = 12_000;

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
    const next = `${url.pathname}${url.search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    return next !== current;
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
  const [showLoading, setShowLoading] = useState(false);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noChangeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeAtStartRef = useRef(pathname);
  const pendingRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (noChangeRef.current) clearTimeout(noChangeRef.current);
    if (maxRef.current) clearTimeout(maxRef.current);
    delayRef.current = null;
    noChangeRef.current = null;
    maxRef.current = null;
  }, []);

  const endLoading = useCallback(() => {
    pendingRef.current = 0;
    clearTimers();
    setShowLoading(false);
  }, [clearTimers]);

  const notifyNavigationStart = useCallback(() => {
    routeAtStartRef.current = currentRouteKey();
    pendingRef.current += 1;
    clearTimers();

    delayRef.current = setTimeout(() => {
      if (pendingRef.current > 0) setShowLoading(true);
    }, LOADING_DELAY_MS);

    noChangeRef.current = setTimeout(() => {
      if (pendingRef.current > 0 && currentRouteKey() === routeAtStartRef.current) {
        endLoading();
      }
    }, NO_ROUTE_CHANGE_MS);

    maxRef.current = setTimeout(endLoading, MAX_LOADING_MS);
  }, [clearTimers, endLoading]);

  useEffect(() => {
    if (pendingRef.current > 0) endLoading();
  }, [pathname, endLoading]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor || !isInternalNavigationAnchor(anchor)) return;

      notifyNavigationStart();
    };

    document.addEventListener('click', onClick, false);
    return () => document.removeEventListener('click', onClick, false);
  }, [notifyNavigationStart]);

  useEffect(() => () => endLoading(), [endLoading]);

  return (
    <NavigationContext.Provider value={{ isLoading: showLoading, notifyNavigationStart }}>
      {children}
      {showLoading ? (
        <div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-4 bg-[#5B8FB9]/92 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Cargando"
        >
          <LoadingSpinner size="xl" className="text-white" />
          <p className="text-sm font-bold uppercase tracking-widest text-white/90">
            Cargando…
          </p>
        </div>
      ) : null}
    </NavigationContext.Provider>
  );
}

export function useNavigationFeedback(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigationFeedback debe usarse dentro de NavigationProvider');
  }
  return ctx;
}
