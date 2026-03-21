'use client';

import {
    useLayoutEffect,
    useRef,
    useState,
    type InputHTMLAttributes,
    type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const STEP = 0.25;
const DEFAULT_MIN = 5;
const DEFAULT_MAX = 11;
/** Margen extra en la medición (px) para que el texto no rocen los bordes. */
const FIT_PAD_X = 14;
const FIT_PAD_Y = 6;
/** Tolerancia al comparar scrollWidth/Height con el área útil. */
const FIT_TOLERANCE_PX = 1.5;

function fitFontSizePx(
    el: HTMLElement,
    maxW: number,
    maxH: number,
    minPx: number,
    maxPx: number,
    widthOnly: boolean
): number {
    if (maxW <= 0 || maxH <= 0) return minPx;
    let fs = maxPx;
    while (fs >= minPx) {
        el.style.fontSize = `${fs}px`;
        void el.offsetHeight;
        const sw = el.scrollWidth;
        const sh = el.scrollHeight;
        const fitsW = sw <= maxW + FIT_TOLERANCE_PX;
        const fitsH = widthOnly ? true : sh <= maxH + FIT_TOLERANCE_PX;
        if (fitsW && fitsH) return fs;
        fs -= STEP;
    }
    return minPx;
}

type ShrinkToFitTextProps = {
    children: ReactNode;
    className?: string;
    wrapClassName?: string;
    innerClassName?: string;
    minPx?: number;
    maxPx?: number;
    /** Una sola línea; la fuente se ajusta al ancho (horarios ACT/CAT/etc.). */
    singleLine?: boolean;
};

/** Texto de solo lectura: muestra el contenido reduciendo fuente si hace falta; padding interior respecto al borde. */
export function ShrinkToFitText({
    children,
    className,
    wrapClassName,
    innerClassName,
    minPx = DEFAULT_MIN,
    maxPx = DEFAULT_MAX,
    singleLine = true,
}: ShrinkToFitTextProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [, setTick] = useState(0);

    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const text = textRef.current;
        if (!wrap || !text) return;

        const run = () => {
            const maxW = Math.max(0, wrap.clientWidth - FIT_PAD_X);
            const maxH = Math.max(0, wrap.clientHeight - FIT_PAD_Y);
            fitFontSizePx(text, maxW, maxH, minPx, maxPx, singleLine);
        };

        run();
        const ro = new ResizeObserver(() => {
            run();
            setTick((t) => t + 1);
        });
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [children, minPx, maxPx, singleLine]);

    return (
        <div
            ref={wrapRef}
            className={cn(
                'flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden px-2 py-0.5 box-border',
                className,
                wrapClassName
            )}
        >
            <span
                ref={textRef}
                className={cn(
                    'max-w-full text-center font-black leading-none',
                    singleLine
                        ? 'block w-full whitespace-nowrap overflow-hidden'
                        : 'block w-full max-w-full break-words leading-tight [overflow-wrap:anywhere]',
                    innerClassName
                )}
            >
                {children}
            </span>
        </div>
    );
}

type ShrinkToFitInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    minPx?: number;
    maxPx?: number;
    wrapClassName?: string;
    /** Una sola línea — evita saltos; ajuste de fuente por ancho (horarios). */
    singleLine?: boolean;
};

/** Input controlado: fuente se reduce para que el valor quepa íntegramente dentro de la celda. */
export function ShrinkToFitInput({
    className,
    wrapClassName,
    minPx = DEFAULT_MIN,
    maxPx = DEFAULT_MAX,
    value,
    singleLine = false,
    ...rest
}: ShrinkToFitInputProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [, setTick] = useState(0);
    const widthOnly = singleLine || rest.type === 'time' || rest.type === 'datetime-local';

    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const input = inputRef.current;
        if (!wrap || !input) return;

        const run = () => {
            const maxW = Math.max(0, wrap.clientWidth - FIT_PAD_X);
            const maxH = Math.max(0, wrap.clientHeight - FIT_PAD_Y);
            fitFontSizePx(input, maxW, maxH, minPx, maxPx, widthOnly);
        };

        run();
        const ro = new ResizeObserver(() => {
            run();
            setTick((t) => t + 1);
        });
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [value, minPx, maxPx, rest.type, singleLine, widthOnly]);

    return (
        <div
            ref={wrapRef}
            className={cn(
                'flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden px-2 py-0.5 box-border',
                wrapClassName
            )}
        >
            <input
                ref={inputRef}
                value={value}
                className={cn(
                    'w-full min-w-0 max-w-full min-h-0 bg-transparent text-center font-black leading-none outline-none',
                    'py-0 align-middle',
                    singleLine && 'whitespace-nowrap',
                    className
                )}
                {...rest}
            />
        </div>
    );
}
