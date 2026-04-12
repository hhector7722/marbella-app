'use client';

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

/**
 * Porta comandas metálico claro: labio inferior detrás de la tarjeta, bloque superior + ranura delante.
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
            {/* Labio inferior — detrás de la comanda (z-8) */}
            <div
                className={cn(
                    'absolute inset-x-0 bottom-0 z-[8] rounded-t-[5px]',
                    'h-[14px] sm:h-[16px]',
                    'bg-gradient-to-b from-[#c4c9d2] via-[#adb3bf] to-[#959cab]',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_3px_rgba(0,0,0,0.06),0_-3px_10px_rgba(0,0,0,0.1)]'
                )}
            />

            {/* Bloque superior + ranura — delante; tapa el borde superior de la comanda (z-25) */}
            <div
                className={cn(
                    'absolute inset-x-0 top-0 z-[25] rounded-b-[4px]',
                    'h-[38px] sm:h-[42px]',
                    'bg-gradient-to-b from-[#f3f4f6] via-[#e5e7eb] to-[#cdd2dc]',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-12px_16px_rgba(100,110,130,0.12),0_4px_14px_rgba(0,0,0,0.14)]'
                )}
            >
                <div className="absolute left-[8%] right-[8%] top-2 h-px bg-white/75 sm:top-2.5" />
                {/* Ranura negra: todo el ancho del bloque superior / porta comandas */}
                <div
                    className={cn(
                        'absolute inset-x-0 bottom-0 bg-[#1a1f28]',
                        'h-[6px] sm:h-[7px]',
                        'shadow-[inset_0_3px_6px_rgba(0,0,0,0.82),0_1px_0_rgba(255,255,255,0.15)]'
                    )}
                />
            </div>
        </div>
    );
}
