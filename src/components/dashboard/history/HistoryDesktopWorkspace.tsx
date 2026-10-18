'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameMonth, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CloudSun, Pencil } from 'lucide-react';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import type { Tables } from '@/types/supabase';
import { getCashClosingPhotoUrlsAction } from '@/app/actions/cash-closing-photos';
import { buildLastClosingMetrics, formatClosingDifference, formatClosingValue, formatCurrencySpanish } from '@/lib/cash-closing-metrics';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

export type HistoryDesktopClosing = Pick<Tables<'cash_closings'>,
    'id' | 'closing_date' | 'closed_at' | 'tpv_sales' | 'net_sales' |
    'sales_card' | 'cash_counted' | 'sales_pending' | 'debt_recovered' |
    'difference' | 'tickets_count' | 'weather' |
    'dataphone_totals_photo_path' | 'bdp_closing_ticket_photo_path'
>;

type Props = {
    selectedDate: string;
    viewMonth: Date;
    calendarWeeks: Date[][];
    monthLabel: string;
    monthlyClosings: HistoryDesktopClosing[];
    summary: { totalNet: number; totalGross: number; count: number };
    percentChange: number;
    lastClosing: HistoryDesktopClosing | null;
    getClosingForDate: (date: string) => HistoryDesktopClosing | null;
    getExpectedSales: (date: Date) => number;
    onSelectDate: (date: string) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onOpenClosing: (closing: HistoryDesktopClosing) => void;
    onMonthlySales: () => void;
    onPeriodPerformance: () => void;
    onShowTable: () => void;
};


type TicketPeriodReport = {
    summary: { totalSales: number; count: number; avgTicket: number };
    hours: { hour: number; count: number; total: number }[];
    products: { nombre_articulo: string; cantidad_total: number; precio_medio: number; total_ingresos: number }[];
};

function useTicketPeriodReport(startDate: string | null, endDate: string | null) {
    const [report, setReport] = useState<TicketPeriodReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (!startDate || !endDate) { setReport(null); return; }
        let alive = true;
        setReport(null);
        setFailed(false);
        setLoading(true);
        const supabase = createClient();
        void (async () => {
            try {
                const { data, error } = await supabase.rpc('get_full_period_ticket_sales_detail', {
                    p_start_date: startDate,
                    p_end_date: endDate,
                });
                if (!alive) return;
                if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
                    setFailed(true);
                    return;
                }
                const value = data as unknown as TicketPeriodReport;
                if (!value.summary || !Array.isArray(value.hours) || !Array.isArray(value.products)) {
                    setFailed(true);
                    return;
                }
                setReport(value);
            } catch {
                if (alive) setFailed(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [startDate, endDate]);
    return { report, loading, failed };
}

function HistorySalesBreakdown({ report, loading, failed, fillHeight = false }: {
    report: TicketPeriodReport | null; loading: boolean; failed: boolean; fillHeight?: boolean;
}) {
    const productsListRef = useRef<HTMLDivElement>(null);
    const hoursListRef = useRef<HTMLDivElement>(null);
    const [fittedHeight, setFittedHeight] = useState<number | null>(null);
    useEffect(() => {
        if (!fillHeight || !report) return;
        const products = productsListRef.current;
        const hourList = hoursListRef.current;
        if (!products || !hourList) return;
        const measure = () => {
            // Each row is exactly 24px: keep only whole rows visible.
            const available = Math.min(products.parentElement?.clientHeight ?? 0, hourList.parentElement?.clientHeight ?? 0) - 24;
            const next = Math.max(0, Math.floor(available / 24) * 24);
            setFittedHeight(previous => previous === next ? previous : next);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(products.parentElement!);
        observer.observe(hourList.parentElement!);
        return () => observer.disconnect();
    }, [fillHeight, report]);
    const hours = useMemo(() => [...(report?.hours ?? [])]
        .map(row => ({ hour: Number(row.hour), count: Number(row.count) || 0, total: Number(row.total) || 0 }))
        .sort((a, b) => a.hour - b.hour), [report]);
    const topHours = useMemo(() => [...hours].filter(h => h.total > 0).sort((a, b) => b.total - a.total), [hours]);
    const timeline = useMemo(() => {
        const totals = Array.from({ length: 16 }, (_, i) => hours.find(h => h.hour === i + 7)?.total ?? 0);
        const peak = Math.max(1, ...totals);
        return totals.map((total, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, totals.length - 1)) * 120},${16 - total / peak * 13}`).join(' ');
    }, [hours]);
    if (loading) return <p className="py-4 text-center text-[10px] text-white/50">Cargando ventas…</p>;
    if (failed) return <p className="py-4 text-center text-[10px] text-rose-200">No se ha podido cargar el desglose.</p>;
    if (!report) return null;
    return (
        <div className={cn("grid min-h-0 grid-cols-2 gap-5 pt-2", fillHeight && "h-full")}>
            <div className={cn("min-w-0", fillHeight && "flex min-h-0 flex-col")}>
                <div className="mb-2 flex h-4 min-w-0 items-center">
                    <h3 className="text-xs font-bold uppercase text-white/85">Productos</h3>
                </div>
                {report.products.length ? (
                    <div ref={productsListRef} style={fillHeight && fittedHeight !== null ? { height: fittedHeight } : undefined} className={cn("history-sales-list custom-scrollbar h-[192px] snap-y snap-mandatory overflow-y-auto overscroll-contain pr-0.5", fillHeight && "!h-auto min-h-0")}>
                        {report.products.map((item, index) => (
                            <div key={`${item.nombre_articulo}-${index}`} className="grid h-6 min-w-0 snap-start snap-always grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[11px]">
                                <span className="min-w-0 truncate text-white/80" title={item.nombre_articulo}>{index + 1}. {item.nombre_articulo}</span>
                                <span className="shrink-0 text-[10px] tabular-nums text-white/60">{Number(item.cantidad_total).toLocaleString('es-ES')} u</span>
                                <strong className="shrink-0 tabular-nums">{currency(item.total_ingresos)}</strong>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-[9px] text-white/40">Sin productos</p>}
            </div>
            <div className={cn("history-hour-column min-w-0", fillHeight && "flex min-h-0 flex-col")}>
                <div className="mb-2 flex h-4 min-w-0 items-center gap-2">
                    <h3 className="shrink-0 text-xs font-bold uppercase text-white/85">Horas</h3>
                    <svg aria-label="Evolución de ventas por hora" role="img" viewBox="0 0 120 20" preserveAspectRatio="none" className="h-3 min-w-0 flex-1 text-white">
                        <path d={timeline} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="butt" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
                    </svg>
                </div>
                {topHours.length ? <div ref={hoursListRef} style={fillHeight && fittedHeight !== null ? { height: fittedHeight } : undefined} className={cn("history-sales-list custom-scrollbar h-[192px] snap-y snap-mandatory overflow-y-auto overscroll-contain pr-0.5", fillHeight && "!h-auto min-h-0")}>{topHours.map(row => (
                    <div key={row.hour} className="flex h-6 min-w-0 snap-start snap-always items-center gap-2 whitespace-nowrap text-[11px]">
                        <span className="shrink-0 font-semibold">{`${row.hour}-${(row.hour + 1) % 24}`}</span>
                        <span className="history-hour-tickets text-[10px] tabular-nums text-white/60">{row.count} tick</span>
                        <span className="history-hour-average text-[10px] tabular-nums text-white/55">{currency(row.count > 0 ? row.total / row.count : 0)} med</span>
                        <strong className="ml-auto shrink-0 text-right tabular-nums">{currency(row.total)}</strong>
                    </div>
                ))}</div> : <p className="text-[10px] text-white/40">Sin ventas positivas</p>}
            </div>
        </div>
    );
}

const currency = (v: number | null | undefined) => formatCurrencySpanish(Number(v ?? 0));
const timeLine = (date: string) => format(parseISO(date), "EEEE d 'de' MMMM", { locale: es });

function HistoryDesktopDailyCard({
    date, closing, onOpen, expectedSales,
}: {
    date: string;
    closing: HistoryDesktopClosing | null;
    onOpen: () => void;
    expectedSales: number;
}) {
    const [photos, setPhotos] = useState<{ dataphoneUrl: string | null; bdpUrl: string | null }>({
        dataphoneUrl: null, bdpUrl: null,
    });
    const [openPhoto, setOpenPhoto] = useState<{ src: string; alt: string } | null>(null);
    const dailyReport = useTicketPeriodReport(closing?.closing_date ?? null, closing?.closing_date ?? null);

    useEffect(() => {
        let active = true;
        setPhotos({ dataphoneUrl: null, bdpUrl: null });
        if (!closing?.dataphone_totals_photo_path && !closing?.bdp_closing_ticket_photo_path) return;

        void getCashClosingPhotoUrlsAction({
            dataphonePath: closing.dataphone_totals_photo_path,
            bdpPath: closing.bdp_closing_ticket_photo_path,
        }).then((result) => {
            if (active && result.success) {
                setPhotos({ dataphoneUrl: result.dataphoneUrl, bdpUrl: result.bdpUrl });
            }
        }).catch(() => {});
        return () => { active = false; };
    }, [closing?.id, closing?.dataphone_totals_photo_path, closing?.bdp_closing_ticket_photo_path]);

    const values = closing ? buildLastClosingMetrics({ ...closing }) : null;
    const metrics = values ? [
        ['Ventas', values.tpvSales],
        ['Venta neta', values.netSales],
        ['Tarjeta', values.salesCard],
        ['Efectivo', values.cashCounted],
        ['Pendiente pago', values.salesPending],
        ['Cobros pendientes', values.debtRecovered],
    ] as const : [];

    return (
        <article
            data-component="HistoryDesktopDayCard"
            data-selected="true"
            className="history-desktop-day flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/45 bg-[rgb(6_20_49/0.8)] text-white"
        >
            <header className="flex min-h-[32px] shrink-0 items-center justify-between gap-2 border-b border-white/15 bg-[rgb(8_26_60/0.8)] px-3 py-1.5">
                <div className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide">
                    {timeLine(date)}
                </div>
                {closing && values ? (
                    <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 text-[9px] text-white/60">
                        {closing.weather ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><CloudSun size={12} />{closing.weather}</span> : null}
                        <span className="whitespace-nowrap">{values.tickets} tickets</span>
                        {values.avgTicket > 0 ? <span className="whitespace-nowrap">{currency(values.avgTicket)} ticket medio</span> : null}
                    </div>
                ) : null}
                {closing && (
                    <button type="button" onClick={onOpen} className="shrink-0 rounded p-1 text-white/75 hover:bg-white/10 hover:text-white" aria-label={`Abrir detalle completo del ${timeLine(date)}`} title="Abrir detalle completo">
                        <Pencil size={15} aria-hidden />
                    </button>
                )}
            </header>
            {closing && values ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-6 pt-2">
                    <div className="flex shrink-0 flex-col divide-y divide-white/10">
                        {metrics.map(([name, value]) => (
                            <div key={name} className="grid min-h-[29px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1">
                                <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight text-white/85">{name}</span>
                                <strong className="text-right text-xs font-bold tabular-nums">{currency(value)}</strong>
                            </div>
                        ))}
                        <div className="grid min-h-[29px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1">
                            <span className="text-[10px] font-semibold uppercase text-white/85">Diferencia</span>
                            <strong className={cn('text-xs font-bold tabular-nums', values.difference > 0 ? 'text-emerald-300' : values.difference < 0 ? 'text-rose-300' : '')}>{currency(values.difference)}</strong>
                        </div>
                    </div>
                    {expectedSales > 0 ? (
                        <div className="flex shrink-0 items-center justify-center gap-4 text-center text-[9px] leading-snug text-white/60">
                            <span>Esperado: <strong className="text-white/85">{currency(expectedSales)}</strong></span>
                            <span>Rendimiento: <strong className={values.netSales >= expectedSales ? 'text-emerald-300' : 'text-rose-300'}>
                                {((values.netSales - expectedSales) / expectedSales * 100).toFixed(0)}%
                            </strong></span>
                        </div>
                    ) : null}
                    <div className="grid shrink-0 grid-cols-2 items-start gap-3 pt-1">
                        {([
                            ['dataphoneUrl', 'Totales datáfonos', 'dataphone_totals_photo_path'],
                            ['bdpUrl', 'Informe TPV', 'bdp_closing_ticket_photo_path'],
                        ] as const).map(([photoKey, label, pathKey]) => (
                            <button
                                type="button"
                                key={photoKey}
                                disabled={!photos[photoKey]}
                                onClick={() => {
                                    const src = photos[photoKey];
                                    if (src) setOpenPhoto({ src, alt: label });
                                }}
                                className="flex min-w-0 flex-col items-center justify-start gap-1 bg-transparent p-0 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 disabled:cursor-default disabled:hover:opacity-100"
                                aria-label={`Ver ${label.toLowerCase()} del ${timeLine(date)}`}
                            >
                                {photos[photoKey] ? (
                                    <img src={photos[photoKey]!} alt="" loading="lazy" className="block h-auto max-h-[100px] w-auto max-w-full rounded-xl object-contain" />
                                ) : (
                                    <span className="flex min-h-[68px] flex-1 items-center text-center text-[9px] text-white/45">
                                        {closing[pathKey] ? 'Cargando imagen…' : 'Sin imagen'}
                                    </span>
                                )}
                                <span className="text-center text-[8px] font-bold uppercase leading-tight text-white/65">{label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="min-h-0 flex-1">
                        <HistorySalesBreakdown report={dailyReport.report} loading={dailyReport.loading} failed={dailyReport.failed} fillHeight />
                    </div>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-center text-xs text-white/55">
                    No hay cierre registrado para este día
                </div>
            )}
            <ImageLightbox
                open={openPhoto !== null}
                onClose={() => setOpenPhoto(null)}
                src={openPhoto?.src}
                alt={openPhoto?.alt}
                scheme="dark"
                variant="work"
                zoomable
                zoomControls
                imageOnly
                instance="history-desktop-photo-preview"
            />
        </article>
    );
}

function HistoryDesktopSummary({ title, subtitle, metrics, weather, report, loading, failed }: {
    title: string;
    subtitle?: string;
    metrics: { label: string; value: string; trend?: number | null }[];
    weather?: string | null;
    report: TicketPeriodReport | null;
    loading: boolean;
    failed: boolean;
}) {
    return (
        <section className="history-desktop-summary rounded-[var(--radio-control)] border border-white/25 bg-[rgb(15_40_85/0.65)] px-3 pb-6 pt-2 text-white">
            <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{title}</h2>
                <div className="flex min-w-0 items-center gap-2">
                    {subtitle ? <span className="truncate text-[9px] text-white/50">{subtitle}</span> : null}
                    {weather ? <span className="inline-flex shrink-0 items-center gap-1 text-[9px] text-white/75"><CloudSun size={13} />{weather}</span> : null}
                    {report ? <span className="shrink-0 text-[9px] text-white/70"><strong className="text-white">{Number(report.summary.count).toLocaleString('es-ES')}</strong> tickets</span> : null}
                    {report ? <span className="shrink-0 text-[9px] text-white/70">TM <strong className="text-white">{currency(report.summary.avgTicket)}</strong></span> : null}
                </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="grid shrink-0 grid-cols-4 gap-x-2 gap-y-2">
                    {metrics.map(({ label, value, trend }) => (
                        <div key={label} className="flex min-w-0 flex-col items-center justify-center text-center">
                            <strong className="flex max-w-full items-center justify-center gap-1 truncate text-[clamp(10px,0.9vw,15px)] font-black tabular-nums text-white">
                                {trend !== undefined && trend !== null ? <span aria-hidden="true" className={trend >= 0 ? "text-emerald-400" : "text-rose-400"}>{trend >= 0 ? '▲' : '▼'}</span> : null}{value}
                            </strong>
                            <span className="text-[8px] font-semibold uppercase leading-tight text-white/60">{label}</span>
                        </div>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <HistorySalesBreakdown report={report} loading={loading} failed={failed} fillHeight />
                </div>
            </div>
        </section>
    );
}

export default function HistoryDesktopWorkspace({
    selectedDate, viewMonth, calendarWeeks, monthLabel, monthlyClosings,
    summary, percentChange, lastClosing, getClosingForDate, getExpectedSales,
    onSelectDate, onPrevMonth, onNextMonth, onOpenClosing, onMonthlySales,
    onPeriodPerformance, onShowTable,
}: Props) {
    const monthly = useMemo(() => ({
        card: monthlyClosings.reduce((sum, row) => sum + Number(row.sales_card ?? 0), 0),
        cash: monthlyClosings.reduce((sum, row) => sum + Number(row.cash_counted ?? 0), 0),
        pending: monthlyClosings.reduce((sum, row) => sum + Number(row.sales_pending ?? 0), 0),
        recovered: monthlyClosings.reduce((sum, row) => sum + Number(row.debt_recovered ?? 0), 0),
        difference: monthlyClosings.reduce((sum, row) => sum + Number(row.difference ?? 0), 0),
    }), [monthlyClosings]);
    const last = buildLastClosingMetrics(lastClosing ? { ...lastClosing } : null);
    const monthStart = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
    const monthEnd = format(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0), 'yyyy-MM-dd');
    const monthlyReport = useTicketPeriodReport(monthStart, monthEnd);
    const lastReport = useTicketPeriodReport(lastClosing?.closing_date ?? null, lastClosing?.closing_date ?? null);
    const lastExpected = lastClosing ? getExpectedSales(parseISO(lastClosing.closing_date)) : 0;
    const lastPerformance = lastClosing && lastExpected > 0
        ? ((Number(lastClosing.net_sales ?? 0) - lastExpected) / lastExpected) * 100
        : null;
    const performanceValue = (value: number | null) => value === null ? '—' : `${Math.abs(value).toFixed(1)}%`;
    const monthlyKpis = [
        { label: 'Ventas', value: currency(monthlyReport.report?.summary.totalSales ?? summary.totalGross) },
        { label: 'Venta neta', value: currency(summary.totalNet) },
        { label: 'Rendimiento', value: performanceValue(percentChange), trend: percentChange },
        { label: 'Tarjeta', value: currency(monthly.card) },
        { label: 'Efectivo', value: currency(monthly.cash) },
        { label: 'Pendiente', value: currency(monthly.pending) },
        { label: 'Cobros', value: currency(monthly.recovered) },
        { label: 'Diferencia', value: currency(monthly.difference) },
    ];
    const lastKpis = [
        { label: 'Ventas', value: formatClosingValue(last.tpvSales, 'tpv_sales') },
        { label: 'Venta neta', value: formatClosingValue(last.netSales, 'net_sales') },
        { label: 'Rendimiento', value: performanceValue(lastPerformance), trend: lastPerformance },
        { label: 'Tarjeta', value: formatClosingValue(last.salesCard, 'tpv_sales') },
        { label: 'Efectivo', value: formatClosingValue(last.cashCounted, 'cash_counted') },
        { label: 'Pendiente', value: formatClosingValue(last.salesPending, 'tpv_sales') },
        { label: 'Cobros', value: formatClosingValue(last.debtRecovered, 'tpv_sales') },
        { label: 'Diferencia', value: formatClosingDifference(last.difference) },
    ];

    return (
        <div data-component="HistoryDesktopWorkspace" className="history-desktop-workspace mx-auto hidden w-full min-w-0 flex-col px-3 pb-3 pt-1 lg:flex">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-4 text-white">
                <div className="flex min-w-0 items-baseline gap-4">
                    <h1 className="text-xl font-black">Historial de cierres</h1>
                    <span className="text-xs capitalize text-white/60">{monthLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/10" onClick={onPeriodPerformance}>Rendimiento</button>
                    <button type="button" className="rounded-md border border-white/35 px-3 py-1 text-xs text-white hover:bg-white/10" onClick={onShowTable}>Tabla</button>
                </div>
            </div>
            <div className="history-desktop-board grid min-h-0 flex-1 items-start gap-4">
                <div data-element="summary-stack" className="flex min-h-0 min-w-0 flex-col gap-4">
                    <HistoryDesktopSummary title="Último cierre" subtitle={lastClosing ? timeLine(lastClosing.closing_date) : undefined} metrics={lastKpis} weather={lastClosing?.weather} report={lastReport.report} loading={lastReport.loading} failed={lastReport.failed} />
                    <HistoryDesktopSummary title="Mensual" subtitle={monthLabel} metrics={monthlyKpis} report={monthlyReport.report} loading={monthlyReport.loading} failed={monthlyReport.failed} />
                </div>
                <div data-element="selected-day" className="min-h-0 min-w-0">
                    <HistoryDesktopDailyCard
                        key={selectedDate}
                        date={selectedDate}
                        closing={getClosingForDate(selectedDate)}
                        onOpen={() => {
                            const closing = getClosingForDate(selectedDate);
                            if (closing) onOpenClosing(closing);
                        }}
                        expectedSales={getClosingForDate(selectedDate) ? getExpectedSales(parseISO(selectedDate)) : 0}
                    />
                </div>
                {/* Navegación de mes flotante sobre el fondo: el calendario blanco
                    empieza directamente por su cabecera roja de días. */}
                <div data-element="calendar-column" className="flex min-h-0 min-w-0 flex-col">
                    <nav data-element="calendar-navigation" className="flex shrink-0 items-center justify-center gap-2 bg-transparent text-white" aria-label="Cambiar mes del historial">
                        <button type="button" onClick={onPrevMonth} className="rounded-md p-1.5 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Mes anterior">
                            <ChevronLeft size={19} />
                        </button>
                        <span className="min-w-[128px] text-center text-sm font-semibold capitalize text-white">
                            {format(startOfMonth(viewMonth), 'MMMM yyyy', { locale: es })}
                        </span>
                        <button type="button" onClick={onNextMonth} className="rounded-md p-1.5 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Mes siguiente">
                            <ChevronRight size={19} />
                        </button>
                    </nav>
                    <section data-element="calendar" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radio-control)] border border-zinc-200 bg-white text-zinc-900">
                        <MonthCalendarFrame flush className="history-desktop-month-cal-chrome">
                            <div className="month-cal-weeks history-desktop-cal-weeks" style={{ gridTemplateRows: `repeat(${calendarWeeks.length}, minmax(0, 1fr))` }}>
                                {calendarWeeks.map((week) => (
                                    <div key={format(week[0], 'yyyy-MM-dd')} className="month-cal-week grid min-h-0 grid-cols-7 border-b border-gray-100 last:border-b-0">
                                        {week.map((day) => {
                                            const iso = format(day, 'yyyy-MM-dd');
                                            const closing = getClosingForDate(iso);
                                            const isCurrentMonth = isSameMonth(day, viewMonth);
                                            const active = iso === selectedDate;
                                            const past = day < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                                            const netSales = Number(closing?.net_sales ?? 0);
                                            const expectedSales = closing ? getExpectedSales(day) : 0;
                                            const difference = expectedSales > 0 && netSales > 0
                                                ? (netSales - expectedSales) / expectedSales * 100
                                                : null;

                                            return (
                                                <button
                                                    type="button"
                                                    key={iso}
                                                    aria-label={`Seleccionar ${timeLine(iso)}`}
                                                    aria-pressed={active}
                                                    onClick={() => onSelectDate(iso)}
                                                    className={cn(
                                                        'month-cal-cell relative flex min-h-0 min-w-0 flex-col border-r border-gray-100 p-1 text-zinc-900 transition-colors last:border-r-0 hover:bg-blue-50/50',
                                                        past ? 'bg-zinc-50/90' : 'bg-white',
                                                        !isCurrentMonth && 'opacity-35',
                                                        active && 'z-[1] bg-white ring-2 ring-inset ring-zinc-900'
                                                    )}
                                                >
                                                    <span className={cn('absolute right-1 top-1 text-[9px] font-medium text-gray-400', active && 'font-bold text-zinc-950')}>
                                                        {format(day, 'd')}
                                                    </span>
                                                    <span className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 pt-2 text-center">
                                                        {netSales > 0 ? (
                                                            <>
                                                                <strong className="text-[clamp(9px,0.8vw,13px)] font-extrabold tabular-nums text-zinc-950">
                                                                    {currency(Math.round(netSales))}
                                                                </strong>
                                                                {difference !== null ? (
                                                                    <span className={cn(
                                                                        'text-[9px] font-black tabular-nums',
                                                                        difference > 5 ? 'text-emerald-600' :
                                                                        difference < -5 ? 'text-rose-600' : 'text-zinc-500'
                                                                    )}>
                                                                        {difference > 5 ? '▲ ' : difference < -5 ? '▼ ' : ''}
                                                                        {Math.abs(Math.round(difference))}%
                                                                    </span>
                                                                ) : null}
                                                            </>
                                                        ) : null}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </MonthCalendarFrame>
                    </section>
                </div>
            </div>
        </div>
    );
}
