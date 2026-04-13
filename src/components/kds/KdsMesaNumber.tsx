"use client";

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
};

/**
 * Mismo estilo dorsal Teko + doble trazo que el número de mesa, en tamaño reducido
 * para nombre de cliente en cabecera (centrado, puede ocupar varias palabras).
 */
export function KdsStickerBannerText({ value, isCompleted }: KdsStickerBannerTextProps) {
    const v = value.trim();
    if (!v) return null;
    return (
        <span
            className={cn(
                'inline-grid max-w-[min(92vw,28rem)] place-items-center [grid-template-areas:\'banner\'] px-1 py-0.5 font-normal uppercase leading-tight tracking-wide',
                kdsMesaNumberFont.className
            )}
        >
            <span
                className="pointer-events-none col-start-1 row-start-1 select-none text-center text-2xl text-transparent [-webkit-text-stroke:5px_rgb(255_255_255)] [paint-order:stroke_fill] [grid-area:banner] sm:text-3xl sm:[-webkit-text-stroke:6px_rgb(255_255_255)] md:text-4xl md:[-webkit-text-stroke:7px_rgb(255_255_255)]"
                aria-hidden
            >
                {v}
            </span>
            <span
                className={cn(
                    'relative z-10 col-start-1 row-start-1 text-center text-2xl [paint-order:stroke_fill] [-webkit-text-stroke:1.5px_rgb(255_255_255)] [grid-area:banner] sm:text-3xl sm:[-webkit-text-stroke:2px_rgb(255_255_255)] md:text-4xl md:[-webkit-text-stroke:2px_rgb(255_255_255)]',
                    'text-black break-words [word-break:break-word]',
                    '[text-shadow:1px_1px_0_rgb(23_23_23),0.5px_0.5px_0_rgba(255_255_255_0.12)]',
                    isCompleted &&
                        'text-slate-600 [text-shadow:1px_1px_0_rgb(71_85_105)] sm:[-webkit-text-stroke:2px_rgb(255_255_255)] md:[-webkit-text-stroke:2px_rgb(255_255_255)]'
                )}
            >
                {v}
            </span>
        </span>
    );
}
