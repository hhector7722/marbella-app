'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from "@/utils/supabase/client";
import { X } from 'lucide-react';
import { format, isSameDay, addDays, parseISO, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
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
        preferStock?: boolean;
    };
}

interface WorkerWeeklyHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    workerId: string;
    weekStart: string; // ISO Date string (yyyy-MM-dd) of the Monday
}

// --- VISUAL HELPERS (idénticos a StaffDashboardView.tsx) ---
const fmtDecimal = (val: number): string => {
    const s = val.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return ' ';
    const str = Math.abs(val).toFixed(0);
    return val < 0 ? `-${str}€` : `${str}€`;
};

const formatWorked = (val: number) => fmtDecimal(Math.abs(val));

export default function WorkerWeeklyHistoryModal({ isOpen, onClose, workerId, weekStart }: WorkerWeeklyHistoryModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [weekData, setWeekData] = useState<WeeklyData | null>(null);
    const [workerName, setWorkerName] = useState('');
    const [calculatorOpen, setCalculatorOpen] = useState(false);

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

            // 5. Set Final State (Perfect Photocopy Mapping)
            // Usamos startBalance de get_monthly_timesheet y preferStock de get_weekly_worker_stats
            const summaryFromTS = targetWeek?.summary;
            
            setWeekData({
                weekNumber: parseInt(format(mondayDate, 'w')),
                startDate: mondayDate,
                endDate: sundayDate,
                days: weekDays,
                summary: {
                    totalHours: rpcStaff?.totalHours ?? summaryFromTS?.totalHours ?? 0,
                    weeklyBalance: rpcStaff?.overtimeHours ?? summaryFromTS?.weeklyBalance ?? 0,
                    estimatedValue: rpcStaff?.totalCost ?? summaryFromTS?.estimatedValue ?? 0,
                    finalBalance: rpcStaff?.overtimeHours ?? summaryFromTS?.finalBalance ?? 0,
                    isPaid: rpcStaff?.isPaid ?? summaryFromTS?.isPaid ?? false,
                    contractedHours: 0,
                    startBalance: summaryFromTS?.startBalance ?? 0,
                    preferStock: rpcStaff?.preferStock ?? false
                }
            });
        } catch (error) {
            console.error("Error in Modal:", error);
            toast.error("Error al cargar detalles semanales");
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal((
        <div className="fixed inset-0 bg-black/60 z-[220] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col w-fit max-w-[95vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex flex-col min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Historial Semanal</h3>
                        <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1 truncate">
                            {format(parseISO(weekStart), 'd MMM', { locale: es })} - {format(addDays(parseISO(weekStart), 6), 'd MMM yyyy', { locale: es })} • {workerName}
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90 min-h-[48px] min-w-[48px]">
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />

                {/* Content: contenedor se adapta al tamaño de la tabla */}
                <div className="p-4 overflow-auto shrink-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 min-w-[280px]">
                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                        </div>
                    ) : weekData ? (
                        <div className="mb-4 relative z-0">
                            <div className="grid grid-cols-7 gap-2">
                                {weekData.days.map((day, i) => (
                                    <div
                                        key={i}
                                        className="flex flex-col min-h-[108px] bg-white relative rounded-xl shadow-sm overflow-hidden"
                                    >
                                        <div className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center relative z-10">
                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                        </div>
                                        <div className="flex-1 p-1 flex flex-col items-stretch relative z-0 bg-white">
                                            <span className={`absolute top-1 right-1 text-[9px] font-bold ${day.isToday ? 'text-blue-600' : 'text-zinc-400'}`}>{day.dayNumber}</span>
                                            <div className="flex-1 flex flex-col justify-center w-full pb-1 mt-4 min-h-[52px]">
                                                <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                                    {day.hasLog ? (
                                                        <>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                            <span className="text-[9px] font-mono text-zinc-700 leading-none">{day.clockIn}</span>
                                                        </>
                                                    ) : <span className="text-[9px] text-transparent select-none">0</span>}
                                                </div>
                                                <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                                    {day.hasLog && day.clockOut ? (
                                                        <>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                                            <span className="text-[9px] font-mono text-zinc-700 leading-none">{day.clockOut}</span>
                                                        </>
                                                    ) : (day.hasLog && !day.clockOut && day.isToday ? <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" /> : <span className="text-[9px] text-transparent select-none">0</span>)}
                                                </div>
                                            </div>
                                            <div className="w-full space-y-0 pt-0.5 min-h-[26px]">
                                                {day.hasLog && day.totalHours > 0.05 ? (
                                                    <div className="flex justify-between items-center text-[8px] text-zinc-400 h-3">
                                                        <span className="ml-0.5 font-black uppercase tracking-tighter">H</span>
                                                        <span className="font-bold text-zinc-800 pr-1">{fmtDecimal(day.totalHours)}</span>
                                                    </div>
                                                ) : <div className="h-3" />}
                                                {day.extraHours > 0.05 ? (
                                                    <div className="flex justify-between items-center text-[8px] text-zinc-400 h-3">
                                                        <span className="ml-0.5 font-black uppercase tracking-tighter">EX</span>
                                                        <span className="font-bold text-zinc-800 pr-1">{fmtDecimal(day.extraHours)}</span>
                                                    </div>
                                                ) : <div className="h-3" />}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-2 bg-white rounded-2xl shadow-sm flex items-center h-10 relative z-10 overflow-hidden">
                                {weekData.summary.isPaid && (
                                    <img
                                        src="/sello/pagado.png"
                                        alt="PAGADO"
                                        className="absolute right-0.5 top-1/2 -translate-y-1/2 w-[64px] h-auto z-30 pointer-events-none md:w-[72px]"
                                    />
                                )}
                                <div className="w-24 pl-3 shrink-0 flex items-center h-full">
                                    <span className="font-black text-[11px] md:text-[12px] uppercase leading-none text-zinc-600 whitespace-nowrap">
                                        SEMANA {weekData.weekNumber}
                                    </span>
                                </div>
                                <div className="flex-1 grid grid-cols-4 h-full relative z-20 pr-16 md:pr-24">
                                    <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                        <span className="text-[9px] font-black leading-none text-black block">
                                            {weekData.summary.totalHours > 0.05 ? fmtDecimal(weekData.summary.totalHours) : " "}
                                        </span>
                                        <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">HORAS</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                        {(() => {
                                            const startBalance = weekData.summary.startBalance ?? 0;
                                            const hasPending = Math.abs(startBalance) > 0.05;
                                            const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                                            const isFutureWeek = weekData.startDate > currentWeekStart;
                                            const showPending = hasPending && !isFutureWeek;
                                            const colorClass = !showPending ? "text-transparent" : startBalance >= 0 ? "text-emerald-600" : "text-red-600";
                                            const text = showPending ? fmtDecimal(Math.abs(startBalance)) : " ";
                                            return (
                                                <span className={cn("text-[9px] font-black leading-none block", colorClass)}>
                                                    {text}
                                                </span>
                                            );
                                        })()}
                                        <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter text-center">PENDIENTES</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                        <span className="text-[9px] font-black leading-none text-black block">
                                            {(weekData.summary.weeklyBalance ?? 0) > 0.05 ? fmtDecimal(Math.abs(weekData.summary.weeklyBalance)) : " "}
                                        </span>
                                        <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">EXTRAS</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                        <span className="text-[9px] font-black leading-none text-emerald-600 block">
                                            {(weekData.summary.estimatedValue ?? 0) > 0.05 && weekData.summary.preferStock !== true
                                                ? fmtMoney(weekData.summary.estimatedValue)
                                                : " "}
                                        </span>
                                        <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter text-center">IMPORTE</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-gray-400">No data found</div>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
}
