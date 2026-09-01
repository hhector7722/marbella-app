'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const CATALOG_GRID_COLS = {
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
} as const;

export type CatalogGridColumns = keyof typeof CATALOG_GRID_COLS;

export { CatalogSquare, CatalogTileUnificado, type CatalogNameTone } from './UnifiedCatalogTile';

/**
 * Celda de catálogo (Recetas, Ingredientes, Proveedores) y de menús de acceso
 * (Info, Documentos, Manuales, Caja, Stock). Pieza local de dominio: no es
 * primitiva del sistema.
 *
 * El recuadro blanco (imagen + precio opcional) flota sobre el envolvente.
 * El nombre va fuera, en una fila fija, para no desalinear los cuadrados.
 * Recetas, ingredientes y proveedores usan `CatalogTileUnificado`.
 * Menús de acceso en modal siguen con `CatalogTile` (nombre dentro del cuadrado).
 */
export function CatalogGrid({
    children,
    columns = 4,
}: {
    children: ReactNode;
    columns?: CatalogGridColumns;
}) {
    return (
        <div
            className={cn(
                'grid items-start gap-5 sm:gap-6 md:gap-8 lg:gap-4 xl:gap-5',
                CATALOG_GRID_COLS[columns],
                columns === 4 && 'lg:grid-cols-6 xl:grid-cols-7',
                columns === 5 && 'lg:grid-cols-6 xl:grid-cols-8',
                columns === 6 && 'lg:grid-cols-7 xl:grid-cols-8',
            )}
        >
            {children}
        </div>
    );
}

/**
 * Rejilla de accesos en modal: otras páginas o submodales.
 * Misma celda que el catálogo. Por defecto 3 columnas; más si se especifica.
 */
export function AccessMenuGrid({
    children,
    columns = 3,
}: {
    children: ReactNode;
    columns?: CatalogGridColumns;
}) {
    return <CatalogGrid columns={columns}>{children}</CatalogGrid>;
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
    fallback?: ReactNode;
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
                    ) : fallback ? (
                        <span className="text-gray-200">{fallback}</span>
                    ) : null}
                </div>
                <div className="flex h-5 w-full shrink-0 items-center justify-center gap-1 overflow-hidden sm:h-6">
                    <span data-element="name" className="min-w-0 truncate text-[11px] font-bold leading-none text-gray-700 sm:text-xs md:text-sm">
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