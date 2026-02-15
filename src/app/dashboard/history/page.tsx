'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    Search,
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    CloudSun,
    Receipt,
    CreditCard,
    User,
    Filter,
    TrendingUp,
    ChevronLeft,
    ChevronRight as ChevronRightIcon,
    X,
    TrendingDown,
    PiggyBank,
    Pencil,
    Trash2,
    Save
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FIXED_CASH_FUND, BILLS, COINS } from '@/components/CashClosingModal';

// Configuración de Coste MO Estimado
const AVG_HOURLY_COST = 15.00;

interface ClosingSummary {
    grossSales: number;     // Facturación (Estimada con IVA)
    netSales: number;       // Venta Neta
    avgTicket: number;      // Ticket Medio
    laborCost: number;      // Coste MO
    laborPercentage: number;// % MO
    dominantWeather: string;// Clima predominante
    totalTickets: number;   // Auxiliar para cálculos
}

export default function HistoryPage() {
    const supabase = createClient();
    const router = useRouter();

    // Estados de Filtro
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [selectedClosing, setSelectedClosing] = useState<any>(null);

    // Datos
    const [closings, setClosings] = useState<any[]>([]);
    const [summary, setSummary] = useState({
        totalGrossSales: 0,
        totalNetSales: 0,
        avgTicket: 0,
        totalClosings: 0
    });

    const [showMonthPicker, setShowMonthPicker] = useState(false);

    // Estados para Edición
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    useEffect(() => {
        checkUserRole();
        fetchHistory();
    }, [selectedDateFilter, rangeStart, rangeEnd, filterMode]);

    async function checkUserRole() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            setIsManager(profile?.role === 'manager');
        }
    }

    async function fetchHistory() {
        setLoading(true);
        try {
            let startISO: string | undefined;
            let endISO: string | undefined;

            let query = supabase
                .from('cash_closings')
                .select('*')
                .order('closed_at', { ascending: false });

            if (filterMode === 'single') {
                const d = new Date(selectedDateFilter);
                d.setHours(0, 0, 0, 0);
                startISO = d.toISOString();
                d.setHours(23, 59, 59, 999);
                endISO = d.toISOString();
                query = query.gte('closed_at', startISO).lte('closed_at', endISO);
            } else if (filterMode === 'range') {
                if (!rangeStart || !rangeEnd) {
                    setClosings([]);
                    setSummary({ totalGrossSales: 0, totalNetSales: 0, avgTicket: 0, totalClosings: 0 });
                    setLoading(false);
                    return;
                }
                const s = new Date(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = new Date(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startISO = s.toISOString();
                endISO = e.toISOString();
                query = query.gte('closed_at', startISO).lte('closed_at', endISO);
            }

            const { data: closingsData } = await query;

            // Para labor cost necesitamos fichajes
            let logsQuery = supabase
                .from('time_logs')
                .select('total_hours')
                .not('clock_out', 'is', null);

            if (startISO && endISO) {
                logsQuery = logsQuery.gte('clock_in', startISO).lte('clock_in', endISO);
            }

            const { data: logsData } = await logsQuery;

            if (closingsData) {
                setClosings(closingsData);
                const sumGross = closingsData.reduce((acc, c) => acc + (c.tpv_sales || 0), 0);
                const sumNet = closingsData.reduce((acc, c) => acc + (c.net_sales || 0), 0);
                const totalTickets = closingsData.reduce((acc, c) => acc + (c.tickets_count || 0), 0);

                const avgTicket = totalTickets > 0 ? sumNet / totalTickets : 0;

                setSummary({
                    totalGrossSales: sumGross,
                    totalNetSales: sumNet,
                    avgTicket: avgTicket,
                    totalClosings: closingsData.length
                });
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    }

    // --- HANDLERS EDICIÓN ---
    const handleFieldUpdate = (field: string, value: number) => {
        if (!editData) return;
        const newData = { ...editData, [field]: value };

        // 1. Recalcular Venta Neta
        if (field === 'tpv_sales') {
            newData.net_sales = value / 1.10;
        }

        // 2. Recalcular Esperado (Fondo + (Ventas - Tarjeta - Pendiente) + Cobros)
        const cashSalesToday = newData.tpv_sales - newData.sales_card - newData.sales_pending;
        const expectedCash = FIXED_CASH_FUND + cashSalesToday + newData.debt_recovered;
        newData.cash_expected = expectedCash;

        // 3. Recalcular Diferencia y Retiro basados en el contado actual
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

        // Calcular total contado
        const totalCounted = Object.entries(newBreakdown).reduce((sum, [den, q]) => sum + (parseFloat(den) * (q as number)), 0);

        // Recalcular diferencia y retiro
        const diff = totalCounted - editData.cash_expected;
        const withDrawn = totalCounted > FIXED_CASH_FUND ? totalCounted - FIXED_CASH_FUND : 0;
        const cLeft = totalCounted > FIXED_CASH_FUND ? FIXED_CASH_FUND : totalCounted;

        setEditData({
            ...editData,
            breakdown: newBreakdown,
            cash_counted: totalCounted,
            difference: diff,
            cash_withdrawn: withDrawn,
            cash_left: cLeft
        });
    };

    const handleSaveEdit = async () => {
        if (!editData) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('cash_closings')
                .update({
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
                })
                .eq('id', editData.id);

            if (error) throw error;

            toast.success("Cierre actualizado");
            setSelectedClosing(editData);
            setIsEditing(false);
            fetchHistory();
        } catch (err: any) {
            console.error(err);
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
            const { error } = await supabase
                .from('cash_closings')
                .delete()
                .eq('id', selectedClosing.id);

            if (error) throw error;

            toast.success("Cierre eliminado correctamente");
            setSelectedClosing(null);
            fetchHistory();
        } catch (err: any) {
            console.error(err);
            toast.error("Error al eliminar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Calendario
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
            setSelectedDateFilter(dateStr);
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

    const handleMonthSelect = (monthIndex: number) => {
        const year = new Date().getFullYear();
        const firstDay = new Date(year, monthIndex, 1);
        const lastDay = new Date(year, monthIndex + 1, 0);

        setRangeStart(format(firstDay, 'yyyy-MM-dd'));
        setRangeEnd(format(lastDay, 'yyyy-MM-dd'));
        setFilterMode('range');
        setShowMonthPicker(false);
    };

    // Helper para formatear moneda
    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[80vh]">

                    {/* CABECERA ESTRECHA MARBELLA DETAIL */}
                    <div className="bg-[#36606F] px-8 py-5 flex items-center justify-between">
                        <h1 className="text-xl font-black text-white uppercase tracking-wider">
                            Histórico Cierres
                        </h1>
                        <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors p-2">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col">
                        {/* Filters */}
                        <div className="mb-6 space-y-4">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Día:</span>
                                    <button
                                        onClick={() => setShowCalendar('single')}
                                        className={cn(
                                            "h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5",
                                            filterMode === 'single' ? "bg-[#5B8FB9] border-[#5B8FB9] text-white shadow-sm" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"
                                        )}
                                    >
                                        <Calendar size={12} />
                                        {format(new Date(selectedDateFilter), 'dd MMM', { locale: es })}
                                    </button>
                                </div>
                                <div className="h-4 w-px bg-gray-200 shrink-0 mx-1"></div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Periodo:</span>
                                    <button
                                        onClick={() => setShowCalendar('range')}
                                        className={cn(
                                            "h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5 font-black uppercase",
                                            filterMode === 'range' ? "bg-[#5B8FB9] border-[#5B8FB9] text-white shadow-sm" : "bg-gray-50 border-gray-100 text-[#5B8FB9] hover:border-gray-200"
                                        )}
                                    >
                                        <Calendar size={12} />
                                        {rangeStart && rangeEnd
                                            ? `${format(new Date(rangeStart), 'dd MMM', { locale: es })} - ${format(new Date(rangeEnd), 'dd MMM', { locale: es })}`
                                            : 'RANGO'}
                                    </button>
                                </div>
                                <div className="h-4 w-px bg-gray-200 shrink-0 mx-1"></div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mes:</span>
                                    <button
                                        onClick={() => setShowMonthPicker(true)}
                                        className="h-8 px-3 rounded-lg text-[10px] font-bold border-2 bg-gray-50 border-gray-100 text-[#5B8FB9] hover:border-gray-200 transition-all flex items-center gap-1.5 font-black uppercase"
                                    >
                                        <Filter size={12} />
                                        Mes
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* KPI SUMMARY CLEAN (Sin tarjetas, solo valor y color) */}
                        <div className="grid grid-cols-3 gap-2 mb-8 py-6 border-y border-gray-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Ventas</span>
                                <span className="text-xl font-black text-emerald-500">{summary.totalGrossSales.toFixed(0)}€</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Venta Neta</span>
                                <span className="text-xl font-black text-emerald-600">{summary.totalNetSales.toFixed(0)}€</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Ticket Medio</span>
                                <span className="text-xl font-black text-blue-500">{summary.avgTicket.toFixed(2)}€</span>
                            </div>
                        </div>

                        {/* Closings List */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {loading ? (
                                    <div className="text-center py-20 text-gray-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Cargando historial...</div>
                                ) : closings.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                                        <Receipt size={32} className="mx-auto text-gray-200 mb-2" />
                                        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Sin registros</p>
                                    </div>
                                ) : (
                                    closings.map((close, i) => (
                                        <div
                                            key={close.id}
                                            onClick={() => setSelectedClosing(close)}
                                            className="bg-gray-50/50 hover:bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between transition-all hover:shadow-md group cursor-pointer"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:text-[#5B8FB9] transition-all group-hover:scale-110">
                                                    <Calendar size={18} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-gray-800 uppercase">
                                                        {format(new Date(close.closed_at), 'dd MMM', { locale: es })}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                        {format(new Date(close.closed_at), 'eeee', { locale: es })}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right flex items-center gap-4">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-sm font-black text-[#5B8FB9]">
                                                        {close.net_sales.toFixed(2)}€
                                                    </span>
                                                    <div className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 ${close.difference === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                        {close.difference === 0 ? 'OK' : `${close.difference.toFixed(2)}€`}
                                                    </div>
                                                </div>
                                                <ChevronRightIcon size={16} className="text-gray-300 group-hover:text-[#5B8FB9] transition-colors" />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODAL DETALLE CIERRE */}
                {selectedClosing && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => {
                        if (!isEditing) setSelectedClosing(null);
                    }}>
                        <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            {/* Header del Modal */}
                            <div className="bg-[#36606F] p-6 text-white relative shrink-0">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setSelectedClosing(null);
                                    }}
                                    className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                                <div className="flex items-center gap-2 opacity-80 mb-1">
                                    <Calendar size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">
                                        {isEditing ? 'Editando Cierre' : 'Detalle de Cierre'}
                                    </span>
                                </div>
                                <h2 className="text-2xl font-black uppercase tracking-tight">
                                    {format(new Date(selectedClosing.closed_at), 'eeee d MMMM', { locale: es })}
                                </h2>
                                <div className="flex items-center gap-4 mt-2 text-[10px] font-bold uppercase text-blue-100">
                                    <span className="flex items-center gap-1"><CloudSun size={12} /> {selectedClosing.weather || 'N/A'}</span>
                                    <span className="flex items-center gap-1"><Receipt size={12} /> {selectedClosing.tickets_count || 0} Tickets</span>
                                </div>
                            </div>

                            <div className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                                {/* VENTAS */}
                                <div>
                                    <div className="flex items-center justify-between mb-4 border-b pb-2">
                                        <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ventas</h3>
                                        {!isEditing && isManager && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditData({ ...selectedClosing });
                                                        setIsEditing(true);
                                                    }}
                                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={handleDeleteClosing}
                                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Total Ventas</span>
                                            {isEditing ? (
                                                <div className="flex items-center gap-1 border-b-2 border-blue-200">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent p-0 text-lg font-black text-gray-800 outline-none"
                                                        value={editData?.tpv_sales || 0}
                                                        onChange={e => handleFieldUpdate('tpv_sales', parseFloat(e.target.value) || 0)}
                                                    />
                                                    <span className="text-lg font-black text-gray-400">€</span>
                                                </div>
                                            ) : (
                                                <span className="text-lg font-black text-gray-800">{selectedClosing.tpv_sales.toFixed(2)}€</span>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Tarjeta</span>
                                            {isEditing ? (
                                                <div className="flex items-center gap-1 border-b-2 border-blue-200">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent p-0 text-lg font-black text-gray-800 outline-none"
                                                        value={editData?.sales_card || 0}
                                                        onChange={e => handleFieldUpdate('sales_card', parseFloat(e.target.value) || 0)}
                                                    />
                                                    <span className="text-lg font-black text-gray-400">€</span>
                                                </div>
                                            ) : (
                                                <span className="text-lg font-black text-gray-800">{selectedClosing.sales_card.toFixed(2)}€</span>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Pendiente</span>
                                            {isEditing ? (
                                                <div className="flex items-center gap-1 border-b-2 border-blue-200">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent p-0 text-lg font-black text-gray-800 outline-none"
                                                        value={editData?.sales_pending || 0}
                                                        onChange={e => handleFieldUpdate('sales_pending', parseFloat(e.target.value) || 0)}
                                                    />
                                                    <span className="text-lg font-black text-gray-400">€</span>
                                                </div>
                                            ) : (
                                                <span className="text-lg font-black text-gray-800">{selectedClosing.sales_pending.toFixed(2)}€</span>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Cobros Deuda</span>
                                            {isEditing ? (
                                                <div className="flex items-center gap-1 border-b-2 border-blue-200">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent p-0 text-lg font-black text-gray-800 outline-none"
                                                        value={editData?.debt_recovered || 0}
                                                        onChange={e => handleFieldUpdate('debt_recovered', parseFloat(e.target.value) || 0)}
                                                    />
                                                    <span className="text-lg font-black text-gray-400">€</span>
                                                </div>
                                            ) : (
                                                <span className="text-lg font-black text-gray-800">{selectedClosing.debt_recovered.toFixed(2)}€</span>
                                            )}
                                        </div>

                                        {/* NUEVOS CAMPOS REQUERIDOS */}
                                        <div className="p-4 bg-emerald-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Efectivo Ingresado</span>
                                            <span className="text-lg font-black text-emerald-700">
                                                {(isEditing ? editData?.cash_withdrawn : selectedClosing.cash_withdrawn)?.toFixed(2)}€
                                            </span>
                                        </div>

                                        <div className="p-4 bg-blue-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Ticket Medio</span>
                                            <span className="text-lg font-black text-blue-700">
                                                {(selectedClosing.tickets_count > 0 ? (isEditing ? editData?.net_sales : selectedClosing.net_sales) / selectedClosing.tickets_count : 0).toFixed(2)}€
                                            </span>
                                        </div>

                                        <div className="p-4 bg-[#36606F]/5 border border-[#36606F]/10 rounded-2xl col-span-2 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-[#36606F] uppercase">Venta Neta Total</span>
                                            <span className="text-xl font-black text-[#36606F]">
                                                {(isEditing ? editData?.net_sales : selectedClosing.net_sales)?.toFixed(2)}€
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* ESTADO DE CAJA (DIFERENCIA) */}
                                <div>
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2">Estado de Caja</h3>
                                    <div className={cn(
                                        "flex justify-between p-4 rounded-2xl transition-all",
                                        (isEditing ? editData?.difference : selectedClosing.difference) === 0
                                            ? "bg-emerald-100/50 text-emerald-700 border border-emerald-200"
                                            : "bg-rose-100/50 text-rose-700 border border-rose-200"
                                    )}>
                                        <span className="text-xs font-black uppercase tracking-widest">Descuadre</span>
                                        <span className="text-lg font-black">
                                            {(isEditing ? editData?.difference : selectedClosing.difference)?.toFixed(2)}€
                                        </span>
                                    </div>
                                </div>

                                {/* DESGLOSE */}
                                {(isEditing ? editData?.breakdown : selectedClosing.breakdown) && (
                                    <div>
                                        <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2">Desglose de Arqueo</h3>
                                        <div className="grid grid-cols-4 gap-2">
                                            {Object.entries((isEditing ? editData : selectedClosing).breakdown)
                                                .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                                                .map(([den, qty]) => (
                                                    <div key={den} className="flex flex-col items-center p-2 bg-gray-50 rounded-xl relative">
                                                        <span className="text-[8px] font-black text-gray-400">
                                                            {parseFloat(den) < 1 ? (parseFloat(den) * 100).toFixed(0) + 'c' : den + '€'}
                                                        </span>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white border border-blue-100 rounded-lg text-center text-xs font-black text-[#5B8FB9] outline-none focus:ring-1 focus:ring-blue-300"
                                                                value={qty as number}
                                                                onChange={e => handleBreakdownUpdate(den, parseInt(e.target.value) || 0)}
                                                            />
                                                        ) : (
                                                            <span className="text-xs font-black text-[#5B8FB9]">x{qty as number}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            {/* Si estamos editando, mostrar todas las denominaciones por si falta alguna */}
                                            {isEditing && [...BILLS, ...COINS].map(den => {
                                                if (editData?.breakdown[den.toString()] !== undefined) return null;
                                                return (
                                                    <div key={den} className="flex flex-col items-center p-2 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                                                        <span className="text-[8px] font-black text-gray-300">
                                                            {den < 1 ? (den * 100).toFixed(0) + 'c' : den + '€'}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-white border border-gray-100 rounded-lg text-center text-xs font-black text-gray-300 outline-none"
                                                            placeholder="0"
                                                            onChange={e => handleBreakdownUpdate(den.toString(), parseInt(e.target.value) || 0)}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {selectedClosing.notes && !isEditing && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[11px] font-bold text-amber-700 italic">
                                        "{selectedClosing.notes}"
                                    </div>
                                )}

                                {isEditing && (
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={loading}
                                        className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {loading ? <LoadingSpinner size="sm" className="text-white" /> : (
                                            <>
                                                <Save size={20} />
                                                Guardar Cambios
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL CALENDARIO */}
                {showCalendar && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowCalendar(null)}>
                        <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                                <h3 className="font-black text-gray-800 uppercase text-[10px] tracking-widest">{showCalendar === 'single' ? 'Fecha Única' : 'Rango de Fechas'}</h3>
                                <button onClick={() => setShowCalendar(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={18} className="text-gray-400" /></button>
                            </div>

                            <div className="p-4">
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <button onClick={() => setCalendarBaseDate(new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronLeft size={20} className="text-gray-600" /></button>
                                    <span className="font-black text-gray-800 text-xs uppercase tracking-tighter">{calendarBaseDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                                    <button onClick={() => setCalendarBaseDate(new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronRightIcon size={20} className="text-gray-600" /></button>
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                        <div key={d} className="text-center text-[9px] font-black text-gray-300 py-2">{d}</div>
                                    ))}
                                    {generateCalendarDays().map((day, i) => {
                                        if (!day) return <div key={i} />;
                                        const dStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const isSelected = showCalendar === 'single' ? selectedDateFilter === dStr : (rangeStart === dStr || rangeEnd === dStr);
                                        const isInRange = showCalendar === 'range' && rangeStart && rangeEnd && new Date(dStr) > new Date(rangeStart) && new Date(dStr) < new Date(rangeEnd);

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleDateSelect(day)}
                                                className={cn(
                                                    "aspect-square flex items-center justify-center rounded-xl text-xs font-black transition-all",
                                                    isSelected ? "bg-[#5B8FB9] text-white shadow-md" : isInRange ? "bg-blue-50 text-[#5B8FB9]" : "hover:bg-gray-100 text-gray-700"
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

                {/* MODAL MESES */}
                {showMonthPicker && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowMonthPicker(false)}>
                        <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                                <h3 className="font-black text-gray-800 uppercase text-[10px] tracking-widest">Seleccionar Mes</h3>
                                <button onClick={() => setShowMonthPicker(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={18} className="text-gray-400" /></button>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-2">
                                {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, i) => (
                                    <button
                                        key={month}
                                        onClick={() => handleMonthSelect(i)}
                                        className="py-3 px-4 rounded-xl text-xs font-black uppercase text-gray-600 hover:bg-[#5B8FB9] hover:text-white transition-all text-left"
                                    >
                                        {month}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}