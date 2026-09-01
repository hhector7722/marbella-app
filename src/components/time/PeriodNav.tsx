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
        'text-center text-[11px] font-medium capitalize leading-none sm:text-xs md:text-sm';

    return (
        <div className={cn('flex w-full items-center justify-center', className)}>
            <div className="inline-flex items-center justify-center gap-0">
                <button
                    type="button"
                    onClick={onPrev}
                    className="flex h-9 px-1 shrink-0 items-center justify-center rounded-lg hover:bg-zinc-100/10 transition-colors"
                    aria-label={prevAriaLabel}
                >
                    <ChevronLeft size={18} strokeWidth={1.75} />
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
                    className="flex h-9 px-1 shrink-0 items-center justify-center rounded-lg hover:bg-zinc-100/10 transition-colors"
                    aria-label={nextAriaLabel}
                >
                    <ChevronRight size={18} strokeWidth={1.75} />
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
            icon={<Calendar size={20} strokeWidth={1.75} />}
            onClick={onClick}
            className="shrink-0"
        />
    );
}
