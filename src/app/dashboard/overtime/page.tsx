'use client';

import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft, Calendar, Filter, ChevronDown, CheckCircle2, Circle, X, AlertCircle
} from 'lucide-react';
import React, { memo, useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths, getISOWeek, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, togglePaidStatus, type WeeklyStats, type StaffWeeklyStats } from '@/app/actions/overtime';
import { cn } from '@/lib/utils';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';

// REGLA ZERO-DISPLAY: En vistas de lectura, cualquier valor igual a 0 debe mostrarse como un espacio vacío " ".
const formatDisplay = (val: number, suffix: string = '') => {
    if (val === 0) return " ";
    return `${val.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${suffix}`;
};

// --- COMPONENTS UNIFIED WITH DASHBOARD ---

const StaffOvertimeRow = memo(({
    staff,
    weekId,
    onTogglePaid,
    onClick
}: {
    staff: StaffWeeklyStats,
    weekId: string,
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean, stats: any) => void,
    onClick: () => void
}) => (
    <div onClick={onClick} className="flex items-center justify-between p-3 bg-white/60 rounded-2xl border border-purple-100/30 cursor-pointer hover:bg-white transition-colors group">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 text-[#5E35B1] flex items-center justify-center text-xs font-black capitalize">
                {staff.name.charAt(0)}
            </div>
            <div>
                <span className="text-xs font-bold text-gray-700 capitalize group-hover:text-purple-700 transition-colors block">
                    {staff.name}
                </span>
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                    {staff.overtimeHours.toFixed(1)}h extra
                </span>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-sm font-black text-gray-800">{formatDisplay(staff.totalCost, '€')}</span>
            <button
                onClick={(e) => onTogglePaid(e, weekId, staff.id, !staff.isPaid, { totalHours: staff.totalHours, overtimeHours: staff.overtimeHours })}
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90",
                    staff.isPaid ? "bg-emerald-500 text-white shadow-md" : "bg-white border-2 border-gray-200 text-transparent"
                )}
            >
                <CheckCircle2 className="w-4 h-4" />
            </button>
        </div>
    </div>
));
StaffOvertimeRow.displayName = 'StaffOvertimeRow';

const WeekOvertimeCard = memo(({
    week,
    onTogglePaid,
    onSelectHistory
}: {
    week: WeeklyStats,
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean, stats: any) => void,
    onSelectHistory: (workerId: string, weekId: string) => void
}) => {
    const isFullyPaid = week.staff?.every((s: any) => s.isPaid);
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden transition-all">
            <button onClick={() => setExpanded(!expanded)} className="w-full p-3 flex items-center justify-between text-left group transition-colors hover:bg-gray-50/50">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center transition-transform group-hover:scale-110 shrink-0">
                        {isFullyPaid ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center shadow-sm">
                                <span className="text-white font-black text-sm leading-none pt-[1px]">!</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-gray-900">Sem {getISOWeek(new Date(week.weekId))}</h4>
                        <span className="font-light mx-0.5 text-gray-300">•</span>
                        <p className="text-[10px] font-bold uppercase pt-0.5 text-gray-500">
                            {format(new Date(week.weekId), "d MMM", { locale: es })} - {format(addDays(new Date(week.weekId), 6), "d MMM", { locale: es })}
                        </p>
                    </div>
                </div>
                <div className="text-right flex items-center gap-3">
                    <span className="text-lg font-black text-gray-900">{formatDisplay(week.totalAmount, '€')}</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform text-gray-400", expanded && "rotate-180")} />
                </div>
            </button>
            {expanded && (
                <div className="px-4 pb-4 pt-1 space-y-2 animate-in slide-in-from-top-2 duration-300">
                    {week.staff.map((s: any) => (
                        <StaffOvertimeRow
                            key={s.id}
                            staff={s}
                            weekId={week.weekId}
                            onTogglePaid={onTogglePaid}
                            onClick={() => onSelectHistory(s.id, week.weekId)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
WeekOvertimeCard.displayName = 'WeekOvertimeCard';

// --- MAIN PAGE ---

export default function OvertimePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<WeeklyStats[]>([]);
    const [summary, setSummary] = useState({ totalCost: 0, totalHours: 0, totalOvertimeCost: 0 });
    const [selectedHistory, setSelectedHistory] = useState<{ workerId: string, weekId: string } | null>(null);

    // Filters
    const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [showManualDates, setShowManualDates] = useState(false);

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await getOvertimeData(startDate, endDate);
            setWeeksData(result.weeksResult);
            setSummary(result.summary);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, status: boolean, stats: any) => {
        e.stopPropagation();

        // Optimistic update
        setWeeksData(prev => prev.map(w => {
            if (w.weekId === weekId) {
                return {
                    ...w,
                    staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: status } : s)
                };
            }
            return w;
        }));

        try {
            const result = await togglePaidStatus(staffId, weekId, status, stats);
            if (!result.success) throw new Error("Error logic");
            toast.success(status ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar");
            // Revert
            setWeeksData(prev => prev.map(w => {
                if (w.weekId === weekId) {
                    return {
                        ...w,
                        staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: !status } : s)
                    };
                }
                return w;
            }));
        }
    };

    return (
        <>
            <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
                <div className="max-w-4xl mx-auto space-y-4">
                    {/* DOUBLE CONTAINER STRUCTURE (Card-in-Card) */}
                    <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col min-h-[85vh]">

                        {/* INTEGRATED DARK HEADER */}
                        <div className="bg-[#36606F] p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 transition-all border border-white/10 active:scale-95">
                                        <ArrowLeft size={20} strokeWidth={3} />
                                    </button>
                                    <h1 className="text-2xl font-black text-white uppercase tracking-tight italic">Histórico Extras</h1>
                                </div>
                                <button onClick={() => router.push('/dashboard')} className="text-white/40 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* CAPSULE SUMMARY (KPIs) */}
                            <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-4 grid grid-cols-3 gap-2">
                                <div className="flex flex-col items-center justify-center text-center">
                                    <span className="text-xl font-black text-white leading-none whitespace-nowrap">{formatDisplay(summary.totalOvertimeCost, '€')}</span>
                                    <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">Coste Extra</span>
                                </div>
                                <div className="flex flex-col items-center justify-center text-center border-x border-white/10">
                                    <span className="text-xl font-black text-emerald-400 leading-none whitespace-nowrap">{formatDisplay(summary.totalCost, '€')}</span>
                                    <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">Total Ref.</span>
                                </div>
                                <div className="flex flex-col items-center justify-center text-center">
                                    <span className="text-xl font-black text-blue-300 leading-none whitespace-nowrap">{summary.totalHours.toFixed(0)}h</span>
                                    <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">Producción</span>
                                </div>
                            </div>
                        </div>

                        {/* FILTERS AREA (Bento Style) */}
                        <div className="p-6 bg-[#fafafa] space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                {/* PERIOD SELECTOR */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowMonthPicker(!showMonthPicker)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                            showMonthPicker ? "bg-rose-500 text-white" : "bg-white border border-gray-100 text-gray-400 hover:border-blue-200"
                                        )}
                                    >
                                        <Calendar size={14} />
                                        {format(new Date(startDate), 'MMMM yyyy', { locale: es })}
                                        <ChevronDown size={12} className={cn("transition-transform", showMonthPicker && "rotate-180")} />
                                    </button>

                                    {showMonthPicker && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)}></div>
                                            <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                <div className="grid grid-cols-1 gap-1 max-h-60 overflow-y-auto no-scrollbar">
                                                    {Array.from({ length: 12 }).map((_, i) => {
                                                        const d = addMonths(startOfMonth(new Date()), -i);
                                                        const isCurrent = isSameMonth(d, new Date(startDate));
                                                        return (
                                                            <button
                                                                key={i}
                                                                onClick={() => {
                                                                    setStartDate(format(startOfMonth(d), 'yyyy-MM-dd'));
                                                                    setEndDate(format(endOfMonth(d), 'yyyy-MM-dd'));
                                                                    setShowMonthPicker(false);
                                                                    setShowManualDates(false);
                                                                }}
                                                                className={cn(
                                                                    "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-left",
                                                                    isCurrent ? "bg-rose-500 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                                                )}
                                                            >
                                                                {format(d, 'MMMM yyyy', { locale: es })}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="h-6 w-px bg-gray-200 mx-2"></div>

                                {/* MANUAL DATES */}
                                {!showManualDates ? (
                                    <button
                                        onClick={() => setShowManualDates(true)}
                                        className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:border-blue-200 transition-all flex items-center gap-2"
                                    >
                                        <Filter size={14} /> Fecha Manual
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 animate-in slide-in-from-left duration-200">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-[10px] font-black text-gray-700 outline-none"
                                        />
                                        <span className="text-gray-300 font-black">/</span>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-[10px] font-black text-gray-700 outline-none"
                                        />
                                        <button onClick={() => setShowManualDates(false)} className="p-1.5 text-gray-400 hover:text-rose-500 transition-colors">
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* MAIN LIST CONTAINER (Internal Card) */}
                        <div className="flex-1 p-4 md:p-6 bg-white">
                            <div className="bg-[#EFEDED] rounded-[2rem] border border-zinc-100 shadow-inner p-4 md:p-6 min-h-[400px]">
                                {loading ? (
                                    <div className="h-64 flex flex-col items-center justify-center gap-4">
                                        <div className="w-12 h-12 border-4 border-[#36606F] border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-[10px] font-black text-[#36606F] uppercase tracking-[0.2em] animate-pulse">Sincronizando nóminas...</span>
                                    </div>
                                ) : weeksData.length === 0 ? (
                                    <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                                            <AlertCircle size={32} className="text-gray-200" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No hay registros</p>
                                            <p className="text-[10px] font-medium text-gray-400">Intenta con otro periodo o filtros</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {weeksData.map(week => (
                                            <WeekOvertimeCard
                                                key={week.weekId}
                                                week={week}
                                                onTogglePaid={handleTogglePaid}
                                                onSelectHistory={(workerId, weekId) => setSelectedHistory({ workerId, weekId })}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL HISTORIAL TRABAJADOR */}
            <WorkerWeeklyHistoryModal
                isOpen={!!selectedHistory}
                onClose={() => setSelectedHistory(null)}
                workerId={selectedHistory?.workerId || ''}
                weekStart={selectedHistory?.weekId || ''}
            />
        </>
    );
}