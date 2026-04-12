'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Altura del bloque riel (debe coincidir con el padding superior del wrapper de fila).
 */
const RAIL_H = 'h-[52px] sm:h-[58px]';

/**
 * Contenedor de cada fila de comandas: reserva altura para el riel absoluto + contexto de apilado.
 */
export const kdsRailRowWrapperClass = 'relative isolate w-full min-w-0 pt-[52px] sm:pt-[58px]';

/**
 * Margen negativo de la fila de comandas. Un poco menos que el alineado exacto a la ranura
 * para que se vea un fragmento de la línea negra encima del borde de la comanda (~3px).
 */
export const kdsRailCardOverlapClass = '-mt-[17px] sm:-mt-[20px]';

/** Metal superior: varios tonos + brillo + penumbra (más “foto” que ilustración plana). */
const upperMetalStyle: CSSProperties = {
    background:
        'linear-gradient(168deg, #f7f8fa 0%, #e8ebf0 12%, #d1d7e1 35%, #b3bcc8 62%, #959eac 88%, #868f9e 100%)',
    boxShadow: `
        inset 0 2px 3px rgba(255,255,255,0.85),
        inset 0 -18px 24px rgba(35,40,50,0.22),
        0 8px 20px rgba(0,0,0,0.28),
        0 2px 6px rgba(0,0,0,0.18)
    `,
};

/** Labio inferior: bisel + contact shadow. */
const lowerLipStyle: CSSProperties = {
    background: 'linear-gradient(180deg, #c5ccd6 0%, #a8b0bc 38%, #8a929e 72%, #6f7784 100%)',
    boxShadow: `
        inset 0 2px 2px rgba(255,255,255,0.45),
        inset 0 -3px 6px rgba(0,0,0,0.18),
        0 -4px 12px rgba(0,0,0,0.15)
    `,
};

/** Ranura: hueco con gradiente (no plano) y sombra interior profunda. */
const grooveStyle: CSSProperties = {
    background: 'linear-gradient(180deg, #0a0c10 0%, #151a22 35%, #1f262f 70%, #252d38 100%)',
    boxShadow: `
        inset 0 5px 10px rgba(0,0,0,0.75),
        inset 0 -2px 3px rgba(255,255,255,0.06),
        0 1px 0 rgba(255,255,255,0.12)
    `,
};

/**
 * Porta comandas: capas y sombras para aspecto metálico más realista.
 */
export function KdsCommandRail({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'pointer-events-none absolute left-1/2 top-0 z-0 w-screen max-w-[100vw] -translate-x-1/2',
                RAIL_H,
                className
            )}
            aria-hidden
        >
            {/* Labio inferior — detrás de la comanda */}
            <div
                className="absolute inset-x-0 bottom-0 z-[8] h-[14px] rounded-t-[6px] sm:h-[16px]"
                style={lowerLipStyle}
            />
            {/* Sombra de contacto bajo el metal superior (suelo del porta) */}
            <div
                className="absolute inset-x-0 bottom-[12px] z-[9] h-[6px] bg-gradient-to-t from-black/25 to-transparent blur-[2px] sm:bottom-[14px]"
                aria-hidden
            />

            {/* Bloque superior */}
            <div
                className="absolute inset-x-0 top-0 z-[25] h-[38px] overflow-hidden rounded-b-[5px] sm:h-[42px]"
                style={upperMetalStyle}
            >
                {/* Brillo especular ancho (reflejo de luz) */}
                <div
                    className="pointer-events-none absolute left-[6%] right-[6%] top-0 h-[42%] rounded-b-[40%] bg-gradient-to-b from-white/55 via-white/15 to-transparent"
                    aria-hidden
                />
                {/* Oscurecido en la parte baja del bloque (antes de la ranura) */}
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/14 to-transparent"
                    aria-hidden
                />
                {/* Línea de bisel bajo el brillo */}
                <div className="absolute left-[10%] right-[10%] top-[28%] h-px bg-gradient-to-r from-transparent via-white/50 to-transparent sm:top-[30%]" />

                {/* Ranura */}
                <div
                    className="absolute inset-x-0 bottom-0 h-[6px] sm:h-[7px]"
                    style={grooveStyle}
                />
                {/* Reflejo mínimo en el borde inferior de la ranura (metal pulido) */}
                <div className="pointer-events-none absolute inset-x-[12%] bottom-[1px] h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </div>
        </div>
    );
}
