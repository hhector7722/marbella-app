'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { shouldShowMinutesForBarWidthPx } from '@/lib/schedule-shift-bar-display';

export function useShiftBarShowMinutes(
    barRef: RefObject<HTMLElement | null>,
    start: string,
    end: string,
): boolean {
    const [showMinutes, setShowMinutes] = useState(false);

    useLayoutEffect(() => {
        const el = barRef.current;
        if (!el) return;

        const update = () => {
            const w = el.getBoundingClientRect().width;
            setShowMinutes(shouldShowMinutesForBarWidthPx(w, start, end));
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [barRef, start, end]);

    return showMinutes;
}
