/** Curva estándar de animaciones iOS (UIView push / panel). */
export const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Alias explícito usado en transiciones de página. */
export const IOS_EASE_OUT = IOS_EASE;

/** Salida rápida (fade / backdrop). */
export const IOS_EASE_FADE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';

export const PAGE_PUSH_MS = 360;
export const PAGE_POP_MS = 360;
export const MODAL_ENTER_MS = 260;
export const MODAL_EXIT_MS = 220;
export const TAB_SWIPE_COMMIT_RATIO = 0.14;
export const SWIPE_BACK_EDGE_PX = 44;
export const SWIPE_BACK_COMMIT_RATIO = 0.14;

/** @deprecated Usar MODAL_ENTER_MS */
export const MODAL_TRANSITION_MS = MODAL_ENTER_MS;

/** @deprecated Usar PAGE_PUSH_MS */
export const PAGE_TRANSITION_MS = PAGE_PUSH_MS;

export function iosTransition(property: string, durationMs: number): string {
  return `${property} ${durationMs}ms ${IOS_EASE}`;
}

export function syncMotionCssVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--marbella-ios-ease', IOS_EASE);
  root.style.setProperty('--marbella-ios-ease-out', IOS_EASE_FADE_OUT);
  root.style.setProperty('--marbella-page-duration', `${PAGE_PUSH_MS}ms`);
  root.style.setProperty('--marbella-modal-enter-duration', `${MODAL_ENTER_MS}ms`);
  root.style.setProperty('--marbella-modal-exit-duration', `${MODAL_EXIT_MS}ms`);
}
