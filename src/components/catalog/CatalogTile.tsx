'use client';

import type { ReactNode } from 'react';

/**
 * Celda de catálogo (Recetas, Ingredientes, Proveedores).
 * Pieza local de dominio: no es primitiva del sistema.
 *
 * El conjunto imagen + pie es un cuadrado. La imagen se encoge; el pie no se recorta.
 */
export function CatalogGrid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-4 items-start gap-2 sm:gap-3 md:gap-4">{children}</div>;
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
                <div className="relative min-h-0 flex-1 overflow-hidden">
                    {imageSrc ? (
                        <img
                            src={imageSrc}
                            alt={imageAlt}
                            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-200">
                            {fallback}
                        </div>
                    )}
                </div>
                <div className="w-full shrink-0 pt-1 text-center">
                    <div className="break-words text-[11px] font-bold leading-tight text-gray-700 sm:text-xs md:text-sm">
                        {title}
                    </div>
                    {subtitle ? (
                        <div className="mt-0.5 break-words text-[11px] font-black leading-tight sm:text-xs md:text-sm">
                            {subtitle}
                        </div>
                    ) : null}
                </div>
            </div>
        </button>
    );
}
