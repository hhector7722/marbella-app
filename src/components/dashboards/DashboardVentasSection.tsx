'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDays, addMonths, format, isToday, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { cn, getBusinessHourFromTicket } from '@/lib/utils';
import { formatTicketTimeMadrid } from '@/utils/date-utils';
import { BUSINESS_HOURS } from '@/lib/constants';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import LiveClock from '@/components/ui/LiveClock';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';

export type DashboardVentasInitialData = {
    liveTickets?: { total: number; count: number };
    salesChartData?: { hora: number; total: number }[];
};

type DashboardVentasSectionProps = {
    initialData?: DashboardVentasInitialData;
};

export default function DashboardVentasSection({ initialData }: DashboardVentasSectionProps) {
    const supabase = createClient();

    const [liveTickets, setLiveTickets] = useState(initialData?.liveTickets || { total: 0, count: 0 });
    const [salesChartData, setSalesChartData] = useState<{ hora: number; total: number }[]>(
        initialData?.salesChartData || Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }))
    );
    const [isSalesExpanded, setIsSalesExpanded] = useState(false);
    const [salesTickets, setSalesTickets] = useState<any[]>([]);
    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [ticketLines, setTicketLines] = useState<any[]>([]);
    const [loadingTicketLines, setLoadingTicketLines] = useState(false);
    const [loadingSalesTickets, setLoadingSalesTickets] = useState(false);
    const [salesViewDate, setSalesViewDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const salesViewDateRef = useRef(salesViewDate);
    const initialLoadDoneRef = useRef(false);
    const hourlyFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSalesDateModalOpen, setIsSalesDateModalOpen] = useState(false);

    useModalUsageTracking({
        open: isSalesDateModalOpen,
        usageId: 'dashboard-ventas-date',
        usageLabel: 'Selector de fecha ventas',
    });
    const trackVentasDate = useTrackModalApply('dashboard-ventas-date', 'Selector de fecha ventas');
    const [salesCalendarBaseDate, setSalesCalendarBaseDate] = useState(() => new Date());
    const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [filterHourRange, setFilterHourRange] = useState<{ start: number; end: number } | null>(null);

    const getTicketHour = (ticket: { hora_cierre?: string; fecha?: string }): number =>
        getBusinessHourFromTicket(ticket);

    const fetchHourlySales = async (targetDate?: string) => {
        const dateStr = targetDate ?? format(new Date(), 'yyyy-MM-dd');
        try {
            const { data, error } = await supabase.rpc('get_hourly_sales', {
                p_start_date: dateStr,
                p_end_date: dateStr,
            });
            if (!error && data && data.length > 0) {
                const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                data.forEach((r: { hora: number; total: number }) => {
                    const h = Number(r.hora);
                    if (h >= 0 && h < 24) hourly[h] = { hora: h, total: Number(r.total) || 0 };
                });
                setSalesChartData(hourly);
                return;
            }
            const { data: tickets } = await supabase
                .from('tickets_marbella')
                .select('hora_cierre, fecha, total_documento')
                .eq('fecha', dateStr);
            const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
            (tickets || []).forEach((t: { hora_cierre?: string; fecha?: string; total_documento?: number }) => {
                const hour = getBusinessHourFromTicket(t);
                hourly[hour].total += Number(t.total_documento) || 0;
            });
            setSalesChartData(hourly);
        } catch {
            setSalesChartData(Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
        }
    };

    const fetchSalesForDate = async (dateStr: string) => {
        await fetchHourlySales(dateStr);
        try {
            const { data: salesStats } = await supabase.rpc('get_daily_sales_stats', { target_date: dateStr });
            setLiveTickets({
                total: salesStats?.total_ventas ?? 0,
                count: salesStats?.recuento_tickets ?? 0,
            });
        } catch {
            setLiveTickets({ total: 0, count: 0 });
        }
    };

    useEffect(() => {
        let lastDateStr = format(new Date(), 'yyyy-MM-dd');
        const dayCheckInterval = setInterval(() => {
            const nowStr = format(new Date(), 'yyyy-MM-dd');
            if (nowStr !== lastDateStr) {
                lastDateStr = nowStr;
                if (salesViewDateRef.current === nowStr) {
                    fetchHourlySales(nowStr);
                }
            }
        }, 60000);

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const channel = supabase
            .channel('realtime_tickets_dashboard')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'tickets_marbella',
                },
                (payload: any) => {
                    if (salesViewDateRef.current !== todayStr) return;
                    const rawFecha = payload.new?.fecha as string | Date | undefined;
                    const ticketFecha = rawFecha == null ? '' : String(rawFecha).split('T')[0];
                    if (ticketFecha !== todayStr) return;
                    const newTotal = Number(payload.new.total_documento) || 0;
                    setLiveTickets((prev) => ({
                        total: prev.total + newTotal,
                        count: prev.count + (newTotal > 0 ? 1 : newTotal < 0 ? -1 : 0),
                    }));
                    if (hourlyFetchDebounceRef.current) {
                        clearTimeout(hourlyFetchDebounceRef.current);
                    }
                    hourlyFetchDebounceRef.current = setTimeout(() => {
                        void fetchHourlySales(todayStr);
                        hourlyFetchDebounceRef.current = null;
                    }, 300);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            clearInterval(dayCheckInterval);
            if (hourlyFetchDebounceRef.current) {
                clearTimeout(hourlyFetchDebounceRef.current);
            }
        };
    }, [supabase]);

    salesViewDateRef.current = salesViewDate;

    useEffect(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const hasInitialTodayData =
            salesViewDate === todayStr &&
            initialData?.liveTickets != null &&
            initialData?.salesChartData != null;

        if (hasInitialTodayData && !initialLoadDoneRef.current) {
            initialLoadDoneRef.current = true;
            return;
        }

        void fetchSalesForDate(salesViewDate);
    }, [salesViewDate]);

    useEffect(() => {
        if (selectedChartHour === null) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const chartEl = chartContainerRef.current;
            const tooltipEl = tooltipRef.current;
            const target = e.target as Node;
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

    useEffect(() => {
        if (!isSalesExpanded && filterHourRange === null) return;
        let cancelled = false;
        setLoadingSalesTickets(true);
        supabase
            .from('tickets_marbella')
            .select('numero_documento, fecha, hora_cierre, total_documento')
            .eq('fecha', salesViewDate)
            .order('fecha', { ascending: false })
            .order('hora_cierre', { ascending: false })
            .limit(100)
            .then(({ data, error }) => {
                if (!cancelled) {
                    if (error) {
                        console.warn('Error fetching sales tickets:', error);
                        setSalesTickets([]);
                    } else {
                        setSalesTickets(data || []);
                    }
                    setLoadingSalesTickets(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [isSalesExpanded, salesViewDate, filterHourRange, supabase]);

    const displayTickets =
        filterHourRange === null
            ? salesTickets
            : salesTickets.filter((t) => {
                  const h = getTicketHour(t);
                  const lo = Math.min(filterHourRange.start, filterHourRange.end);
                  const hi = Math.max(filterHourRange.start, filterHourRange.end);
                  return h >= lo && h <= hi;
              });

    const displaySummary =
        filterHourRange === null
            ? liveTickets
            : {
                  total: displayTickets.reduce((s, t) => s + (Number(t.total_documento) || 0), 0),
                  count: displayTickets.length,
              };

    const toggleTicket = async (numero_documento: string) => {
        if (expandedTicket === numero_documento) {
            setExpandedTicket(null);
            return;
        }
        setExpandedTicket(numero_documento);
        setLoadingTicketLines(true);
        setTicketLines([]);
        try {
            const { data, error } = await supabase.rpc('get_ticket_lines', { p_numero_documento: numero_documento });
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
            toast.error('Error al cargar detalles del ticket');
        } finally {
            setLoadingTicketLines(false);
        }
    };

    const parseSalesViewDate = () => {
        const [y, m, d] = salesViewDate.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    };

    return (
        <>
            <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                <div className="bg-[#36606F] px-2 py-1 flex items-center justify-between gap-2 text-white shrink-0">
                    <Link
                        href="/dashboard/ventas"
                        className={cn(
                            'py-1 px-2.5 md:py-1.5 md:px-3 flex items-center justify-center rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest',
                            'bg-[#407080] text-white hover:bg-[#467888] active:scale-[0.98] transition-all cursor-pointer border-0 shadow-none'
                        )}
                    >
                        Ventas
                    </Link>
                    <div className="flex-1 flex items-center justify-center min-w-0">
                        <div className="inline-flex items-center gap-1 md:gap-1.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setSalesViewDate(format(subDays(parseSalesViewDate(), 1), 'yyyy-MM-dd'))}
                                className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer touch-manipulation"
                                aria-label="Día anterior"
                            >
                                <ChevronLeft className="w-5 h-5 md:w-5 md:h-5 text-white" />
                            </button>
                            <button
                                onClick={() => {
                                    setSalesCalendarBaseDate(parseSalesViewDate());
                                    setIsSalesDateModalOpen(true);
                                }}
                                className="shrink-0 min-h-[48px] flex flex-col items-center justify-center py-1 px-2 rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer"
                            >
                                {isToday(parseSalesViewDate()) ? (
                                    <LiveClock />
                                ) : (
                                    <>
                                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/90 whitespace-nowrap">
                                            {format(parseSalesViewDate(), 'eee d MMM', { locale: es }).replace('.', '')}
                                        </span>
                                        <span className="text-[8px] font-medium text-white/60">histórico</span>
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = addDays(parseSalesViewDate(), 1);
                                    if (format(next, 'yyyy-MM-dd') <= format(new Date(), 'yyyy-MM-dd')) {
                                        setSalesViewDate(format(next, 'yyyy-MM-dd'));
                                    }
                                }}
                                className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                                aria-label="Día siguiente"
                                disabled={format(addDays(parseSalesViewDate(), 1), 'yyyy-MM-dd') > format(new Date(), 'yyyy-MM-dd')}
                            >
                                <ChevronRight className="w-5 h-5 md:w-5 md:h-5 text-white" />
                            </button>
                        </div>
                    </div>
                    <Link
                        href="/dashboard/history"
                        className={cn(
                            'py-1 px-2.5 md:py-1.5 md:px-3 flex items-center justify-center rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest',
                            'bg-[#407080] text-white hover:bg-[#467888] active:scale-[0.98] transition-all cursor-pointer border-0 shadow-none'
                        )}
                    >
                        Cierres
                    </Link>
                </div>

                <div className={cn('p-3 md:p-2.5 grid grid-cols-3 gap-2 md:gap-4 items-center shrink-0 transition-all duration-300', isSalesExpanded ? 'pb-1' : 'pb-0')}>
                    <button
                        onClick={() => setIsSalesExpanded(!isSalesExpanded)}
                        className="flex flex-col items-center justify-center text-center min-h-[48px] w-full rounded-xl hover:bg-zinc-50/50 active:scale-[0.98] transition-all cursor-pointer group"
                    >
                        <PremiumCountUp value={displaySummary.total} suffix="€" decimals={2} className="text-lg md:text-3xl font-black text-black leading-none" />
                        <span className="flex items-center justify-center gap-1 mt-1">
                            <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ventas</span>
                            <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-transform duration-200 shrink-0', isSalesExpanded && 'rotate-180')} />
                        </span>
                    </button>
                    <div className="flex flex-col items-center justify-center text-center">
                        <PremiumCountUp value={displaySummary.total > 0 ? displaySummary.total / 1.1 : 0} suffix="€" decimals={2} className="text-lg md:text-3xl font-black text-emerald-600 leading-none" />
                        <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Venta Neta</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center">
                        <PremiumCountUp value={displaySummary.count > 0 ? displaySummary.total / displaySummary.count : 0} suffix="€" decimals={2} className="text-lg md:text-3xl font-black text-blue-600 leading-none" />
                        <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ticket Medio</span>
                    </div>
                </div>

                {(() => {
                    const chartData = salesChartData;
                    const rangeData = chartData.slice(BUSINESS_HOURS.start, BUSINESS_HOURS.end + 1);
                    const maxMain = Math.max(...rangeData.map((d) => d.total), 0);
                    const scaleMax = Math.max(maxMain, 1);
                    const hasData = maxMain > 0;
                    if (!hasData) return null;
                    const numPoints = rangeData.length;
                    const maxSelectableHour = isToday(parseSalesViewDate()) ? new Date().getHours() : BUSINESS_HOURS.end;
                    const toPath = (data: { hora: number; total: number }[]) => {
                        const pts = data.map((d, i) => {
                            const x = (i / (numPoints - 1 || 1)) * 120;
                            const y = 22 - (d.total / scaleMax) * 18;
                            return `${x},${y}`;
                        });
                        return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
                    };
                    const getHourFromClientX = (clientX: number): number => {
                        const el = chartContainerRef.current;
                        if (!el) return BUSINESS_HOURS.start;
                        const rect = el.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                        const rawHour = BUSINESS_HOURS.start + Math.round(ratio * (numPoints - 1));
                        return Math.min(maxSelectableHour, Math.max(BUSINESS_HOURS.start, rawHour));
                    };
                    const handleChartTap = (clientX: number) => {
                        const hour = getHourFromClientX(clientX);
                        if (hour <= maxSelectableHour) setSelectedChartHour(hour);
                    };
                    const totalHastaHora =
                        selectedChartHour === null
                            ? 0
                            : Array.from({ length: selectedChartHour - BUSINESS_HOURS.start + 1 }, (_, i) => chartData[BUSINESS_HOURS.start + i]?.total ?? 0).reduce(
                                  (a, b) => a + Number(b),
                                  0
                              );
                    return (
                        <div className="w-full pb-1 pt-0 -mt-1 shrink-0">
                            <div
                                ref={chartContainerRef}
                                className="w-full relative"
                                onClick={(e) => handleChartTap(e.clientX)}
                                onTouchEnd={(e) => {
                                    if (e.changedTouches.length) {
                                        e.preventDefault();
                                        handleChartTap(e.changedTouches[0].clientX);
                                    }
                                }}
                            >
                                <svg viewBox="0 0 120 24" className="w-full h-8 md:h-10 block select-none" preserveAspectRatio="none">
                                    <path d={toPath(rangeData)} fill="none" stroke="#36606F" strokeWidth="2" strokeLinecap="butt" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
                                </svg>
                            </div>
                            <div className="flex justify-between px-3 text-[9px] font-mono text-[#36606F] leading-none select-none pointer-events-none mt-0.5">
                                <span>7h</span>
                                <span>23h</span>
                            </div>
                            {selectedChartHour !== null &&
                                (() => {
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
                                    return typeof document !== 'undefined' ? createPortal(tooltipEl, document.body) : null;
                                })()}
                        </div>
                    );
                })()}

                <div className={cn('overflow-hidden transition-all duration-300 shrink-0', isSalesExpanded ? 'opacity-100' : 'h-0 opacity-0')}>
                    <div className={cn('pt-1 pb-1 px-1 space-y-1 transition-all duration-300', expandedTicket ? 'overflow-y-auto no-scrollbar max-h-none' : 'overflow-y-auto no-scrollbar max-h-[200px] md:max-h-[280px]')}>
                        {loadingSalesTickets ? (
                            <div className="flex justify-center py-8">
                                <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                            </div>
                        ) : salesTickets.length === 0 ? (
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-300 italic px-2 py-6 text-center">
                                {isToday(parseSalesViewDate()) ? 'Sin tickets hoy' : 'Sin tickets este día'}
                            </p>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-zinc-100 overflow-hidden max-md:[&_table_th]:border-r-0 max-md:[&_table_td]:border-r-0 relative">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#36606F] text-white text-[8px] md:text-[9px] font-black uppercase tracking-wider">
                                        <tr>
                                            <th className="py-2 px-2 md:px-3">Hora</th>
                                            <th className="py-2 px-2 md:px-3">Doc</th>
                                            <th className="py-2 px-2 md:px-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-[10px] md:text-xs font-bold text-zinc-600">
                                        {displayTickets.length === 0 && filterHourRange !== null ? (
                                            <tr>
                                                <td colSpan={3} className="py-4 text-center text-[9px] font-bold text-zinc-400">
                                                    Ningún ticket entre {String(filterHourRange.start).padStart(2, '0')}:00 y {String(filterHourRange.end).padStart(2, '0')}:00
                                                </td>
                                            </tr>
                                        ) : (
                                            displayTickets.map((ticket, idx) => {
                                                const cleanDoc = ticket.numero_documento?.replace(/0+/, '') || '';
                                                const hora = formatTicketTimeMadrid(ticket.hora_cierre, ticket.fecha);
                                                return (
                                                    <React.Fragment key={ticket.numero_documento || idx}>
                                                        <tr
                                                            onClick={() => toggleTicket(ticket.numero_documento)}
                                                            className={cn('cursor-pointer hover:bg-zinc-50 transition-colors active:bg-zinc-100', expandedTicket === ticket.numero_documento && 'bg-zinc-50')}
                                                        >
                                                            <td className="py-2 px-2 md:px-3 font-mono text-zinc-500">{hora}</td>
                                                            <td className="py-2 px-2 md:px-3 font-mono text-zinc-700">{cleanDoc}</td>
                                                            <td className={cn('py-2 px-2 md:px-3 text-right font-black tabular-nums', (ticket.total_documento || 0) > 0 ? 'text-emerald-500' : 'text-zinc-600')}>
                                                                {(ticket.total_documento || 0) !== 0 ? `${Number(ticket.total_documento).toFixed(2)}€` : ' '}
                                                            </td>
                                                        </tr>
                                                        {expandedTicket === ticket.numero_documento && (
                                                            <tr className="bg-zinc-50/50">
                                                                <td colSpan={3} className="px-2 py-2 md:px-3 md:py-3">
                                                                    <div className="bg-[#fcfcfc] rounded-xl p-2 md:p-3 animate-in slide-in-from-top-2 duration-200">
                                                                        {loadingTicketLines ? (
                                                                            <div className="flex justify-center py-4">
                                                                                <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                                                            </div>
                                                                        ) : ticketLines.length === 0 ? (
                                                                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-300 text-center py-2">Sin detalles</p>
                                                                        ) : (
                                                                            <table className="w-full text-left border-collapse table-fixed">
                                                                                <thead>
                                                                                    <tr className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                                                                                        <th className="py-1.5 px-1 text-center w-8">Cant</th>
                                                                                        <th className="py-1.5 px-1 md:px-2 w-[45%]">Producto</th>
                                                                                        <th className="py-1.5 px-1 text-right">Precio</th>
                                                                                        <th className="py-1.5 px-1 text-right">Total</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="text-[9px] md:text-[10px] font-bold text-zinc-500">
                                                                                    {ticketLines.map((line, lIdx) => {
                                                                                        const isSubItem = line.articulo_nombre?.startsWith('↳') || line.articulo_nombre?.startsWith('?');
                                                                                        const showUnits = !isSubItem || line.unidades !== 1;
                                                                                        return (
                                                                                            <tr key={lIdx} className="border-b border-zinc-100/50 last:border-0">
                                                                                                <td className="py-1.5 px-1 text-center tabular-nums text-zinc-400">{showUnits && line.unidades !== 0 ? line.unidades : ' '}</td>
                                                                                                <td className={cn('py-1.5 px-1 md:px-2 text-zinc-700 min-w-0 truncate', isSubItem && 'pl-4 text-zinc-500 font-medium')}>{line.articulo_nombre}</td>
                                                                                                <td className="py-1.5 px-1 text-right tabular-nums">{line.precio_unidad !== 0 ? line.precio_unidad.toFixed(2) : ' '}</td>
                                                                                                <td className="py-1.5 px-1 text-right font-black tabular-nums text-emerald-600/70">{line.importe_total !== 0 ? line.importe_total.toFixed(2) : ' '}</td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isSalesDateModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setIsSalesDateModalOpen(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">Seleccionar fecha</h3>
                            <button onClick={() => setIsSalesDateModalOpen(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                                <X size={18} className="text-zinc-400" />
                            </button>
                        </div>
                        <div className="px-4 pb-2 flex items-center gap-2">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider shrink-0">Seleccionar hora</span>
                            <select
                                value={filterHourRange?.start ?? ''}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '') setFilterHourRange(null);
                                    else setFilterHourRange((prev) => ({ start: Number(v), end: prev?.end ?? 23 }));
                                }}
                                className="rounded-xl border border-zinc-200 px-2 py-2 text-[10px] font-mono font-bold min-h-[40px] flex-1"
                            >
                                <option value="">Todo el día</option>
                                {Array.from({ length: 17 }, (_, i) => i + 7).map((h) => (
                                    <option key={h} value={h}>
                                        {String(h).padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                            <span className="text-zinc-300 shrink-0">–</span>
                            <select
                                value={filterHourRange?.end ?? ''}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '') setFilterHourRange(null);
                                    else setFilterHourRange((prev) => ({ start: prev?.start ?? 7, end: Number(v) }));
                                }}
                                className="rounded-xl border border-zinc-200 px-2 py-2 text-[10px] font-mono font-bold min-h-[40px] flex-1"
                            >
                                <option value="">Todo el día</option>
                                {Array.from({ length: 17 }, (_, i) => i + 7).map((h) => (
                                    <option key={h} value={h}>
                                        {String(h).padStart(2, '0')}:00
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="p-6 pt-0">
                            <div className="flex items-center justify-between mb-6 px-2">
                                <button onClick={() => setSalesCalendarBaseDate(subMonths(salesCalendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                                    <ChevronLeft size={20} className="text-zinc-400" />
                                </button>
                                <span className="font-black text-zinc-900 text-xs uppercase tracking-tight">{format(salesCalendarBaseDate, 'MMMM yyyy', { locale: es })}</span>
                                <button onClick={() => setSalesCalendarBaseDate(addMonths(salesCalendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                                    <ChevronRight size={20} className="text-zinc-400" />
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                                    <div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">
                                        {d}
                                    </div>
                                ))}
                                {(() => {
                                    const year = salesCalendarBaseDate.getFullYear();
                                    const month = salesCalendarBaseDate.getMonth();
                                    const firstDay = new Date(year, month, 1);
                                    const lastDay = new Date(year, month + 1, 0);
                                    const days: (number | null)[] = [];
                                    const startDay = (firstDay.getDay() + 6) % 7;
                                    for (let i = 0; i < startDay; i++) days.push(null);
                                    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
                                    return days.map((day, i) => {
                                        if (!day) return <div key={i} />;
                                        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const isSelected = salesViewDate === dStr;
                                        const today = new Date();
                                        const isFuture = new Date(year, month, day) > new Date(today.getFullYear(), today.getMonth(), today.getDate());
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    if (!isFuture) {
                                                        trackVentasDate(formatYmdShort(dStr), { selectedDate: dStr });
                                                        setSalesViewDate(dStr);
                                                        setIsSalesDateModalOpen(false);
                                                    }
                                                }}
                                                disabled={isFuture}
                                                className={cn(
                                                    'aspect-square flex items-center justify-center rounded-2xl text-[11px] font-black transition-all min-h-[48px]',
                                                    isSelected ? 'bg-[#36606F] text-white shadow-xl' : isFuture ? 'text-zinc-300 cursor-not-allowed' : 'hover:bg-zinc-50 text-zinc-600 active:scale-95'
                                                )}
                                            >
                                                {day}
                                            </button>
                                        );
                                    });
                                })()}
                            </div>
                            {!isToday(parseSalesViewDate()) && (
                                <button
                                    onClick={() => {
                                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                                        trackVentasDate(formatYmdShort(todayStr), { selectedDate: todayStr });
                                        setSalesViewDate(todayStr);
                                        setIsSalesDateModalOpen(false);
                                    }}
                                    className="mt-6 w-full py-3 rounded-2xl bg-[#5B8FB9] text-white font-black text-xs uppercase tracking-widest hover:bg-[#4a7a9e] active:scale-[0.98] transition-all"
                                >
                                    Ver hoy
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
