'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Control de periodo (P7): el mes/rango se lee sin abrir nada;
 * las flechas cambian; pulsar la etiqueta abre el selector cuando existe.
 */
export function PeriodNav({
    label,
    onPrev,
    onNext,
    onLabelClick,
    prevAriaLabel = 'Mes anterior',
    nextAriaLabel = 'Mes siguiente',
    hasActiveFilter,
    onClear,
    labelClassName,
    className,
}: {
    label: string;
    onPrev: () => void;
    onNext: () => void;
    onLabelClick?: () => void;
    prevAriaLabel?: string;
    nextAriaLabel?: string;
    hasActiveFilter?: boolean;
    onClear?: () => void;
    labelClassName?: string;
    className?: string;
}) {
    const labelClass = cn(
        'text-base md:text-lg font-black text-ds-marca capitalize text-center px-1 sm:px-2 min-w-0 max-w-[min(100%,14rem)] sm:max-w-none',
        onLabelClick && 'hover:opacity-80 min-h-12',
        labelClassName
    );

    return (
        <div className={cn('flex justify-center w-full', className)}>
            <div className="inline-flex items-center justify-center gap-1 sm:gap-2 max-w-full">
                <button
                    type="button"
                    onClick={onPrev}
                    className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-ds-marca"
                    aria-label={prevAriaLabel}
                >
                    <ChevronLeft size={22} />
                </button>
                <div className="relative min-w-0">
                    {onLabelClick ? (
                        <button type="button" onClick={onLabelClick} className={labelClass}>
                            {label}
                        </button>
                    ) : (
                        <span className={labelClass}>{label}</span>
                    )}
                    {hasActiveFilter && onClear ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                            }}
                            aria-label="Restablecer periodo"
                            className={cn(
                                'absolute -top-1.5 -right-1.5',
                                'w-5 h-5 md:w-6 md:h-6 rounded-full',
                                'bg-rose-500 hover:bg-rose-600 text-white shadow-lg',
                                'flex items-center justify-center transition-all active:scale-95',
                                'border-2 border-white'
                            )}
                        >
                            <X size={10} strokeWidth={4} className="md:size-3" />
                        </button>
                    ) : null}
                </div>
                <button
                    type="button"
                    onClick={onNext}
                    className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-ds-marca"
                    aria-label={nextAriaLabel}
                >
                    <ChevronRight size={22} />
                </button>
            </div>
        </div>
    );
}
