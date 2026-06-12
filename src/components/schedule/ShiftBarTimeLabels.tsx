'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

const STEP = 0.25;
const MAX_PX = 9;
const MIN_PX = 5;
/** Margen horizontal dentro de la barra (px-1.5 + holgura). */
const BAR_PAD_X = 12;
const FIT_TOLERANCE_PX = 1;

const labelStyle = { textShadow: '0 1px 2px rgba(0,0,0,0.3)' } as const;

function fitPairFontSize(startEl: HTMLElement, endEl: HTMLElement, barWidth: number): number {
    const maxW = Math.max(0, barWidth - BAR_PAD_X);
    let fs = MAX_PX;
    while (fs >= MIN_PX) {
        startEl.style.fontSize = `${fs}px`;
        endEl.style.fontSize = `${fs}px`;
        void startEl.offsetWidth;
        const total = startEl.scrollWidth + endEl.scrollWidth;
        if (total <= maxW + FIT_TOLERANCE_PX) return fs;
        fs -= STEP;
    }
    return MIN_PX;
}

type ShiftBarTimeLabelsProps = {
    barRef: RefObject<HTMLElement | null>;
    start: string;
    end: string;
    className?: string;
};

/** Etiquetas HH:mm en extremos de la barra verde; reduce fuente solo en esa franja si se solapan. */
export function ShiftBarTimeLabels({ barRef, start, end, className }: ShiftBarTimeLabelsProps) {
    const startRef = useRef<HTMLSpanElement>(null);
    const endRef = useRef<HTMLSpanElement>(null);
    const [fontSize, setFontSize] = useState(MAX_PX);

    useLayoutEffect(() => {
        const bar = barRef.current;
        const startEl = startRef.current;
        const endEl = endRef.current;
        if (!bar || !startEl || !endEl) return;

        const run = () => {
            const fs = fitPairFontSize(startEl, endEl, bar.getBoundingClientRect().width);
            setFontSize(fs);
            startEl.style.fontSize = `${fs}px`;
            endEl.style.fontSize = `${fs}px`;
        };

        run();
        const ro = new ResizeObserver(run);
        ro.observe(bar);
        return () => ro.disconnect();
    }, [barRef, start, end]);

    const labelClass = cn(
        'font-black text-white pointer-events-none select-none shrink-0 leading-none',
        className,
    );

    return (
        <>
            <span ref={startRef} className={labelClass} style={{ ...labelStyle, fontSize }}>
                {start}
            </span>
            <span ref={endRef} className={labelClass} style={{ ...labelStyle, fontSize }}>
                {end}
            </span>
        </>
    );
}
