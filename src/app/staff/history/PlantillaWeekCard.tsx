'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const MAX_ROWS_DEFAULT = 12;
const LOG_ROW_HEIGHT = 7;
const LOG_ROW_GAP = 3;
const DAY_VERTICAL_PAD = 4;
const DAY_HEADER_HEIGHT = 9;
const DAY_CONTENT_TOP_OFFSET = 12;

/** Tipos con etiqueta de texto (sin reloj). `regular` y `no_registered` pintan horas. */
const SPECIAL_EVENTS: Record<string, { label: string; text: string }> = {
    holiday: { label: 'F', text: 'text-red-500' },
    weekend: { label: 'E', text: 'text-yellow-500' },
    adjustment: { label: 'B', text: 'text-orange-500' },
    personal: { label: 'P', text: 'text-blue-500' },
};

export type PlantillaDayLog = {
    id: string;
    user_id: string;
    first_name?: string;
    last_name?: string;
    clock_in: string;
    clock_out: string | null;
    event_type?: string;
    clock_out_show_no_registrada?: boolean;
    in_time: string;
    out_time: string;
};

export type PlantillaDay = {
    date: string;
    dayNumber: number;
    dayName: string;
    isToday: boolean;
    isOtherMonth: boolean;
    logs: PlantillaDayLog[];
};

export type PlantillaWeek = {
    weekNumber: number;
    startDate: string;
    days: PlantillaDay[];
};

interface PlantillaWeekCardProps {
    week: PlantillaWeek;
    onDayClick: (date: string) => void;
    /** Filas por día que entran en el hueco; el resto se resume en «+N más». */
    maxRows?: number;
    /** Separador entre la hora de entrada y la de salida. */
    timeSeparator?: string;
    /** Pinta la línea horizontal que separa registros de trabajadores. */
    showRowDividers?: boolean;
}

/** Solo el primer nombre: identifica al empleado sin ocupar la celda. */
function getFirstName(log: PlantillaDayLog): string {
    const first = (log.first_name || '').trim();
    return first.split(/\s+/)[0] || '?';
}

/** "08:30" → "8" · "14:00" → "14". Solo la hora, sin minutos ni cero inicial. */
function formatHourOnly(time: string | null | undefined): string {
    if (!time) return '';
    // ANTI-ISO-SLICE: si llega un DateTime completo, quedarse con la parte horaria.
    const clean = time.includes('T') ? (time.split('T')[1] ?? '') : time;
    const hour = Number.parseInt(clean.split(':')[0] ?? '', 10);
    return Number.isFinite(hour) ? String(hour) : '';
}

export function PlantillaWeekCard({ week, onDayClick, maxRows = MAX_ROWS_DEFAULT, timeSeparator = '/', showRowDividers = true }: PlantillaWeekCardProps) {
    const maxDisplayedLogs = Math.max(
        0,
        ...week.days.map((day) => Math.min((day.logs || []).length, maxRows)),
    );
    const contentHeight =
        maxDisplayedLogs === 0
            ? DAY_HEADER_HEIGHT
            : maxDisplayedLogs * LOG_ROW_HEIGHT + (maxDisplayedLogs - 1) * LOG_ROW_GAP;
    const dayHeight =
        DAY_VERTICAL_PAD + DAY_CONTENT_TOP_OFFSET + contentHeight + DAY_VERTICAL_PAD;

    return (
        <div className="grid grid-cols-7 border-b border-gray-100 last:border-b-0 month-cal-week">
            {week.days.map((day, di) => {
                    return (
                        <div
                            key={di}
                            onClick={() => onDayClick(day.date)}
                            style={{ minHeight: `max(${dayHeight}px, var(--month-cal-cell-min-h))` }}
                            className={cn(
                                'relative flex flex-col cursor-pointer transition-colors p-0.5 sm:p-1 month-cal-cell',
                                'border-r border-gray-100 last:border-r-0',
                                'bg-white hover:bg-zinc-50',
                                day.isToday && !day.isOtherMonth && 'bg-blue-50/10'
                            )}
                        >
                            <span className={cn(
                                "absolute top-1 right-1 text-[9px] font-bold",
                                day.isToday && !day.isOtherMonth ? "text-blue-600" : (day.isOtherMonth ? "text-gray-400 opacity-50" : "text-gray-400")
                            )}>
                                {day.dayNumber}
                            </span>
                            <div className={cn("flex-1 flex flex-col items-stretch justify-center mt-3 w-full overflow-hidden", day.isOtherMonth && "opacity-45")}>
                                <div className="flex flex-col items-stretch justify-center w-full space-y-[3px]">
                                    {(() => {
                                        const logs = day.logs || [];
                                        const overflow = logs.length > maxRows ? logs.length - maxRows + 1 : 0;
                                        const displayLogs = overflow > 0 ? logs.slice(0, maxRows - 1) : logs.slice(0, maxRows);

                                        return (
                                            <>
                                                {displayLogs.map((log, idx) => {
                                                    const special = SPECIAL_EVENTS[log.event_type || 'regular'];
                                                    const isNoRegistered =
                                                        log.event_type === 'no_registered' || log.clock_out_show_no_registrada === true;
                                                    const name = getFirstName(log);
                                                    const inHour = formatHourOnly(log.in_time);
                                                    const outHour = formatHourOnly(log.out_time);
                                                    const needsLineBelow = idx < displayLogs.length - 1 || overflow > 0;

                                                    if (special) {
                                                        return (
                                                            <div
                                                                key={log.id}
                                                                className="relative flex w-full min-w-0 flex-row items-center"
                                                            >
                                                                <span className="min-w-0 max-w-[66%] flex-1 truncate text-[6px] font-normal leading-none text-zinc-600">
                                                                    {name}
                                                                </span>
                                                                <span className={cn("absolute left-3/4 -translate-x-1/2 text-[7px] font-black leading-none", special.text)}>
                                                                    {special.label}
                                                                </span>
                                                                {needsLineBelow && showRowDividers && (
                                                                    <div className="absolute h-px bg-gray-100 left-0.5 right-0.5" style={{ top: 'calc(100% + 1px)' }} />
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            key={log.id}
                                                            className="relative flex w-full min-w-0 flex-row items-center justify-between gap-1"
                                                        >
                                                            <span className="min-w-0 flex-1 truncate text-[6px] font-normal leading-none text-zinc-600">
                                                                {name}
                                                            </span>
                                                            <span className="flex shrink-0 items-center gap-0 font-mono text-[7px] font-bold leading-none" data-week-log-hours>
                                                                <span className={cn("", isNoRegistered ? "text-rose-600" : "text-emerald-600")}>
                                                                    {inHour || '—'}
                                                                </span>
                                                                <span className="font-normal text-zinc-600">{timeSeparator}</span>
                                                                <span className="text-rose-600">{outHour || ''}</span>
                                                            </span>
                                                            {needsLineBelow && showRowDividers && (
                                                                <div className="absolute h-px bg-gray-100 left-0.5 right-0.5" style={{ top: 'calc(100% + 1px)' }} />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {overflow > 0 && (
                                                    <div className="flex w-full min-w-0 flex-row items-center justify-start">
                                                        <span className="text-[7px] font-bold text-gray-400">+{overflow} más</span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    );
                })}
        </div>
    );
}
