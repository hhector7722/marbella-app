'use client';

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Control de periodo (P7): vive en la cabecera de PageScreen.
 * Flechas cambian el periodo; el filtro de la cabecera abre el selector.
 */
export function PeriodNav({
    label,
    onPrev,
    onNext,
    onLabelClick,
    prevAriaLabel = 'Mes anterior',
    nextAriaLabel = 'Mes siguiente',
    className,
}: {
    label: string;
    onPrev: () => void;
    onNext: () => void;
    onLabelClick?: () => void;
    prevAriaLabel?: string;
    nextAriaLabel?: string;
    className?: string;
}) {
    const labelClass =
        'min-w-0 max-w-[9.5rem] truncate text-center text-[11px] font-black capitalize leading-none text-white sm:max-w-[14rem] sm:text-xs md:text-sm';

    return (
        <div className={cn('flex w-full min-w-0 items-center justify-center', className)}>
            <div className="inline-flex max-w-full min-w-0 items-center justify-center gap-0.5">
                <button
                    type="button"
                    onClick={onPrev}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10"
                    aria-label={prevAriaLabel}
                >
                    <ChevronLeft size={18} />
                </button>
                {onLabelClick ? (
                    <button type="button" onClick={onLabelClick} className={cn(labelClass, 'hover:opacity-80')}>
                        {label}
                    </button>
                ) : (
                    <span className={labelClass}>{label}</span>
                )}
                <button
                    type="button"
                    onClick={onNext}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10"
                    aria-label={nextAriaLabel}
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}

/** Icono de filtro de periodo: siempre el mismo, a la derecha de la cabecera. */
export function PeriodFilterButton({
    onClick,
    instance = 'period-filter',
}: {
    onClick: () => void;
    instance?: string;
}) {
    return (
        <Button
            type="button"
            variant="tertiary"
            instance={instance}
            aria-label="Filtrar"
            icon={<Calendar size={20} strokeWidth={2.25} />}
            onClick={onClick}
            className="shrink-0"
        />
    );
}
