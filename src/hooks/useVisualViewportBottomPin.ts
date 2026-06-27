'use client';

import { useEffect, type RefObject } from 'react';

/** Mantiene una barra `position:fixed; bottom:0` anclada al borde visual en iOS Safari/PWA. */
export function useVisualViewportBottomPin(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const mountTime = Date.now();

    const pin = () => {
      const vv = window.visualViewport;
      if (!vv) {
        node.style.bottom = '0px';
        return;
      }
      // Solo desplazar con teclado; en PWA iOS innerHeight > vv.height sin teclado
      // generaba un gap falso y dejaba la barra flotando.
      let keyboardOpen = vv.height < window.innerHeight * 0.82;

      // Al abrir la app (primeros 1.5s), damos por hecho que el teclado está cerrado
      // para evitar que la barra suba por cálculos iniciales inestables del viewport.
      if (Date.now() - mountTime < 1500) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isInputFocused = activeTag === 'input' || activeTag === 'textarea';
        if (!isInputFocused) {
          keyboardOpen = false;
        }
      }

      const gap = keyboardOpen
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      node.style.bottom = `${gap}px`;
    };

    pin();
    // Reevaluar después del periodo inicial para ajustar si la medida real cambió
    const timeoutId = setTimeout(pin, 1500);
    window.visualViewport?.addEventListener('resize', pin);
    window.visualViewport?.addEventListener('scroll', pin);
    window.addEventListener('resize', pin);
    window.addEventListener('scroll', pin, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      window.visualViewport?.removeEventListener('resize', pin);
      window.visualViewport?.removeEventListener('scroll', pin);
      window.removeEventListener('resize', pin);
      window.removeEventListener('scroll', pin);
      node.style.bottom = '';
    };
  }, [ref]);
}
