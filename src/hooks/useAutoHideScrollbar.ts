import { useEffect, type RefObject } from 'react';

/**
 * Muestra la barra de scroll solo mientras el contenedor se desplaza.
 * Marca el elemento con `data-scrolling="true"` durante `timeout` ms tras el
 * último evento de scroll; el estilo vive en la utilidad `.custom-scrollbar`.
 */
export function useAutoHideScrollbar<T extends HTMLElement>(
    ref: RefObject<T | null> | undefined,
    timeout = 900
) {
    useEffect(() => {
        const el = ref?.current;
        if (!el) return;

        let timer: ReturnType<typeof setTimeout> | null = null;

        const onScroll = () => {
            if (el.getAttribute('data-scrolling') !== 'true') {
                el.setAttribute('data-scrolling', 'true');
            }
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                el.removeAttribute('data-scrolling');
            }, timeout);
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
            if (timer) clearTimeout(timer);
        };
    }, [ref, timeout]);
}
