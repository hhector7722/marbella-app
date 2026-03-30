'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from "@/utils/supabase/client";
import { ArrowLeft, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, getHourFromTicketTime } from '@/lib/utils';
import { toast } from 'sonner';
import { BUSINESS_HOURS } from '@/lib/constants';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { SubNavVentas } from '@/components/dashboards/SubNavVentas';
import type { VentasTab } from '@/components/dashboards/SubNavVentas';

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

/** Tramo horario para la pestaña Horas (tickets con h<7 excluidos). */
function hourToSlotLabel(h: number): string | null {
    if (h >= 7 && h <= 22) {
        const start = `${String(h).padStart(2, '0')}:00`;
        const end = `${String(h + 1).padStart(2, '0')}:00`;
        return `${start} - ${end}`;
    }
    if (h === 23) return '23:00 - 24:00';
    return null;
}

interface HourSlotRow {
    label: string;
    cant: number;
    media: number;
    total: number;
}

export default function VentasPage() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<VentasTab>('VENTAS');

    useEffect(() => {
        const tab = searchParams.get('tab') as VentasTab | null;
        const valid: VentasTab[] = ['VENTAS', 'PRODUCTOS', 'HORAS'];
        if (tab && valid.includes(tab)) {
            setActiveTab(tab);
        }
    }, []);

    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    const [hourFilter, setHourFilter] = useState<{ startTime: string; endTime: string } | null>(null);

    const calendarDays = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? new Date(rangeStart) : new Date(selectedDate);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [filterMode, rangeStart, selectedDate]);

    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<TicketSummary[]>([]);
    const [products, setProducts] = useState<ProductRanking[]>([]);
    const [summary, setSummary] = useState({ totalSales: 0, count: 0, avgTicket: 0 });

    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [ticketLines, setTicketLines] = useState<any[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    const [salesChartData, setSalesChartData] = useState<{ hora: number; total: number }[]>(() => Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
    const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const chartDate = filterMode === 'single' ? selectedDate : (rangeStart ?? selectedDate);

    useEffect(() => {
        fetchVentas();
    }, [rangeStart, rangeEnd, selectedDate, filterMode, hourFilter]);

    useEffect(() => {
        let cancelled = false;
        async function fetchHourly() {
            try {
                const { data, error } = await supabase.rpc('get_hourly_sales', {
                    p_start_date: chartDate,
                    p_end_date: chartDate
                });
                if (cancelled) return;
                if (!error && data && data.length > 0) {
                    const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                    data.forEach((r: { hora: number; total: number }) => {
                        const h = Number(r.hora);
                        if (h >= 0 && h < 24) hourly[h] = { hora: h, total: Number(r.total) || 0 };
                    });
                    setSalesChartData(hourly);
                    return;
                }
                const { data: ticketsData } = await supabase
                    .from('tickets_marbella')
                    .select('hora_cierre, total_documento, fecha')
                    .gte('fecha', chartDate)
                    .lte('fecha', chartDate)
                    .limit(5000); // MODIFICACIÓN: Límite para la gráfica [cite: 130]

                const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                (ticketsData || []).forEach((t: { hora_cierre?: string; total_documento?: number; fecha?: string }) => {
                    const hour = getHourFromTicketTime(t.hora_cierre, t.fecha);
                    hourly[hour].total += Number(t.total_documento) || 0;
                });
                setSalesChartData(hourly);
            } catch {
                if (!cancelled) setSalesChartData(Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
            }
        }
        fetchHourly();
        return () => { cancelled = true; };
    }, [chartDate]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (selectedChartHour === null) return;
            const target = e.target as Node;
            const chartEl = chartContainerRef.current;
            const tooltipEl = tooltipRef.current;
            if (chartEl?.contains(target) || tooltipEl?.contains(target)) return;
            setSelectedChartHour(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [selectedChartHour]);

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

            const ticketsPromise = supabase
                .from('tickets_marbella')
                .select('numero_documento, fecha, hora_cierre, total_documento')
                .gte('fecha', startDateStr)
                .lte('fecha', endDateStr)
                .order('fecha', { ascending: false })
                .order('hora_cierre', { ascending: false })
                .limit(5000); // MODIFICACIÓN: Límite para el listado [cite: 152]

            const productsPromise = supabase.rpc('get_product_sales_ranking', {
                p_start_date: startDateStr,
                p_end_date: endDateStr
            });

            const [ticketsRes, productsRes] = await Promise.all([ticketsPromise, productsPromise]);

            if (ticketsRes.error) {
                if (ticketsRes.error.code === '42P01') {
                    console.warn("Tabla tickets_marbella no detectada.");
                } else {
                    console.error("Error tickets:", ticketsRes.error);
                    throw ticketsRes.error;
                }
            }

            const activeData = ticketsRes.data || [];
            const activeProducts = productsRes.data || [];

            const filteredTickets = (() => {
                if (!hourFilter) return activeData;
                const [sH, sM] = hourFilter.startTime.split(':').map(Number);
                const [eH, eM] = hourFilter.endTime.split(':').map(Number);
                const startTotal = (Number.isFinite(sH) ? sH : 0) * 60 + (Number.isFinite(sM) ? sM : 0);
                const endTotal = (Number.isFinite(eH) ? eH : 0) * 60 + (Number.isFinite(eM) ? eM : 0);
                return activeData.filter((t: any) => {
                    const hour = getHourFromTicketTime(t.hora_cierre, t.fecha);
                    const minutes = hour * 60;
                    return minutes >= startTotal && minutes <= endTotal;
                });
            })();

            const total = filteredTickets.reduce((acc, t) => acc + (Number((t as any).total_documento) || 0), 0);
            const count = filteredTickets.length;

            setTickets(filteredTickets as any);
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

            const groupedLines = (data || []).reduce((acc: any, line: any) => {
                const key = `${line.articulo_nombre}-${line.precio_unidad}`;
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

    const hourSlotsRows = useMemo((): HourSlotRow[] => {
        const map = new Map<string, { count: number; sum: number }>();
        for (const t of tickets) {
            const h = getHourFromTicketTime(t.hora_cierre, t.fecha);
            const label = hourToSlotLabel(h);
            if (!label) continue;
            const amt = Number(t.total_documento) || 0;
            const prev = map.get(label) ?? { count: 0, sum: 0 };
            prev.count += 1;
            prev.sum += amt;
            map.set(label, prev);
        }
        const rows: HourSlotRow[] = [];
        for (const [label, { count, sum }] of map) {
            if (count === 0) continue;
            rows.push({
                label,
                cant: count,
                media: sum / count,
                total: sum
            });
        }
        rows.sort((a, b) => b.total - a.total);
        return rows;
    }, [tickets]);

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-24 text-zinc-900 print:bg-white">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">

                    <div className="bg-[#36606F] p-4 md:p-5 pb-3 md:pb-4 space-y-3 print:hidden">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                                <button onClick={() => router.back()} className="flex items-center justify-center text-white bg-white/10 rounded-full border border-white/10 w-7 h-7 md:w-10 md:h-10 hover:bg-white/20 transition-all active:scale-95 shrink-0">
                                    <ArrowLeft className="w-3.5 h-3.5 md:w-5 md:h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-lg md:text-3xl font-black text-white uppercase tracking-tight italic shrink-0">Ventas</h1>
                            </div>

                            <div className="flex items-center gap-2 md:gap-4 shrink-0">
                                <TimeFilterButton
                                    onClick={() => setIsTimeFilterOpen(true)}
                                    hasActiveFilter={(() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        return filterMode !== 'single' || selectedDate !== today || !!hourFilter;
                                    })()}
                                    onClear={() => {
                                        const today = new Date().toISOString().split('T')[0];
                                        setHourFilter(null);
                                        setFilterMode('single');
                                        setSelectedDate(today);
                                    }}
                                    className="text-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-center max-sm mx-auto pt-1">
                            <button
                                onClick={() => {
                                    if (filterMode === 'single') {
                                        const prev = subDays(parseLocalSafe(selectedDate), 1);
                                        setSelectedDate(format(prev, 'yyyy-MM-dd'));
                                    } else handlePrevMonth();
                                }}
                                className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none"
                            >
                                <ChevronLeft size={20} />
                            </button>

                            <button
                                onClick={() => setIsTimeFilterOpen(true)}
                                className="px-2 md:px-6 text-[13px] sm:text-[15px] md:text-[18px] font-black text-white hover:text-blue-100 transition-colors capitalize tracking-wide whitespace-nowrap text-center"
                            >
                                {filterMode === 'single'
                                    ? format(parseLocalSafe(selectedDate), "EEEE d 'de' MMMM", { locale: es })
                                    : (rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? format(new Date(rangeStart), "MMMM 'de' yyyy", { locale: es })
                                        : 'Periodo')}
                            </button>

                            <button
                                onClick={() => {
                                    if (filterMode === 'single') {
                                        const next = addDays(parseLocalSafe(selectedDate), 1);
                                        setSelectedDate(format(next, 'yyyy-MM-dd'));
                                    } else handleNextMonth();
                                }}
                                className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-all outline-none"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="py-4 px-2 grid grid-cols-3 border-b border-zinc-50 print:hidden">
                        <div className="flex flex-col items-center justify-center text-center px-1">
                            <span className="text-[13px] md:text-2xl font-black tabular-nums line-clamp-1 text-emerald-500">
                                {summary.totalSales > 0 ? `${summary.totalSales.toFixed(2)}€` : " "}
                            </span>
                            <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">Ventas Totales</span>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center px-1">
                            <span className="text-[13px] md:text-2xl font-black tabular-nums line-clamp-1 text-zinc-900">
                                {summary.count > 0 ? summary.count : " "}
                            </span>
                            <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">Nº Tickets</span>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center px-1">
                            <span className="text-[13px] md:text-2xl font-black tabular-nums line-clamp-1 text-[#36606F]">
                                {summary.avgTicket > 0 ? `${summary.avgTicket.toFixed(2)}€` : " "}
                            </span>
                            <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">Ticket Medio</span>
                        </div>
                    </div>

                    {/* Gráfica ventas por hora */}
                    {(() => {
                        const chartData = salesChartData;
                        const rangeData = chartData.slice(BUSINESS_HOURS.start, BUSINESS_HOURS.end + 1);
                        const maxMain = Math.max(...rangeData.map(d => d.total), 0);
                        const scaleMax = Math.max(maxMain, 1);
                        const hasData = maxMain > 0;
                        if (!hasData) return null;
                        const numPoints = rangeData.length;
                        const isChartDateToday = chartDate === format(new Date(), 'yyyy-MM-dd');
                        const maxSelectableHour = isChartDateToday ? new Date().getHours() : BUSINESS_HOURS.end;
                        const toPath = (data: { hora: number; total: number }[]) => {
                            const pts = data.map((d, i) => {
                                const x = (i / (numPoints - 1 || 1)) * 120;
                                const y = 22 - (d.total / scaleMax) * 18;
                                return `${x},${y}`;
                            });
                            return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
                        };
                        const handleChartTap = (clientX: number) => {
                            const el = chartContainerRef.current;
                            if (!el) return;
                            const rect = el.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                            const rawHour = BUSINESS_HOURS.start + Math.round(ratio * (numPoints - 1));
                            const hour = Math.min(maxSelectableHour, Math.max(BUSINESS_HOURS.start, rawHour));
                            if (hour <= maxSelectableHour) setSelectedChartHour(hour);
                        };
                        const totalHastaHora = selectedChartHour === null ? 0 : Array.from(
                            { length: selectedChartHour - BUSINESS_HOURS.start + 1 },
                            (_, i) => chartData[BUSINESS_HOURS.start + i]?.total ?? 0
                        ).reduce((a, b) => a + Number(b), 0);
                        return (
                            <div className="w-full pb-1 pt-2 px-4 border-b border-zinc-50 shrink-0 print:hidden">
                                <div ref={chartContainerRef} className="w-full relative" onClick={(e) => handleChartTap(e.clientX)} onTouchEnd={(e) => {
                                    if (e.changedTouches.length) {
                                        e.preventDefault();
                                        handleChartTap(e.changedTouches[0].clientX);
                                    }
                                }}>
                                    <svg viewBox="0 0 120 24" className="w-full h-8 md:h-10 block select-none" preserveAspectRatio="none">
                                        <path d={toPath(rangeData)} fill="none" stroke="#36606F" strokeWidth="2" strokeLinecap="butt" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
                                    </svg>
                                </div>
                                <div className="flex justify-between px-0 text-[9px] font-mono text-[#36606F] leading-none select-none pointer-events-none mt-0.5">
                                    <span>7h</span><span>23h</span>
                                </div>
                                {selectedChartHour !== null && typeof document !== 'undefined' && (() => {
                                    const idx = selectedChartHour - BUSINESS_HOURS.start;
                                    const xPct = (idx / (numPoints - 1 || 1)) * 100;
                                    const yView = 22 - ((chartData[selectedChartHour]?.total ?? 0) / scaleMax) * 18;
                                    const yPct = (yView / 24) * 100;
                                    const rect = chartContainerRef.current?.getBoundingClientRect();
                                    const pointLeft = rect ? rect.left + (xPct / 100) * rect.width : 0;
                                    const pointTop = rect ? rect.top + (yPct / 100) * rect.height : 0;
                                    const tooltipEl = (
                                        <div className="fixed z-[100] pointer-events-none" style={{ left: pointLeft, top: pointTop, transform: 'translate(-50%, -100%)', marginTop: '-4px' }}>
                                            <div ref={tooltipRef} className="rounded-lg bg-white border border-zinc-200 shadow-lg px-2.5 py-1.5 text-center min-w-[4rem]">
                                                <div className="text-[10px] md:text-xs font-mono font-bold text-zinc-800 leading-tight">{String(selectedChartHour).padStart(2, '0')}:00</div>
                                                <div className="text-[10px] md:text-xs font-black tabular-nums text-emerald-600 leading-tight">{totalHastaHora.toFixed(2)}€</div>
                                            </div>
                                            <div className="absolute left-1/2 top-full w-3 h-3 rounded-full bg-[#36606F] border-2 border-white shadow-sm -translate-x-1/2 -translate-y-1/2" />
                                        </div>
                                    );
                                    return createPortal(tooltipEl, document.body);
                                })()}
                            </div>
                        );
                    })()}

                    <SubNavVentas activeTab={activeTab} onTabChange={setActiveTab} showPrint />

                    <div className="p-4 md:p-6 bg-zinc-50/50 print:bg-white print:p-4">
                        <div className="hidden print:block text-lg font-black text-zinc-800 mb-2">
                            Ventas — {activeTab === 'VENTAS' ? 'Ventas' : activeTab === 'PRODUCTOS' ? 'Productos' : 'Horas'}
                        </div>
                        <div className="bg-transparent w-full">
                            {loading ? (
                                <div className="flex justify-center items-center py-20"><LoadingSpinner size="lg" className="text-[#36606F]" /></div>
                            ) : activeTab === 'VENTAS' ? (
                                tickets.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin ventas en este periodo</span>
                                    </div>
                                ) : (
                                    <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-ventas">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider border-b border-[#36606F]">
                                                <tr><th className="py-4 px-3 md:px-6 whitespace-nowrap">Hora</th><th className="py-4 px-3 md:px-6 whitespace-nowrap">Documento</th><th className="py-4 px-3 md:px-6 text-right whitespace-nowrap">Total</th></tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600 bg-white">
                                                {tickets.map((ticket, idx) => {
                                                    const cleanDocNumber = ticket.numero_documento ? ticket.numero_documento.replace(/^0+/, '') : '';
                                                    return (
                                                        <React.Fragment key={ticket.numero_documento || idx}>
                                                            <tr onClick={() => handleRowClick(ticket.numero_documento)} className={cn("group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100", expandedTicket === ticket.numero_documento && "bg-zinc-50")}>
                                                                <td className="py-3 px-2 md:px-4 whitespace-nowrap text-zinc-500 font-mono text-[10px] md:text-xs">
                                                                    {(() => {
                                                                        try {
                                                                            let rawTime = ticket.hora_cierre;
                                                                            if (rawTime && typeof rawTime === 'string') {
                                                                                if (rawTime.includes('T')) rawTime = rawTime.split('T')[1];
                                                                                if (rawTime !== '00:00:00' && rawTime.length >= 5) return rawTime.substring(0, 5);
                                                                            }
                                                                            if (ticket.fecha && ticket.fecha.includes('T')) {
                                                                                const fTime = ticket.fecha.split('T')[1];
                                                                                if (fTime !== '00:00:00') return fTime.substring(0, 5);
                                                                            }
                                                                            return '---';
                                                                        } catch (e) { return '---'; }
                                                                    })()}
                                                                </td>
                                                                <td className="py-3 px-2 md:px-4 font-mono text-[10px] md:text-xs text-zinc-700">{cleanDocNumber}</td>
                                                                <td className={cn("py-3 px-2 md:px-4 text-right font-black tabular-nums whitespace-nowrap text-[11px] md:text-sm", (ticket.total_documento || 0) > 0 ? "text-emerald-500" : "text-zinc-600")}>
                                                                    {(ticket.total_documento || 0) !== 0 ? `${Number(ticket.total_documento).toFixed(2)}€` : ' '}
                                                                </td>
                                                            </tr>
                                                            {expandedTicket === ticket.numero_documento && (
                                                                <tr className="bg-zinc-50/30 print:hidden">
                                                                    <td colSpan={3} className="px-1 py-2 md:p-4">
                                                                        <div className="bg-[#fcfcfc] rounded-2xl p-2 md:p-4">
                                                                            {loadingLines ? (
                                                                                <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>
                                                                            ) : ticketLines.length === 0 ? (
                                                                                <div className="text-center py-4 text-[10px] font-black uppercase tracking-widest text-zinc-300">No hay detalles</div>
                                                                            ) : (
                                                                                <table className="w-full text-left border-collapse table-fixed">
                                                                                    <thead>
                                                                                        <tr className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                                                                                            <th className="py-2 px-1 text-center w-8 md:w-12">Cant</th><th className="py-2 px-1 md:px-2 w-[45%]">Producto</th><th className="py-2 px-1 md:px-2 text-right">Precio</th><th className="py-2 px-1 text-right">Total</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="text-[10px] md:text-[11px] font-bold text-zinc-500">
                                                                                        {ticketLines.map((line, lIdx) => (
                                                                                            <tr key={lIdx} className="border-b border-zinc-100/50 last:border-0">
                                                                                                <td className="py-2 px-1 text-center tabular-nums text-zinc-400">{line.unidades !== 0 ? line.unidades : ' '}</td>
                                                                                                <td className="py-2 px-1 md:px-2 text-zinc-700 truncate">{line.articulo_nombre}</td>
                                                                                                <td className="py-2 px-1 md:px-2 text-right tabular-nums">{line.precio_unidad !== 0 ? line.precio_unidad.toFixed(2) : ' '}</td>
                                                                                                <td className="py-2 px-1 text-right font-black tabular-nums text-emerald-600/70">{line.importe_total !== 0 ? line.importe_total.toFixed(2) : ' '}</td>
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
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : activeTab === 'PRODUCTOS' ? (
                                products.length === 0 ? (
                                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin productos</span>
                                    </div>
                                ) : (
                                    <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-ventas">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider border-b border-[#36606F]">
                                                <tr><th className="py-4 px-3 md:px-6 whitespace-nowrap">Producto</th><th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Cant</th><th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Media</th><th className="py-4 px-3 md:px-6 text-right whitespace-nowrap">Total</th></tr>
                                            </thead>
                                            <tbody className="text-xs font-bold text-zinc-600 bg-white">
                                                {products.map((prod, idx) => (
                                                    <tr key={idx} className="group hover:bg-zinc-50/80 transition-colors">
                                                        <td className="py-3 px-2 md:px-4 whitespace-nowrap flex items-center gap-1.5 md:gap-3">
                                                            <span className="text-[9px] md:text-[10px] font-black text-zinc-300 tabular-nums w-3 md:w-4 text-right">{prod.rank}</span>
                                                            <span className="text-zinc-900 font-bold max-w-[100px] sm:max-w-[200px] truncate text-[10px] md:text-xs">{prod.nombre_articulo}</span>
                                                        </td>
                                                        <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-500">{Number(prod.cantidad_total).toFixed(0)}</td>
                                                        <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-400">{Number(prod.precio_medio).toFixed(2)}€</td>
                                                        <td className="py-3 px-2 md:px-4 text-right font-black tabular-nums whitespace-nowrap text-emerald-500 text-[11px] md:text-sm">{Number(prod.total_ingresos).toFixed(2)}€</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : hourSlotsRows.length === 0 ? (
                                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sin datos por hora</span>
                                </div>
                            ) : (
                                <div className="w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden print-table-ventas">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#36606F] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider border-b border-[#36606F]">
                                            <tr><th className="py-4 px-3 md:px-6 whitespace-nowrap">Horas</th><th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Cant</th><th className="py-4 px-2 md:px-4 text-center whitespace-nowrap">Media</th><th className="py-4 px-3 md:px-6 text-right whitespace-nowrap">Total</th></tr>
                                        </thead>
                                        <tbody className="text-xs font-bold text-zinc-600 bg-white">
                                            {hourSlotsRows.map((row) => (
                                                <tr key={row.label} className="group hover:bg-zinc-50/80 transition-colors">
                                                    <td className="py-3 px-2 md:px-4 whitespace-nowrap font-mono text-[10px] md:text-xs font-bold text-zinc-900 tabular-nums">{row.label}</td>
                                                    <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-500 tabular-nums">{row.cant !== 0 ? row.cant : ' '}</td>
                                                    <td className="py-3 px-1 md:px-4 text-center text-[10px] md:text-xs text-zinc-400 tabular-nums">{row.media !== 0 ? `${row.media.toFixed(2)}€` : ' '}</td>
                                                    <td className="py-3 px-2 md:px-4 text-right font-black tabular-nums whitespace-nowrap text-emerald-500 text-[11px] md:text-sm">{row.total !== 0 ? `${row.total.toFixed(2)}€` : ' '}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

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
                                <button onClick={() => setCalendarBaseDate(addMonths(calendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (<div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">{d}</div>))}
                                {generateCalendarDays().map((day, i) => {
                                    if (!day) return <div key={i} />;
                                    const dStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isSelected = showCalendar === 'single' ? selectedDate === dStr : (rangeStart === dStr || rangeEnd === dStr);
                                    const isInRange = showCalendar === 'range' && rangeStart && rangeEnd && new Date(dStr) > new Date(rangeStart) && new Date(dStr) < new Date(rangeEnd);
                                    return (<button key={i} onClick={() => handleDateSelect(day)} className={cn("aspect-square flex items-center justify-center rounded-2xl text-[11px] font-black transition-all", isSelected ? "bg-zinc-900 text-white shadow-xl scale-110" : isInRange ? "bg-blue-50 text-[#5B8FB9]" : "hover:bg-zinc-50 text-zinc-600")}>{day}</button>);
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
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const date = new Date(pickerYear, i, 1);
                                    const isSelected = filterMode === 'range' && rangeStart === format(startOfMonth(date), 'yyyy-MM-dd') && rangeEnd === format(endOfMonth(date), 'yyyy-MM-dd');
                                    return (<button key={i} onClick={() => { setRangeStart(format(startOfMonth(date), 'yyyy-MM-dd')); setRangeEnd(format(endOfMonth(date), 'yyyy-MM-dd')); setFilterMode('range'); setShowMonthPicker(false); }} className={cn("py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2", isSelected ? "bg-zinc-900 border-zinc-900 text-white shadow-lg scale-105" : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900")}>{format(date, 'MMM', { locale: es })}</button>);
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={["hours", "date", "range", "week", "month", "year"]}
                initialValue={hourFilter ? ({ kind: "hours", startTime: hourFilter.startTime, endTime: hourFilter.endTime } satisfies TimeFilterValue) : filterMode === "single" ? ({ kind: "date", date: selectedDate } satisfies TimeFilterValue) : rangeStart && rangeEnd ? ({ kind: "range", startDate: rangeStart, endDate: rangeEnd } satisfies TimeFilterValue) : ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)}
                onApply={(v) => {
                    if (v.kind === "hours") { setHourFilter({ startTime: v.startTime, endTime: v.endTime }); return; }
                    setHourFilter(null);
                    if (v.kind === "date") { setSelectedDate(v.date); setFilterMode("single"); return; }
                    if (v.kind === "range" || v.kind === "week") { setRangeStart(v.startDate); setRangeEnd(v.endDate); setFilterMode("range"); return; }
                    if (v.kind === "month") { const s = new Date(v.year, v.month - 1, 1); const e = new Date(v.year, v.month, 0); setRangeStart(format(s, "yyyy-MM-dd")); setRangeEnd(format(e, "yyyy-MM-dd")); setFilterMode("range"); return; }
                    if (v.kind === "year") { const s = new Date(v.year, 0, 1); const e = new Date(v.year, 11, 31); setRangeStart(format(s, "yyyy-MM-dd")); setRangeEnd(format(e, "yyyy-MM-dd")); setFilterMode("range"); }
                }}
            />
        </div>
    );
}