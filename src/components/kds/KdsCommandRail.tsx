'use client';

import { cn } from '@/lib/utils';

/**
 * Riel / porta comandas procedural (sin bitmap): gradientes + sombras.
 * La comanda va justo debajo; usar `kdsRailCardOverlapClass` en la fila de tarjetas
 * para que el borde superior quede oculto bajo el labio del riel (z-index en KDSView).
 */
export const kdsRailCardOverlapClass = '-mt-[20px] sm:-mt-[22px]';

export function KdsCommandRail({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'pointer-events-none relative h-[52px] w-full shrink-0 overflow-hidden sm:h-[58px]',
                className
            )}
            aria-hidden
        >
            {/* Chapa base */}
            <div className="absolute inset-0 bg-[#4f555e]" />
            <div
                className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-white/[0.22] via-white/[0.06] to-transparent"
                aria-hidden
            />
            <div
                className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/35 to-transparent"
                aria-hidden
            />

            {/* Ranura (hueco donde “entra” el ticket) */}
            <div
                className="absolute bottom-[11px] left-[5%] right-[5%] h-[9px] rounded-full bg-black/55 shadow-[inset_0_3px_5px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.07)] sm:bottom-[12px] sm:h-[10px]"
                aria-hidden
            />

            {/* Labio inferior: tapa visualmente el borde superior de la comanda */}
            <div
                className="absolute bottom-0 left-0 right-0 h-[15px] bg-gradient-to-b from-[#3a3f47] via-[#2e3238] to-[#23262c] shadow-[0_-4px_10px_rgba(0,0,0,0.4)] sm:h-[17px]"
                aria-hidden
            />
            <div className="absolute bottom-[14px] left-0 right-0 h-px bg-white/[0.12] sm:bottom-[16px]" aria-hidden />

            {/* Reflejo fino superior */}
            <div className="absolute left-[8%] right-[8%] top-1 h-px bg-white/25" aria-hidden />
        </div>
    );
}
