'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar,
    CloudSun,
    Receipt,
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
    Banknote
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FIXED_CASH_FUND, BILLS, COINS } from '@/components/CashClosingModal';

// --- TYPES & CONSTANTS ---
type MetricType = 'net_sales' | 'gross_sales' | 'avg_ticket' | 'tickets_count' | 'cash_counted';

const METRICS: { label: string; value: MetricType; icon: any }[] = [
    { label: 'Venta Neta', value: 'net_sales', icon: TrendingUp },
    { label: 'Ticket Medio', value: 'avg_ticket', icon: Receipt },
    { label: 'Facturación', value: 'gross_sales', icon: TrendingUp },
    { label: 'Tickets', value: 'tickets_count', icon: Calendar },
    { label: 'Efectivo', value: 'cash_counted', icon: Banknote },
];

// --- MINI COMPONENTS (SVG) ---

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
            // 1. Fetch Closings
            const { data: closingsData } = await supabase
                .from('cash_closings')
                .select('*')
                .gte('closed_at', new Date(rangeStart).toISOString())
                .lte('closed_at', new Date(rangeEnd + 'T23:59:59').toISOString())
                .order('closed_at', { ascending: false });

            setClosings(closingsData || []);

            // 2. Fetch Hourly Sales for Sparklines
            const { data: ticketsData } = await supabase
                .from('tickets_marbella')
                .select('fecha, hora_cierre, total_documento')
                .gte('fecha', rangeStart)
                .lte('fecha', rangeEnd);

            if (ticketsData) {
                const hourlyMap: Record<string, number[]> = {};

                // Group by date
                ticketsData.forEach(ticket => {
                    const date = ticket.fecha;
                    if (!hourlyMap[date]) {
                        hourlyMap[date] = new Array(24).fill(0);
                    }
                    // Extract hour from "HH:MM:SS" or similar
                    const hour = parseInt(ticket.hora_cierre.split(':')[0]) || 0;
                    if (hour >= 0 && hour < 24) {
                        hourlyMap[date][hour] += Number(ticket.total_documento) || 0;
                    }
                });

                setHourlySales(hourlyMap);
            }
        } catch (err) {
            console.error(err);
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
            avgTicket: totalTickets > 0 ? totalNet / totalTickets : 0,
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
        const expectedCash = FIXED_CASH_FUND + cashSalesToday + newData.debt_recovered;
        newData.cash_expected = expectedCash;
        const diff = newData.cash_counted - expectedCash;
        const withDrawn = newData.cash_counted > FIXED_CASH_FUND ? newData.cash_counted - FIXED_CASH_FUND : 0;
        const cLeft = newData.cash_counted > FIXED_CASH_FUND ? FIXED_CASH_FUND : newData.cash_counted;
        newData.difference = diff;
        newData.cash_withdrawn = withDrawn;
        newData.cash_left = cLeft;
        setEditData(newData);
    };

    const handleBreakdownUpdate = (denomination: string, qty: number) => {
        if (!editData) return;
        const newBreakdown = { ...editData.breakdown, [denomination]: qty };
        const totalCounted = Object.entries(newBreakdown).reduce((sum, [den, q]) => sum + (parseFloat(den) * (q as number)), 0);
        const diff = totalCounted - editData.cash_expected;
        const withDrawn = totalCounted > FIXED_CASH_FUND ? totalCounted - FIXED_CASH_FUND : 0;
        const cLeft = totalCounted > FIXED_CASH_FUND ? FIXED_CASH_FUND : totalCounted;
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
                cash_withdrawn: editData.cash_withdrawn,
                cash_left: editData.cash_left,
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
        if (!confirm("¿Estás seguro de eliminar este cierre? Esta acción revertirá los movimientos en tesorería.")) return;
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
        <div className="min-h-screen bg-[#5B8FB9] pb-32">
            {/* --- HEADER & FILTERS --- */}
            <div className="sticky top-0 z-50 bg-[#36606F] text-white p-4 shadow-lg">
                <div className="max-w-7xl mx-auto flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-xl">
                                <ChevronLeft size={24} />
                            </button>
                            <h1 className="text-xl font-black uppercase tracking-tighter">Historial Marbella</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowMonthPicker(true)}
                                className="h-10 px-4 bg-white/10 hover:bg-white/20 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all"
                            >
                                <Filter size={16} />
                                {format(new Date(rangeStart), 'MMMM', { locale: es })}
                            </button>
                            <button
                                onClick={() => setShowCalendar(true)}
                                className="h-10 px-4 bg-white/10 hover:bg-white/20 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all"
                            >
                                <Calendar size={16} />
                                {format(new Date(rangeStart), 'dd MMM', { locale: es })} - {format(new Date(rangeEnd), 'dd MMM', { locale: es })}
                            </button>
                        </div>
                    </div>

                    {/* Metric Selector */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        {METRICS.map(m => (
                            <button
                                key={m.value}
                                onClick={() => setSelectedMetric(m.value)}
                                className={cn(
                                    "flex-shrink-0 h-10 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border-2",
                                    selectedMetric === m.value
                                        ? "bg-white border-white text-[#36606F] shadow-xl scale-105"
                                        : "border-white/20 text-white/60 hover:border-white/40 hover:text-white"
                                )}
                            >
                                <m.icon size={14} className={cn(selectedMetric === m.value ? "text-[#36606F]" : "text-white/40")} />
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- SUMMARY BANNER (UNIFIED) --- */}
            <div className="max-w-7xl mx-auto p-4 md:p-6">
                <div className="bg-white/10 backdrop-blur-md rounded-[2.5rem] p-8 border border-white/5 shadow-2xl mb-12">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2 block">Resumen Periodo</span>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">
                                {formatValue(summary.totalNet, 'net_sales')} <span className="text-white/40 text-2xl">Neta</span>
                            </h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-12">
                            {[
                                { label: 'Facturación', val: summary.totalGross, color: 'text-blue-200', icon: TrendingUp },
                                { label: 'Ticket Medio', val: summary.avgTicket, color: 'text-amber-200', icon: Receipt },
                                { label: 'Días', val: summary.count, color: 'text-white/40', icon: Calendar },
                            ].map((s, i) => (
                                <div key={i} className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{s.label}</span>
                                    <span className={cn("text-xl font-black", s.color)}>
                                        {i === 2 ? s.val : formatValue(s.val, 'net_sales')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- CLOSING GRID --- */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <LoadingSpinner size="lg" className="text-white" />
                        <span className="text-white/40 text-xs font-black uppercase tracking-widest animate-pulse">Cargando Registros...</span>
                    </div>
                ) : closings.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="bg-white/5 rounded-[3rem] p-12 inline-flex flex-col items-center gap-4">
                            <Search size={48} className="text-white/20" />
                            <p className="text-white/40 font-black uppercase tracking-widest text-sm">No hay cierres para este periodo</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
                        {closings.map((c) => {
                            const mainVal = c[selectedMetric] || 0;
                            const diffPerc = ((mainVal / (summary.totalNet / (summary.count || 1) || 1) - 1) * 100).toFixed(1);
                            const dayHourlySales = hourlySales[format(new Date(c.closed_at), 'yyyy-MM-dd')] || [];

                            return (
                                <div
                                    key={c.id}
                                    onClick={() => setSelectedClosing(c)}
                                    className="group relative bg-white/95 backdrop-blur-sm rounded-[3rem] p-8 shadow-2xl hover:scale-[1.02] transition-all cursor-pointer border border-white/20 flex flex-col gap-6"
                                >
                                    {/* Card Header: Date and Comparison */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-[#36606F]/40 uppercase tracking-[0.2em] mb-1">
                                                {format(new Date(c.closed_at), 'eeee, d MMM', { locale: es })}
                                            </span>
                                            <div className={cn(
                                                "flex items-center gap-1 text-[11px] font-black uppercase tracking-tighter",
                                                parseFloat(diffPerc) >= 0 ? "text-emerald-500" : "text-rose-500"
                                            )}>
                                                {parseFloat(diffPerc) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                                {Math.abs(parseFloat(diffPerc))}% vs Media
                                            </div>
                                        </div>
                                        <div className="bg-[#36606F]/5 p-3 rounded-2xl group-hover:bg-[#36606F] group-hover:text-white transition-all text-[#36606F]">
                                            <Calendar size={18} />
                                        </div>
                                    </div>

                                    {/* Main Metric Focus */}
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                            {METRICS.find(m => m.value === selectedMetric)?.label}
                                        </span>
                                        <span className="text-5xl font-black text-[#1E293B] tracking-[ -0.05em]">
                                            {selectedMetric === 'tickets_count' ? mainVal : formatValue(mainVal, selectedMetric)}
                                        </span>
                                    </div>

                                    {/* Secondary Metrics Grid */}
                                    <div className="grid grid-cols-3 gap-2 py-4 border-y border-gray-100/10 bg-gray-50/50 -mx-4 px-4 rounded-3xl">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-gray-400 uppercase">Facturación</span>
                                            <span className="text-[13px] font-black text-gray-800">{formatValue(c.tpv_sales, 'gross_sales')}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-gray-200/50 pl-3">
                                            <span className="text-[8px] font-black text-gray-400 uppercase">T. Medio</span>
                                            <span className="text-[13px] font-black text-gray-800">{(c.tpv_sales / (c.tickets_count || 1)).toFixed(1)}€</span>
                                        </div>
                                        <div className="flex flex-col border-l border-gray-200/50 pl-3">
                                            <span className="text-[8px] font-black text-gray-400 uppercase">Efectivo</span>
                                            <span className="text-[13px] font-black text-emerald-600 font-bold">{formatValue(c.cash_counted, 'cash_counted')}</span>
                                        </div>
                                    </div>

                                    {/* Hourly Sales Chart */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ritmo de Ventas (H)</span>
                                            <TrendingUp size={12} className="text-emerald-500/50" />
                                        </div>
                                        <div className="h-[60px] flex items-end">
                                            {dayHourlySales.length > 0 ? (
                                                <Sparkline
                                                    data={dayHourlySales}
                                                    color="#36606F"
                                                    height={60}
                                                    width={280}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                                    <span className="text-[8px] font-bold text-gray-300 uppercase">Sin datos horarios</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* DETAIL MODAL */}
            {selectedClosing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => !isEditing && setSelectedClosing(null)}>
                    <div className="absolute inset-0 bg-[#1e293b]/80 backdrop-blur-md" />
                    <div className="relative bg-white rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-8 text-white relative shrink-0">
                            {/* Navigation Controls */}
                            <div className="absolute top-8 left-8 flex gap-2">
                                <button
                                    onClick={() => handleNavigateClosing('prev')}
                                    className="p-3 hover:bg-white/10 rounded-2xl transition-all disabled:opacity-20"
                                    disabled={closings.findIndex(c => c.id === selectedClosing.id) === closings.length - 1}
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <button
                                    onClick={() => handleNavigateClosing('next')}
                                    className="p-3 hover:bg-white/10 rounded-2xl transition-all disabled:opacity-20"
                                    disabled={closings.findIndex(c => c.id === selectedClosing.id) === 0}
                                >
                                    <ChevronRight size={24} />
                                </button>
                            </div>

                            <button onClick={() => { setIsEditing(false); setSelectedClosing(null); }} className="absolute top-8 right-8 p-3 hover:bg-white/10 rounded-2xl transition-all">
                                <X size={24} />
                            </button>

                            <div className="mt-12">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2 block text-center">Detalle de Cierre</span>
                                <h2 className="text-3xl font-black uppercase tracking-tighter text-center">
                                    {format(new Date(selectedClosing.closed_at), 'eeee d MMMM', { locale: es })}
                                </h2>
                                <div className="flex items-center justify-center gap-4 mt-6">
                                    <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                                        <CloudSun size={14} className="text-amber-400" />
                                        <span className="text-[11px] font-black uppercase">{selectedClosing.weather || 'Clima N/A'}</span>
                                    </div>
                                    <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                                        <Receipt size={14} className="text-blue-400" />
                                        <span className="text-[11px] font-black uppercase">{selectedClosing.tickets_count || 0} Tickets</span>
                                    </div>
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
                                        { label: 'Efectivo en Caja', key: 'cash_counted', highlight: true, icon: Banknote },
                                        { label: 'Cobro Tarjeta', key: 'sales_card' },
                                        { label: 'Pendiente Pago', key: 'sales_pending' },
                                        { label: 'Diferencia Caja', key: 'difference', highlight: true },
                                    ].map((row) => {
                                        const val = isEditing ? editData[row.key] : selectedClosing[row.key];
                                        const isDiff = row.key === 'difference';
                                        const isCash = row.key === 'cash_counted';

                                        return (
                                            <div key={row.key} className={cn(
                                                "flex items-center justify-between p-4 rounded-2xl",
                                                isDiff ? (val === 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600") :
                                                    isCash ? "bg-[#36606F]/5 text-[#36606F]" : "bg-gray-50/50"
                                            )}>
                                                <div className="flex items-center gap-2">
                                                    {row.icon && <row.icon size={14} className="opacity-40" />}
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{row.label}</span>
                                                </div>
                                                {isEditing && !['difference', 'cash_counted'].includes(row.key) ? (
                                                    <input type="number" className="bg-transparent text-right font-black outline-none border-b border-black/10" value={val || 0} onChange={e => handleFieldUpdate(row.key, parseFloat(e.target.value) || 0)} />
                                                ) : (
                                                    <span className="font-black">{val.toFixed(2)}€</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {isEditing && (
                                <button onClick={handleSaveEdit} disabled={loading} className="w-full h-16 bg-[#36606F] text-white rounded-[2rem] shadow-xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50">
                                    {loading ? <LoadingSpinner size="sm" /> : <><Save size={20} /> Guardar Cierre</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
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