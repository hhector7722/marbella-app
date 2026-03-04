'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TicketSummary {
    id: string;
    numero_documento: string;
    fecha: string;
    hora_cierre: string;
    origen: string;
    total_documento: number;
}

interface ProductRanking {
    rank?: number;
    nombre_articulo: string;
    cantidad_total: number;
    precio_medio: number;
    total_ingresos: number;
}

export default function VentasPage() {
    const supabase = createClient();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<'TICKETS' | 'PRODUCTOS'>('TICKETS');

    // Filtros de fecha (Arquitectura calcada de HistoryPage)
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

    const calendarDays = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? new Date(rangeStart) : new Date(selectedDate);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [filterMode, rangeStart, selectedDate]);

    // Estados de Datos
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<TicketSummary[]>([]);
    const [products, setProducts] = useState<ProductRanking[]>([]);
    const [summary, setSummary] = useState({ totalSales: 0, count: 0, avgTicket: 0 });

    useEffect(() => {
        fetchVentas();
    }, [rangeStart, rangeEnd, selectedDate, filterMode]);

    async function fetchVentas() {
        setLoading(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                startISO = selectedDate;
                endISO = selectedDate;
            } else {
                if (!rangeStart || !rangeEnd) {
                    setTickets([]);
                    setProducts([]);
                    setSummary({ totalSales: 0, count: 0, avgTicket: 0 });
                    setLoading(false);
                    return;
                }
                startISO = rangeStart;
                endISO = rangeEnd;
            }

            // Fetching paralelo de Tickets (Cabeceras) y Ranking de Productos
            const ticketsPromise = supabase
                .from('tickets_marbella') // Endpoint/Tabla a utilizar
                .select('id, numero_documento, fecha, hora_cierre, total_documento')
                .gte('fecha', startISO)
                .lte('fecha', endISO)
                .order('fecha', { ascending: false })
                .order('hora_cierre', { ascending: false });

            const productsPromise = supabase.rpc('get_product_sales_ranking', {
                p_start_date: startISO,
                p_end_date: endISO
            });

            const [ticketsRes, productsRes] = await Promise.all([ticketsPromise, productsPromise]);

            if (ticketsRes.error) {
                if (ticketsRes.error.code === '42P01') {
                    console.warn("Tabla tickets_marbella no detectada o permisos erróneos. Mocking data...");
                } else {
                    throw ticketsRes.error;
                }
            }
            if (productsRes.error) {
                console.warn("Error en RPC get_product_sales_ranking o no existe.", productsRes.error);
            }

            const activeData = ticketsRes.data || [];
            const activeProducts = productsRes.data || [];

            const total = activeData.reduce((acc, t) => acc + (Number(t.total_documento) || 0), 0);
            const count = activeData.length;

            setTickets(activeData as any);
            setProducts(activeProducts.map((p: any, i: number) => ({ ...p, rank: i + 1 })) as ProductRanking[]);
            setSummary({
                totalSales: total,
                count: count,
                avgTicket: count > 0 ? total / count : 0
            });

        } catch (err: any) {
            console.error('Error fetching ventas:', err);
            toast.error("Error al cargar ventas");
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

    const handleRowClick = (ticketId: string) => {
        // Preparado para futura navegación
        console.log("Navegar al ticket:", ticketId);
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-24 text-zinc-900">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">

                    {/* CABECERA Y FILTROS */}
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-6">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.back()} className="flex items-center justify-center text-white bg-white/10 rounded-full border border-white/10 w-10 h-10 hover:bg-white/20 transition-all active:scale-95 shrink-0">
                                <ArrowLeft className="w-5 h-5" strokeWidth={3} />
                            </button>
                            <h1 className="text-lg md:text-4xl font-black text-white uppercase tracking-tight italic truncate">Ventas</h1>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pb-2">
                            <button
                                onClick={() => setShowMonthPicker(true)}
                                className={cn(
                                    "py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border outline-none truncate",
                                    filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? "bg-white border-white text-zinc-800 shadow-sm"
                                        : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                )}
                            >
                                {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                    ? format(new Date(rangeStart), 'MMMM yyyy', { locale: es })
                                    : 'MES'}
                            </button>

                            <button
                                onClick={() => {
                                    setRangeStart(null);
                                    setRangeEnd(null);
                                    setShowCalendar('range');
                                }}
                                className={cn(
                                    "py-2 rounded-xl text-[9px] font-black border transition-all flex items-center justify-center gap-2 uppercase tracking-widest outline-none",
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
                                    "py-2 rounded-xl text-[9px] font-black border transition-all flex items-center justify-center gap-2 uppercase tracking-widest outline-none",
                                    filterMode === 'single' ? "bg-white border-white text-zinc-800 shadow-sm" : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                )}
                            >
                                FECHA
                            </button>
                        </div>
                    </div>

                    {/* SECCIÓN DE KPIs */}
                    <div className="py-4 px-2 grid grid-cols-3 border-b border-zinc-50">
                        <div className="flex flex-col items-center justify-center text-center px-1">
                            <span className="text-[13px] md:text-2xl font-black tabular-nums line-clamp-1 text-emerald-500">
                                {summary.totalSales > 0 ? `${summary.totalSales.toFixed(2)}€` : " "}
                            </span>
                            <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">Ventas Totales</span>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                            <span className="text-[13px] md:text-2xl font-black tabular-nums line-clamp-1 text-zinc-900">
                                {summary.count > 0 ? summary.count : " "}
                            </span>
                            <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">Nº Tickets</span>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                            <span className="text-[13px] md:text-2xl font-black tabular-nums line-clamp-1 text-[#36606F]">
                                {summary.avgTicket > 0 ? `${summary.avgTicket.toFixed(2)}€` : " "}
                            </span>
                            <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">Ticket Medio</span>
                        </div>
                    </div>

                    {/* TOGGLE SWITCH DE VISTAS */}
                    <div className="px-4 md:px-6 py-2 bg-white">
                        <div className="bg-zinc-100 p-1 rounded-xl flex gap-1 max-w-sm mx-auto md:mx-0">
                            <button
                                onClick={() => setActiveTab('TICKETS')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all rounded-lg",
                                    activeTab === 'TICKETS' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                                )}
                            >
                                Visión Tickets
                            </button>
                            <button
                                onClick={() => setActiveTab('PRODUCTOS')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all rounded-lg",
                                    activeTab === 'PRODUCTOS' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                                )}
                            >
                                Visión Productos
                            </button>
                        </div>
                    </div>

                    {/* TABLAS */}
                    <div className="p-4 md:p-6 bg-zinc-50/30">
                        <div className="p-3 bg-white rounded-[1.5rem] overflow-hidden border border-zinc-100 shadow-xl">
                            {loading ? (
                                <div className="flex justify-center items-center py-20">
                                    <LoadingSpinner size="lg" className="text-[#36606F]" />
                                </div>
                            ) : activeTab === 'TICKETS' ? (
                                tickets.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin ventas en este periodo</span>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em]">
                                                <tr>
                                                    <th className="p-3 md:p-4 rounded-tl-xl whitespace-nowrap">Fecha</th>
                                                    <th className="p-3 md:p-4 whitespace-nowrap">Nº Ticket</th>
                                                    <th className="p-3 md:p-4 whitespace-nowrap">Origen</th>
                                                    <th className="p-3 md:p-4 rounded-tr-xl text-right whitespace-nowrap">Importe Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600">
                                                {tickets.map((ticket, idx) => (
                                                    <tr
                                                        key={ticket.id || idx}
                                                        onClick={() => handleRowClick(ticket.id)}
                                                        className="group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100 border-b border-zinc-50 last:border-0"
                                                    >
                                                        <td className="p-3 md:p-4 whitespace-nowrap">
                                                            {format(new Date(`${ticket.fecha}T${ticket.hora_cierre || '00:00:00'}`), 'dd/MM HH:mm')}
                                                        </td>
                                                        <td className="p-3 md:p-4 font-mono text-[10px] md:text-xs">
                                                            {ticket.numero_documento}
                                                        </td>
                                                        <td className="p-3 md:p-4 text-[10px] md:text-xs text-zinc-400">
                                                            {ticket.origen || 'TPV'}
                                                        </td>
                                                        <td className={cn(
                                                            "p-3 md:p-4 text-right font-black tabular-nums whitespace-nowrap",
                                                            (ticket.total_documento || 0) > 0 ? "text-emerald-500" : "text-zinc-600"
                                                        )}>
                                                            {Number(ticket.total_documento || 0).toFixed(2)}€
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : (
                                products.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin productos en este periodo</span>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em]">
                                                <tr>
                                                    <th className="p-3 md:p-4 rounded-tl-xl whitespace-nowrap">Producto</th>
                                                    <th className="p-3 md:p-4 text-center whitespace-nowrap">Cantidad</th>
                                                    <th className="p-3 md:p-4 text-center whitespace-nowrap">Precio Medio</th>
                                                    <th className="p-3 md:p-4 rounded-tr-xl text-right whitespace-nowrap">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600">
                                                {products.map((prod, idx) => (
                                                    <tr
                                                        key={idx}
                                                        className="group hover:bg-zinc-50/80 transition-colors border-b border-zinc-50 last:border-0"
                                                    >
                                                        <td className="p-3 md:p-4 whitespace-nowrap flex items-center gap-3">
                                                            <span className="text-[10px] font-black text-zinc-300 tabular-nums w-4 text-right">
                                                                {prod.rank}
                                                            </span>
                                                            <span className="text-zinc-900 font-bold">
                                                                {prod.nombre_articulo}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 md:p-4 text-center text-[10px] md:text-xs text-zinc-500">
                                                            {Number(prod.cantidad_total).toFixed(0)} uds
                                                        </td>
                                                        <td className="p-3 md:p-4 text-center text-[10px] md:text-xs text-zinc-400">
                                                            {Number(prod.precio_medio).toFixed(2)}€
                                                        </td>
                                                        <td className="p-3 md:p-4 text-right font-black tabular-nums whitespace-nowrap text-emerald-500">
                                                            {Number(prod.total_ingresos).toFixed(2)}€
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* MODALES REUTILIZADOS DE HISTORY PAGE */}
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
