'use client';

import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    Filter,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    CheckCircle,
    CheckCircle2,
    Circle,
    Search,
    X,
    Clock,
    Clock3,
    TrendingUp,
    Users,
    Download,
    Info,
    BadgeDollarSign,
    HandCoins,
    Calculator
} from 'lucide-react';
import React, { memo, useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths, getISOWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, togglePaidStatus, type WeeklyStats, type StaffWeeklyStats } from '@/app/actions/overtime';
import { cn } from '@/lib/utils';

// [ARCHITECT_ULTRAFLUIDITY] Memoized Sub-components
const StaffDetailRow = memo(({
    staff,
    onTogglePaid,
    selectedWeekName
}: {
    staff: StaffWeeklyStats,
    onTogglePaid: (staffId: string, currentPaidStatus: boolean, stats: any) => void,
    selectedWeekName: string
}) => {
    const formatValue = (val: number, suffix: string = '') => {
        if (val === 0) return " ";
        return `${val.toFixed(2)}${suffix}`;
    };

    const formatHours = (val: number) => {
        if (val === 0) return " ";
        return `${val.toFixed(1)}h`;
    };

    return (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100/50 hover:bg-white hover:shadow-xl hover:scale-[1.01] transition-all group">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#36606F] text-white flex items-center justify-center text-xs font-black shadow-lg">
                    {staff.name.charAt(0)}
                </div>
                <div>
                    <span className="text-sm font-black text-[#36606F] block tracking-tight uppercase">{staff.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{formatHours(staff.totalHours)} totales</span>
                        {staff.overtimeHours > 0 && (
                            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">• {formatHours(staff.overtimeHours)} EXTRA</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="text-right flex flex-col items-end">
                    <span className={cn(
                        "text-lg font-black tabular-nums leading-none tracking-tighter",
                        staff.isPaid ? "text-emerald-500" : "text-[#36606F]"
                    )}>
                        {formatValue(staff.totalCost, '€')}
                    </span>
                    <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">COSTO EXTRA</span>
                </div>
                <button
                    onClick={() => onTogglePaid(staff.id, staff.isPaid, { totalHours: staff.totalHours, overtimeHours: staff.overtimeHours })}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-100 shadow-sm transition-all hover:scale-110 active:scale-95 group-hover:border-[#36606F]/20"
                >
                    {staff.isPaid ? (
                        <CheckCircle2 size={20} className="text-emerald-500" strokeWidth={3} />
                    ) : (
                        <Circle size={20} className="text-zinc-200" strokeWidth={3} />
                    )}
                </button>
            </div>
        </div>
    );
});
StaffDetailRow.displayName = 'StaffDetailRow';

const WeekOvertimeCard = memo(({
    week,
    onClick
}: {
    week: WeeklyStats,
    onClick: () => void
}) => {
    const allStaffPaid = week.staff.every(s => s.isPaid);
    const paidCount = week.staff.filter(s => s.isPaid).length;
    const totalCount = week.staff.length;

    const formatValue = (val: number, suffix: string = '') => {
        if (val === 0) return " ";
        return `${val.toFixed(0)}${suffix}`;
    };

    const formatHours = (val: number) => {
        if (val === 0) return " ";
        return `${val.toFixed(1)}h`;
    };

    const weekNumber = getISOWeek(week.startDate);

    return (
        <div
            onClick={onClick}
            className="group relative bg-white rounded-[2.5rem] shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer border border-zinc-100 flex flex-col overflow-hidden animate-in fade-in duration-300"
        >
            {/* Header Rojo Compacto (Refined) */}
            <div className="bg-[#D64D5D] p-3 flex justify-center items-center shadow-sm relative overflow-hidden">
                <span className="text-[11px] font-black text-white uppercase tracking-wider relative z-10">
                    Semana {weekNumber} • {format(week.startDate, 'd MMM', { locale: es })} - {format(addDays(week.startDate, 6), 'd MMM', { locale: es })}
                </span>
                {allStaffPaid && (
                    <div className="absolute right-4 bg-emerald-500/20 text-white p-1 rounded-full border border-white/20">
                        <CheckCircle2 size={12} strokeWidth={4} />
                    </div>
                )}
            </div>

            <div className="p-5 flex flex-col">
                {/* Main Metric Row */}
                <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-4xl font-black text-zinc-900 tracking-tighter tabular-nums leading-none">
                        {formatValue(week.totalAmount, '€')}
                    </span>
                    <div className="flex flex-col items-end">
                        <div className={cn(
                            "text-sm font-black uppercase tracking-tighter whitespace-nowrap leading-none",
                            allStaffPaid ? "text-emerald-500" : "text-orange-500"
                        )}>
                            {allStaffPaid ? 'PAGADO' : `${paidCount}/${totalCount} LISTO`}
                        </div>
                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter opacity-70 mt-1">ESTADO PAGO</span>
                    </div>
                </div>

                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-4">
                    COSTO EXTRA SEMANAL
                </span>

                {/* Symmetrical Metrics Footer (Bento style) */}
                <div className="grid grid-cols-2 gap-0 pt-3 border-t border-zinc-100 mt-auto">
                    <div className="flex flex-col items-center">
                        <span className="text-[11px] font-black text-zinc-900 tabular-nums">{formatHours(week.totalHours)}</span>
                        <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Producción</span>
                    </div>
                    <div className="flex flex-col items-center border-l border-zinc-100">
                        <span className="text-[11px] font-black text-[#36606F] tabular-nums">{week.staff.length}</span>
                        <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Trabajadores</span>
                    </div>
                </div>
            </div>
        </div>
    );
});
WeekOvertimeCard.displayName = 'WeekOvertimeCard';

export default function OvertimePage() {
    const supabase = createClient();
    const router = useRouter();

    // Filtros de Fecha
    const [startDate, setStartDate] = useState(() => {
        return format(startOfMonth(new Date()), 'yyyy-MM-dd');
    });
    const [endDate, setEndDate] = useState(() => {
        return format(endOfMonth(new Date()), 'yyyy-MM-dd');
    });

    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<(WeeklyStats & { expanded: boolean })[]>([]);
    const [summary, setSummary] = useState({ totalCost: 0, totalHours: 0, totalOvertimeCost: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
    const [staffList, setStaffList] = useState<{ id: string, full_name: string }[]>([]);
    const [selectedWeek, setSelectedWeek] = useState<(WeeklyStats & { expanded: boolean }) | null>(null);
    const [showWorkerPicker, setShowWorkerPicker] = useState(false);

    // UI States for filters
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [showManualDates, setShowManualDates] = useState(false);

    // [ARCHITECT_ULTRAFLUIDITY] Incremental rendering
    const [displayLimit, setDisplayLimit] = useState(15);

    const PRESETS = [
        { label: 'Últimos 30 días', getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
        { label: 'Este Mes', getValue: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
        {
            label: 'Mes Pasado', getValue: () => {
                const d = subDays(startOfMonth(new Date()), 1);
                return { start: startOfMonth(d), end: endOfMonth(d) };
            }
        },
        { label: 'Histórico', getValue: () => ({ start: subDays(new Date(), 365), end: new Date() }) },
    ];

    useEffect(() => {
        fetchStaff();
    }, []);

    useEffect(() => {
        fetchOvertimeData();
    }, [startDate, endDate, selectedWorkerId]);

    async function fetchStaff() {
        const { data } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .order('first_name');

        if (data) {
            setStaffList(data.map(p => ({
                id: p.id,
                full_name: `${p.first_name} ${p.last_name || ''}`
            })));
        }
    }

    async function fetchOvertimeData() {
        setLoading(true);
        try {
            const { weeksResult, summary } = await getOvertimeData(startDate, endDate, selectedWorkerId || undefined);

            const localWeeks = weeksResult.map((w, idx) => ({
                ...w,
                expanded: idx === 0 // Expand the first one
            }));

            setWeeksData(localWeeks);
            setSummary(summary);

        } catch (error) {
            console.error(error);
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    }

    const applyPreset = (preset: any) => {
        const { start, end } = preset.getValue();
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
    };

    const filteredWeeksData = useMemo(() => {
        return weeksData.filter(week => week.staff.length > 0);
    }, [weeksData]);

    const visibleWeeks = useMemo(() => {
        return filteredWeeksData.slice(0, displayLimit);
    }, [filteredWeeksData, displayLimit]);

    const togglePaid = async (staffId: string, weekStart: string, currentPaidStatus: boolean, stats: { totalHours: number, overtimeHours: number }) => {
        const mondayISO = weekStart;
        const newStatus = !currentPaidStatus;

        // Optimistic update in weeksData
        setWeeksData(prev => prev.map(w => {
            if (w.weekId === mondayISO) {
                return {
                    ...w,
                    staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: newStatus } : s)
                };
            }
            return w;
        }));

        // Optimistic update in selectedWeek if open
        if (selectedWeek && selectedWeek.weekId === mondayISO) {
            setSelectedWeek(prev => prev ? {
                ...prev,
                staff: prev.staff.map(s => s.id === staffId ? { ...s, isPaid: newStatus } : s)
            } : null);
        }

        try {
            const result = await togglePaidStatus(staffId, mondayISO, newStatus, stats);

            if (!result.success) throw new Error("Error updating payment status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar estado");
            // Revert
            setWeeksData(prev => prev.map(w => {
                if (format(w.startDate, 'yyyy-MM-dd') === mondayISO) {
                    return {
                        ...w,
                        staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: currentPaidStatus } : s)
                    };
                }
                return w;
            }));
            if (selectedWeek && format(selectedWeek.startDate, 'yyyy-MM-dd') === mondayISO) {
                setSelectedWeek(prev => prev ? {
                    ...prev,
                    staff: prev.staff.map(s => s.id === staffId ? { ...s, isPaid: currentPaidStatus } : s)
                } : null);
            }
        }
    };

    const formatValue = (val: number, suffix: string = '') => {
        if (val === 0) return " ";
        return `${val.toFixed(0)}${suffix}`;
    };

    const formatHours = (val: number) => {
        if (val === 0) return " ";
        return `${val.toFixed(1)}h`;
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* --- INTEGRATED DARK HEADER --- */}
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-4 relative">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 md:gap-4">
                                <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 transition-all border border-white/10 active:scale-95">
                                    <ArrowLeft className="w-5 h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight italic text-nowrap">Histórico Extras</h1>
                            </div>
                            <button onClick={() => router.back()} className="text-white/40 hover:text-white transition-colors p-2">
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    <div className="p-6 md:p-8 w-full bg-white min-h-screen">

                        {/* FILTROS Y BÚSQUEDA (Layout Compacto) */}
                        <div className="mb-6 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                                {/* Selector de Trabajador */}
                                <div className="relative flex-1">
                                    <button
                                        onClick={() => setShowWorkerPicker(!showWorkerPicker)}
                                        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none hover:border-blue-200 transition-all"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Users size={14} className="text-blue-500" />
                                            <span>{selectedWorkerId ? staffList.find(s => s.id === selectedWorkerId)?.full_name : "Todos los trabajadores"}</span>
                                        </div>
                                        <ChevronDown size={14} className={cn("text-gray-400 transition-transform", showWorkerPicker && "rotate-180")} />
                                    </button>

                                    {showWorkerPicker && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowWorkerPicker(false)}></div>
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in zoom-in duration-200 max-h-[300px] overflow-y-auto no-scrollbar">
                                                <button
                                                    onClick={() => {
                                                        setSelectedWorkerId(null);
                                                        setShowWorkerPicker(false);
                                                    }}
                                                    className={cn(
                                                        "w-full px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-left mb-1",
                                                        !selectedWorkerId ? "bg-rose-500 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                                    )}
                                                >
                                                    Todos los trabajadores
                                                </button>
                                                {staffList.map((staff) => (
                                                    <button
                                                        key={staff.id}
                                                        onClick={() => {
                                                            setSelectedWorkerId(staff.id);
                                                            setShowWorkerPicker(false);
                                                        }}
                                                        className={cn(
                                                            "w-full px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-left mb-1",
                                                            selectedWorkerId === staff.id ? "bg-rose-500 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                                        )}
                                                    >
                                                        {staff.full_name}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Fecha Filtro */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <div className="flex gap-1">
                                            {PRESETS.slice(0, 2).map(p => (
                                                <button
                                                    key={p.label}
                                                    onClick={() => {
                                                        applyPreset(p);
                                                        setShowManualDates(false);
                                                    }}
                                                    className="px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[9px] font-black text-gray-500 hover:bg-white hover:border-blue-200 transition-all uppercase"
                                                >
                                                    {p.label.split(' ')[0]}
                                                </button>
                                            ))}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowMonthPicker(!showMonthPicker)}
                                                    className={cn(
                                                        "px-2 py-1.5 border rounded-lg text-[9px] font-black transition-all uppercase",
                                                        showMonthPicker ? "bg-rose-500 text-white border-rose-500" : "bg-gray-50 border-gray-100 text-gray-500 hover:bg-white hover:border-blue-200"
                                                    )}
                                                >
                                                    Periodo
                                                </button>
                                                {showMonthPicker && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)}></div>
                                                        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in zoom-in duration-200">
                                                            <div className="grid grid-cols-1 gap-1 max-h-[240px] overflow-y-auto no-scrollbar">
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
                                                                                isCurrent
                                                                                    ? "bg-rose-500 text-white"
                                                                                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
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
                                        </div>
                                    </div>
                                    <div className="h-4 w-px bg-gray-200 shrink-0 mx-1"></div>
                                    <div className="flex items-center gap-1.5 shrink-0 relative">
                                        {!showManualDates ? (
                                            <button
                                                onClick={() => setShowManualDates(true)}
                                                className="h-8 px-3 rounded-lg bg-gray-50 border border-gray-100 text-[10px] font-black text-gray-700 flex items-center gap-1.5 hover:border-blue-200 transition-all"
                                            >
                                                <Calendar size={12} className="text-blue-500" />
                                                {format(new Date(startDate), 'dd MMM', { locale: es })} - {format(new Date(endDate), 'dd MMM', { locale: es })}
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-1 animate-in slide-in-from-right-2 duration-200">
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                    className="h-8 px-2 rounded-lg bg-white border border-blue-200 text-[9px] font-black text-gray-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                />
                                                <span className="text-[9px] font-black text-gray-400">/</span>
                                                <input
                                                    type="date"
                                                    value={endDate}
                                                    onChange={(e) => setEndDate(e.target.value)}
                                                    className="h-8 px-2 rounded-lg bg-white border border-blue-200 text-[9px] font-black text-gray-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                />
                                                <button
                                                    onClick={() => setShowManualDates(false)}
                                                    className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* KPI SUMMARY CLEAN */}
                        <div className="grid grid-cols-3 gap-0 mb-8 py-8 border-y border-gray-50 bg-gray-50/30 rounded-3xl mx-1">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-2xl md:text-3xl font-black text-zinc-900 tabular-nums leading-none mb-1">{formatValue(summary.totalCost, '€')}</span>
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest font-bold">TOTAL PERIODO</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-100 italic">
                                <span className="text-2xl md:text-3xl font-black text-orange-500 tabular-nums leading-none mb-1">{formatValue(summary.totalOvertimeCost, '€')}</span>
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest font-bold">EXCESOS</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-2xl md:text-3xl font-black text-blue-500 tabular-nums leading-none mb-1">{formatHours(summary.totalHours)}</span>
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest font-bold">PRODUCCIÓN</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-4 px-2 italic">
                            <h2 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Desglose Semanal</h2>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[9px] font-black text-zinc-400 uppercase">Todo Pagado</span>
                            </div>
                        </div>

                        <div className="p-2 md:p-3 bg-white flex-1 overflow-y-auto no-scrollbar">
                            <div className="bg-[#EFEDED] rounded-[2.5rem] border border-zinc-100 shadow-xl overflow-hidden min-h-[500px]">
                                {/* LISTADO DE SEMANAS */}
                                <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
                                        {loading ? (
                                            <div className="col-span-full text-center py-20 text-blue-400 font-bold animate-pulse uppercase tracking-widest text-xs">Calculando nóminas...</div>
                                        ) : filteredWeeksData.length === 0 ? (
                                            <div className="col-span-full text-center py-20 bg-white/50 rounded-[2rem] border-2 border-dashed border-gray-100">
                                                <p className="text-gray-400 font-bold text-sm">Sin resultados</p>
                                            </div>
                                        ) : (
                                            <>
                                                {visibleWeeks.map(week => (
                                                    <WeekOvertimeCard
                                                        key={week.weekId}
                                                        week={week}
                                                        onClick={() => setSelectedWeek(week)}
                                                    />
                                                ))}

                                                {filteredWeeksData.length > displayLimit && (
                                                    <div
                                                        className="col-span-full py-10 flex justify-center"
                                                        ref={(el) => {
                                                            if (!el) return;
                                                            const observer = new IntersectionObserver((entries) => {
                                                                if (entries[0].isIntersecting) {
                                                                    setDisplayLimit(prev => prev + 15);
                                                                }
                                                            });
                                                            observer.observe(el);
                                                        }}
                                                    >
                                                        <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest animate-pulse">
                                                            Cargando más semanas...
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL DETALLE SEMANA */}
            {selectedWeek && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#36606F]/80 backdrop-blur-md" onClick={() => setSelectedWeek(null)}></div>
                    <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Header Azul Marbella */}
                        <div className="bg-[#36606F] p-8 text-white relative shrink-0 text-center">
                            <button
                                onClick={() => setSelectedWeek(null)}
                                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 active:scale-95"
                            >
                                <X size={20} strokeWidth={3} />
                            </button>

                            <div className="mt-4">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2 block font-bold">Resumen de Nómina</span>
                                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mx-auto max-w-[90%] break-words italic text-white/90">
                                    {selectedWeek.label}
                                </h2>
                                <div className="flex items-center justify-center gap-6 mt-8">
                                    <div className="flex flex-col items-center">
                                        <span className="text-xl font-black text-white">{selectedWeek.totalAmount.toFixed(0)}€</span>
                                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">Extra Total</span>
                                    </div>
                                    <div className="h-8 w-px bg-white/10"></div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-xl font-black text-emerald-400">{selectedWeek.staff.filter(s => s.isPaid).length}/{selectedWeek.staff.length}</span>
                                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">Pagados</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Lista de Trabajadores */}
                        <div className="p-6 md:p-8 space-y-3 overflow-y-auto flex-1 custom-scrollbar bg-[#EFEDED] no-scrollbar">
                            <div className="space-y-3">
                                {selectedWeek.staff.map((staff, idx) => (
                                    <StaffDetailRow
                                        key={idx}
                                        staff={staff}
                                        selectedWeekName={selectedWeek.label}
                                        onTogglePaid={(staffId, currentPaidStatus, stats) =>
                                            togglePaid(staffId, selectedWeek.weekId, currentPaidStatus, stats)
                                        }
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Footer Modal */}
                        <div className="p-6 bg-white border-t border-gray-100/50">
                            <button
                                onClick={() => setSelectedWeek(null)}
                                className="w-full h-14 bg-[#36606F] text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                Cerrar Detalle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}