"use client";

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { kdsMesaNumberFont } from '@/lib/fonts/kds-mesa-number';

type KdsMesaNumberProps = {
    /** Texto ya normalizado (ej. mesa o "--") */
    value: string;
    isCompleted: boolean;
};

/**
 * Número de mesa estilo dorsal deportivo (Teko): base de trazo blanco grueso
 * (counters blancos vía contorno interior) + capa negra con trazo fino y sombra
 * ligera. Tracking ajustado para dígitos juntos tipo “99”.
 */
export function KdsMesaNumber({ value, isCompleted }: KdsMesaNumberProps) {
    return (
        <span
            className={cn(
                'inline-grid min-h-[48px] shrink-0 place-items-center [grid-template-areas:\'mesa\'] px-0.5 py-0.5 font-normal tabular-nums uppercase leading-none',
                // Dígitos más juntos, como dorsales impresos
                'tracking-[-0.07em] sm:tracking-[-0.09em]',
                kdsMesaNumberFont.className
            )}
        >
            {/* Base: trazo blanco grueso — counters en blanco */}
            <span
                className="pointer-events-none col-start-1 row-start-1 select-none text-center text-6xl text-transparent [-webkit-text-stroke:9px_rgb(255_255_255)] [paint-order:stroke_fill] [grid-area:mesa] sm:text-7xl sm:[-webkit-text-stroke:11px_rgb(255_255_255)] md:text-8xl md:[-webkit-text-stroke:12px_rgb(255_255_255)]"
                aria-hidden
            >
                {value}
            </span>
            {/* Frente: cuerpo oscuro + filo blanco interior + sombra corta (relieve) */}
            <span
                className={cn(
                    'relative z-10 col-start-1 row-start-1 text-center text-6xl [paint-order:stroke_fill] [-webkit-text-stroke:2px_rgb(255_255_255)] [grid-area:mesa] sm:text-7xl sm:[-webkit-text-stroke:3px_rgb(255_255_255)] md:text-8xl md:[-webkit-text-stroke:4px_rgb(255_255_255)]',
                    'text-black',
                    '[text-shadow:2px_2px_0_rgb(23_23_23),1px_1px_0_rgba(255_255_255_0.15)]',
                    isCompleted &&
                        'text-slate-600 [text-shadow:2px_2px_0_rgb(71_85_105)] sm:[-webkit-text-stroke:3px_rgb(255_255_255)] md:[-webkit-text-stroke:4px_rgb(255_255_255)]'
                )}
            >
                {value}
            </span>
        </span>
    );
}

type KdsStickerBannerTextProps = {
    value: string;
    isCompleted: boolean;
    /** Contenedor con alto fijo; el texto escala con `transform` para caber sin crecer la cabecera */
    className?: string;
};

/**
 * Nombre cliente en cabecera KDS: Teko, blanco plano sin trazo ni sombra; escala en caja fija.
 */
export function KdsStickerBannerText({ value, isCompleted, className }: KdsStickerBannerTextProps) {
    const v = value.trim();
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    const recompute = useCallback(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner || !v) return;
        const ow = outer.clientWidth;
        const oh = outer.clientHeight;
        const iw = inner.scrollWidth;
        const ih = inner.scrollHeight;
        if (iw < 1 || ih < 1) return;
        setScale(Math.min(1, ow / iw, oh / ih));
    }, [v]);

    useLayoutEffect(() => {
        recompute();
        const id = requestAnimationFrame(() => requestAnimationFrame(recompute));
        const outer = outerRef.current;
        if (!outer) {
            return () => cancelAnimationFrame(id);
        }
        const ro = new ResizeObserver(() => recompute());
        ro.observe(outer);
        return () => {
            cancelAnimationFrame(id);
            ro.disconnect();
        };
    }, [recompute, isCompleted]);

    if (!v) return null;

    return (
        <div
            ref={outerRef}
            className={cn('flex w-full min-w-0 items-start justify-center overflow-hidden', className)}
        >
            <div
                ref={innerRef}
                className="inline-block max-w-none origin-top will-change-transform"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
            >
                <span
                    className={cn(
                        'inline-block max-w-none whitespace-nowrap px-0.5 text-center text-5xl font-normal uppercase leading-none tracking-[0.07em] sm:text-6xl sm:tracking-[0.09em]',
                        kdsMesaNumberFont.className,
                        isCompleted ? 'text-slate-600' : 'text-white'
                    )}
                >
                    {v}
                </span>
            </div>
        </div>
    );
}
