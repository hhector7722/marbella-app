'use client';

import { useEffect, type RefObject } from 'react';

/** Mantiene una barra `position:fixed` anclada al borde visual en iOS Safari/PWA. */
export function useVisualViewportBottomPin(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const mountTime = Date.now();
    const initialHeight = window.innerHeight;

    const pin = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        node.style.transform = '';
        node.style.opacity = '';
        node.style.pointerEvents = '';
        node.style.transition = '';
        return;
      }

      let keyboardOpen = false;
      const vv = window.visualViewport;

      if (vv) {
        if (vv.height < window.innerHeight * 0.82) {
           keyboardOpen = true;
        }
      } else if (window.innerHeight < initialHeight * 0.85) {
        keyboardOpen = true;
      }

      if (Date.now() - mountTime < 1500) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
        if (!isInputFocused) {
          keyboardOpen = false;
        }
      }

      // Si el teclado está abierto, ocultamos la barra desplazándola hacia abajo
      // para asegurar que quede cubierta por el teclado y no aparezca encima.
      if (keyboardOpen) {
        node.style.transform = 'translateY(150%)';
        node.style.opacity = '0';
        node.style.pointerEvents = 'none';
        node.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      } else {
        // No forzar opacity/transform: el cromo de scroll (compact/hidden) manda.
        node.style.transform = '';
        node.style.opacity = '';
        node.style.pointerEvents = '';
        node.style.transition = '';
      }
    };

    pin();
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
      node.style.transform = '';
      node.style.opacity = '';
      node.style.pointerEvents = '';
      node.style.transition = '';
      node.style.bottom = '';
    };
  }, [ref]);
}
