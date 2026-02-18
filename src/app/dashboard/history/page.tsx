'use client';

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
    ArrowUpRight,
    ArrowDownRight,
    Search,
    ChevronRight as ChevronRightIcon,
    Banknote,
    Plus
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BILLS, COINS } from '@/components/CashClosingModal';

// --- TYPES & CONSTANTS ---
type MetricType = 'net_sales' | 'gross_sales' | 'avg_ticket' | 'tickets_count' | 'cash_counted';

const METRICS: { label: string; value: MetricType; icon: any }[] = [
    { label: 'Venta Neta', value: 'net_sales', icon: TrendingUp },
    { label: 'Facturación', value: 'gross_sales', icon: TrendingUp },
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

const CashBreakdownModal = ({ isOpen, onClose, breakdown, date, total }: { isOpen: boolean, onClose: () => void, breakdown: any, date: string, total: number }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] p-6 text-white text-center relative">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-xl transition-all"><X size={20} /></button>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-1 block">Arqueo de Efectivo</span>
                    <h3 className="text-lg font-black uppercase tracking-tighter">{format(new Date(date), 'eeee d MMM', { locale: es })}</h3>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        {Object.entries(breakdown || {}).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).map(([den, qty]) => (
                            <div key={den} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                                <span className="text-xs font-black text-gray-400">{parseFloat(den) < 1 ? (parseFloat(den) * 100).toFixed(0) + 'c' : den + '€'}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-black text-gray-400">x{qty as number}</span>
                                    <span className="text-sm font-black text-[#36606F]">{(parseFloat(den) * (qty as number)).toFixed(2)}€</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center px-2">
                        <span className="text-xs font-black text-gray-400 uppercase">Total Contado</span>
                        <span className="text-xl font-black text-[#36606F]">{total.toFixed(2)}€</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export default function HistoryPage() {
    const supabase = createClient();
    const router = useRouter();

    // Filtros
    const [rangeStart, setRangeStart] = useState<string>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [selectedMetric, setSelectedMetric] = useState<MetricType>('net_sales');

    // UI State
    const [loading, setLoading] = useState(true);
    const [showCalendar, setShowCalendar] = useState<boolean>(false);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [selectedClosing, setSelectedClosing] = useState<any>(null);
    const [showCashDetails, setShowCashDetails] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    // Data
    const [closings, setClosings] = useState<any[]>([]);
    const [hourlySales, setHourlySales] = useState<Record<string, number[]>>({});

    useEffect(() => {
        checkUserRole();
        fetchHistory();
    }, [rangeStart, rangeEnd]);

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
            // 1. Fetch Closings (Parallel) - Optimized for date-only filtering to avoid TZ issues
            const closingsPromise = supabase
                .from('cash_closings')
                .select('*')
                .gte('closing_date', rangeStart)
                .lte('closing_date', rangeEnd)
                .order('closing_date', { ascending: false });

            // 2. Fetch Aggregated Hourly Sales (RPC - Architect_UltraFluidity Optimization)
            // Separate block for RPC so it doesn't block closings if it fails
            const [closingsRes] = await Promise.all([closingsPromise]);

            if (closingsRes.error) throw closingsRes.error;
            setClosings(closingsRes.data || []);

            // 3. Optional Hourly Data (No-blocking strategy)
            try {
                const { data: hourlyData, error: hourlyError } = await supabase
                    .rpc('get_hourly_sales', {
                        p_start_date: rangeStart,
                        p_end_date: rangeEnd
                    });

                if (!hourlyError && hourlyData) {
                    const hourlyMap: Record<string, number[]> = {};
                    hourlyData.forEach((row: any) => {
                        const date = row.fecha; // Already formatted as YYYY-MM-DD by Postgres
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

    const summary = useMemo(() => {
        if (!closings.length) return { totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 };
        const totalNet = closings.reduce((acc, c) => acc + (c.net_sales || 0), 0);
        const totalGross = closings.reduce((acc, c) => acc + (c.tpv_sales || 0), 0);
        const totalTickets = closings.reduce((acc, c) => acc + (c.tickets_count || 0), 0);
        return {
            totalNet,
            totalGross,
            avgTicket: totalTickets > 0 ? totalGross / totalTickets : 0,
            count: closings.length
        };
    }, [closings]);

    // Helpers para la UI
    const formatValue = (val: number, type: MetricType) => {
        if (type === 'tickets_count') return val.toString();
        // REGLA ZERO-DISPLAY: En vistas de lectura (no formularios), cualquier valor igual a 0 debe mostrarse como un espacio vacío " ".
        if (val === 0) return " ";
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: val < 100 ? 2 : 0 }).format(val);
    };

    // --- HANDLERS EDICIÓN (Mantenidos del original) ---
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
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-32">
            <div className="max-w-5xl mx-auto">
                {/* --- GLOBAL INTEGRATED CARD --- */}
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">

                    {/* --- INTEGRATED DARK HEADER --- */}
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-4">
                                <button onClick={() => router.back()} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 transition-all border border-white/10 active:scale-95">
                                    <ArrowLeft className="w-4 md:w-5 h-4 md:h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight italic text-nowrap">Cierres</h1>
                            </div>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="bg-emerald-600/90 hover:bg-emerald-500 text-white h-10 md:h-12 px-4 md:px-6 rounded-xl md:rounded-2xl flex items-center gap-2 md:gap-3 transition-all border border-emerald-400/30 active:scale-95 text-[10px] md:text-xs font-black uppercase tracking-widest shadow-lg"
                            >
                                <div className="bg-white/20 p-1 md:p-1.5 rounded-lg text-white">
                                    <Plus className="w-3 md:w-4 h-3 md:h-4" strokeWidth={4} />
                                </div>
                                <span className="hidden xs:inline">Cierre</span>
                                <span className="xs:hidden">Cier.</span>
                            </button>
                        </div>

                        {/* FILTERS INTEGRATED IN HEADER */}
                        <div className="flex justify-end gap-2">
                            <div className="bg-black/20 p-1 rounded-2xl border border-white/5 flex gap-1">
                                {[
                                    { label: 'Mes', action: () => setShowMonthPicker(true) },
                                    { label: 'Periodo', action: () => setShowCalendar(true) },
                                    { label: 'Fecha', action: () => setShowCalendar(true) }
                                ].map((f) => (
                                    <button
                                        key={f.label}
                                        onClick={f.action}
                                        className="h-8 md:h-10 px-4 md:px-8 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 transition-all outline-none"
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* --- WHITE BODY --- */}
                    <div className="bg-white">
                        {/* COMPACT SUMMARY (Integrated) */}
                        <div className="py-2 md:py-4 px-4 grid grid-cols-3 border-b border-zinc-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-lg md:text-2xl font-black text-[#5B8FB9] tabular-nums leading-none">{formatValue(summary.totalGross, 'gross_sales')}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1">VENTAS</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100">
                                <span className="text-lg md:text-2xl font-black text-[#5B8FB9] tabular-nums leading-none">{formatValue(summary.totalNet, 'net_sales')}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1">V. NETA</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 italic">
                                <span className="text-lg md:text-2xl font-black text-[#5B8FB9] tabular-nums leading-none">{summary.avgTicket.toFixed(1)}€</span>
                                <span className="text-[7px] md:text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-0.5 md:mt-1">T. MEDIO</span>
                            </div>
                        </div>

                        {/* SECOND CONTAINER (METRICS + LIST) */}
                        <div className="p-3 md:p-6">
                            <div className="bg-zinc-50/10 rounded-[2rem] border border-zinc-100 shadow-xl overflow-hidden p-3 md:p-6">
                                {/* METRIC SELECTOR (Integrated) */}
                                <div className="mb-6 flex justify-center">
                                    <div className="bg-[#36606F] p-1.5 rounded-[2rem] border border-white/10 flex gap-1.5 overflow-x-auto no-scrollbar max-w-full shadow-inner">
                                        {METRICS.map(m => (
                                            <button
                                                key={m.value}
                                                onClick={() => setSelectedMetric(m.value)}
                                                className={cn(
                                                    "flex-shrink-0 h-8 md:h-10 px-4 md:px-6 rounded-[1.5rem] text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                                    selectedMetric === m.value
                                                        ? "bg-white text-[#36606F] shadow-lg scale-105"
                                                        : "text-white/60 hover:text-white hover:bg-white/5"
                                                )}
                                            >
                                                <m.icon size={14} className={cn(selectedMetric === m.value ? "text-[#36606F]" : "text-white/40")} />
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* CLOSINGS LIST */}
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                        <LoadingSpinner size="lg" className="text-[#36606F]" />
                                    </div>
                                ) : closings.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <Calendar size={32} />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Sin actividad</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-4">
                                        {closings.map((c) => {
                                            const mainVal = c[selectedMetric] || 0;
                                            const diffPerc = ((mainVal / (summary.totalNet / (summary.count || 1) || 1) - 1) * 100).toFixed(1);

                                            return (
                                                <div
                                                    key={c.id}
                                                    onClick={() => setSelectedClosing(c)}
                                                    className="group relative bg-white rounded-2xl md:rounded-[1.5rem] p-4 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer border border-zinc-50 flex flex-col gap-3"
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex flex-col">
                                                            <span className="hidden md:block text-[9px] font-black text-[#36606F] uppercase tracking-wider mb-0.5">
                                                                {format(new Date(c.closed_at), 'eeee, d MMM', { locale: es })}
                                                            </span>
                                                            <span className="md:hidden text-[9px] font-black text-[#36606F] uppercase tracking-wider mb-0.5">
                                                                {format(new Date(c.closed_at), 'd MMM', { locale: es })}
                                                            </span>
                                                            <div className={cn(
                                                                "text-[8px] font-black uppercase tracking-tighter",
                                                                parseFloat(diffPerc) >= 0 ? "text-emerald-500" : "text-rose-500"
                                                            )}>
                                                                {parseFloat(diffPerc) >= 0 ? '↗' : '↘'} {Math.abs(parseFloat(diffPerc))}% vs media
                                                            </div>
                                                        </div>
                                                        <div className="bg-zinc-50 p-1.5 rounded-lg text-zinc-300 group-hover:text-[#5B8FB9] transition-colors">
                                                            <Calendar size={12} />
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col">
                                                        <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">
                                                            {METRICS.find(m => m.value === selectedMetric)?.label}
                                                        </span>
                                                        <span className="text-xl md:text-2xl font-black text-zinc-900 tracking-tighter tabular-nums leading-none">
                                                            {selectedMetric === 'tickets_count' ? mainVal : formatValue(mainVal, selectedMetric)}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-1 pt-3 border-t border-zinc-50">
                                                        <div className="flex flex-col">
                                                            <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest">Facturación</span>
                                                            <span className="text-[9px] font-black text-zinc-700 tabular-nums">{Math.round(c.tpv_sales)}€</span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-zinc-50 pl-1">
                                                            <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest">T. Medio</span>
                                                            <span className="text-[9px] font-black text-zinc-700 tabular-nums">{(c.tpv_sales / (c.tickets_count || 1)).toFixed(1)}€</span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-zinc-50 pl-1">
                                                            <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest">Efectivo</span>
                                                            <span className="text-[9px] font-black text-emerald-500 tabular-nums">{(c.cash_counted || 0).toFixed(0)}€</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAIL MODAL */}
            {selectedClosing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !isEditing && setSelectedClosing(null)}>
                    <div className="absolute inset-0 bg-[#36606F]/60 backdrop-blur-md" />
                    <div className="relative bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-8 text-white relative shrink-0 text-center">
                            <div className="absolute top-8 left-8 flex gap-2">
                                <button onClick={() => handleNavigateClosing('prev')} className="p-2 hover:bg-white/10 rounded-xl transition-all disabled:opacity-20" disabled={closings.findIndex(c => c.id === selectedClosing.id) === closings.length - 1}><ChevronLeft size={24} /></button>
                                <button onClick={() => handleNavigateClosing('next')} className="p-2 hover:bg-white/10 rounded-xl transition-all disabled:opacity-20" disabled={closings.findIndex(c => c.id === selectedClosing.id) === 0}><ChevronRight size={24} /></button>
                            </div>
                            <button onClick={() => { setIsEditing(false); setSelectedClosing(null); }} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-xl transition-all"><X size={24} /></button>

                            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2 block">Detalle de Cierre</span>
                            <h2 className="text-3xl font-black uppercase tracking-tighter">
                                {format(new Date(selectedClosing.closed_at), 'eeee d MMMM', { locale: es })}
                            </h2>
                            <div className="flex items-center justify-center gap-4 mt-6">
                                <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                                    <CloudSun size={14} className="text-amber-400" />
                                    <span className="text-[11px] font-black uppercase">{selectedClosing.weather || 'Clima N/A'}</span>
                                </div>
                                <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                                    <Receipt size={14} className="text-blue-400" />
                                    <span className="text-[11px] font-black uppercase tracking-widest">{selectedClosing.tickets_count || 0} Tickets</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100">
                                    <div className="flex justify-between items-center mb-6">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Facturación</span>
                                        {!isEditing && isManager && (
                                            <div className="flex gap-1">
                                                <button onClick={() => { setEditData({ ...selectedClosing }); setIsEditing(true); }} className="p-2 text-[#5B8FB9] hover:bg-white rounded-xl shadow-sm transition-all"><Pencil size={14} /></button>
                                                <button onClick={handleDeleteClosing} className="p-2 text-rose-500 hover:bg-white rounded-xl shadow-sm transition-all"><Trash2 size={14} /></button>
                                            </div>
                                        )}
                                    </div>
                                    {isEditing ? (
                                        <input type="number" className="w-full bg-transparent text-2xl font-black text-gray-900 border-b-2 border-[#5B8FB9] outline-none pb-1" value={editData?.tpv_sales || 0} onChange={e => handleFieldUpdate('tpv_sales', parseFloat(e.target.value) || 0)} />
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
                                            )} onClick={() => isCash && !isEditing && setShowCashDetails(true)}>
                                                <div className="flex items-center gap-3">
                                                    {row.icon && <row.icon size={16} className="opacity-40" />}
                                                    <span className="text-[11px] font-black uppercase tracking-widest">{row.label}</span>
                                                    {isCash && !isEditing && <ChevronRightIcon size={14} className="opacity-40" />}
                                                </div>
                                                {isEditing && !['difference', 'cash_counted'].includes(row.key) ? (
                                                    <input type="number" className="bg-transparent text-right font-black outline-none border-b border-black/10 text-lg" value={val || 0} onChange={e => handleFieldUpdate(row.key, parseFloat(e.target.value) || 0)} />
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

            {/* CASH BREAKDOWN SUB-MODAL */}
            {selectedClosing && (
                <CashBreakdownModal
                    isOpen={showCashDetails}
                    onClose={() => setShowCashDetails(false)}
                    breakdown={selectedClosing.breakdown}
                    date={selectedClosing.closed_at}
                    total={selectedClosing.cash_counted}
                />
            )}

            {/* MONTH PICKER */}
            {showMonthPicker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#1e293b]/60 backdrop-blur-md" onClick={() => setShowMonthPicker(false)}>
                    <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-8 text-white text-center"><h3 className="text-lg font-black uppercase tracking-widest">Seleccionar Mes</h3></div>
                        <div className="p-8 grid grid-cols-2 gap-3">
                            {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, i) => (
                                <button key={month} onClick={() => {
                                    const year = new Date().getFullYear();
                                    setRangeStart(format(new Date(year, i, 1), 'yyyy-MM-dd'));
                                    setRangeEnd(format(endOfMonth(new Date(year, i, 1)), 'yyyy-MM-dd'));
                                    setShowMonthPicker(false);
                                }} className="h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-gray-50 hover:bg-[#5B8FB9] hover:text-white transition-all">{month}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* RANGE SELECTOR */}
            {showCalendar && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#1e293b]/60 backdrop-blur-md" onClick={() => setShowCalendar(false)}>
                    <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-8 text-white text-center"><h3 className="text-lg font-black uppercase tracking-widest">Rango de Fechas</h3></div>
                        <div className="p-8 space-y-6">
                            <input type="date" className="w-full h-14 bg-gray-50 rounded-2xl px-6 font-black text-[#5B8FB9]" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                            <input type="date" className="w-full h-14 bg-gray-50 rounded-2xl px-6 font-black text-[#5B8FB9]" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                            <button onClick={() => setShowCalendar(false)} className="w-full h-16 bg-[#5B8FB9] text-white rounded-[2rem] font-black uppercase tracking-widest shadow-xl">Aplicar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}