'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import {
    sampleTabBarOverSurface,
    type TabBarOverSurface,
} from '@/lib/design-system/tabbar-over-surface';

/**
 * Observa qué hay detrás de la TabBar y decide el cristal:
 * `dark` = widgets HomeScreen; `light` = envolvente legible sobre papel.
 */
export function useTabBarOverSurface(
    ref: RefObject<HTMLElement | null>
): TabBarOverSurface {
    const pathname = usePathname();
    const [over, setOver] = useState<TabBarOverSurface>('dark');

    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;

        let raf = 0;
        const measure = () => {
            raf = 0;
            const next = sampleTabBarOverSurface(node);
            setOver((prev) => (prev === next ? prev : next));
        };
        const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(measure);
        };

        measure();
        const settle = window.setTimeout(measure, 80);

        document.addEventListener('scroll', schedule, { passive: true, capture: true });
        window.addEventListener('resize', schedule);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.clearTimeout(settle);
            document.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [ref, pathname]);

    return over;
}
