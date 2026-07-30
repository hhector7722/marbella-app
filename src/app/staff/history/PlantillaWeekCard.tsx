'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

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
    idx: number;
    onDayClick: (date: string) => void;
}

function getInitials(log: PlantillaDayLog): string {
    const f = (log.first_name || '').trim().charAt(0).toUpperCase() || '?';
    const l = (log.last_name || '').trim().charAt(0).toUpperCase() || '';
    return f + l;
}

/** "08:30" → "8" · "14:00" → "14". Solo la hora, sin minutos ni cero inicial. */
function formatHourOnly(time: string | null | undefined): string {
    if (!time) return '';
    // ANTI-ISO-SLICE: si llega un DateTime completo, quedarse con la parte horaria.
    const clean = time.includes('T') ? (time.split('T')[1] ?? '') : time;
    const hour = Number.parseInt(clean.split(':')[0] ?? '', 10);
    return Number.isFinite(hour) ? String(hour) : '';
}

export function PlantillaWeekCard({ week, idx, onDayClick }: PlantillaWeekCardProps) {
    return (
        <div className="rounded-xl border border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden bg-white">
            {idx === 0 && (
                <div className="rounded-t-2xl overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-gray-100">
                        {DAY_HEADERS.map((d) => (
                            <div
                                key={d}
                                className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                            >
                                <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">
                                    {d}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-7 border-b border-gray-100">
                {week.days.map((day, di) => {
                    return (
                        <div
                            key={di}
                            onClick={() => onDayClick(day.date)}
                            className={cn(
                                "relative border-r border-gray-100 last:border-r-0 min-h-[85px] flex flex-col p-1 pb-1 cursor-pointer transition-colors",
                                "bg-white hover:bg-zinc-50",
                                day.isToday && !day.isOtherMonth && "bg-blue-50/10"
                            )}
                        >
                            <span className={cn(
                                "absolute top-1 right-1 text-[9px] font-bold",
                                day.isToday && !day.isOtherMonth ? "text-blue-600" : (day.isOtherMonth ? "text-gray-400 opacity-50" : "text-gray-400")
                            )}>
                                {day.dayNumber}
                            </span>
                            <div className={cn("flex-1 flex flex-col items-stretch justify-center mt-3 w-full overflow-hidden", day.isOtherMonth && "opacity-45")}>
                                <div className="flex flex-col items-stretch justify-center w-full space-y-[3px] min-h-[117px]">
                                    {(() => {
                                        const logs = day.logs || [];
                                        const MAX_ROWS = 12;
                                        const overflow = logs.length > MAX_ROWS ? logs.length - MAX_ROWS + 1 : 0;
                                        const displayLogs = overflow > 0 ? logs.slice(0, MAX_ROWS - 1) : logs.slice(0, MAX_ROWS);

                                        return (
                                            <>
                                                {displayLogs.map((log, idx) => {
                                                    const special = SPECIAL_EVENTS[log.event_type || 'regular'];
                                                    const isNoRegistered =
                                                        log.event_type === 'no_registered' || log.clock_out_show_no_registrada === true;
                                                    const initials = getInitials(log);
                                                    const inHour = formatHourOnly(log.in_time);
                                                    const outHour = formatHourOnly(log.out_time);
                                                    const needsLineBelow = idx < displayLogs.length - 1 || overflow > 0;

                                                    if (special) {
                                                        return (
                                                            <div
                                                                key={log.id}
                                                                className="relative flex w-full min-w-0 flex-row items-center"
                                                            >
                                                                <span className="shrink-0 text-[7px] font-bold leading-none text-zinc-600">
                                                                    {initials}
                                                                </span>
                                                                <span className={cn("absolute left-3/4 -translate-x-1/2 text-[7px] font-black leading-none", special.text)}>
                                                                    {special.label}
                                                                </span>
                                                                {needsLineBelow && (
                                                                    <div className="absolute h-px bg-gray-100 left-0.5 right-0.5" style={{ top: 'calc(100% + 1px)' }} />
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            key={log.id}
                                                            className="relative flex w-full min-w-0 flex-row items-center justify-between"
                                                        >
                                                            <span className="shrink-0 text-[7px] font-bold leading-none text-zinc-600">
                                                                {initials}
                                                            </span>
                                                            <span className="flex shrink-0 items-center gap-0 font-mono text-[7px] font-bold leading-none">
                                                                <span className={cn("", isNoRegistered ? "text-rose-600" : "text-emerald-600")}>
                                                                    {inHour || '—'}
                                                                </span>
                                                                <span className="font-normal text-zinc-600">/</span>
                                                                <span className="text-rose-600">{outHour || ''}</span>
                                                            </span>
                                                            {needsLineBelow && (
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

            {/* Sin fila resumen en vista plantilla (manager sin empleado filtrado) */}
        </div>
    );
}
