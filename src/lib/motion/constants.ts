/** Curva estándar de animaciones iOS (UIView). */
export const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Salida rápida tipo spring iOS. */
export const IOS_EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';

export const PAGE_TRANSITION_MS = 360;
export const MODAL_TRANSITION_MS = 320;
export const MODAL_BACKDROP_MS = 280;

export type NavigationDirection = 'forward' | 'back' | 'fade';

export function getPathDepth(pathname: string): number {
  return pathname.split('/').filter(Boolean).length;
}

export function shouldSkipPageMotion(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname === '/carta' || pathname.startsWith('/carta/')) return true;
  if (pathname === '/staff/carta') return true;
  if (pathname === '/dashboard/carta') return true;
  if (pathname.startsWith('/eventos')) return true;
  return false;
}
