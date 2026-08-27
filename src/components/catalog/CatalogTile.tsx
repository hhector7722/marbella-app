'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Celda de catálogo (Recetas, Ingredientes, Proveedores).
 * Pieza local de dominio: no es primitiva del sistema.
 *
 * El conjunto imagen + pie es un cuadrado. La imagen se encoge dentro
 * del hueco; el pie es una sola fila. El hueco del pie se reserva siempre
 * para que proveedores, recetas e ingredientes pinten la foto al mismo tamaño.
 * Recetas e ingredientes: 3 columnas. Proveedores (página y pedido): 4.
 */
export function CatalogGrid({
    children,
    columns = 4,
}: {
    children: ReactNode;
    columns?: 3 | 4;
}) {
    return (
        <div
            className={cn(
                'grid items-start gap-5 sm:gap-6 md:gap-8',
                columns === 3 ? 'grid-cols-3' : 'grid-cols-4',
            )}
        >
            {children}
        </div>
    );
}

export function CatalogTile({
    title,
    imageSrc,
    imageAlt = '',
    fallback,
    subtitle,
    onClick,
}: {
    title: string;
    imageSrc?: string | null;
    imageAlt?: string;
    fallback: ReactNode;
    subtitle?: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={title}
            className="aspect-square w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left shadow-none"
        >
            <div className="flex h-full w-full min-h-0 flex-col">
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-3">
                    {imageSrc ? (
                        <img
                            src={imageSrc}
                            alt={imageAlt}
                            className="max-h-full max-w-full object-contain"
                        />
                    ) : (
                        <span className="text-gray-200">{fallback}</span>
                    )}
                </div>
                <div className="flex h-5 w-full shrink-0 items-center justify-center gap-1 overflow-hidden sm:h-6">
                    <span className="min-w-0 truncate text-[11px] font-bold leading-none text-gray-700 sm:text-xs md:text-sm">
                        {title}
                    </span>
                    {subtitle ? (
                        <span className="shrink-0 text-[11px] font-black leading-none sm:text-xs md:text-sm">
                            {subtitle}
                        </span>
                    ) : null}
                </div>
            </div>
        </button>
    );
}
