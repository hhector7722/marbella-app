'use client';

import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Disparador de filtro de catálogo (CAT, PROV, FC).
 * Flota sobre el fondo: sin tarjeta, sin borde, sin sombra.
 */
export function CatalogFilterChip({
    label,
    value,
    onOpen,
    onClear,
    clearAriaLabel,
    valueClassName,
    title,
}: {
    label: string;
    value?: string | null;
    onOpen?: () => void;
    onClear?: () => void;
    clearAriaLabel?: string;
    valueClassName?: string;
    title?: string;
}) {
    if (value) {
        if (onOpen && !onClear) {
            return (
                <button
                    type="button"
                    data-element="catalog-filter"
                    data-state="idle"
                    onClick={onOpen}
                    aria-label={title ?? value}
                >
                    <span data-element="label" className={cn(valueClassName)} title={title ?? value}>
                        {value}
                    </span>
                    <ChevronDown data-element="chevron" size={12} aria-hidden />
                </button>
            );
        }
        return (
            <div data-element="catalog-filter" data-state="active">
                <span data-element="label" className={cn(valueClassName)} title={title ?? value}>
                    {value}
                </span>
                {onClear ? (
                    <button
                        type="button"
                        data-element="clear"
                        onClick={onClear}
                        aria-label={clearAriaLabel ?? `Quitar filtro ${label}`}
                    >
                        <X size={12} strokeWidth={4} aria-hidden />
                    </button>
                ) : null}
            </div>
        );
    }

    if (onOpen) {
        return (
            <button
                type="button"
                data-element="catalog-filter"
                data-state="idle"
                onClick={onOpen}
                aria-label={label}
            >
                <span data-element="label">{label}</span>
                <ChevronDown data-element="chevron" size={12} aria-hidden />
            </button>
        );
    }

    return (
        <div data-element="catalog-filter" data-state="idle">
            <span data-element="label">{label}</span>
        </div>
    );
}
