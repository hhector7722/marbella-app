'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MOBILE_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

/**
 * Cromo P3 de Cierres: franja, tarjeta al 97 % y cabecera roja de días.
 * El contenido de cada celda lo pone el dominio.
 * `flush`: sin franja ni margen; la tarjeta ocupa el ancho del hueco (mosaico Staff).
 */
export function MonthCalendarFrame({
    children,
    className,
    flush = false,
    ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; flush?: boolean }) {
    return (
        <div
            data-component="MonthCalendarFrame"
            data-flush={flush ? 'true' : undefined}
            className={cn('month-cal-chrome', flush && 'month-cal-chrome--flush', className)}
            {...rest}
        >
            <div className="month-cal-grid-wrap">
                <div className="grid shrink-0 grid-cols-7 border-b border-gray-100">
                    {WEEKDAYS.map((d, index) => (
                        <div
                            key={d}
                            className="flex h-5 items-center justify-center border-r border-white/30 bg-gradient-to-b from-red-500 to-red-600 shadow-sm last:border-r-0"
                        >
                            <span className="truncate px-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-white drop-shadow-sm">
                                <span className="hidden md:inline">{d}</span>
                                <span className="md:hidden">{MOBILE_HEADERS[index]}</span>
                            </span>
                        </div>
                    ))}
                </div>
                {children}
            </div>
        </div>
    );
}
