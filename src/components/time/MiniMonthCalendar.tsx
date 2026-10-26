'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PERIOD_PICKER_ACCENT_BG, PERIOD_PICKER_ACCENT_TEXT } from '@/components/time/MonthPickerGrid';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export function MiniMonthCalendar({
    month,
    onMonthChange,
    onSelectDay,
    isSelected,
    isInRange,
    isDisabled,
    monthInHeader = false,
    dayAmounts,
}: {
    month: Date;
    onMonthChange: (next: Date) => void;
    onSelectDay: (day: Date) => void;
    isSelected?: (day: Date) => boolean;
    isInRange?: (day: Date) => boolean;
    isDisabled?: (day: Date) => boolean;
    /** Si la cabecera del mes ya está en el Modal, solo se pinta la rejilla. */
    monthInHeader?: boolean;
    /** Importes diarios del cierre: activa el calendario de ventas en el filtro. */
    dayAmounts?: Record<string, number>;
}) {
    const startVisible = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const endVisible = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: startVisible, end: endVisible });

    return (
        <div className="space-y-3">
            {!monthInHeader ? (
                <div className="flex items-center justify-between px-1">
                    <button
                        type="button"
                        onClick={() => onMonthChange(subMonths(month, 1))}
                        className="flex min-h-12 min-w-12 items-center justify-center rounded-lg p-2 transition-colors hover:bg-zinc-50"
                        aria-label="Mes anterior"
                    >
                        <ChevronLeft size={20} className="text-zinc-400" />
                    </button>
                    <div className={cn('text-xs font-black uppercase tracking-tight', PERIOD_PICKER_ACCENT_TEXT)}>
                        {format(month, 'MMMM yyyy', { locale: es })}
                    </div>
                    <button
                        type="button"
                        onClick={() => onMonthChange(addMonths(month, 1))}
                        className="flex min-h-12 min-w-12 items-center justify-center rounded-lg p-2 transition-colors hover:bg-zinc-50"
                        aria-label="Mes siguiente"
                    >
                        <ChevronRight size={20} className="text-zinc-400" />
                    </button>
                </div>
            ) : null}

            <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                    <div key={d} className="py-2 text-center text-[9px] font-black text-zinc-300">
                        {d}
                    </div>
                ))}
                {days.map((day) => {
                    const muted = !isSameMonth(day, month);
                    const selected = Boolean(isSelected?.(day));
                    const inRange = Boolean(isInRange?.(day));
                    const disabled = Boolean(isDisabled?.(day));
                    const amount = dayAmounts?.[format(day, 'yyyy-MM-dd')];
                    return (
                        <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => {
                                if (!disabled) onSelectDay(day);
                            }}
                            disabled={disabled}
                            aria-label={format(day, 'yyyy-MM-dd') + (amount == null ? '' : ', venta neta ' + amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }))}
                            className={cn(
                                'flex items-center justify-center rounded-lg text-[11px] font-black transition-all',
                                dayAmounts ? 'aspect-auto min-h-[47px] flex-col gap-1 px-0.5 py-1' : 'aspect-square',
                                muted ? 'opacity-20' : 'opacity-100',
                                disabled && 'cursor-not-allowed text-zinc-300',
                                selected
                                    ? PERIOD_PICKER_ACCENT_BG
                                    : inRange
                                      ? 'bg-zinc-100 text-[var(--color-envolvente)]'
                                      : amount != null && !disabled
                                        ? 'border border-emerald-200 bg-emerald-50 text-zinc-700'
                                        : disabled
                                          ? 'text-zinc-300'
                                          : 'text-zinc-600',
                            )}
                        >
                            <span>{format(day, 'd')}</span>
                            {dayAmounts && amount != null && <span className={cn('max-w-full whitespace-nowrap text-[8px] font-semibold tracking-tight', selected ? '' : 'text-emerald-700')}>{Math.round(amount).toLocaleString('es-ES')}€</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
