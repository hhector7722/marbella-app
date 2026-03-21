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

function fitFontSizePx(
    el: HTMLElement,
    maxW: number,
    maxH: number,
    minPx: number,
    maxPx: number
): number {
    if (maxW <= 0 || maxH <= 0) return minPx;
    let fs = maxPx;
    while (fs >= minPx) {
        el.style.fontSize = `${fs}px`;
        void el.offsetHeight;
        const sw = el.scrollWidth;
        const sh = el.scrollHeight;
        if (sw <= maxW + 0.5 && sh <= maxH + 0.5) return fs;
        fs -= STEP;
    }
    return minPx;
}

type ShrinkToFitTextProps = {
    children: ReactNode;
    className?: string;
    innerClassName?: string;
    minPx?: number;
    maxPx?: number;
};

/** Texto de solo lectura: muestra todo el contenido reduciendo fuente si hace falta; padding interior respecto al borde. */
export function ShrinkToFitText({
    children,
    className,
    innerClassName,
    minPx = DEFAULT_MIN,
    maxPx = DEFAULT_MAX,
}: ShrinkToFitTextProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [, setTick] = useState(0);

    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const text = textRef.current;
        if (!wrap || !text) return;

        const run = () => {
            const padX = 8;
            const padY = 4;
            const maxW = Math.max(0, wrap.clientWidth - padX);
            const maxH = Math.max(0, wrap.clientHeight - padY);
            fitFontSizePx(text, maxW, maxH, minPx, maxPx);
        };

        run();
        const ro = new ResizeObserver(() => {
            run();
            setTick((t) => t + 1);
        });
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [children, minPx, maxPx]);

    return (
        <div
            ref={wrapRef}
            className={cn(
                'flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden px-1.5 py-0.5 box-border',
                className
            )}
        >
            <span
                ref={textRef}
                className={cn(
                    'block w-full max-w-full break-words text-center font-black leading-tight [overflow-wrap:anywhere]',
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
    /** Una sola línea (p. ej. horas) — evita saltos y ajusta solo el tamaño de fuente. */
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

    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const input = inputRef.current;
        if (!wrap || !input) return;

        const run = () => {
            const padX = 8;
            const padY = 4;
            const maxW = Math.max(0, wrap.clientWidth - padX);
            const maxH = Math.max(0, wrap.clientHeight - padY);
            fitFontSizePx(input, maxW, maxH, minPx, maxPx);
        };

        run();
        const ro = new ResizeObserver(() => {
            run();
            setTick((t) => t + 1);
        });
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [value, minPx, maxPx, rest.type, singleLine]);

    return (
        <div
            ref={wrapRef}
            className={cn(
                'flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden px-1.5 py-0.5 box-border',
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
