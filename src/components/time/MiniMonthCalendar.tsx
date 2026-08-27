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

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export function MiniMonthCalendar({
    month,
    onMonthChange,
    onSelectDay,
    isSelected,
    isInRange,
    monthInHeader = false,
}: {
    month: Date;
    onMonthChange: (next: Date) => void;
    onSelectDay: (day: Date) => void;
    isSelected?: (day: Date) => boolean;
    isInRange?: (day: Date) => boolean;
    /** Si la cabecera del mes ya está en el Modal, solo se pinta la rejilla. */
    monthInHeader?: boolean;
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
                    <div className="text-xs font-black uppercase tracking-tight text-zinc-900">
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
                    return (
                        <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => onSelectDay(day)}
                            aria-label={format(day, 'yyyy-MM-dd')}
                            className={cn(
                                'flex aspect-square items-center justify-center rounded-lg text-[11px] font-black transition-all',
                                muted ? 'opacity-20' : 'opacity-100',
                                selected
                                    ? 'bg-ds-marca text-white'
                                    : inRange
                                      ? 'text-ds-marca'
                                      : 'text-zinc-600',
                            )}
                        >
                            {format(day, 'd')}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
