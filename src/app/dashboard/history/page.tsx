'use client'; // Force update v3 - polishing calendar cards

import { useEffect, useState, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar,
    CloudSun,
    Receipt,
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    X,
    Filter,
    TrendingUp,
    TrendingDown,
    Pencil,
    Trash2,
    Save,
    Search,
    ChevronRight as ChevronRightIcon,
    Banknote,
    Plus,
    Minus,
    LayoutGrid,
    List
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import CashClosingModal, { BILLS, COINS } from '@/components/CashClosingModal';

// --- TYPES & CONSTANTS ---
type MetricType = 'net_sales' | 'tpv_sales' | 'avg_ticket' | 'tickets_count' | 'cash_counted';

const METRICS: { label: string; value: MetricType; icon: any }[] = [
    { label: 'Venta Neta', value: 'net_sales', icon: TrendingUp },
    { label: 'Ventas', value: 'tpv_sales', icon: TrendingUp },
    { label: 'Tickets', value: 'tickets_count', icon: Calendar },
    { label: 'Efectivo', value: 'cash_counted', icon: Banknote },
];

// --- MINI COMPONENTS ---

const Sparkline = ({ data, color = "#10b981", height = 40, width = 120 }: { data: number[], color?: string, height?: number, width?: number }) => {
    if (!data.length) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * width,
        y: height - ((v - min) / range) * height
    }));

    const pathData = points.reduce((acc, p, i) =>
        acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), ""
    );

    return (
        <svg width={width} height={height} className="overflow-visible">
            <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm"
            />
        </svg>
    );
};

const DonutChart = ({ size = 60, percentage = 75, color = "#10b981" }: { size?: number, percentage?: number, color?: string }) => {
    const radius = size / 2.5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="currentColor"
                strokeWidth="6"
                fill="transparent"
                className="text-gray-100"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={color}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
            />
        </svg>
    );
};

const CashBreakdownModal = ({ isOpen, onClose, breakdown, date, total, isEditing = false, onUpdate }: { isOpen: boolean, onClose: () => void, breakdown: any, date: string, total: number, isEditing?: boolean, onUpdate?: (den: string, qty: number) => void }) => {
    if (!isOpen) return null;

    const displayBreakdown = isEditing ? {
        ...BILLS.reduce((acc, b) => ({ ...acc, [b.toString()]: 0 }), {}),
        ...COINS.reduce((acc, c) => ({ ...acc, [c.toString()]: 0 }), {}),
        ...breakdown
    } : breakdown;

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] p-8 text-white text-center relative">
                    <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-xl transition-all"><X size={20} /></button>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-1 block">Arqueo de Efectivo</span>
                    <h3 className="text-xl font-black uppercase tracking-tighter">
                        {(() => {
                            const d = new Date(date);
                            return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee d MMM', { locale: es });
                        })()}
                    </h3>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        {Object.entries(displayBreakdown || {}).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).map(([den, qty]) => (
                            <div key={den} className="flex items-center justify-between p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100/50">
                                <span className="text-xs font-black text-gray-400">{parseFloat(den) < 1 ? (parseFloat(den) * 100).toFixed(0) + 'c' : den + '€'}</span>
                                <div className="flex items-center gap-4">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm">
                                            <span className="text-[10px] font-black text-gray-300 uppercase">x</span>
                                            <input
                                                type="number"
                                                className="w-12 bg-transparent text-sm font-black text-[#36606F] text-center outline-none"
                                                value={qty as number || ''}
                                                onChange={e => onUpdate?.(den, parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-xs font-black text-gray-400">x{qty as number}</span>
                                    )}
                                    <span className="text-sm font-black text-[#36606F] min-w-[50px] text-right">{(parseFloat(den) * (qty as number || 0)).toFixed(2)}€</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center px-2">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Total Contado</span>
                        <span className="text-2xl font-black text-[#36606F]">{total.toFixed(2)}€</span>
                    </div>
                </div>
                {isEditing && (
                    <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                        <button onClick={onClose} className="w-full h-12 bg-[#36606F] text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">
                            Confirmar Arqueo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export default function HistoryPage() {
    const supabase = createClient();
    const router = useRouter();

    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [selectedMetric, setSelectedMetric] = useState<MetricType>('net_sales');

    const handlePrevMonth = () => {
        const currentMonthDate = rangeStart ? new Date(rangeStart) : new Date();
        const prev = subMonths(currentMonthDate, 1);
        setRangeStart(format(startOfMonth(prev), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(prev), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const handleNextMonth = () => {
        const currentMonthDate = rangeStart ? new Date(rangeStart) : new Date();
        const next = addMonths(currentMonthDate, 1);
        setRangeStart(format(startOfMonth(next), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('calendar');
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

    const [selectedClosing, setSelectedClosing] = useState<any>(null);
    const [showCashDetails, setShowCashDetails] = useState(false);
    const [showClosingModal, setShowClosingModal] = useState(false);

    const calendarDays = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? new Date(rangeStart) : new Date(selectedDate);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [filterMode, rangeStart, selectedDate]);

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    const [closings, setClosings] = useState<any[]>([]);
    const [hourlySales, setHourlySales] = useState<Record<string, number[]>>({});
    const [summary, setSummary] = useState({ totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });

    useEffect(() => {
        checkUserRole();
        fetchHistory();
    }, [rangeStart, rangeEnd, selectedDate, filterMode]);

    async function checkUserRole() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            setIsManager(profile?.role === 'manager');
        }
    }

    async function fetchHistory() {
        setLoading(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                startISO = selectedDate;
                endISO = selectedDate;
            } else {
                if (!rangeStart || !rangeEnd) {
                    setClosings([]);
                    setLoading(false);
                    return;
                }
                startISO = rangeStart;
                endISO = rangeEnd;
            }

            const closingsPromise = supabase
                .from('cash_closings')
                .select('*')
                .gte('closing_date', startISO)
                .lte('closing_date', endISO)
                .order('closing_date', { ascending: false });

            const summaryPromise = supabase.rpc('get_cash_closings_summary', {
                p_start_date: startISO,
                p_end_date: endISO
            });

            const [closingsRes, summaryRes] = await Promise.all([closingsPromise, summaryPromise]);

            if (closingsRes.error) throw closingsRes.error;
            setClosings(closingsRes.data || []);
            setSummary(summaryRes.data || { totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });

            try {
                const { data: hourlyData, error: hourlyError } = await supabase
                    .rpc('get_hourly_sales', {
                        p_start_date: startISO,
                        p_end_date: endISO
                    });

                if (!hourlyError && hourlyData) {
                    const hourlyMap: Record<string, number[]> = {};
                    hourlyData.forEach((row: any) => {
                        const date = row.fecha;
                        if (!hourlyMap[date]) {
                            hourlyMap[date] = new Array(24).fill(0);
                        }
                        if (row.hora >= 0 && row.hora < 24) {
                            hourlyMap[date][row.hora] = Number(row.total);
                        }
                    });
                    setHourlySales(hourlyMap);
                }
            } catch (rpcErr) {
                console.warn('Hourly sales RPC failed', rpcErr);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
            toast.error("Error al cargar datos históricos");
        } finally {
            setLoading(false);
        }
    }

    const generateCalendarDays = () => {
        const year = calendarBaseDate.getFullYear();
        const month = calendarBaseDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (number | null)[] = [];
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
        return days;
    };

    const handleDateSelect = (day: number) => {
        const dateStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (showCalendar === 'single') {
            setSelectedDate(dateStr);
            setFilterMode('single');
            setShowCalendar(null);
        } else if (showCalendar === 'range') {
            if (!rangeStart || (rangeStart && rangeEnd)) {
                setRangeStart(dateStr);
                setRangeEnd(null);
            } else {
                if (new Date(dateStr) < new Date(rangeStart)) {
                    setRangeStart(dateStr);
                } else {
                    setRangeEnd(dateStr);
                    setFilterMode('range');
                    setShowCalendar(null);
                }
            }
        }
    };


    const formatValue = (val: number, type: MetricType) => {
        if (type === 'tickets_count') return val.toString();
        if (val === 0) return " ";
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: val < 100 ? 2 : 0 }).format(val);
    };

    const handleFieldUpdate = (field: string, value: number) => {
        if (!editData) return;
        const newData = { ...editData, [field]: value };
        if (field === 'tpv_sales') newData.net_sales = value / 1.10;
        const cashSalesToday = newData.tpv_sales - newData.sales_card - newData.sales_pending;
        const expectedCash = cashSalesToday + newData.debt_recovered;
        newData.cash_expected = expectedCash;
        const diff = newData.cash_counted - expectedCash;
        newData.difference = diff;
        setEditData(newData);
    };

    const handleBreakdownUpdate = (denomination: string, qty: number) => {
        if (!editData) return;
        const newBreakdown = { ...editData.breakdown, [denomination]: qty };
        const totalCounted = Object.entries(newBreakdown).reduce((sum, [den, q]) => sum + (parseFloat(den) * (q as number)), 0);
        const diff = totalCounted - editData.cash_expected;
        const withDrawn = totalCounted;
        const cLeft = 0;
        setEditData({ ...editData, breakdown: newBreakdown, cash_counted: totalCounted, difference: diff, cash_withdrawn: withDrawn, cash_left: cLeft });
    };

    const handleSaveEdit = async () => {
        if (!editData) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('cash_closings').update({
                tpv_sales: editData.tpv_sales,
                net_sales: editData.tpv_sales / 1.10,
                sales_card: editData.sales_card,
                sales_pending: editData.sales_pending,
                debt_recovered: editData.debt_recovered,
                cash_expected: editData.cash_expected,
                cash_counted: editData.cash_counted,
                difference: editData.difference,
                breakdown: editData.breakdown
            }).eq('id', editData.id);
            if (error) throw error;
            toast.success("Cierre actualizado");
            setSelectedClosing(editData);
            setIsEditing(false);
            fetchHistory();
        } catch (err: any) {
            toast.error("Error al actualizar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClosing = async () => {
        if (!selectedClosing) return;
        if (!confirm("¿Estás seguro de eliminar este cierre?")) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('cash_closings').delete().eq('id', selectedClosing.id);
            if (error) throw error;
            toast.success("Cierre eliminado");
            setSelectedClosing(null);
            fetchHistory();
        } catch (err: any) {
            toast.error("Error al eliminar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigateClosing = (direction: 'next' | 'prev') => {
        if (!selectedClosing) return;
        const currentIndex = closings.findIndex(c => c.id === selectedClosing.id);
        const nextIndex = direction === 'next' ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < closings.length) {
            setSelectedClosing(closings[nextIndex]);
            setIsEditing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-1 md:p-3 pb-20">
            <div className="max-w-5xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="bg-[#36606F] p-2 md:p-4 space-y-3 relative">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-4">
                                <button onClick={() => router.back()} className="flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-95 md:w-10 md:h-10 md:bg-white/10 md:rounded-full md:border md:border-white/10">
                                    <ArrowLeft className="w-5 md:w-5 h-5 md:h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight italic text-nowrap">Cierres</h1>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="bg-black/20 p-1 rounded-xl flex gap-1 mr-2">
                                    <button
                                        onClick={() => setViewMode('calendar')}
                                        className={cn(
                                            "p-1.5 md:p-2 rounded-lg transition-all",
                                            viewMode === 'calendar' ? "bg-white text-[#36606F] shadow-sm" : "text-white/40 hover:text-white"
                                        )}
                                    >
                                        <Calendar size={16} className="md:w-5 md:h-5" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={cn(
                                            "p-1.5 md:p-2 rounded-lg transition-all",
                                            viewMode === 'grid' ? "bg-white text-[#36606F] shadow-sm" : "text-white/40 hover:text-white"
                                        )}
                                    >
                                        <LayoutGrid size={16} className="md:w-5 md:h-5" />
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowClosingModal(true)}
                                    className="flex items-center gap-2 md:gap-3 px-3 py-1.5 md:px-4 md:py-2 rounded-xl hover:bg-white/5 transition-all active:scale-95 group"
                                >
                                    <div className="bg-emerald-500 text-white p-1 md:p-1.5 rounded-full shadow-lg group-hover:scale-110 transition-transform">
                                        <Plus size={12} className="md:w-3.5 md:h-3.5" strokeWidth={4} />
                                    </div>
                                    <span className="text-[10px] md:text-xs font-black text-white uppercase tracking-widest hidden sm:inline">Cierre</span>
                                </button>
                            </div>
                        </div>

                        {/* FILTROS INTEGRADOS EN CABECERA */}
                        <div className="flex items-center justify-between gap-2 pb-2">
                            {/* NAVEGADOR MENSUAL PRINCIPAL */}
                            <div className="flex items-center bg-white/5 border border-white/20 rounded-xl overflow-hidden flex-1 max-w-[200px] md:max-w-[250px]">
                                <button onClick={handlePrevMonth} className="p-1.5 md:p-2 hover:bg-white/10 text-white transition-all outline-none">
                                    <ChevronLeft size={18} />
                                </button>
                                <button onClick={() => setShowMonthPicker(true)} className="flex-1 py-1.5 md:py-2 text-[10px] md:text-[11px] font-black text-white uppercase tracking-widest text-center hover:bg-white/10 transition-all truncate outline-none">
                                    {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? format(new Date(rangeStart), 'MMMM yyyy', { locale: es })
                                        : 'SELECCIONAR MES'}
                                </button>
                                <button onClick={handleNextMonth} className="p-1.5 md:p-2 hover:bg-white/10 text-white transition-all outline-none">
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            {/* FILTROS SECUNDARIOS REDUCIDOS */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => {
                                        setRangeStart(null);
                                        setRangeEnd(null);
                                        setShowCalendar('range');
                                    }}
                                    className={cn(
                                        "px-2 md:px-3 py-1.5 md:py-2 rounded-xl text-[8px] md:text-[9px] font-black border transition-all uppercase tracking-widest outline-none",
                                        filterMode === 'range' && rangeStart && rangeEnd && !isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                            ? "bg-white border-white text-zinc-800 shadow-sm"
                                            : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                    )}
                                >
                                    PERIODO
                                </button>
                                <button
                                    onClick={() => setShowCalendar('single')}
                                    className={cn(
                                        "px-2 md:px-3 py-1.5 md:py-2 rounded-xl text-[8px] md:text-[9px] font-black border transition-all uppercase tracking-widest outline-none",
                                        filterMode === 'single' ? "bg-white border-white text-zinc-800 shadow-sm" : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                    )}
                                >
                                    FECHA
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white">
                        <div className="pt-1 md:pt-1.5 pb-1 md:pb-1.5 px-4 grid grid-cols-3 border-b border-zinc-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-lg md:text-2xl font-black text-zinc-900 tabular-nums leading-none">{formatValue(summary.totalGross, 'tpv_sales')}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">VENTAS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100">
                                <span className="text-lg md:text-2xl font-black text-emerald-600 tabular-nums leading-none">{formatValue(summary.totalNet, 'net_sales')}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">VENTA NETA</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 italic">
                                <span className="text-lg md:text-2xl font-black text-[#36606F] tabular-nums leading-none">{summary.avgTicket.toFixed(1)}€</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1 font-bold">TICKET MEDIO</span>
                            </div>
                        </div>

                        <div className="px-1.5 md:px-3 pb-2 md:pb-4 pt-1 md:pt-1.5">
                            <div className="bg-[#EFEDED] rounded-[2.5rem] border border-zinc-100 shadow-xl overflow-hidden">
                                <div className="bg-[#36606F] p-1.5 md:p-2.5 flex justify-between items-center overflow-x-auto no-scrollbar">
                                    <div className="flex gap-2 md:gap-3 w-full max-w-xl mx-auto justify-between">
                                        {METRICS.map(m => (
                                            <button
                                                key={m.value}
                                                onClick={() => setSelectedMetric(m.value)}
                                                className={cn(
                                                    "flex-1 h-8 md:h-10 md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 px-2 whitespace-nowrap",
                                                    selectedMetric === m.value
                                                        ? "text-white md:bg-white md:text-[#36606F] md:shadow-lg"
                                                        : "text-white/40 md:text-white/60 hover:text-white hover:bg-white/5"
                                                )}
                                            >
                                                <m.icon size={12} className={cn("hidden sm:block", selectedMetric === m.value ? "md:text-[#36606F] text-white" : "text-white/40")} />
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                        <LoadingSpinner size="lg" className="text-[#36606F]" />
                                    </div>
                                ) : closings.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <Calendar size={32} />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Sin actividad</p>
                                    </div>
                                ) : viewMode === 'grid' ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-4 p-4 md:p-6">
                                        {closings.map((c) => {
                                            const mainVal = c[selectedMetric] || 0;
                                            const diffPerc = ((mainVal / (summary.totalNet / (summary.count || 1) || 1) - 1) * 100).toFixed(1);

                                            return (
                                                <div
                                                    key={c.id}
                                                    onClick={() => setSelectedClosing(c)}
                                                    className="group relative bg-white rounded-2xl md:rounded-[2.5rem] shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer border border-zinc-100 flex flex-col overflow-hidden"
                                                >
                                                    <div className="bg-[#D64D5D] p-2.5 md:p-3 flex justify-center items-center shadow-sm">
                                                        <span className="text-[10px] md:text-[11px] font-black text-white uppercase tracking-wider">
                                                            {(() => {
                                                                const d = new Date(c.closed_at);
                                                                return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee, d MMM', { locale: es });
                                                            })()}
                                                        </span>
                                                    </div>

                                                    <div className="p-4 md:p-5 flex flex-col">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <span className="text-3xl md:text-5xl font-black text-zinc-900 tracking-tighter tabular-nums leading-none">
                                                                {selectedMetric === 'tickets_count' ? mainVal : formatValue(mainVal, selectedMetric)}
                                                            </span>
                                                            <div className="flex flex-col items-end">
                                                                <div className={cn(
                                                                    "text-xs md:text-sm font-black uppercase tracking-tighter whitespace-nowrap leading-none",
                                                                    parseFloat(diffPerc) >= 0 ? "text-emerald-500" : "text-rose-600"
                                                                )}>
                                                                    {parseFloat(diffPerc) >= 0 ? '↗' : '↘'} {Math.abs(parseFloat(diffPerc))}%
                                                                </div>
                                                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tighter opacity-70">VS MEDIA</span>
                                                            </div>
                                                        </div>

                                                        <span className="text-[8px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-4">
                                                            {METRICS.find(m => m.value === selectedMetric)?.label}
                                                        </span>

                                                        <div className="grid grid-cols-4 gap-0 pt-3 border-t border-zinc-100 mt-auto">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[10px] md:text-[11px] font-black text-zinc-900 tabular-nums">{Math.round(c.tpv_sales)}€</span>
                                                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Ventas</span>
                                                            </div>
                                                            <div className="flex flex-col items-center border-l border-zinc-100 italic">
                                                                <span className="text-[10px] md:text-[11px] font-black text-[#36606F] tabular-nums">{(c.tpv_sales / (c.tickets_count || 1)).toFixed(1)}€</span>
                                                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Media</span>
                                                            </div>
                                                            <div className="flex flex-col items-center border-l border-zinc-100">
                                                                <span className="text-[10px] md:text-[11px] font-black text-zinc-900 tabular-nums">{Math.round(c.sales_card || 0)}€</span>
                                                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Tarjeta</span>
                                                            </div>
                                                            <div className="flex flex-col items-center border-l border-zinc-100">
                                                                <span className="text-[10px] md:text-[11px] font-black text-emerald-600 tabular-nums">{(c.cash_counted || 0).toFixed(0)}€</span>
                                                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Cash</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-1 md:p-3 overflow-x-auto no-scrollbar">
                                        <div className="min-w-0">
                                            <div className="grid grid-cols-7 mb-1 md:mb-2 px-0.5 md:px-2">
                                                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d, index) => (
                                                    <div key={d} className="text-[7px] md:text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em] md:tracking-[0.2em] text-center">
                                                        <span className="hidden md:inline">{d}</span>
                                                        <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-7 gap-1 md:gap-3">
                                                {calendarDays.map((day, idx) => {
                                                    const closing = closings.find(c => isSameDay(new Date(c.closed_at), day));
                                                    const isCurrentMonth = filterMode === 'range' && rangeStart
                                                        ? isSameMonth(day, new Date(rangeStart))
                                                        : filterMode === 'single' ? isSameMonth(day, new Date(selectedDate)) : true;

                                                    if (!closing) {
                                                        return (
                                                            <div key={idx} className={cn(
                                                                "h-[50px] md:h-32 rounded-lg md:rounded-2xl border border-zinc-100/50 flex flex-col p-1 md:p-3 transition-opacity",
                                                                isCurrentMonth ? "bg-white/40" : "bg-transparent opacity-10"
                                                            )}>
                                                                <span className="text-[8px] md:text-[10px] font-black text-zinc-300">{format(day, 'd')}</span>
                                                            </div>
                                                        );
                                                    }

                                                    const mainVal = closing[selectedMetric] || 0;
                                                    const diffPerc = ((mainVal / (summary.totalNet / (summary.count || 1) || 1) - 1) * 100).toFixed(1);

                                                    return (
                                                        <div
                                                            key={closing.id}
                                                            onClick={() => setSelectedClosing(closing)}
                                                            className="group relative bg-white h-full min-h-[50px] md:min-h-[120px] rounded-lg md:rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer border border-zinc-100 flex flex-col overflow-hidden"
                                                        >
                                                            <div className="bg-[#D64D5D] px-1 py-0.5 md:px-2 md:py-1 flex justify-center items-center shadow-sm">
                                                                <span className="text-[8px] md:text-[10px] font-black text-white">{format(day, 'd')}</span>
                                                            </div>

                                                            <div className="p-1 md:p-2 flex flex-col h-full bg-white group-hover:bg-[#EFEDED]/30 transition-colors">
                                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-0 md:gap-1 mb-0.5 px-0.5 h-full">
                                                                    <div className="flex flex-col h-full w-full justify-center md:block">
                                                                        <div className="text-[8.5px] min-[370px]:text-[10px] md:text-[20px] font-black text-zinc-900 tabular-nums leading-none tracking-tighter md:tracking-normal md:max-w-[70%] text-center md:text-left mt-0.5 md:mt-0">
                                                                            {selectedMetric === 'tickets_count' ? mainVal : Math.round(mainVal)}
                                                                            {selectedMetric !== 'tickets_count' && <span className="text-[6px] md:text-[12px] ml-[1px] md:ml-0.5 font-black">€</span>}
                                                                        </div>

                                                                        <div className="text-[5px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-auto md:mt-0 mb-0.5 md:mb-2 leading-tight text-center md:text-left">
                                                                            {METRICS.find(m => m.value === selectedMetric)?.label}
                                                                        </div>
                                                                    </div>

                                                                    <div className={cn(
                                                                        "hidden md:block text-[8px] md:text-[10px] font-black uppercase whitespace-nowrap ml-auto",
                                                                        parseFloat(diffPerc) >= 0 ? "text-emerald-500" : "text-[#D64D5D]"
                                                                    )}>
                                                                        {parseFloat(diffPerc) >= 0 ? '↗' : '↘'}{Math.abs(Math.round(parseFloat(diffPerc)))}%
                                                                    </div>
                                                                </div>

                                                                <div className="hidden md:grid grid-cols-2 gap-y-1.5 gap-x-1.5 mt-auto w-full pt-1.5 border-t border-zinc-100">
                                                                    <div className="flex flex-col items-center justify-center py-0.5">
                                                                        <span className="text-[8px] md:text-[11px] font-black text-zinc-900 tabular-nums leading-none">{Math.round(closing.tpv_sales)}</span>
                                                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-400 uppercase leading-none mt-1">Ventas</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-center justify-center py-0.5">
                                                                        <span className="text-[8px] md:text-[11px] font-black text-[#36606F] tabular-nums leading-none">{(closing.tpv_sales / (closing.tickets_count || 1)).toFixed(0)}</span>
                                                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-400 uppercase leading-none mt-1">Media</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-center justify-center py-0.5">
                                                                        <span className="text-[8px] md:text-[11px] font-black text-emerald-600 tabular-nums leading-none">{(closing.cash_counted || 0).toFixed(0)}</span>
                                                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-400 uppercase leading-none mt-1">Cash</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-center justify-center py-0.5">
                                                                        <span className="text-[8px] md:text-[11px] font-black text-zinc-900 tabular-nums leading-none">{Math.round(closing.sales_card || 0)}</span>
                                                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-400 uppercase leading-none mt-1">Tarjeta</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {selectedClosing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !isEditing && setSelectedClosing(null)}>
                    <div className="absolute inset-0 bg-[#36606F]/60 backdrop-blur-md" />
                    <div className="relative bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-6 md:p-8 text-white relative shrink-0 text-center">
                            <div className="flex items-center justify-between mb-2 relative z-10">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleNavigateClosing('prev'); }}
                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-30 active:scale-90 border border-white/10 group"
                                    disabled={closings.findIndex(c => c.id === selectedClosing.id) === closings.length - 1}
                                    title="Día Anterior"
                                >
                                    <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
                                </button>

                                <div className="flex items-center gap-2">
                                    {!isEditing && isManager && (
                                        <>
                                            <button
                                                onClick={() => { setEditData({ ...selectedClosing }); setIsEditing(true); }}
                                                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 shadow-lg active:scale-95"
                                                title="Editar Cierre"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={handleDeleteClosing}
                                                className="p-2 bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 rounded-xl transition-all border border-rose-500/20 shadow-lg active:scale-95"
                                                title="Eliminar Cierre"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => { setIsEditing(false); setSelectedClosing(null); }}
                                        className="p-2 bg-white text-[#36606F] hover:bg-zinc-100 rounded-xl transition-all shadow-xl active:scale-95 ml-2"
                                    >
                                        <X size={16} strokeWidth={3} />
                                    </button>
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleNavigateClosing('next'); }}
                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-30 active:scale-90 border border-white/10 group"
                                    disabled={closings.findIndex(c => c.id === selectedClosing.id) === 0}
                                    title="Día Siguiente"
                                >
                                    <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </div>

                            <div className="mt-4">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2 block">Cierre de Caja</span>
                                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mx-auto max-w-[90%] break-words">
                                    {(() => {
                                        const d = new Date(selectedClosing.closed_at);
                                        return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee d MMMM', { locale: es });
                                    })()}
                                </h2>
                                <div className="flex items-center justify-center gap-4 mt-6">
                                    <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                                        <CloudSun size={14} className="text-amber-400" />
                                        <span className="text-[10px] font-black uppercase">{selectedClosing.weather || 'Clima N/A'}</span>
                                    </div>
                                    <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                                        <Receipt size={14} className="text-blue-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{selectedClosing.tickets_count || 0} Tickets</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100 flex flex-col justify-between">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 block">Facturación Total</span>
                                    {isEditing ? (
                                        <input type="number" className="w-full bg-transparent text-2xl font-black text-gray-900 border-b-2 border-[#5B8FB9] outline-none pb-1" value={editData?.tpv_sales || ''} onChange={e => handleFieldUpdate('tpv_sales', parseFloat(e.target.value) || 0)} />
                                    ) : (
                                        <span className="text-2xl font-black text-gray-900">{selectedClosing.tpv_sales.toFixed(2)}€</span>
                                    )}
                                </div>
                                <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100">
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-6">Venta Neta</span>
                                    <span className="text-2xl font-black text-emerald-600">
                                        {(isEditing ? editData?.net_sales : selectedClosing.net_sales).toFixed(2)}€
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-2">Desglose Operativo</h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { label: 'Efectivo en Caja', key: 'cash_counted', highlight: true, icon: Banknote, hasBreakdown: true },
                                        { label: 'Cobro Tarjeta', key: 'sales_card' },
                                        { label: 'Pendiente Pago', key: 'sales_pending' },
                                        { label: 'Diferencia Caja', key: 'difference', highlight: true },
                                    ].map((row) => {
                                        const val = isEditing ? editData[row.key] : selectedClosing[row.key];
                                        const isDiff = row.key === 'difference';
                                        const isCash = row.key === 'cash_counted';

                                        return (
                                            <div key={row.key} className={cn(
                                                "flex items-center justify-between p-5 rounded-[1.5rem] transition-all",
                                                isDiff ? (val === 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600") :
                                                    isCash ? "bg-[#36606F]/5 text-[#36606F] cursor-pointer hover:bg-[#36606F]/10 active:scale-[0.98]" : "bg-gray-50/50"
                                            )} onClick={() => isCash && setShowCashDetails(true)}>
                                                <div className="flex items-center gap-3">
                                                    {row.icon && <row.icon size={16} className="opacity-40" />}
                                                    <span className="text-[11px] font-black uppercase tracking-widest">{row.label}</span>
                                                    {isCash && <ChevronRightIcon size={14} className="opacity-40" />}
                                                </div>
                                                {isEditing && !['difference', 'cash_counted'].includes(row.key) ? (
                                                    <input type="number" className="bg-transparent text-right font-black outline-none border-b border-black/10 text-lg" value={val || ''} onChange={e => handleFieldUpdate(row.key, parseFloat(e.target.value) || 0)} />
                                                ) : (
                                                    <span className="text-lg font-black">{val.toFixed(2)}€</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {isEditing && (
                                <button onClick={handleSaveEdit} disabled={loading} className="w-full h-16 bg-[#36606F] text-white rounded-[2rem] shadow-xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                                    {loading ? <LoadingSpinner size="sm" /> : <><Save size={20} /> Guardar Cierre</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedClosing && (
                <CashBreakdownModal
                    isOpen={showCashDetails}
                    onClose={() => setShowCashDetails(false)}
                    breakdown={isEditing ? editData.breakdown : selectedClosing.breakdown}
                    date={selectedClosing.closed_at}
                    total={isEditing ? editData.cash_counted : selectedClosing.cash_counted}
                    isEditing={isEditing}
                    onUpdate={handleBreakdownUpdate}
                />
            )}

            <CashClosingModal
                isOpen={showClosingModal}
                onClose={() => setShowClosingModal(false)}
                onSuccess={() => {
                    fetchHistory();
                    setShowClosingModal(false);
                }}
            />

            {showCalendar && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowCalendar(null)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">{showCalendar === 'single' ? 'Fecha Única' : 'Rango de Fechas'}</h3>
                            <button onClick={() => setShowCalendar(null)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6 px-2">
                                <button onClick={() => setCalendarBaseDate(subMonths(calendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-zinc-900 text-xs uppercase tracking-tight">{format(calendarBaseDate, 'MMMM yyyy', { locale: es })}</span>
                                <button onClick={() => setCalendarBaseDate(addDays(endOfMonth(calendarBaseDate), 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>

                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">{d}</div>
                                ))}
                                {generateCalendarDays().map((day, i) => {
                                    if (!day) return <div key={i} />;
                                    const dStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isSelected = showCalendar === 'single' ? selectedDate === dStr : (rangeStart === dStr || rangeEnd === dStr);
                                    const isInRange = showCalendar === 'range' && rangeStart && rangeEnd && new Date(dStr) > new Date(rangeStart) && new Date(dStr) < new Date(rangeEnd);

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => handleDateSelect(day)}
                                            className={cn(
                                                "aspect-square flex items-center justify-center rounded-2xl text-[11px] font-black transition-all",
                                                isSelected ? "bg-zinc-900 text-white shadow-xl scale-110" : isInRange ? "bg-blue-50 text-[#5B8FB9]" : "hover:bg-zinc-50 text-zinc-600"
                                            )}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showMonthPicker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowMonthPicker(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">Seleccionar Mes</h3>
                            <button onClick={() => setShowMonthPicker(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors">
                                    <ChevronLeft size={20} className="text-zinc-400" />
                                </button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors">
                                    <ChevronRight size={20} className="text-zinc-400" />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const date = new Date(pickerYear, i, 1);
                                    const isSelected = filterMode === 'range' && rangeStart === format(startOfMonth(date), 'yyyy-MM-dd') && rangeEnd === format(endOfMonth(date), 'yyyy-MM-dd');

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                const s = startOfMonth(date);
                                                const e = endOfMonth(date);
                                                setRangeStart(format(s, 'yyyy-MM-dd'));
                                                setRangeEnd(format(e, 'yyyy-MM-dd'));
                                                setFilterMode('range');
                                                setShowMonthPicker(false);
                                            }}
                                            className={cn(
                                                "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                                isSelected
                                                    ? "bg-zinc-900 border-zinc-900 text-white shadow-lg scale-105"
                                                    : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900"
                                            )}
                                        >
                                            {format(date, 'MMM', { locale: es })}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}