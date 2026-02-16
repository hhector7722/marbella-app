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

    const filteredWeeksData = weeksData.filter(week => week.staff.length > 0);

    const togglePaid = async (staffId: string, weekStartDate: Date, currentPaidStatus: boolean, stats: { totalHours: number, overtimeHours: number }) => {
        const mondayISO = format(weekStartDate, 'yyyy-MM-dd');
        const newStatus = !currentPaidStatus;

        // Optimistic update in weeksData
        setWeeksData(prev => prev.map(w => {
            if (format(w.startDate, 'yyyy-MM-dd') === mondayISO) {
                return {
                    ...w,
                    staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: newStatus } : s)
                };
            }
            return w;
        }));

        // Optimistic update in selectedWeek if open
        if (selectedWeek && format(selectedWeek.startDate, 'yyyy-MM-dd') === mondayISO) {
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

                    {/* CABECERA ESTRECHA MARBELLA DETAIL */}
                    <div className="bg-[#36606F] px-8 py-5 flex items-center justify-between">
                        <h1 className="text-xl font-black text-white uppercase tracking-wider">
                            Histórico Extras
                        </h1>
                        <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors p-2">
                            <X size={24} />
                        </button>
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
                        <div className="grid grid-cols-3 gap-2 mb-8 py-6 border-y border-gray-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Periodo</span>
                                <span className="text-xl font-black text-[#5B8FB9]">{formatValue(summary.totalCost, '€')}</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Excesos</span>
                                <span className="text-xl font-black text-orange-500">{formatValue(summary.totalOvertimeCost, '€')}</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Producción</span>
                                <span className="text-xl font-black text-blue-500">{formatHours(summary.totalHours)}</span>
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
                                            <div
                                                key={week.weekId}
                                                onClick={() => setSelectedWeek(week)}
                                                className="bg-white rounded-3xl border border-gray-100 hover:shadow-md transition-all duration-300 overflow-hidden cursor-pointer"
                                            >
                                                {/* Cabecera Semana */}
                                                <div className="p-4 flex justify-between items-center select-none">
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                                            allStaffPaid ? "bg-emerald-50 text-emerald-500" : "bg-blue-50 text-blue-500"
                                                        )}>
                                                            {allStaffPaid ? <CheckCircle2 size={18} /> : <Calendar size={18} />}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">{week.label}</h3>
                                                                {allStaffPaid ? (
                                                                    <span className="bg-emerald-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase">PAGADA</span>
                                                                ) : (
                                                                    <span className="bg-orange-400 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase">{paidCount}/{totalCount} PAGADOS</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase">{formatHours(week.totalHours)} totales</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <span className="text-lg font-black text-gray-800 leading-none">{formatValue(week.totalAmount, '€')}</span>
                                                        </div>
                                                        <ChevronDown size={16} className="text-gray-300" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL DETALLE SEMANA */}
            {selectedWeek && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#36606F]/60 backdrop-blur-sm" onClick={() => setSelectedWeek(null)}></div>
                    <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in duration-300">
                        {/* Cabecera Modal */}
                        <div className="bg-[#36606F] p-8 pb-10 flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-1">{selectedWeek.label}</h2>
                                <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Desglose de personal y pagos</p>
                            </div>
                            <button onClick={() => setSelectedWeek(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl text-white transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        {/* KPIs de la Semana */}
                        <div className="grid grid-cols-2 gap-4 px-8 -mt-6">
                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Coste Total</span>
                                <span className="text-2xl font-black text-gray-800">{formatValue(selectedWeek.totalAmount, '€')}</span>
                            </div>
                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Horas Totales</span>
                                <span className="text-2xl font-black text-[#5B8FB9]">{formatHours(selectedWeek.totalHours)}</span>
                            </div>
                        </div>

                        {/* Lista de Personal */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar">
                            <div className="space-y-3">
                                {selectedWeek.staff.map((staff, idx) => (
                                    <div key={idx} className="bg-gray-50 p-4 rounded-3xl flex items-center justify-between border border-transparent hover:border-blue-100 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-[#5B8FB9] text-white flex items-center justify-center text-sm font-black shadow-lg">
                                                {staff.name.charAt(0)}
                                            </div>
                                            <div>
                                                <span className="text-sm font-black text-gray-800 block">{staff.name}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-500 text-[8px] font-black rounded-lg uppercase">{formatHours(staff.totalHours)}</span>
                                                    {staff.overtimeHours > 0 && (
                                                        <span className="px-2 py-0.5 bg-orange-50 text-orange-500 text-[8px] font-black rounded-lg uppercase">
                                                            {formatHours(staff.overtimeHours)} EXTRA
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <span className={cn(
                                                    "text-lg font-black block leading-none",
                                                    staff.isPaid ? "text-gray-300 line-through" : "text-gray-800"
                                                )}>
                                                    {formatValue(staff.totalCost, '€')}
                                                </span>
                                                {staff.overtimeCost > 0 && !staff.isPaid && (
                                                    <span className="text-[9px] font-bold text-rose-500">Extras: {formatValue(staff.overtimeCost, '€')}</span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => togglePaid(staff.id, selectedWeek.startDate, staff.isPaid, { totalHours: staff.totalHours, overtimeHours: staff.overtimeHours })}
                                                className="transition-all active:scale-90"
                                            >
                                                {staff.isPaid ? (
                                                    <CheckCircle2 size={28} className="text-emerald-500 fill-emerald-50" />
                                                ) : (
                                                    <Circle size={28} className="text-gray-200 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer Modal */}
                        <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-center">
                            <button
                                onClick={() => setSelectedWeek(null)}
                                className="px-8 py-3 bg-[#36606F] text-white text-xs font-black rounded-2xl shadow-lg hover:shadow-xl transition-all uppercase tracking-widest active:scale-95"
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