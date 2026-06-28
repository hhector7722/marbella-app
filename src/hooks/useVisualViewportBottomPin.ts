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
      // The gap calculation that shifted the bar UP when the keyboard was open has been disabled,
      // as the expected behavior is for the keyboard to open overlaying the bar.
      // We rely on interactiveWidget: "overlays-content" in the viewport config now.
      node.style.bottom = '0px';
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
