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
    ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FIXED_CASH_FUND, BILLS, COINS } from '@/components/CashClosingModal';

// --- TYPES & CONSTANTS ---
type MetricType = 'net_sales' | 'gross_sales' | 'avg_ticket' | 'tickets_count';

const METRICS: { label: string; value: MetricType; icon: any }[] = [
    { label: 'Venta Neta', value: 'net_sales', icon: TrendingUp },
    { label: 'Ticket Medio', value: 'avg_ticket', icon: Receipt },
    { label: 'Facturación', value: 'gross_sales', icon: TrendingUp },
    { label: 'Tickets', value: 'tickets_count', icon: Calendar },
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
            const { data } = await supabase
                .from('cash_closings')
                .select('*')
                .gte('closed_at', new Date(rangeStart).toISOString())
                .lte('closed_at', new Date(rangeEnd + 'T23:59:59').toISOString())
                .order('closed_at', { ascending: false });

            setClosings(data || []);
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

            {/* --- SUMMARY BANNER --- */}
            <div className="max-w-7xl mx-auto p-4 md:p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Venta Neta', val: summary.totalNet, color: 'text-emerald-500', icon: TrendingUp },
                        { label: 'Facturación', val: summary.totalGross, color: 'text-blue-500', icon: TrendingUp },
                        { label: 'Ticket Medio', val: summary.avgTicket, color: 'text-amber-500', icon: Receipt },
                        { label: 'Días', val: summary.count, color: 'text-white/60', icon: Calendar },
                    ].map((s, i) => (
                        <div key={i} className="bg-white/10 backdrop-blur-md rounded-[2rem] p-6 border border-white/5 flex flex-col gap-1 items-start">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{s.label}</span>
                            <div className="flex items-center gap-2">
                                <span className={cn("text-2xl font-black", s.color)}>
                                    {i === 3 ? s.val : formatValue(s.val, 'net_sales')}
                                </span>
                            </div>
                        </div>
                    ))}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {closings.map((c) => {
                            const mainVal = c[selectedMetric] || 0;
                            const diffPerc = ((mainVal / (summary.totalNet / (summary.count || 1) || 1) - 1) * 100).toFixed(1);

                            return (
                                <div
                                    key={c.id}
                                    onClick={() => setSelectedClosing(c)}
                                    className="group relative bg-[#F8FAFC] rounded-[2.5rem] p-8 shadow-2xl hover:scale-[1.02] transition-all cursor-pointer overflow-hidden border border-white/20"
                                >
                                    {/* Card Header */}
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                                {METRICS.find(m => m.value === selectedMetric)?.label}
                                            </span>
                                            <span className="text-3xl font-black text-[#1E293B] tracking-tighter">
                                                {formatValue(mainVal, selectedMetric)}
                                            </span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-2xl shadow-sm text-gray-400 group-hover:text-[#5B8FB9] transition-colors">
                                            <Calendar size={18} />
                                        </div>
                                    </div>

                                    {/* Charts Section */}
                                    <div className="flex items-end justify-between gap-4 mt-auto">
                                        <div className="flex-1 flex flex-col gap-2">
                                            <div className="h-[40px] flex items-end">
                                                <Sparkline
                                                    data={[mainVal * 0.8, mainVal * 0.9, mainVal * 0.85, mainVal * 1.05, mainVal, mainVal * 0.95]}
                                                    color={mainVal > 0 ? "#10b981" : "#e11d48"}
                                                />
                                            </div>
                                            <div className={cn(
                                                "flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter",
                                                parseFloat(diffPerc) >= 0 ? "text-emerald-500" : "text-rose-500"
                                            )}>
                                                {parseFloat(diffPerc) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                                {Math.abs(parseFloat(diffPerc))}% vs Avg
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <DonutChart percentage={Math.min(100, Math.max(0, (mainVal / ((summary.totalNet / (summary.count || 1)) * 1.5 || 1)) * 100))} color="#10b981" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[9px] font-black text-gray-400">
                                                    {format(new Date(c.closed_at), 'dd', { locale: es })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-4">
                                        <span className="text-[11px] font-black text-gray-800 uppercase">
                                            {format(new Date(c.closed_at), 'eeee, d MMM', { locale: es })}
                                        </span>
                                        {c.difference !== 0 && (
                                            <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-1 rounded-lg">
                                                {c.difference.toFixed(2)}€
                                            </span>
                                        )}
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
                            <button onClick={() => { setIsEditing(false); setSelectedClosing(null); }} className="absolute top-8 right-8 p-3 hover:bg-white/10 rounded-2xl transition-all">
                                <X size={24} />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2 block">Detalle de Cierre</span>
                            <h2 className="text-3xl font-black uppercase tracking-tighter">
                                {format(new Date(selectedClosing.closed_at), 'eeee d MMMM', { locale: es })}
                            </h2>
                            <div className="flex items-center gap-4 mt-6">
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
                                        { label: 'Cobro Tarjeta', key: 'sales_card' },
                                        { label: 'Pendiente Pago', key: 'sales_pending' },
                                        { label: 'Diferencia Caja', key: 'difference', highlight: true },
                                    ].map((row) => {
                                        const val = isEditing ? editData[row.key] : selectedClosing[row.key];
                                        return (
                                            <div key={row.key} className={cn("flex items-center justify-between p-4 rounded-2xl", row.highlight ? (val === 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600") : "bg-gray-50/50")}>
                                                <span className="text-[10px] font-black uppercase tracking-widest">{row.label}</span>
                                                {isEditing && row.key !== 'difference' ? (
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