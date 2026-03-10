'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { X } from 'lucide-react';
import { format, isSameDay, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';

// --- TYPES ---
interface DailyLog {
    date: Date;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string;
    clockOut: string;
    totalHours: number;
    extraHours: number;
    isToday: boolean;
}

interface WeeklyData {
    weekNumber: number;
    startDate: Date;
    endDate: Date;
    days: DailyLog[];
    summary: {
        totalHours: number;
        weeklyBalance: number;
        estimatedValue: number;
        startBalance: number;
        finalBalance: number;
        isPaid: boolean;
        contractedHours: number;
    };
}

interface WorkerWeeklyHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    workerId: string;
    weekStart: string; // ISO Date string (yyyy-MM-dd) of the Monday
}

// --- VISUAL HELPERS (idénticos a /staff/dashboard) ---
const formatValue = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(Number(val))) return ' ';
    const n = Number(val);
    if (Math.abs(n) < 0.1) return ' ';
    return Math.round(n).toString();
};
const formatMoney = (val: number) => {
    if (Math.abs(val) < 0.1) return " ";
    return `${val.toFixed(0)}€`;
};

export default function WorkerWeeklyHistoryModal({ isOpen, onClose, workerId, weekStart }: WorkerWeeklyHistoryModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [weekData, setWeekData] = useState<WeeklyData | null>(null);
    const [workerName, setWorkerName] = useState('');

    useEffect(() => {
        if (isOpen && workerId && weekStart) {
            fetchWeekData();
        }
    }, [isOpen, workerId, weekStart]);

    async function fetchWeekData() {
        setLoading(true);
        try {
            // 1. Fetch Profile
            const { data: profile } = await supabase.from('profiles')
                .select('first_name, last_name')
                .eq('id', workerId).single();

            if (profile) {
                setWorkerName(`${profile.first_name} ${profile.last_name || ''}`);
            }

            const mondayDate = parseISO(weekStart);
            const sundayDate = addDays(mondayDate, 6);
            const mondayISO = weekStart;
            const sundayISO = format(sundayDate, 'yyyy-MM-dd');

            // 2. Fetch SSOT Statistics (totales del footer)
            const { data: rpcData, error: rpcError } = await supabase.rpc('get_weekly_worker_stats', {
                p_start_date: mondayISO,
                p_end_date: sundayISO,
                p_user_id: workerId
            });

            if (rpcError) throw rpcError;

            const rpcWeek = rpcData?.weeksResult?.[0];
            const rpcStaff = rpcWeek?.staff?.[0];

            // 3. Fetch grid days from get_monthly_timesheet (misma fuente que /staff/history — extraHours correctos)
            const year = mondayDate.getFullYear();
            const month = mondayDate.getMonth() + 1; // 1-indexed for PostgreSQL

            const { data: timesheetData, error: tsError } = await supabase.rpc('get_monthly_timesheet', {
                p_user_id: workerId,
                p_year: year,
                p_month: month
            });

            if (tsError) throw tsError;

            const weeks = (timesheetData || []) as Array<{ startDate: string; days: Array<{ date: string; hasLog: boolean; clockIn: string | null; clockOut: string | null; totalHours: number; extraHours: number }>; summary?: any }>;
            const targetWeek = weeks.find((w) => {
                const ws = typeof w.startDate === 'string' ? w.startDate : (w.startDate as string)?.split?.('T')?.[0];
                return ws === weekStart;
            });

            const rawDays = targetWeek?.days || [];

            // 4. Build presentation array (formato unificado con /staff/history)
            const weekDays: DailyLog[] = rawDays.map((day: any) => {
                const d = new Date(day.date);
                return {
                    ...day,
                    date: d,
                    dayName: format(d, 'EEE', { locale: es }).toUpperCase().slice(0, 3),
                    dayNumber: d.getDate(),
                    isToday: isSameDay(d, new Date()),
                    clockIn: day.clockIn ?? '',
                    clockOut: day.clockOut ?? ''
                };
            });

            // 5. Set Final State (totales de get_weekly_worker_stats, días de get_monthly_timesheet)
            if (rpcStaff) {
                setWeekData({
                    weekNumber: parseInt(format(mondayDate, 'w')),
                    startDate: mondayDate,
                    endDate: sundayDate,
                    days: weekDays,
                    summary: {
                        totalHours: rpcStaff.totalHours ?? 0,
                        weeklyBalance: rpcStaff.overtimeHours ?? 0,
                        estimatedValue: rpcStaff.totalCost ?? 0,
                        finalBalance: rpcStaff.overtimeHours ?? 0,
                        isPaid: rpcStaff.isPaid ?? false,
                        contractedHours: 0,
                        startBalance: rpcStaff.pendingBalance ?? 0
                    }
                });
            } else if (targetWeek && weekDays.length > 0) {
                const s = targetWeek.summary;
                setWeekData({
                    weekNumber: parseInt(format(mondayDate, 'w')),
                    startDate: mondayDate,
                    endDate: sundayDate,
                    days: weekDays,
                    summary: {
                        totalHours: s?.totalHours ?? 0,
                        weeklyBalance: s?.weeklyBalance ?? 0,
                        estimatedValue: s?.estimatedValue ?? 0,
                        finalBalance: s?.finalBalance ?? 0,
                        isPaid: s?.isPaid ?? false,
                        contractedHours: 0,
                        startBalance: s?.startBalance ?? 0
                    }
                });
            }
        } catch (error) {
            console.error("Error in Modal:", error);
            toast.error("Error al cargar detalles semanales");
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col w-fit max-w-[95vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex flex-col min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Historial Semanal</h3>
                        <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1 truncate">
                            {format(parseISO(weekStart), 'd MMM', { locale: es })} - {format(addDays(parseISO(weekStart), 6), 'd MMM yyyy', { locale: es })} • {workerName}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90 shrink-0">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* Content: contenedor se adapta al tamaño de la tabla */}
                <div className="p-4 overflow-auto shrink-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 min-w-[280px]">
                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                        </div>
                    ) : weekData ? (
                        <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                            {/* Days Grid — fotocopia de /staff/dashboard */}
                            <div className="grid grid-cols-7">
                                {weekData.days.map((day, i) => (
                                    <div key={i} className="flex flex-col border-r border-gray-100 last:border-r-0 min-h-[110px] bg-white relative">
                                        <div className="h-7 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center relative z-10">
                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                        </div>
                                        <div className="flex-1 p-1 flex flex-col items-center relative z-0 bg-white">
                                            <span className={`absolute top-1 right-1 text-[9px] font-bold ${day.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.dayNumber}</span>
                                            <div className="flex-1 flex flex-col justify-center gap-1 w-full">
                                                {day.hasLog ? (
                                                    <>
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 shadow-sm"></div>
                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                        </div>
                                                        {day.clockOut && (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 shadow-sm"></div>
                                                                <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (<span className="text-gray-200 text-xs text-center">-</span>)}
                                            </div>
                                            <div className="w-full mt-auto space-y-0.5 pt-1">
                                                {day.hasLog && day.totalHours > 0 && (
                                                    <div className="flex justify-between items-end text-[8px] text-gray-400 border-t border-gray-50 pt-1">
                                                        <span>Horas</span><span className="font-bold text-gray-800">{day.totalHours > 0.05 ? day.totalHours.toFixed(0) : ' '}</span>
                                                    </div>
                                                )}
                                                {day.extraHours > 0 && (
                                                    <div className="flex justify-between items-end text-[8px] text-gray-400">
                                                        <span>Extras</span><span className="font-bold text-gray-800">{day.extraHours.toFixed(0)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer totales — fotocopia de /staff/dashboard (Horas, Extras, Pendiente, Importe) */}
                            <div className="p-3 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
                                <div className="flex flex-col items-center px-4 border-r border-gray-200 shrink-0">
                                    <span className="font-black text-gray-800 text-sm">{formatValue(weekData.summary.totalHours)}</span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Horas</span>
                                </div>
                                <div className="flex flex-col items-center px-4 border-r border-gray-200 shrink-0">
                                    <span className="font-black text-sm text-blue-600">{formatValue(weekData.summary.weeklyBalance)}</span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Extras</span>
                                </div>
                                <div className="flex flex-col items-center px-4 border-r border-gray-200 shrink-0">
                                    <span className={`font-black text-sm ${(weekData.summary.startBalance ?? 0) > 0 ? 'text-green-600' :
                                        (weekData.summary.startBalance ?? 0) < 0 ? 'text-red-500' : 'text-gray-400'
                                        }`}>
                                        {formatValue(weekData.summary.startBalance)}
                                    </span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Pendiente</span>
                                </div>
                                <div className="flex flex-col items-center px-4 shrink-0">
                                    <span className="font-black text-sm text-green-600">{formatMoney(weekData.summary.estimatedValue)}</span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Importe</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-gray-400">No data found</div>
                    )}
                </div>
            </div>
        </div>
    );
}
