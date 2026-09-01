'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

/** Azul de cabecera (envolvente) para todo el cromo de filtro de periodo. */
export const PERIOD_PICKER_ACCENT_TEXT = 'text-[var(--color-envolvente)]';
export const PERIOD_PICKER_ACCENT_BG = 'bg-[var(--color-envolvente)] text-ds-texto-invertido';

/** Celda de mes: misma anatomía en TimeFilterModal y selectores de export. */
export function monthCellClassName(selected: boolean): string {
    return cn(
        'min-h-12 py-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border-2',
        selected
            ? `${PERIOD_PICKER_ACCENT_BG} border-[var(--color-envolvente)]`
            : 'bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-[var(--color-envolvente)]'
    );
}

/** Meses en modales oscuros (exportación multi-empleado, etc.). */
export function monthCellDarkClassName(selected: boolean): string {
    return cn(
        'py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border min-h-[32px]',
        selected
            ? 'bg-[var(--color-envolvente-alto)] border-[var(--color-envolvente-alto)] text-ds-texto-invertido shadow-sm'
            : 'bg-white/5 border-white/15 text-white/55 hover:border-white/30 hover:text-white/85'
    );
}

/** Pestaña activa del TimeFilterModal. */
export function periodFilterTabClassName(selected: boolean): string {
    return cn(
        'min-h-9 min-w-0 flex-1 px-1 text-[10px] font-medium transition-colors',
        selected ? PERIOD_PICKER_ACCENT_BG : 'bg-transparent text-ds-texto hover:bg-[var(--color-superficie-inactiva)]'
    );
}

/** Día «hoy» en mini-calendarios de periodo (horas extras, widgets). */
export function periodTodayClassName(isToday: boolean, idleClass = 'text-zinc-500'): string {
    return isToday ? PERIOD_PICKER_ACCENT_BG : idleClass;
}

/**
 * Rejilla de 12 meses + navegación de año.
 * `monthIndex` es 0–11 (como `Date#getMonth`).
 */
export function MonthPickerGrid({
    year,
    onYearChange,
    isSelected,
    onSelectMonth,
}: {
    year: number;
    onYearChange: (year: number) => void;
    isSelected: (monthIndex: number) => boolean;
    onSelectMonth: (monthIndex: number) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <button
                    type="button"
                    onClick={() => onYearChange(year - 1)}
                    className="flex min-h-12 min-w-12 items-center justify-center rounded-lg p-2 transition-colors hover:bg-zinc-50"
                    aria-label="Año anterior"
                >
                    <ChevronLeft size={20} className="text-zinc-400" />
                </button>
                <div className={cn('text-xl font-black tracking-tighter', PERIOD_PICKER_ACCENT_TEXT)}>{year}</div>
                <button
                    type="button"
                    onClick={() => onYearChange(year + 1)}
                    className="flex min-h-12 min-w-12 items-center justify-center rounded-lg p-2 transition-colors hover:bg-zinc-50"
                    aria-label="Año siguiente"
                >
                    <ChevronRight size={20} className="text-zinc-400" />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }).map((_, i) => {
                    const date = new Date(year, i, 1);
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onSelectMonth(i)}
                            className={monthCellClassName(isSelected(i))}
                        >
                            {format(date, 'MMM', { locale: es })}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
