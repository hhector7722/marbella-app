export {
  IOS_EASE,
  IOS_EASE_OUT,
  IOS_EASE_FADE_OUT,
  PAGE_PUSH_MS,
  PAGE_POP_MS,
  PAGE_TRANSITION_MS,
  MODAL_ENTER_MS,
  MODAL_EXIT_MS,
  MODAL_TRANSITION_MS,
  TAB_SWIPE_COMMIT_RATIO,
  SWIPE_BACK_EDGE_PX,
  SWIPE_BACK_COMMIT_RATIO,
  iosTransition,
  syncMotionCssVars,
} from '@/lib/motion/tokens';

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
