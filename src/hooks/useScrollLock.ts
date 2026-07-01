import { useEffect } from 'react';

let lockCount = 0;
let originalState: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyTouchAction: string;
  mainOverflow: string;
} | null = null;

export function lockScrollGlobal() {
  if (typeof document === 'undefined') return () => {};

  lockCount++;
  if (lockCount === 1) {
    const html = document.documentElement;
    const main = document.querySelector('main');
    
    html.setAttribute('data-modal-open', 'true');

    originalState = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyTouchAction: document.body.style.touchAction,
      mainOverflow: main instanceof HTMLElement ? main.style.overflow : '',
    };

    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    if (main instanceof HTMLElement) {
      main.style.overflow = 'hidden';
    }
  }

  return () => {
    lockCount--;
    if (lockCount < 0) lockCount = 0;

    if (lockCount === 0 && originalState) {
      const html = document.documentElement;
      const main = document.querySelector('main');

      html.removeAttribute('data-modal-open');
      html.style.overflow = originalState.htmlOverflow;
      document.body.style.overflow = originalState.bodyOverflow;
      document.body.style.touchAction = originalState.bodyTouchAction;
      if (main instanceof HTMLElement) {
        main.style.overflow = originalState.mainOverflow;
      }
      originalState = null;
    }
  };
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const unlock = lockScrollGlobal();
    return () => {
      unlock();
    };
  }, [active]);
}
