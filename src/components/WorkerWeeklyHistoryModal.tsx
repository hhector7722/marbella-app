'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { X, Calendar, Edit2, Check } from 'lucide-react';
import { format, isSameDay, addDays, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn, calculateRoundedHours } from '@/lib/utils'; // Import shared rounding logic
import { updateWeeklyContractHours } from '@/app/actions/overtime';
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

// --- VISUAL HELPERS ---
const formatNumber = (val: number) => {
    if (Math.abs(val) < 0.1) return ' ';
    const rounded = Math.round(val * 2) / 2;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
};
const formatValue = (val: number) => formatNumber(val);
const formatBalance = (val: number) => formatNumber(val);
const formatMoney = (val: number) => {
    if (Math.abs(val) < 0.1) return " ";
    return `${val.toFixed(0)}€`;
};

export default function WorkerWeeklyHistoryModal({ isOpen, onClose, workerId, weekStart }: WorkerWeeklyHistoryModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [weekData, setWeekData] = useState<WeeklyData | null>(null);
    const [workerName, setWorkerName] = useState('');
    const [isEditingContract, setIsEditingContract] = useState(false);
    const [tempContractHours, setTempContractHours] = useState<number>(40);
    const [isSavingContract, setIsSavingContract] = useState(false);

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

            // 2. Define Date Range (UTC boundaries for Consistency)
            const mondayDate = parseISO(weekStart);
            const sundayDate = addDays(mondayDate, 6);
            const mondayISO = weekStart;
            const sundayISO = format(sundayDate, 'yyyy-MM-dd');

            // 3. Fetch RAW Logs for Grid (Grid needs detailed times)
            const { data: logs } = await supabase.from('time_logs')
                .select('*')
                .eq('user_id', workerId)
                .gte('clock_in', mondayISO)
                .lte('clock_in', sundayISO + 'T23:59:59Z')
                .order('clock_in', { ascending: true });

            // 4. Fetch SSOT Statistics from RPC
            const { data: rpcData, error: rpcError } = await supabase.rpc('get_weekly_worker_stats', {
                p_start_date: mondayISO,
                p_end_date: sundayISO,
                p_user_id: workerId
            });

            if (rpcError) throw rpcError;

            // 5. Process Daily Grid (keeps simple rounding for visual)
            const logsByDate = new Map();
            logs?.forEach(log => {
                const dateStr = format(parseISO(log.clock_in), 'yyyy-MM-dd');
                logsByDate.set(dateStr, log);
            });

            const weekDays: DailyLog[] = [];
            let currentAccumulated = 0;
            const DAILY_LIMIT = 8;

            // Note: rpcData has the SSOT contracted hours etc but for the GRID we might need the weekly one
            const rpcWeek = rpcData?.weeksResult?.[0];
            const rpcStaff = rpcWeek?.staff?.[0];
            const effContractForGrid = rpcStaff?.contracted_hours_weekly ?? 0;

            for (let i = 0; i < 7; i++) {
                const d = addDays(mondayDate, i);
                const dStr = format(d, 'yyyy-MM-dd');
                const isToday = isSameDay(d, new Date());
                const log = logsByDate.get(dStr);

                let h = 0, cin = '', cout = '', dayExtras = 0;
                if (log) {
                    const inD = parseISO(log.clock_in); cin = format(inD, 'HH:mm');
                    if (log.clock_out) { const outD = parseISO(log.clock_out); cout = format(outD, 'HH:mm'); }

                    h = log.total_hours ? calculateRoundedHours(log.total_hours) : 0;
                    const newAccumulated = currentAccumulated + h;
                    if (newAccumulated > effContractForGrid) {
                        dayExtras = (currentAccumulated >= effContractForGrid) ? h : (newAccumulated - effContractForGrid);
                    }
                    currentAccumulated = newAccumulated;
                }
                weekDays.push({
                    date: d,
                    dayName: format(d, 'EEE', { locale: es }).toUpperCase().slice(0, 3),
                    dayNumber: d.getDate(),
                    hasLog: !!log, clockIn: cin, clockOut: cout,
                    totalHours: h, extraHours: dayExtras, isToday: isToday
                });
            }

            // 6. Set Final State from RPC (SSOT)
            if (rpcStaff) {
                setWeekData({
                    weekNumber: parseInt(format(mondayDate, 'w')),
                    startDate: mondayDate,
                    endDate: sundayDate,
                    days: weekDays,
                    summary: {
                        totalHours: rpcStaff.totalHours,
                        weeklyBalance: rpcStaff.overtimeHours, // En este contexto, lo extra de la semana es el balance semanal
                        estimatedValue: rpcStaff.totalCost,
                        // Nota: La RPC devuelve totalCost y overtimeCost pero no el "pending_balance" de los snapshots explícitamente en el retorno de staff?
                        // Ah, la RPC calcula FinalBalance = Pending + Weekly. El 'totalCost' es FinalBalance * Rate.
                        // Usaremos los campos de rpcStaff para ser coherentes con el dash.
                        finalBalance: rpcStaff.overtimeHours,
                        isPaid: rpcStaff.isPaid,
                        contractedHours: effContractForGrid,
                        startBalance: rpcStaff.pendingBalance
                    }
                });
                setTempContractHours(effContractForGrid);
            }
        } catch (error) {
            console.error("Error in Modal:", error);
            toast.error("Error al cargar detalles semanales");
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveContract() {
        if (!workerId || !weekStart) return;
        if (isNaN(tempContractHours) || tempContractHours < 0) {
            toast.error("Las horas deben ser un número válido");
            return;
        }
        setIsSavingContract(true);
        try {
            const res = await updateWeeklyContractHours(workerId, weekStart, tempContractHours);
            if (res.success) {
                toast.success("Contrato semanal actualizado");
                setIsEditingContract(false);
                fetchWeekData();
            } else {
                toast.error(res.error || "Error al actualizar contrato");
            }
        } catch (error) {
            console.error(error);
            toast.error("Error crítico al actualizar contrato");
        } finally {
            setIsSavingContract(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Historial Semanal</h3>
                        <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">
                            {format(parseISO(weekStart), 'd MMM', { locale: es })} - {format(addDays(parseISO(weekStart), 6), 'd MMM yyyy', { locale: es })} • {workerName}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 bg-gray-50 min-h-[300px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                        </div>
                    ) : weekData ? (
                        <div className="bg-white rounded-2xl shadow-lg border border-purple-100 overflow-hidden ring-1 ring-purple-100/50 ring-offset-2">
                            {/* Days Grid */}
                            <div className="grid grid-cols-7 border-b border-gray-100">
                                {weekData.days.map((day, i) => (
                                    <div key={i} className="flex flex-col border-r border-gray-100 last:border-r-0 min-h-[90px] bg-white relative">
                                        <div className="h-4 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md relative z-10">
                                            <span className="text-[8px] font-bold text-white uppercase tracking-wider block truncate px-0.5">{day.dayName}</span>
                                        </div>
                                        <div className="flex-1 p-1 flex flex-col items-center relative z-0">
                                            <span className={`absolute top-1 right-1 text-[8px] font-bold ${day.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.dayNumber}</span>

                                            <div className="flex-1 flex flex-col justify-center gap-0.5 w-full pb-1 mt-3">
                                                <div className="h-3 flex items-center justify-center gap-1">
                                                    {day.hasLog && (
                                                        <>
                                                            <div className="w-1 h-1 rounded-full bg-green-500 shrink-0"></div>
                                                            <span className="text-[8px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="h-3 flex items-center justify-center gap-1">
                                                    {day.hasLog && day.clockOut && (
                                                        <>
                                                            <div className="w-1 h-1 rounded-full bg-red-500 shrink-0"></div>
                                                            <span className="text-[8px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="w-full space-y-0 pt-0.5 min-h-[22px]">
                                                {day.hasLog && day.totalHours > 0 ? (
                                                    <div className="flex justify-between items-center text-[7px] text-gray-400 h-2.5">
                                                        <span className="ml-0.5">H</span>
                                                        <span className="font-bold text-gray-800 pr-1">{formatNumber(day.totalHours)}</span>
                                                    </div>
                                                ) : <div className="h-2.5" />}
                                                {day.extraHours > 0.1 ? (
                                                    <div className="flex justify-between items-center text-[7px] text-gray-400 h-2.5">
                                                        <span className="ml-0.5">Ex</span>
                                                        <span className="font-bold text-gray-800 pr-1">{formatNumber(day.extraHours)}</span>
                                                    </div>
                                                ) : <div className="h-2.5" />}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Summary Footer */}
                            <div className="p-3 flex items-center justify-between gap-1 bg-white">
                                <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0 relative group/contract">
                                    {isEditingContract ? (
                                        <div className="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-200">
                                            <input
                                                type="number"
                                                value={tempContractHours}
                                                onChange={(e) => setTempContractHours(Number(e.target.value))}
                                                className="w-12 text-center font-black text-xs border-b-2 border-[#36606F] outline-none"
                                                autoFocus
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={handleSaveContract} disabled={isSavingContract} className="text-emerald-500 hover:scale-110 transition-transform disabled:opacity-50">
                                                    {isSavingContract ? <LoadingSpinner size="sm" /> : <Check size={14} strokeWidth={3} />}
                                                </button>
                                                <button onClick={() => { setIsEditingContract(false); setTempContractHours(weekData.summary.contractedHours); }} className="text-rose-400 hover:scale-110 transition-transform">
                                                    <X size={14} strokeWidth={3} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-1">
                                                <span className="font-black text-gray-800 text-xs leading-none">{formatValue(weekData.summary.contractedHours)}</span>
                                                <button
                                                    onClick={() => setIsEditingContract(true)}
                                                    className="opacity-0 group-hover/contract:opacity-100 transition-opacity text-gray-400 hover:text-[#36606F]"
                                                >
                                                    <Edit2 size={10} />
                                                </button>
                                            </div>
                                            <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Contrato</span>
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                    <span className="font-black text-gray-800 text-xs leading-none">{formatValue(weekData.summary.totalHours)}</span>
                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Horas</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                    <span className={`font-black text-xs leading-none ${weekData.summary.weeklyBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {formatBalance(weekData.summary.weeklyBalance)}
                                    </span>
                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Balance</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                    <span className={`font-black text-xs leading-none ${weekData.summary.startBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {formatBalance(weekData.summary.startBalance)}
                                    </span>
                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                    <span className={`font-black text-xs leading-none ${weekData.summary.finalBalance > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                        {weekData.summary.finalBalance > 0 ? formatBalance(weekData.summary.finalBalance) : " "}
                                    </span>
                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">H Extras</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 shrink-0">
                                    <span className="font-black text-xs leading-none text-green-600">
                                        {weekData.summary.estimatedValue > 0 ? formatMoney(weekData.summary.estimatedValue) : " "}
                                    </span>
                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Importe</span>
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
