'use client';

import { useEffect, useState, useMemo } from 'react';
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
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, togglePaidStatus, type WeeklyStats, type StaffWeeklyStats } from '@/app/actions/overtime';
import { cn } from '@/lib/utils';

export default function OvertimePage() {
    const supabase = createClient();
    const router = useRouter();

    // Filtros de Fecha
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 60);
        return format(d, 'yyyy-MM-dd');
    });
    const [endDate, setEndDate] = useState(() => {
        return format(new Date(), 'yyyy-MM-dd');
    });

    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<(WeeklyStats & { expanded: boolean })[]>([]);
    const [summary, setSummary] = useState({ totalCost: 0, totalHours: 0, totalOvertimeCost: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [isAllPaidInView, setIsAllPaidInView] = useState(false);

    // UI States for filters
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [showManualDates, setShowManualDates] = useState(false);

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
        fetchOvertimeData();
    }, [startDate, endDate]);

    async function fetchOvertimeData() {
        setLoading(true);
        try {
            const { weeksResult, summary } = await getOvertimeData(startDate, endDate);

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

    const filteredWeeksData = weeksData.map(week => ({
        ...week,
        staff: week.staff.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    })).filter(week => week.staff.length > 0);

    const toggleWeek = (weekId: string) => {
        setWeeksData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));
    };

    const togglePaid = async (e: React.MouseEvent, week: (WeeklyStats & { expanded: boolean }), staff: StaffWeeklyStats) => {
        e.stopPropagation();
        const mondayISO = format(week.startDate, 'yyyy-MM-dd');
        const newStatus = !staff.isPaid;

        // Optimistic update
        setWeeksData(prev => prev.map(w => {
            if (w.weekId === week.weekId) {
                return {
                    ...w,
                    staff: w.staff.map(s => s.id === staff.id ? { ...s, isPaid: newStatus } : s)
                };
            }
            return w;
        }));

        try {
            const result = await togglePaidStatus(staff.id, mondayISO, newStatus, {
                totalHours: staff.totalHours,
                overtimeHours: staff.overtimeHours
            });

            if (!result.success) throw new Error("Error updating payment status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar estado");
            // Revert on error
            setWeeksData(prev => prev.map(w => {
                if (w.weekId === week.weekId) {
                    return {
                        ...w,
                        staff: w.staff.map(s => s.id === staff.id ? { ...s, isPaid: !newStatus } : s)
                    };
                }
                return w;
            }));
        }
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* CABECERA ESTRECHA MARBELLA DETAIL */}
                    <div className="bg-[#36606F] px-8 py-5 flex items-center justify-between">
                        <h1 className="text-xl font-black text-white uppercase tracking-wider">
                            Histórico Extras
                        </h1>
                        <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors p-2">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 w-full bg-[#5B8FB9] min-h-screen">

                        {/* FILTROS Y BÚSQUEDA (Layout Compacto) */}
                        <div className="mb-6 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                                {/* Buscador */}
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar staff..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    />
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

                        {/* KPI SUMMARY CLEAN (Sin tarjetas, solo texto y color) */}
                        <div className="grid grid-cols-3 gap-2 mb-8 py-6 border-y border-gray-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Periodo</span>
                                <span className="text-xl font-black text-[#5B8FB9]">{summary.totalCost.toFixed(0)}€</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Excesos</span>
                                <span className="text-xl font-black text-orange-500">{summary.totalOvertimeCost.toFixed(0)}€</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Producción</span>
                                <span className="text-xl font-black text-blue-500">{summary.totalHours.toFixed(0)}h</span>
                            </div>
                        </div>

                        {/* LISTADO DE SEMANAS */}
                        <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
                            <div className="space-y-4 pb-10">
                                {loading ? (
                                    <div className="text-center py-20 text-gray-300 font-bold animate-pulse uppercase tracking-widest text-xs">Calculando nóminas...</div>
                                ) : filteredWeeksData.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-100">
                                        <p className="text-gray-400 font-bold text-sm">Sin resultados</p>
                                    </div>
                                ) : (
                                    filteredWeeksData.map(week => {
                                        const allStaffPaid = week.staff.every(s => s.isPaid);
                                        const paidCount = week.staff.filter(s => s.isPaid).length;
                                        const totalCount = week.staff.length;

                                        return (
                                            <div key={week.weekId} className={cn(
                                                "bg-white rounded-3xl border transition-all duration-300 overflow-hidden",
                                                week.expanded ? "ring-2 ring-blue-500/10 shadow-lg border-blue-100" : "border-gray-100 hover:shadow-md"
                                            )}>
                                                {/* Cabecera Semana */}
                                                <div
                                                    onClick={() => toggleWeek(week.weekId)}
                                                    className="p-4 flex justify-between items-center cursor-pointer select-none"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                                            allStaffPaid ? "bg-emerald-50 text-emerald-500" : "bg-blue-50 text-blue-500"
                                                        )}>
                                                            <Calendar size={18} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">{week.label}</h3>
                                                                {allStaffPaid ? (
                                                                    <span className="bg-emerald-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full">PAGADA</span>
                                                                ) : (
                                                                    <span className="bg-orange-400 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full">{paidCount}/{totalCount} PAGADO</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase">{week.totalHours.toFixed(1)} horas totales</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <span className="text-lg font-black text-gray-800 leading-none">{week.totalAmount.toFixed(0)}€</span>
                                                        </div>
                                                        <ChevronDown size={16} className={cn("text-gray-300 transition-transform", week.expanded && "rotate-180")} />
                                                    </div>
                                                </div>

                                                {/* Desglose Empleados */}
                                                {week.expanded && (
                                                    <div className="px-4 pb-4 animate-in slide-in-from-top-2">
                                                        <div className="space-y-2 pt-2 border-t border-gray-50">
                                                            {week.staff.map((staff, idx) => (
                                                                <div key={idx} className="bg-gray-50/50 p-3 rounded-2xl flex items-center justify-between group hover:bg-white border border-transparent hover:border-gray-100 transition-all">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-xl bg-[#5B8FB9] text-white flex items-center justify-center text-[10px] font-black shadow-sm">
                                                                            {staff.name.charAt(0)}
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-xs font-black text-gray-700 block">{staff.name}</span>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-[9px] font-bold text-gray-400">{staff.totalHours.toFixed(1)}h</span>
                                                                                {staff.overtimeHours > 0 && <span className="text-[8px] font-black text-orange-500 bg-orange-100 px-1 rounded uppercase">+{staff.overtimeHours.toFixed(1)} ex</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="text-right">
                                                                            <span className={cn("text-xs font-black", staff.isPaid ? "text-gray-300 line-through" : "text-gray-800")}>{staff.totalCost.toFixed(0)}€</span>
                                                                            {staff.overtimeCost > 0 && <span className="block text-[8px] font-bold text-rose-400">Extras: {staff.overtimeCost.toFixed(0)}€</span>}
                                                                        </div>
                                                                        <button onClick={(e) => togglePaid(e, week, staff)} className="transition-all active:scale-90">
                                                                            {staff.isPaid ? (
                                                                                <CheckCircle2 size={20} className="text-emerald-500 fill-emerald-50" />
                                                                            ) : (
                                                                                <Circle size={20} className="text-gray-200 hover:text-blue-500" />
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}