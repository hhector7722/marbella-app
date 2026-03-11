'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'adjustment', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', initial: 'P', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
    { value: 'no_registered', label: 'No registrado', initial: '', showCross: true, color: 'bg-red-600 text-white', border: 'border-red-200 bg-red-50' },
];

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
                            <div className={cn("flex-1 flex flex-col items-stretch justify-center mt-3 w-full min-h-[52px] space-y-0.5 overflow-hidden", day.isOtherMonth && "opacity-45")}>
                                {(day.logs || []).slice(0, 4).map((log) => {
                                    const eventConfig = EVENT_TYPES.find(t => t.value === (log.event_type || 'regular'));
                                    const isRegular = !log.event_type || log.event_type === 'regular';
                                    const isComplete = !!log.clock_out && !log.clock_out_show_no_registrada;
                                    const initials = getInitials(log);

                                    return (
                                        <div
                                            key={log.id}
                                            className={cn(
                                                "flex flex-row items-center gap-1 w-full min-w-0",
                                                !isRegular && eventConfig && cn("rounded-md border p-[1px]", eventConfig.border)
                                            )}
                                        >
                                            <div className={cn(
                                                "w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0 flex-shrink-0",
                                                eventConfig?.showCross ? "bg-red-600 text-white" : (isComplete ? "bg-emerald-600 text-white text-[6.5px] leading-none font-black" : "bg-rose-600 text-white text-[6.5px] leading-none font-black")
                                            )}>
                                                {eventConfig?.showCross ? <X size={8} strokeWidth={2.5} className="text-white" /> : initials}
                                            </div>
                                            <div className="min-w-0 flex-1 flex items-center gap-0.5 truncate">
                                                {isRegular ? (
                                                    <>
                                                        <span className="text-[8px] font-mono font-bold text-emerald-600 shrink-0">{log.in_time || '—'}</span>
                                                        <span className="text-gray-300 text-[7px]">-</span>
                                                        <span className={cn(
                                                            "text-[8px] font-mono font-bold shrink-0",
                                                            log.clock_out_show_no_registrada ? "text-rose-600" : "text-rose-600"
                                                        )}>
                                                            {log.clock_out_show_no_registrada ? 'No reg.' : (log.out_time || '—')}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className={cn("text-[8px] font-black", eventConfig?.color || "text-gray-500")}>
                                                        {eventConfig?.initial || '?'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {(day.logs?.length || 0) > 4 && (
                                    <div className="text-[7px] font-bold text-gray-400">+{(day.logs?.length || 0) - 4} más</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bg-white border-t border-gray-100 flex items-center h-10 relative z-10">
                <div className="w-24 pl-3 shrink-0">
                    <span className="font-black text-[11px] md:text-[12px] uppercase leading-none text-zinc-600 whitespace-nowrap">
                        SEMANA {week.weekNumber}
                    </span>
                </div>
                <div className="flex-1 flex items-center justify-center pr-4">
                    <span className="text-[8px] text-zinc-400 font-black uppercase tracking-tighter">Vista plantilla</span>
                </div>
            </div>
        </div>
    );
}
