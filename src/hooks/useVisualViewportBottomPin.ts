'use client';

import { useEffect, type RefObject } from 'react';

/** Mantiene una barra `position:fixed; bottom:0` anclada al borde visual en iOS Safari/PWA. */
export function useVisualViewportBottomPin(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const pin = () => {
      const vv = window.visualViewport;
      if (!vv) {
        node.style.bottom = '0px';
        return;
      }
      // Solo desplazar con teclado; en PWA iOS innerHeight > vv.height sin teclado
      // generaba un gap falso y dejaba la barra flotando.
      const keyboardOpen = vv.height < window.innerHeight * 0.82;
      const gap = keyboardOpen
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      node.style.bottom = `${gap}px`;
    };

    pin();
    window.visualViewport?.addEventListener('resize', pin);
    window.visualViewport?.addEventListener('scroll', pin);
    window.addEventListener('resize', pin);
    window.addEventListener('scroll', pin, { passive: true });

    return () => {
      window.visualViewport?.removeEventListener('resize', pin);
      window.visualViewport?.removeEventListener('scroll', pin);
      window.removeEventListener('resize', pin);
      window.removeEventListener('scroll', pin);
      node.style.bottom = '';
    };
  }, [ref]);
}
