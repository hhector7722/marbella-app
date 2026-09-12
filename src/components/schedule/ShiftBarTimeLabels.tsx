'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

const STEP = 0.25;
/** Suelo móvil; en escritorio el CSS del modal sube `--shift-bar-label-*`. */
const MAX_PX = 9;
const MIN_PX = 5;
const FIT_TOLERANCE_PX = 1;
const LABEL_MAX_VAR = '--shift-bar-label-max';
const LABEL_MIN_VAR = '--shift-bar-label-min';

function readPxVar(el: HTMLElement, name: string, fallback: number): number {
    let node: HTMLElement | null = el;
    while (node) {
        const raw = getComputedStyle(node).getPropertyValue(name).trim();
        if (raw) {
            const n = Number.parseFloat(raw);
            if (Number.isFinite(n) && n > 0) return n;
        }
        if (node.getAttribute('data-component') === 'Modal') break;
        node = node.parentElement;
    }
    return fallback;
}

function barPadX(bar: HTMLElement): number {
    const style = getComputedStyle(bar);
    const left = Number.parseFloat(style.paddingLeft) || 0;
    const right = Number.parseFloat(style.paddingRight) || 0;
    return left + right + 4;
}

const labelStyle = { textShadow: '0 1px 2px rgba(0,0,0,0.3)' } as const;

/** Normaliza la hora a «HH:mm», descartando segundos si vinieran en «HH:mm:ss». */
function toHHMM(time: string): string {
    const parts = String(time ?? '').split(':');
    return parts.length > 2 ? parts.slice(0, 2).join(':') : String(time ?? '').trim();
}

function fitPairFontSize(
    startEl: HTMLElement,
    endEl: HTMLElement,
    bar: HTMLElement,
): number {
    const maxPx = Math.max(readPxVar(bar, LABEL_MAX_VAR, MAX_PX), MIN_PX);
    const minPx = Math.min(readPxVar(bar, LABEL_MIN_VAR, MIN_PX), maxPx);
    const maxW = Math.max(0, bar.getBoundingClientRect().width - barPadX(bar));
    let fs = maxPx;
    while (fs >= minPx) {
        startEl.style.fontSize = `${fs}px`;
        endEl.style.fontSize = `${fs}px`;
        void startEl.offsetWidth;
        const total = startEl.scrollWidth + endEl.scrollWidth;
        if (total <= maxW + FIT_TOLERANCE_PX) return fs;
        fs -= STEP;
    }
    return minPx;
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
            const fs = fitPairFontSize(startEl, endEl, bar);
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
                {toHHMM(start)}
            </span>
            <span ref={endRef} className={labelClass} style={{ ...labelStyle, fontSize }}>
                {toHHMM(end)}
            </span>
        </>
    );
}
