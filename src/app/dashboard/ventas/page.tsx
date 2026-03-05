'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TicketSummary {
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
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
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

    // Estados para Drill-down (Lazy Loading)
    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [ticketLines, setTicketLines] = useState<any[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    useEffect(() => {
        fetchVentas();
    }, [rangeStart, rangeEnd, selectedDate, filterMode]);

    const parseLocalSafe = (dateStr: string | null) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const handlePrevMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const prev = subMonths(current, 1);
        setRangeStart(format(startOfMonth(prev), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(prev), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const handleNextMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const next = addMonths(current, 1);
        setRangeStart(format(startOfMonth(next), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    async function fetchVentas() {
        setLoading(true);
        try {
            let startDateStr: string;
            let endDateStr: string;

            if (filterMode === 'single') {
                startDateStr = selectedDate;
                endDateStr = selectedDate;
            } else {
                if (!rangeStart || !rangeEnd) {
                    setTickets([]);
                    setProducts([]);
                    setSummary({ totalSales: 0, count: 0, avgTicket: 0 });
                    setLoading(false);
                    return;
                }
                const s = parseLocalSafe(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = parseLocalSafe(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startDateStr = s.toISOString();
                endDateStr = e.toISOString();
            }

            // Fetching paralelo de Tickets (Cabeceras) y Ranking de Productos
            const ticketsPromise = supabase
                .from('tickets_marbella') // Endpoint/Tabla a utilizar
                .select('numero_documento, fecha, hora_cierre, total_documento')
                .gte('fecha', startDateStr)
                .lte('fecha', endDateStr)
                .order('fecha', { ascending: false })
                .order('hora_cierre', { ascending: false });

            const productsPromise = supabase.rpc('get_product_sales_ranking', {
                p_start_date: startDateStr,
                p_end_date: endDateStr
            });

            const [ticketsRes, productsRes] = await Promise.all([ticketsPromise, productsPromise]);

            if (ticketsRes.error) {
                if (ticketsRes.error.code === '42P01') {
                    console.warn("Tabla tickets_marbella no detectada o permisos erróneos. Mocking data...");
                } else {
                    console.error("Error tickets:", ticketsRes.error);
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

    const toggleTicket = async (numero_documento: string) => {
        if (expandedTicket === numero_documento) {
            setExpandedTicket(null);
            return;
        }

        setExpandedTicket(numero_documento);
        setLoadingLines(true);
        setTicketLines([]);

        try {
            const { data, error } = await supabase.rpc('get_ticket_lines', {
                p_numero_documento: numero_documento
            });

            if (error) throw error;

            // Agrupación y compresión de líneas del ticket a prueba de fallos
            const groupedLines = (data || []).reduce((acc: any, line: any) => {
                const key = `${line.articulo_nombre}-${line.precio_unidad}`;
                // El RPC devuelve 'cantidad', pero el JSX espera 'unidades'. Lo mapeamos.
                const qty = Number(line.cantidad ?? line.unidades ?? 0);
                const total = Number(line.importe_total ?? 0);

                if (!acc[key]) {
                    acc[key] = { ...line, unidades: qty, importe_total: total };
                } else {
                    acc[key].unidades += qty;
                    acc[key].importe_total += total;
                }
                return acc;
            }, {});

            setTicketLines(Object.values(groupedLines));
        } catch (err) {
            console.error('Error fetching ticket lines:', err);
            toast.error("Error al cargar detalles del ticket");
        } finally {
            setLoadingLines(false);
        }
    };

    const handleRowClick = (ticketId: string) => {
        toggleTicket(ticketId);
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

                        {/* FILTROS INTEGRADOS EN CABECERA */}
                        <div className="flex items-center justify-between gap-1 pb-2 relative min-h-[40px]">
                            {/* NAVEGADOR MENSUAL PRINCIPAL (A la Izquierda) */}
                            <div className="flex items-center gap-0.5 md:gap-1 z-10">
                                <button onClick={handlePrevMonth} className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none">
                                    <ChevronLeft size={18} />
                                </button>
                                <button onClick={() => setShowMonthPicker(true)} className="py-1 px-1 md:px-2 text-[10px] sm:text-[11px] md:text-[13px] font-black text-white uppercase tracking-widest text-center transition-all outline-none whitespace-nowrap">
                                    {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? format(new Date(rangeStart), 'MMMM yyyy', { locale: es })
                                        : 'MES'}
                                </button>
                                <button onClick={handleNextMonth} className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none">
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            {/* FILTROS SECUNDARIOS REDUCIDOS (A la Derecha) */}
                            <div className="flex items-center justify-end gap-1.5 shrink-0 z-10">
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
                                Tickets
                            </button>
                            <button
                                onClick={() => setActiveTab('PRODUCTOS')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all rounded-lg",
                                    activeTab === 'PRODUCTOS' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                                )}
                            >
                                Productos
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
                                                    <th className="p-3 md:p-4 rounded-tl-xl">Fecha</th>
                                                    <th className="p-3 md:p-4">Hora</th>
                                                    <th className="p-3 md:p-4">Documento</th>
                                                    <th className="p-3 md:p-4 rounded-tr-xl text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600">
                                                {tickets.map((ticket, idx) => (
                                                    <React.Fragment key={ticket.numero_documento || idx}>
                                                        <tr
                                                            onClick={() => handleRowClick(ticket.numero_documento)}
                                                            className={cn(
                                                                "group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100 border-b border-zinc-50 last:border-0",
                                                                expandedTicket === ticket.numero_documento && "bg-zinc-50 border-transparent shadow-sm"
                                                            )}
                                                        >
                                                            <td className="p-3 md:p-4 whitespace-nowrap text-zinc-900">
                                                                {ticket.fecha ? format(parseLocalSafe(ticket.fecha), 'dd/MM') : '---'}
                                                            </td>
                                                            <td className="p-3 md:p-4 whitespace-nowrap text-zinc-500 font-mono">
                                                                {(() => {
                                                                    try {
                                                                        let rawTime = ticket.hora_cierre;

                                                                        if (rawTime && typeof rawTime === 'string') {
                                                                            // Si viene como formato ISO (ej. "2026-03-05T14:30:00.000Z"), lo partimos por la 'T'
                                                                            if (rawTime.includes('T')) {
                                                                                rawTime = rawTime.split('T')[1];
                                                                            }

                                                                            // Ahora rawTime es seguro "14:30:00..."
                                                                            if (rawTime !== '00:00:00' && rawTime.length >= 5) {
                                                                                return rawTime.substring(0, 5);
                                                                            }
                                                                        }

                                                                        // Fallback en caso de que venga vacío
                                                                        if (ticket.fecha && ticket.fecha.includes('T')) {
                                                                            const fTime = ticket.fecha.split('T')[1];
                                                                            if (fTime !== '00:00:00') return fTime.substring(0, 5);
                                                                        }

                                                                        return '---';
                                                                    } catch (e) {
                                                                        return '---';
                                                                    }
                                                                })()}
                                                            </td>
                                                            <td className="p-3 md:p-4 font-mono text-[10px] md:text-xs">
                                                                {ticket.numero_documento}
                                                            </td>
                                                            <td className={cn(
                                                                "p-3 md:p-4 text-right font-black tabular-nums whitespace-nowrap",
                                                                (ticket.total_documento || 0) > 0 ? "text-emerald-500" : "text-zinc-600"
                                                            )}>
                                                                {(ticket.total_documento || 0) !== 0 ? `${Number(ticket.total_documento).toFixed(2)}€` : ' '}
                                                            </td>
                                                        </tr>
                                                        {expandedTicket === ticket.numero_documento && (
                                                            <tr className="bg-zinc-50/30">
                                                                <td colSpan={4} className="p-2 md:p-4">
                                                                    <div className="bg-zinc-50/50 rounded-2xl border border-zinc-100/50 p-2 md:p-4 animate-in slide-in-from-top-2 duration-200">
                                                                        {loadingLines ? (
                                                                            <div className="flex justify-center py-6">
                                                                                <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                                                            </div>
                                                                        ) : ticketLines.length === 0 ? (
                                                                            <div className="text-center py-4 text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                                                                No hay detalles para este ticket
                                                                            </div>
                                                                        ) : (
                                                                            <table className="w-full text-left border-collapse">
                                                                                <thead>
                                                                                    <tr className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-100">
                                                                                        <th className="py-2 px-1 text-center w-12">Cant</th>
                                                                                        <th className="py-2 px-2">Producto</th>
                                                                                        <th className="py-2 px-2 text-right">Precio</th>
                                                                                        <th className="py-2 px-1 text-right">Total</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="text-[10px] md:text-[11px] font-bold text-zinc-500">
                                                                                    {ticketLines.map((line, lIdx) => (
                                                                                        <tr key={lIdx} className="border-b border-zinc-100/50 last:border-0">
                                                                                            <td className="py-2 px-1 text-center tabular-nums text-zinc-400">
                                                                                                {line.unidades !== 0 ? line.unidades : ' '}
                                                                                            </td>
                                                                                            <td className="py-2 px-2 text-zinc-700">
                                                                                                {line.articulo_nombre}
                                                                                            </td>
                                                                                            <td className="py-2 px-2 text-right tabular-nums">
                                                                                                {line.precio_unidad !== 0 ? line.precio_unidad.toFixed(2) : ' '}
                                                                                            </td>
                                                                                            <td className="py-2 px-1 text-right font-black tabular-nums text-emerald-600/70">
                                                                                                {line.importe_total !== 0 ? line.importe_total.toFixed(2) : ' '}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
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
                                                            {Number(prod.cantidad_total).toFixed(0)}
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
