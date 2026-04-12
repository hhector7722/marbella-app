"use client";

import { cn } from '@/lib/utils';
import { kdsMesaNumberFont } from '@/lib/fonts/kds-mesa-number';

type KdsMesaNumberProps = {
    /** Texto ya normalizado (ej. mesa o "--") */
    value: string;
    isCompleted: boolean;
};

/**
 * Número de mesa estilo dorsal deportivo: capa base de trazo blanco grueso
 * (rellena counters vía contorno interior del glifo) + capa superior oscura con
 * trazo fino y sombras para sensación 3D / “inline” sin assets raster.
 */
export function KdsMesaNumber({ value, isCompleted }: KdsMesaNumberProps) {
    return (
        <span
            className={cn(
                'inline-grid min-h-[48px] shrink-0 place-items-center [grid-template-areas:\'mesa\'] px-0.5 py-0.5 font-normal tabular-nums uppercase leading-none tracking-wide',
                kdsMesaNumberFont.className
            )}
        >
            {/* Base: solo trazo blanco grueso — counters en blanco */}
            <span
                className="pointer-events-none col-start-1 row-start-1 select-none text-center text-5xl text-transparent [-webkit-text-stroke:11px_rgb(255_255_255)] [paint-order:stroke_fill] [grid-area:mesa] sm:text-6xl sm:[-webkit-text-stroke:13px_rgb(255_255_255)] md:text-7xl md:[-webkit-text-stroke:15px_rgb(255_255_255)]"
                aria-hidden
            >
                {value}
            </span>
            {/* Frente: relleno + contorno + extrusión */}
            <span
                className={cn(
                    'relative z-10 col-start-1 row-start-1 text-center text-5xl [paint-order:stroke_fill] [-webkit-text-stroke:4px_rgb(255_255_255)] [grid-area:mesa] sm:text-6xl sm:[-webkit-text-stroke:5px_rgb(255_255_255)] md:text-7xl md:[-webkit-text-stroke:6px_rgb(255_255_255)]',
                    'text-black',
                    '[text-shadow:1px_1px_0_rgb(75_85_99),2px_2px_0_rgb(31_41_55),3px_3px_0_rgb(17_24_39),-1px_-1px_0_rgba(255_255_255_0.2)]',
                    isCompleted &&
                        'text-slate-600 [-webkit-text-stroke:4px_rgb(255_255_255)] sm:[-webkit-text-stroke:5px_rgb(255_255_255)] md:[-webkit-text-stroke:6px_rgb(255_255_255)] [text-shadow:1px_1px_0_rgb(148_163_184),2px_2px_0_rgb(100_116_139)]'
                )}
            >
                {value}
            </span>
        </span>
    );
}
