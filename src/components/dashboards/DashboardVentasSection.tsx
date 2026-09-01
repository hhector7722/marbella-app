'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, format, isToday, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/utils/supabase/client';
import { cn, getBusinessHourFromTicket } from '@/lib/utils';
import { BUSINESS_HOURS } from '@/lib/constants';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import LiveClock from '@/components/ui/LiveClock';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { randomId } from '@/lib/random-id';
import { MiniMonthCalendar } from '@/components/time/MiniMonthCalendar';
import { Surface } from '@/components/ui/Surface';
import { KpiStat } from '@/components/ui/KpiStat';
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
    const supabase = useMemo(() => createClient(), []);

    const [liveTickets, setLiveTickets] = useState(initialData?.liveTickets || { total: 0, count: 0 });
    const [salesChartData, setSalesChartData] = useState<{ hora: number; total: number }[]>(
        initialData?.salesChartData || Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }))
    );
    const [salesTickets, setSalesTickets] = useState<any[]>([]);
    const [salesViewDate, setSalesViewDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const salesViewDateRef = useRef(salesViewDate);
    const initialLoadDoneRef = useRef(false);
    const hourlyFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSalesDateModalOpen, setIsSalesDateModalOpen] = useState(false);
    const trackVentasDate = useTrackModalApply('dashboard-ventas-date', 'Selector de fecha ventas');
    const [salesCalendarBaseDate, setSalesCalendarBaseDate] = useState(() => new Date());
    const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [salesLoading, setSalesLoading] = useState(
        !(initialData?.liveTickets != null && initialData?.salesChartData != null)
    );
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
        setSalesLoading(true);
        try {
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
        } finally {
            setSalesLoading(false);
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
        // Nombre único: reutilizar el mismo topic tras subscribe() (Strict Mode / remount)
        // lanza "cannot add postgres_changes callbacks ... after subscribe()".
        const channelName = `realtime_tickets_dashboard:${randomId()}`;
        const channel = supabase
            .channel(channelName)
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
            void supabase.removeChannel(channel);
            clearInterval(dayCheckInterval);
            if (hourlyFetchDebounceRef.current) {
                clearTimeout(hourlyFetchDebounceRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- suscripción única al montar
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
        if (filterHourRange === null) return;
        let cancelled = false;
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
                }
            });
        return () => {
            cancelled = true;
        };
    }, [salesViewDate, filterHourRange, supabase]);

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

    const parseSalesViewDate = () => {
        const [y, m, d] = salesViewDate.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    };

    return (
        <>
            <Surface variant="page" instance="dashboard-ventas" className="flex h-full min-h-0 flex-col overflow-hidden">
                <div data-element="header" data-tone="plain" className="flex items-center justify-between gap-2 shrink-0">
                    <Link
                        href="/dashboard/ventas"
                        className={cn(
                            'py-0.5 px-2 flex items-center justify-center rounded-md text-[8px] font-medium uppercase tracking-wider',
                            'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80 active:scale-[0.98] transition-all cursor-pointer border-0 shadow-none'
                        )}
                    >
                        Ventas
                    </Link>
                    <div className="flex-1 flex items-center justify-center min-w-0">
                        <div className="inline-flex items-center gap-1 md:gap-1.5 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setSalesViewDate(format(subDays(parseSalesViewDate(), 1), 'yyyy-MM-dd'))}
                                className="shrink-0 h-full min-h-0 min-w-[36px] flex items-center justify-center rounded-lg hover:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer touch-manipulation"
                                aria-label="Día anterior"
                            >
                                <ChevronLeft className="w-5 h-5 text-zinc-700" />
                            </button>
                            <button
                                onClick={() => {
                                    setSalesCalendarBaseDate(parseSalesViewDate());
                                    setIsSalesDateModalOpen(true);
                                }}
                                className="shrink-0 h-full min-h-0 flex flex-col items-center justify-center py-0 px-2 rounded-lg hover:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer"
                            >
                                {isToday(parseSalesViewDate()) ? (
                                    <LiveClock />
                                ) : (
                                    <>
                                        <span className="text-[9px] md:text-[10px] font-medium uppercase tracking-widest text-zinc-700 whitespace-nowrap">
                                            {format(parseSalesViewDate(), 'eee d MMM', { locale: es }).replace('.', '')}
                                        </span>
                                        <span className="text-[8px] font-medium text-zinc-400">histórico</span>
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
                                className="shrink-0 h-full min-h-0 min-w-[36px] flex items-center justify-center rounded-lg hover:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                                aria-label="Día siguiente"
                                disabled={format(addDays(parseSalesViewDate(), 1), 'yyyy-MM-dd') > format(new Date(), 'yyyy-MM-dd')}
                            >
                                <ChevronRight className="w-5 h-5 text-zinc-700" />
                            </button>
                        </div>
                    </div>
                    <Link
                        href="/dashboard/history"
                        className={cn(
                            'py-0.5 px-2 flex items-center justify-center rounded-md text-[8px] font-medium uppercase tracking-wider',
                            'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80 active:scale-[0.98] transition-all cursor-pointer border-0 shadow-none'
                        )}
                    >
                        Cierres
                    </Link>
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
                        <div className="w-full shrink-0 px-2 pt-1">
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
                                <svg viewBox="0 0 120 24" className="w-full h-5 block select-none" preserveAspectRatio="none">
                                    <path d={toPath(rangeData)} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" className="text-ds-marca" />
                                </svg>
                            </div>
                            <div className="mt-0.5 flex justify-between px-0 text-[9px] font-mono leading-none text-ds-marca select-none pointer-events-none">
                                <span>{BUSINESS_HOURS.start} h</span>
                                <span>{BUSINESS_HOURS.end} h</span>
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
                                            <div className="absolute left-1/2 top-full w-3 h-3 rounded-full bg-ds-marca border-2 border-white shadow-sm -translate-x-1/2 -translate-y-1/2" />
                                        </div>
                                    );
                                    return typeof document !== 'undefined' ? createPortal(tooltipEl, document.body) : null;
                                })()}
                        </div>
                    );
                })()}

                <div
                    className={cn(
                        'grid shrink-0 grid-cols-3 items-start gap-1 px-2 pb-2',
                        displaySummary.total > 0 ? 'mt-auto' : 'my-auto'
                    )}
                >
                    {salesLoading ? (
                        <div className="col-span-3 flex items-center justify-center py-2" role="status" aria-label="Cargando ventas">
                            <LoadingSpinner size="md" className="text-ds-marca" />
                        </div>
                    ) : (
                    <>
                    <div className="flex min-h-0 w-full flex-col items-center justify-start text-center">
                        <KpiStat
                            instance="dashboard-ventas-total"
                            label="Ventas"
                        >
                            <PremiumCountUp value={displaySummary.total} suffix="€" decimals={2} />
                        </KpiStat>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center">
                        <KpiStat instance="dashboard-ventas-neta" label="Venta Neta" tone="positive">
                        <PremiumCountUp value={displaySummary.total > 0 ? displaySummary.total / 1.1 : 0} suffix="€" decimals={2} />
                        </KpiStat>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center">
                        <KpiStat instance="dashboard-ventas-ticket" label="Ticket Medio" tone="info">
                        <PremiumCountUp value={displaySummary.count > 0 ? displaySummary.total / displaySummary.count : 0} suffix="€" decimals={2} />
                        </KpiStat>
                    </div>
                    </>
                    )}
                </div>
            </Surface>

            <Modal
                open={isSalesDateModalOpen}
                onClose={() => setIsSalesDateModalOpen(false)}
                variant="compact"
                layer="base"
                instance="dashboard-ventas-date"
                usageId="dashboard-ventas-date"
                usageLabel="Selector de fecha ventas"
                title="Seleccionar fecha"
                footer={
                    !isToday(parseSalesViewDate()) ? (
                        <Button
                            type="button"
                            variant="primary"
                            instance="dashboard-ventas-date-today"
                            onClick={() => {
                                const todayStr = format(new Date(), 'yyyy-MM-dd');
                                trackVentasDate(formatYmdShort(todayStr), { selectedDate: todayStr });
                                setSalesViewDate(todayStr);
                                setIsSalesDateModalOpen(false);
                            }}
                        >
                            Ver hoy
                        </Button>
                    ) : undefined
                }
            >
                        <div className="pb-2 flex items-center gap-2">
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
                        <div className="px-4 pb-4">
                            <MiniMonthCalendar
                                month={salesCalendarBaseDate}
                                onMonthChange={setSalesCalendarBaseDate}
                                onSelectDay={(day) => {
                                    const dStr = format(day, 'yyyy-MM-dd');
                                    trackVentasDate(formatYmdShort(dStr), { selectedDate: dStr });
                                    setSalesViewDate(dStr);
                                    setIsSalesDateModalOpen(false);
                                }}
                                isSelected={(day) => format(day, 'yyyy-MM-dd') === salesViewDate}
                                isDisabled={(day) => format(day, 'yyyy-MM-dd') > format(new Date(), 'yyyy-MM-dd')}
                            />
                        </div>
            </Modal>
        </>
    );
}
