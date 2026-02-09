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
    PiggyBank
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(null);
    const [rangeEnd, setRangeEnd] = useState<string | null>(null);

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [selectedClosing, setSelectedClosing] = useState<any>(null);

    // Datos
    const [closings, setClosings] = useState<any[]>([]);
    const [summary, setSummary] = useState({
        avgNetSales: 0,
        avgLaborPercent: 0,
        totalClosings: 0
    });

    useEffect(() => {
        fetchHistory();
    }, [selectedDateFilter, rangeStart, rangeEnd, filterMode]);

    async function fetchHistory() {
        setLoading(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                const d = new Date(selectedDateFilter);
                d.setHours(0, 0, 0, 0);
                startISO = d.toISOString();
                d.setHours(23, 59, 59, 999);
                endISO = d.toISOString();
            } else {
                if (!rangeStart || !rangeEnd) {
                    setClosings([]);
                    setSummary({ avgNetSales: 0, avgLaborPercent: 0, totalClosings: 0 });
                    setLoading(false);
                    return;
                }
                const s = new Date(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = new Date(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startISO = s.toISOString();
                endISO = e.toISOString();
            }

            const { data: closingsData } = await supabase
                .from('cash_closings')
                .select('*')
                .gte('closed_at', startISO)
                .lte('closed_at', endISO)
                .order('closed_at', { ascending: false });

            // Para labor cost necesitamos fichajes
            const { data: logsData } = await supabase
                .from('time_logs')
                .select('total_hours')
                .gte('clock_in', startISO)
                .lte('clock_in', endISO)
                .not('clock_out', 'is', null);

            if (closingsData) {
                setClosings(closingsData);
                const sumNet = closingsData.reduce((acc, c) => acc + (c.net_sales || 0), 0);
                const avgNet = closingsData.length > 0 ? sumNet / closingsData.length : 0;

                const totalHours = logsData?.reduce((acc, l) => acc + (l.total_hours || 0), 0) || 0;
                const totalLaborCost = totalHours * AVG_HOURLY_COST;
                const avgLabor = sumNet > 0 ? (totalLaborCost / sumNet) * 100 : 0;

                setSummary({
                    avgNetSales: avgNet,
                    avgLaborPercent: avgLabor,
                    totalClosings: closingsData.length
                });
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    }

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

    // Helper para formatear moneda
    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[80vh]">

                    {/* Header */}
                    <div className="bg-[#36606F] px-8 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Receipt className="text-white" size={20} />
                            <h1 className="text-base font-black text-white uppercase tracking-wider">
                                Histórico Cierres
                            </h1>
                        </div>
                        <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors">
                            <X size={20} />
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
                                            filterMode === 'single' ? "bg-[#36606F] border-[#36606F] text-white shadow-sm" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"
                                        )}
                                    >
                                        <Calendar size={12} />
                                        {format(new Date(selectedDateFilter), 'dd MMM', { locale: es })}
                                    </button>
                                </div>
                                <div className="h-4 w-px bg-gray-200 shrink-0 mx-1"></div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Rango:</span>
                                    <button
                                        onClick={() => setShowCalendar('range')}
                                        className={cn(
                                            "h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5",
                                            filterMode === 'range' ? "bg-[#36606F] border-[#36606F] text-white shadow-sm" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"
                                        )}
                                    >
                                        <Calendar size={12} />
                                        {rangeStart && rangeEnd
                                            ? `${format(new Date(rangeStart), 'dd MMM', { locale: es })} - ${format(new Date(rangeEnd), 'dd MMM', { locale: es })}`
                                            : 'Selec...'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* KPI SUMMARY CLEAN (Sin tarjetas, solo valor y color) */}
                        <div className="grid grid-cols-3 gap-2 mb-8 py-6 border-y border-gray-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Venta Media</span>
                                <span className="text-xl font-black text-emerald-500">{summary.avgNetSales.toFixed(0)}€</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Coste MO</span>
                                <span className="text-xl font-black text-rose-500">{summary.avgLaborPercent.toFixed(1)}%</span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Cierres</span>
                                <span className="text-xl font-black text-blue-500">{summary.totalClosings}</span>
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
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:text-[#36606F] transition-all group-hover:scale-110">
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
                                                    <span className="text-sm font-black text-[#36606F]">
                                                        {close.net_sales.toFixed(2)}€
                                                    </span>
                                                    <div className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 ${close.difference === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                        {close.difference === 0 ? 'OK' : `${close.difference.toFixed(2)}€`}
                                                    </div>
                                                </div>
                                                <ChevronRightIcon size={16} className="text-gray-300 group-hover:text-[#36606F] transition-colors" />
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
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedClosing(null)}>
                        <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#36606F] p-6 text-white relative">
                                <button onClick={() => setSelectedClosing(null)} className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors">
                                    <X size={20} />
                                </button>
                                <div className="flex items-center gap-2 opacity-80 mb-1">
                                    <Calendar size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Detalle de Cierre</span>
                                </div>
                                <h2 className="text-2xl font-black uppercase tracking-tight">
                                    {format(new Date(selectedClosing.closed_at), 'eeee d MMMM', { locale: es })}
                                </h2>
                                <div className="flex items-center gap-4 mt-2 text-[10px] font-bold uppercase text-blue-100">
                                    <span className="flex items-center gap-1"><CloudSun size={12} /> {selectedClosing.weather || 'N/A'}</span>
                                    <span className="flex items-center gap-1"><Receipt size={12} /> {selectedClosing.tickets_count || 0} Tickets</span>
                                </div>
                            </div>

                            <div className="p-8 space-y-6">
                                <div>
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2">Ventas</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Tarjeta</span>
                                            <span className="text-lg font-black text-gray-800">{selectedClosing.sales_card.toFixed(2)}€</span>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Pendiente</span>
                                            <span className="text-lg font-black text-gray-800">{selectedClosing.sales_pending.toFixed(2)}€</span>
                                        </div>
                                        <div className="p-4 bg-[#36606F]/5 border border-[#36606F]/10 rounded-2xl col-span-2 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-[#36606F] uppercase">Venta Neta Total</span>
                                            <span className="text-xl font-black text-[#36606F]">{selectedClosing.net_sales.toFixed(2)}€</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2">Efectivo</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold text-gray-600">
                                            <span>Esperado</span>
                                            <span>{selectedClosing.cash_expected.toFixed(2)}€</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-bold text-gray-600">
                                            <span>Contado</span>
                                            <span>{selectedClosing.cash_counted.toFixed(2)}€</span>
                                        </div>
                                        <div className={cn(
                                            "flex justify-between p-3 rounded-xl text-xs font-black uppercase",
                                            selectedClosing.difference === 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                                        )}>
                                            <span>Diferencia</span>
                                            <span>{selectedClosing.difference.toFixed(2)}€</span>
                                        </div>
                                    </div>
                                </div>

                                {selectedClosing.notes && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[11px] font-bold text-amber-700 italic">
                                        "{selectedClosing.notes}"
                                    </div>
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
                                                    isSelected ? "bg-[#36606F] text-white shadow-md" : isInRange ? "bg-blue-50 text-[#36606F]" : "hover:bg-gray-100 text-gray-700"
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
            </div>
        </div>
    );
}