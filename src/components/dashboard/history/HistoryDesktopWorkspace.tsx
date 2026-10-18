'use client';

import { useEffect, useMemo, useState } from 'react';
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

function HistorySalesBreakdown({ report, loading, failed }: {
    report: TicketPeriodReport | null; loading: boolean; failed: boolean;
}) {
    const hours = useMemo(() => [...(report?.hours ?? [])]
        .map(row => ({ hour: Number(row.hour), count: Number(row.count) || 0, total: Number(row.total) || 0 }))
        .sort((a, b) => a.hour - b.hour), [report]);
    const topHours = useMemo(() => [...hours].filter(h => h.total > 0).sort((a, b) => b.total - a.total), [hours]);
    const max = Math.max(1, ...hours.map(h => h.total));
    if (loading) return <p className="py-4 text-center text-[10px] text-white/50">Cargando ventas…</p>;
    if (failed) return <p className="py-4 text-center text-[10px] text-rose-200">No se ha podido cargar el desglose.</p>;
    if (!report) return null;
    return (
        <div className="space-y-3 border-t border-white/15 pt-2">
            <div>
                <h3 className="mb-1 text-[10px] font-bold uppercase text-white/75">Ventas por hora</h3>
                <div className="flex h-[52px] items-end gap-[2px]" aria-label="Gráfica de ventas por hora">
                    {Array.from({ length: 24 }, (_, hour) => {
                        const value = hours.find(h => h.hour === hour)?.total ?? 0;
                        return <div key={hour} className="group relative flex min-w-0 flex-1 flex-col justify-end" title={`${hour}:00 — ${currency(value)}`}>
                            <div className="w-full rounded-t-sm bg-sky-400/80" style={{ height: `${Math.max(0, value / max * 52)}px` }} />
                        </div>;
                    })}
                </div>
                <div className="mt-1 flex justify-between text-[8px] text-white/45"><span>00 h</span><span>06 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
            </div>
            <div>
                <h3 className="mb-1 text-[10px] font-bold uppercase text-white/75">Productos más vendidos</h3>
                {report.products.length ? (
                    <div className="space-y-1">
                        {report.products.map((item, index) => (
                            <div key={`${item.nombre_articulo}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 text-[9px]">
                                <span className="truncate text-white/80">{index + 1}. {item.nombre_articulo}</span>
                                <span className="tabular-nums text-white/60">{Number(item.cantidad_total).toLocaleString('es-ES')} uds.</span>
                                <strong className="tabular-nums">{currency(item.total_ingresos)}</strong>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-[9px] text-white/40">Sin productos</p>}
            </div>
            <div>
                <h3 className="mb-1 text-[10px] font-bold uppercase text-white/75">Horas con más ventas</h3>
                {topHours.length ? topHours.map(row => (
                    <div key={row.hour} className="grid grid-cols-[1fr_auto_auto] gap-2 py-0.5 text-[9px]">
                        <span>{String(row.hour).padStart(2, '0')}:00</span>
                        <span className="text-white/60">{row.count} tickets</span>
                        <strong className="tabular-nums">{currency(row.total)}</strong>
                    </div>
                )) : <p className="text-[9px] text-white/40">Sin ventas</p>}
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
                    <span className="ml-2 text-[8px] font-normal normal-case text-white/50">Detalle de cierre</span>
                </div>
                {closing && (
                    <button type="button" onClick={onOpen} className="shrink-0 rounded p-1 text-white/75 hover:bg-white/10 hover:text-white" aria-label={`Abrir detalle completo del ${timeLine(date)}`} title="Abrir detalle completo">
                        <Pencil size={15} aria-hidden />
                    </button>
                )}
            </header>
            {closing && values ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[9px] text-white/60">
                        {closing.weather ? <span className="inline-flex items-center gap-1"><CloudSun size={12} />{closing.weather}</span> : null}
                        <span>{values.tickets} tickets</span>
                        {values.avgTicket > 0 ? <span>{currency(values.avgTicket)} ticket medio</span> : null}
                    </div>
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
                        <div className="shrink-0 text-center text-[9px] leading-snug text-white/60">
                            <div>Esperado: <strong className="text-white/85">{currency(expectedSales)}</strong></div>
                            <div>Rendimiento: <strong className={values.netSales >= expectedSales ? 'text-emerald-300' : 'text-rose-300'}>
                                {((values.netSales - expectedSales) / expectedSales * 100).toFixed(0)}%
                            </strong></div>
                        </div>
                    ) : null}
                    <div className="mt-auto grid min-h-[100px] shrink-0 grid-cols-2 gap-3 pt-2">
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
                                className="flex min-w-0 flex-col items-center justify-end gap-1 overflow-hidden bg-transparent p-0 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 disabled:cursor-default disabled:hover:opacity-100"
                                aria-label={`Ver ${label.toLowerCase()} del ${timeLine(date)}`}
                            >
                                {photos[photoKey] ? (
                                    <img src={photos[photoKey]!} alt="" loading="lazy" className="max-h-[140px] min-h-0 w-full flex-1 rounded-xl object-contain" />
                                ) : (
                                    <span className="flex min-h-[68px] flex-1 items-center text-center text-[9px] text-white/45">
                                        {closing[pathKey] ? 'Cargando imagen…' : 'Sin imagen'}
                                    </span>
                                )}
                                <span className="text-center text-[8px] font-bold uppercase leading-tight text-white/65">{label}</span>
                            </button>
                        ))}
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
                instance="history-desktop-photo-preview"
            />
        </article>
    );
}

function HistoryDesktopSummary({ title, subtitle, metrics, weather, report, loading, failed, footer }: {
    title: string;
    subtitle?: string;
    metrics: { label: string; value: string }[];
    weather?: string | null;
    report: TicketPeriodReport | null;
    loading: boolean;
    failed: boolean;
    footer?: string;
}) {
    return (
        <section className="history-desktop-summary overflow-hidden rounded-[var(--radio-control)] border border-white/25 bg-[rgb(15_40_85/0.65)] px-3 py-2 text-white">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{title}</h2>
                <div className="flex min-w-0 items-center gap-2">
                    {subtitle ? <span className="truncate text-[9px] text-white/50">{subtitle}</span> : null}
                    {weather ? <span className="inline-flex shrink-0 items-center gap-1 text-[9px] text-white/75"><CloudSun size={13} />{weather}</span> : null}
                    {report ? <span className="shrink-0 text-[9px] text-white/70"><strong className="text-white">{Number(report.summary.count).toLocaleString('es-ES')}</strong> tickets</span> : null}
                    {report ? <span className="shrink-0 text-[9px] text-white/70">TM <strong className="text-white">{currency(report.summary.avgTicket)}</strong></span> : null}
                </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <div className="grid grid-cols-4 gap-x-2 gap-y-2">
                    {metrics.map(({ label, value }) => (
                        <div key={label} className="flex min-w-0 flex-col items-center justify-center text-center">
                            <strong className="max-w-full truncate text-[clamp(10px,0.9vw,15px)] font-black tabular-nums">{value}</strong>
                            <span className="text-[8px] font-semibold uppercase leading-tight text-white/60">{label}</span>
                        </div>
                    ))}
                </div>
                {footer ? <p className="text-[9px] text-white/50">{footer}</p> : null}
                <HistorySalesBreakdown report={report} loading={loading} failed={failed} />
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
    const monthlyKpis = [
        { label: 'Ventas', value: currency(monthlyReport.report?.summary.totalSales ?? summary.totalGross) },
        { label: 'Venta neta', value: currency(summary.totalNet) },
        { label: 'Rendimiento', value: `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%` },
        { label: 'Tarjeta', value: currency(monthly.card) },
        { label: 'Efectivo', value: currency(monthly.cash) },
        { label: 'Pendiente', value: currency(monthly.pending) },
        { label: 'Cobros', value: currency(monthly.recovered) },
        { label: 'Diferencia', value: currency(monthly.difference) },
    ];
    const lastKpis = [
        { label: 'Ventas', value: formatClosingValue(last.tpvSales, 'tpv_sales') },
        { label: 'Venta neta', value: formatClosingValue(last.netSales, 'net_sales') },
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
                    <HistoryDesktopSummary title="Mensual" subtitle={monthLabel} metrics={monthlyKpis} report={monthlyReport.report} loading={monthlyReport.loading} failed={monthlyReport.failed} footer="Ventas y tickets incluyen hoy; el resto de importes corresponde a cierres registrados." />
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
