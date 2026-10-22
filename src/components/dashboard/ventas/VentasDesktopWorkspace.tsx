'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, FileText, CreditCard, CloudSun, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { formatTicketTimeMadrid } from '@/utils/date-utils';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { cn } from '@/lib/utils';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { getCashClosingPhotoUrlsAction } from '@/app/actions/cash-closing-photos';

type Ticket = { numero_documento: string; fecha: string; hora_cierre: string; total_documento: number; mesa: number | null };
type Item = { name: string; qty: number; price: number; total: number };
type TicketReport = {
    summary: { totalSales: number; count: number; avgTicket: number };
    products: { nombre_articulo: string; cantidad_total: number; total_ingresos: number }[];
    hours: { hour: number; count: number; total: number }[];
};
type CloseRow = {
    id: string; closing_date: string; tpv_sales: number | null; net_sales: number | null;
    sales_card: number | null; cash_counted: number | null;
    sales_pending: number | null; debt_recovered: number | null; difference: number | null;
    dataphone_totals_photo_path?: string | null; bdp_closing_ticket_photo_path?: string | null;
    weather?: string | null;
};
const euro = (v: unknown) => (Number(v ?? 0)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const compactDoc = (id: string) => id.replace(/^0+/, '').replace(/(B)0+(?=\d)/i, '$1');
const EMPTY_ITEMS: Item[] = [];
const PAGE_SIZE = 7;
type Period = { start: string; end: string; kind: 'day' | 'week' | 'month' | 'range' };
const todayPeriod = (): Period => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return { start: today, end: today, kind: 'day' };
};
const periodLabel = (p: Period) => {
    if (p.start === p.end) return format(parseISO(p.start), "EEEE d 'de' MMMM yyyy", { locale: es });
    const start = parseISO(p.start);
    const end = parseISO(p.end);
    if (p.start === format(startOfMonth(start), 'yyyy-MM-dd') && p.end === format(endOfMonth(start), 'yyyy-MM-dd'))
        return format(start, 'MMMM yyyy', { locale: es });
    return format(start, 'd MMM yyyy', { locale: es }) + ' – ' + format(end, 'd MMM yyyy', { locale: es });
};
const closingSum = (rows: CloseRow[], key: keyof CloseRow) =>
    rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);

/** Misma referencia que el rendimiento del detalle: hasta ocho cierres previos
 * del mismo día de la semana, mirando 16 semanas atrás y excluyendo agosto. */
function historicalExpectedNet(dateYmd: string, netByDate: Map<string, number>): number | null {
    const day = parseISO(dateYmd);
    let total = 0;
    let seen = 0;
    let attempts = 0;
    for (let weeks = 1; weeks <= 16 && seen + attempts < 8; weeks++) {
        const previous = subWeeks(day, weeks);
        if (previous.getMonth() === 7) continue;
        const net = netByDate.get(format(previous, 'yyyy-MM-dd'));
        if (net !== undefined && net > 0) {
            total += net;
            seen++;
        } else {
            attempts++;
        }
    }
    return seen > 0 ? total / seen : null;
}

/** Escala cromática orientativa: el porcentaje no cambia de fórmula. */
function performanceColors(percentage: number | null): { cell: string; text: string } | null {
    if (percentage === null) return null;
    if (percentage >= 15) return { cell: 'bg-teal-50/80', text: 'bg-teal-100 text-teal-800' };
    if (percentage > 0) return { cell: 'bg-sky-50/80', text: 'bg-sky-100 text-sky-800' };
    if (percentage >= -5) return { cell: 'bg-amber-50/80', text: 'bg-amber-100 text-amber-800' };
    if (percentage >= -15) return { cell: 'bg-orange-50/80', text: 'bg-orange-100 text-orange-800' };
    return { cell: 'bg-rose-50/80', text: 'bg-rose-100 text-rose-800' };
}

function HourlySalesCurve({ hours, fullWidth = false }: { hours?: TicketReport['hours']; fullWidth?: boolean }) {
    // Same 7–22h curve and 120×20 coordinate system as /dashboard/history.
    const data = Array.from({ length: 16 }, (_, i) => Number(hours?.find(h => Number(h.hour) === i + 7)?.total ?? 0));
    const peak = Math.max(1, ...data);
    const path = data.map((total, i) => `${i === 0 ? 'M' : 'L'} ${(i / (data.length - 1)) * 120},${16 - total / peak * 13}`).join(' ');
    return (
        <svg aria-label="Evolución de ventas por hora" role="img" viewBox="0 0 120 20" preserveAspectRatio="none"
            className={fullWidth ? 'block h-7 w-full text-[#76b8ff]' : 'h-3 min-w-0 flex-1 text-[#76b8ff]'}>
            <path d={path} fill="none" stroke="currentColor" strokeWidth={fullWidth ? '1' : '1.5'} strokeLinecap="butt" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function TicketProductPreview({ items, onOverflowChange }: { items: Item[]; onOverflowChange: (hidden: boolean) => void }) {
    const areaRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(0);
    useEffect(() => {
        const area = areaRef.current;
        const ruler = measureRef.current;
        if (!area || !ruler) return;
        const measure = () => {
            const available = area.clientWidth;
            let total = 0;
            let fit = 0;
            for (const child of Array.from(ruler.children)) {
                total += (child as HTMLElement).getBoundingClientRect().width;
                if (total > available + 0.5) break;
                fit++;
            }
            setVisible(fit);
            onOverflowChange(fit < items.length);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(area);
        return () => observer.disconnect();
    }, [items, onOverflowChange]);
    const piece = (item: Item, i: number) => (
        <span key={i} className="inline-flex shrink-0 items-center gap-0.5 border-l border-[#172c61]/30 px-1.5 text-[9px] text-[#1a2854]">
            {item.qty !== 1 && <strong className="font-bold tabular-nums">{item.qty}</strong>}
            <span>{item.name}</span>
        </span>
    );
    return (
        <div ref={areaRef} className="relative min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full min-w-0 items-center overflow-hidden whitespace-nowrap">{items.slice(0, visible).map(piece)}</div>
            <div ref={measureRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 flex w-max items-center whitespace-nowrap opacity-0">{items.map(piece)}</div>
        </div>
    );
}

function SalesTicket({ ticket, items, expanded, onToggle, loadingItems }: {
    ticket: Ticket; items: Item[]; expanded: boolean; onToggle: () => void; loadingItems: boolean;
}) {
    const [hasHiddenProducts, setHasHiddenProducts] = useState(false);
    const canExpand = hasHiddenProducts && !loadingItems;
    useEffect(() => {
        if (expanded && !loadingItems && !hasHiddenProducts) onToggle();
    // Collapse if a resize makes all products visible in the single-line preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded, hasHiddenProducts, loadingItems]);
    return (
        <div className="min-w-0 shrink-0">
            <button type="button" aria-expanded={canExpand && expanded} disabled={!canExpand} onClick={canExpand ? onToggle : undefined}
                className={cn("ventas-ticket-strip flex h-[28px] w-full min-w-0 items-center gap-1.5 overflow-hidden bg-[rgb(255_255_255/0.97)] px-2 text-left text-[#1a2854] transition-colors", canExpand ? "cursor-pointer hover:bg-white" : "cursor-default")}>
                <strong className="w-[32px] shrink-0 text-[10px] font-semibold tabular-nums">{formatTicketTimeMadrid(ticket.hora_cierre, ticket.fecha)}</strong>
                <span className="shrink-0 border-l border-[#182d5f]/20 pl-1.5 text-[8px] font-medium tabular-nums text-[#1a2854]/55">{compactDoc(ticket.numero_documento)}</span>
                {ticket.mesa != null && Number(ticket.mesa) > 0 && <span className="shrink-0 rounded bg-[#e1eaff] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums">{ticket.mesa}</span>}
                <TicketProductPreview items={items} onOverflowChange={setHasHiddenProducts}/>
                {canExpand && (expanded
                    ? <ChevronUp size={13} className="shrink-0 text-[#8992a8]" aria-label="Ocultar productos" />
                    : <ChevronDown size={13} className="shrink-0 text-[#8992a8]" aria-label="Mostrar más productos" />)}
                <strong className={cn("ml-auto shrink-0 text-[11px] font-semibold tabular-nums", Number(ticket.total_documento) >= 0 ? "text-emerald-700" : "text-rose-700")}>{euro(ticket.total_documento)}</strong>
            </button>
            {canExpand && expanded && (
                <div className="mx-3 rounded-b-lg border border-t-0 border-white/20 bg-white/10 px-3 py-2 text-[10px] text-white/90">
                    {loadingItems ? 'Cargando productos…' : items.length ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {items.map((item, idx) => (
                                <div key={idx} className="inline-flex items-center gap-1.5">
                                    {item.qty !== 1 && <strong className="tabular-nums">{item.qty}</strong>}
                                    <span>{item.name}</span>
                                </div>
                            ))}
                        </div>
                    ) : <span className="text-white/55">No hay líneas disponibles para este ticket.</span>}
                </div>
            )}
        </div>
    );
}

// Round the scroll viewport down to full 24px rows: no partially visible
// product/hour lines when the browser or dashboard is resized.
function RankingViewport({ children }: { children: ReactNode }) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [fittedHeight, setFittedHeight] = useState<number | null>(null);
    useEffect(() => {
        const holder = viewportRef.current;
        if (!holder) return;
        const measure = () => {
            const next = Math.max(0, Math.floor(holder.clientHeight / 24) * 24);
            setFittedHeight(old => old === next ? old : next);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(holder);
        return () => observer.disconnect();
    }, []);
    return (
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="custom-scrollbar min-w-0 snap-y snap-mandatory overflow-y-auto overscroll-contain"
                style={{ height: fittedHeight === null ? '100%' : fittedHeight }}>
                {children}
            </div>
        </div>
    );
}

// Stacked, full-width product impact and hourly sales rankings, shared by
// both the monthly card and the selected period's detail card.
function SalesBreakdown({ report }: { report: TicketReport | null }) {
    const products = report?.products ?? [];
    const hours = useMemo(
        () => [...(report?.hours ?? [])].filter(h => Number(h.total) > 0)
            .sort((a, b) => Number(b.total) - Number(a.total)),
        [report]
    );
    const maxProductSales = Math.max(1, ...products.map(p => Number(p.total_ingresos ?? 0)));
    const totalSales = Number(report?.summary?.totalSales ?? 0);
    const shareLabel = (sales: number) => totalSales > 0
        ? (sales / totalSales * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '% del total'
        : 'Sin total de ventas disponible';
    const barWidth = (sales: number, maximum: number) => Math.max(0, Math.min(100, sales / maximum * 100)) + '%';

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-3 pt-3">
            <section className="flex min-h-0 flex-[11] flex-col border-b border-white/15 pb-3">
                <div className="mb-2 flex h-4 shrink-0 items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase">Productos</h3>
                    <span className="text-[9px] text-white/45">Ventas por producto</span>
                </div>
                <RankingViewport>
                    {products.map((product, index) => {
                        const sales = Number(product.total_ingresos ?? 0);
                        const label = shareLabel(sales);
                        return (
                            <div key={index} className="grid h-6 min-w-0 snap-start snap-always grid-cols-[minmax(0,1.2fr)_auto_minmax(50px,0.9fr)_auto] items-center gap-x-2 border-b border-white/5 text-[10px]"
                                title={product.nombre_articulo + ' · ' + euro(sales) + ' · ' + label}>
                                <span className="min-w-0 truncate text-white/85">{index + 1}. {product.nombre_articulo}</span>
                                <span className="shrink-0 tabular-nums text-white/60">{Number(product.cantidad_total).toLocaleString('es-ES')} u</span>
                                <div role="img" aria-label={label} className="h-[8px] min-w-0 overflow-hidden rounded-sm bg-white/10">
                                    <div className="h-full rounded-sm bg-[#64a4ff]" style={{ width: barWidth(sales, maxProductSales) }}/>
                                </div>
                                <strong className="min-w-[60px] shrink-0 text-right tabular-nums">{euro(sales)}</strong>
                            </div>
                        );
                    })}
                </RankingViewport>
            </section>
            <section className="flex min-h-0 flex-[10] flex-col">
                <div className="mb-2 flex h-4 shrink-0 items-center gap-2">
                    <h3 className="shrink-0 text-xs font-bold uppercase">Horas</h3>
                    <HourlySalesCurve hours={report?.hours} />
                </div>
                <RankingViewport>
                    {hours.map(hour => {
                        const sales = Number(hour.total ?? 0);
                        return (
                            <div key={hour.hour} className="grid h-6 min-w-0 snap-start snap-always grid-cols-[minmax(31px,0.55fr)_minmax(42px,0.75fr)_minmax(60px,1fr)_minmax(63px,1fr)] items-center gap-x-1.5 border-b border-white/5 text-[10px]"
                                title={`${hour.hour}–${(hour.hour + 1) % 24} · ${hour.count} tickets · ${euro(hour.count > 0 ? sales / hour.count : 0)} de ticket medio · ${euro(sales)}`}>
                                <strong className="min-w-0 tabular-nums text-white/90">{hour.hour}-{(hour.hour + 1) % 24}</strong>
                                <span className="min-w-0 text-center text-[9px] tabular-nums text-sky-200">{hour.count} tick</span>
                                <span className="min-w-0 text-center text-[9px] tabular-nums text-violet-200">{euro(hour.count > 0 ? sales / hour.count : 0)} med</span>
                                <strong className="min-w-0 text-right tabular-nums text-teal-100">{euro(sales)}</strong>
                            </div>
                        );
                    })}
                </RankingViewport>
            </section>
        </div>
    );
}

function SummaryCard({ title, dateText, report, extras }: {
    title: string; dateText: string; report: TicketReport | null;
    extras?: { cash: number; card: number; pending: number; recovered: number; net: number };
}) {
    const sales = Number(report?.summary.totalSales ?? 0);
    const count = Number(report?.summary.count ?? 0);
    const values = [
        ['Ventas', euro(sales)], ['Venta neta', extras ? euro(extras.net) : '—'],
        ['Tickets', count.toLocaleString('es-ES')], ['Tarjeta', extras ? euro(extras.card) : '—'],
        ['Efectivo', extras ? euro(extras.cash) : '—'], ['Pendiente', extras ? euro(extras.pending) : '—'],
        ['Cobros', extras ? euro(extras.recovered) : '—'], ['Ticket medio', euro(report?.summary.avgTicket)]
    ];
    return (
        <div className="history-desktop-summary flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/25 bg-white/10 px-3 pb-4 pt-2 text-white">
            <div className="mb-4 flex min-w-0 shrink-0 items-center justify-between gap-2">
                <strong className="min-w-0 text-sm font-bold">{title}</strong>
                <span className="min-w-0 truncate text-[9px] text-white/55">{dateText}</span>
                {report && <span className="shrink-0 text-[9px] text-white/80">{euro(report.summary.avgTicket)} medio</span>}
            </div>
            <div className="grid shrink-0 grid-cols-4 gap-x-1 gap-y-3">
                {values.map(([label, value]) => (
                    <div key={label} className="min-w-0 text-center">
                        <strong className="block truncate text-[12px] font-bold tabular-nums">{value}</strong>
                        <span className="block truncate text-[8px] uppercase text-white/65">{label}</span>
                    </div>
                ))}
            </div>
            <SalesBreakdown report={report}/>
        </div>
    );
}

export default function VentasDesktopWorkspace() {
    const supabase = useMemo(() => createClient(), []);
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [period, setPeriod] = useState<Period>(todayPeriod);
    const [initializing, setInitializing] = useState(true);
    const [returnPeriod, setReturnPeriod] = useState<Period | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [filterKind, setFilterKind] = useState<'day' | 'week' | 'month' | 'three' | 'custom'>('day');
    const [filterStart, setFilterStart] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [filterEnd, setFilterEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [periodClosings, setPeriodClosings] = useState<CloseRow[]>([]);
    const [historicalNetByDate, setHistoricalNetByDate] = useState<Map<string, number>>(() => new Map());
    const [calendarHistoricalNetByDate, setCalendarHistoricalNetByDate] = useState<Map<string, number>>(() => new Map());
    const [openPhoto, setOpenPhoto] = useState<{ src: string; alt: string } | null>(null);
    const [photos, setPhotos] = useState<{ dataphoneUrl: string | null; bdpUrl: string | null }>({ dataphoneUrl: null, bdpUrl: null });
    const [dailyReport, setDailyReport] = useState<TicketReport | null>(null);
    const [monthReport, setMonthReport] = useState<TicketReport | null>(null);
    const [monthClosings, setMonthClosings] = useState<CloseRow[]>([]);
    const [calendarClosings, setCalendarClosings] = useState<CloseRow[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [linesByTicket, setLinesByTicket] = useState<Record<string, Item[]>>({});
    const [linesLoading, setLinesLoading] = useState(false);
    const [dayLoading, setDayLoading] = useState(true);
    const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [dayError, setDayError] = useState(false);
    const periodKey = period.start + ':' + period.end;
    const periodTitle = periodLabel(period);
    // The left card follows a single-month selection; a multi-month range retains the current month.
    const startDate = parseISO(period.start);
    const endDate = parseISO(period.end);
    const weekCrossesMonth = period.kind === 'week' && !isSameMonth(startDate, endDate);
    const daysInFirstMonth = Math.round((endOfMonth(startDate).getTime() - startDate.getTime()) / 86400000) + 1;
    const referenceMonth = isSameMonth(startDate, endDate)
        ? startOfMonth(startDate)
        : weekCrossesMonth
            ? startOfMonth(daysInFirstMonth >= 4 ? startDate : endDate)
            : startOfMonth(new Date());
    const monthStart = format(startOfMonth(referenceMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(referenceMonth), 'yyyy-MM-dd');
    const referenceLabel = format(referenceMonth, 'MMMM yyyy', { locale: es });
    const monthLabel = format(month, 'MMMM yyyy', { locale: es });
    const isSingleDay = period.start === period.end;
    const visibleTickets = tickets;
    const calendarWeeks = useMemo(() => {
        const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start, end });
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        return weeks;
    }, [month]);
    const byDate = useMemo(() => new Map(calendarClosings.map(c => [c.closing_date, c])), [calendarClosings]);
    const calendarPerformanceByDate = useMemo(() => {
        const result = new Map<string, number>();
        for (const closing of calendarClosings) {
            const expected = historicalExpectedNet(closing.closing_date, calendarHistoricalNetByDate);
            if (expected !== null && expected > 0 && closing.net_sales != null) {
                result.set(closing.closing_date, (Number(closing.net_sales) - expected) / expected * 100);
            }
        }
        return result;
    }, [calendarClosings, calendarHistoricalNetByDate]);

    const changePeriod = (next: Period, keepReturn = false) => {
        setPeriod(next);
        if (!keepReturn) setReturnPeriod(null);
        setMonth(startOfMonth(parseISO(next.start)));
        setTickets([]);
        setPeriodClosings([]);
        setHistoricalNetByDate(new Map());
        setDailyReport(null);
        setLoadedPeriod(null);
        setLinesByTicket({});
        setExpandedTicket(null);
        setHasMore(true);
        setDayLoading(true);
        setPage(0);
    };
    const selectDate = (date: string) => {
        if (!returnPeriod && (period.start !== date || period.end !== date) && period.kind !== 'day')
            setReturnPeriod(period);
        changePeriod({ start: date, end: date, kind: 'day' }, true);
    };
    const restorePeriod = () => {
        if (returnPeriod) changePeriod(returnPeriod);
    };
    const navigateMonth = (delta: number) => setMonth(current => delta < 0 ? subMonths(current, 1) : addMonths(current, 1));
    const applyFilter = () => {
        const anchor = parseISO(filterStart);
        let next: Period;
        if (filterKind === 'day') next = { start: filterStart, end: filterStart, kind: 'day' };
        else if (filterKind === 'week') next = {
            start: format(startOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
            end: format(endOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'), kind: 'week'
        };
        else if (filterKind === 'month') next = {
            start: format(startOfMonth(anchor), 'yyyy-MM-dd'),
            end: format(endOfMonth(anchor), 'yyyy-MM-dd'), kind: 'month'
        };
        else if (filterKind === 'three') {
            const lastComplete = subMonths(startOfMonth(new Date()), 1);
            next = { start: format(subMonths(startOfMonth(lastComplete), 2), 'yyyy-MM-dd'), end: format(endOfMonth(lastComplete), 'yyyy-MM-dd'), kind: 'range' };
        } else {
            if (filterEnd < filterStart) return;
            next = { start: filterStart, end: filterEnd, kind: filterStart === filterEnd ? 'day' : 'range' };
        }
        changePeriod(next);
        setFilterOpen(false);
    };
    // Open at the most recent closed day, not at today's still-open trading day.
    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const { data } = await supabase.from('cash_closings')
                    .select('closing_date')
                    .order('closing_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (!active) return;
                const lastDate = data?.closing_date ?? format(new Date(), 'yyyy-MM-dd');
                changePeriod({ start: lastDate, end: lastDate, kind: 'day' });
            } finally {
                if (active) setInitializing(false);
            }
        })();
        return () => { active = false; };
    }, [supabase]);
    useEffect(() => {
        let active = true;
        const load = async () => {
            const [monthly, closes] = await Promise.all([
                supabase.rpc('get_full_period_ticket_sales_detail', { p_start_date: monthStart, p_end_date: monthEnd }),
                supabase.from('cash_closings').select('id,closing_date,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference').gte('closing_date', monthStart).lte('closing_date', monthEnd)
            ]);
            if (!active) return;
            setMonthReport(monthly.error ? null : monthly.data as unknown as TicketReport);
            setMonthClosings((closes.data ?? []) as CloseRow[]);

        };
        void load();
        return () => { active = false; };
    }, [supabase, monthStart, monthEnd]);

    useEffect(() => {
        let active = true;
        // Navegación independiente del filtro. Cargar cierres del mes y sus
        // comparables de los mismos días de semana, sin consultas por celda.
        const start = format(startOfMonth(month), 'yyyy-MM-dd');
        const end = format(endOfMonth(month), 'yyyy-MM-dd');
        const firstComparable = format(subWeeks(startOfMonth(month), 16), 'yyyy-MM-dd');
        void Promise.all([
            supabase.from('cash_closings')
                .select('id,closing_date,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference')
                .gte('closing_date', start).lte('closing_date', end),
            supabase.from('cash_closings')
                .select('closing_date,net_sales')
                .gte('closing_date', firstComparable).lte('closing_date', end).limit(1500),
        ]).then(([closings, history]) => {
            if (!active) return;
            setCalendarClosings(closings.error ? [] : (closings.data ?? []) as CloseRow[]);
            setCalendarHistoricalNetByDate(new Map<string, number>(
                (history.error ? [] : history.data ?? []).map(c => [c.closing_date, Number(c.net_sales ?? 0)] as [string, number])
            ));
        });
        return () => { active = false; };
    }, [supabase, month]);

    useEffect(() => {
        if (initializing) return;
        let active = true;
        setDailyReport(null);
        void supabase.rpc('get_full_period_ticket_sales_detail', { p_start_date: period.start, p_end_date: period.end })
            .then(({ data, error }) => { if (active) setDailyReport(error ? null : data as unknown as TicketReport); });
        return () => { active = false; };
    }, [supabase, period.start, period.end, initializing]);

    useEffect(() => {
        if (initializing) return;
        let active = true;
        setDayLoading(true);
        setDayError(false);
        const load = async () => {
            if (isSingleDay) {
                // A single trading day is small enough to fetch fully; keep the UI
                // and product-line queries limited to seven visible tickets at a time.
                const all: Ticket[] = [];
                let offset = 0;
                const chunk = 150;
                while (active) {
                    const { data, error } = await supabase.rpc('get_tickets_marbella_page', {
                        p_start_date: period.start, p_end_date: period.end,
                        p_limit: chunk, p_offset: offset, p_start_time: null, p_end_time: null
                    });
                    if (!active) return;
                    if (error) { setDayError(true); setDayLoading(false); return; }
                    const rows = (data ?? []) as Ticket[];
                    all.push(...rows);
                    if (rows.length < chunk) break;
                    offset += chunk;
                }
                if (!active) return;
                setTickets(all);
                setLoadedPeriod(periodKey);
                setHasMore(false);
                setDayLoading(false);
                return;
            }
            // Multi-day selection: never pre-fetch further pages without a click.
            const { data, error } = await supabase.rpc('get_tickets_marbella_page', {
                p_start_date: period.start, p_end_date: period.end,
                p_limit: PAGE_SIZE, p_offset: page, p_start_time: null, p_end_time: null
            });
            if (!active) return;
            if (error) { setDayError(true); setDayLoading(false); return; }
            const batch = (data ?? []) as Ticket[];
            setTickets(prev => page === 0 ? batch : [...prev, ...batch]);
            if (page === 0) setLoadedPeriod(periodKey);
            setHasMore(batch.length === PAGE_SIZE);
            setDayLoading(false);
        };
        void load();
        return () => { active = false; };
    }, [supabase, period.start, period.end, periodKey, page, isSingleDay, initializing]);

    // Obtener los nombres y cantidades de las líneas por lotes, no con una consulta por ticket.
    useEffect(() => {
        let active = true;
        const missing = visibleTickets.filter(t => !Object.prototype.hasOwnProperty.call(linesByTicket, t.numero_documento));
        if (!missing.length) return;
        setLinesLoading(true);
        void (async () => {
            const grouped: Record<string, Item[]> = {};
            for (let i = 0; i < missing.length && active; i += 35) {
                const ids = missing.slice(i, i + 35).map(t => t.numero_documento);
                const { data, error } = await supabase.from('ticket_lines_marbella')
                    .select('numero_documento,nombre,articulo_id,unidades,precio_unidad,importe_total,linea')
                    .in('numero_documento', ids).order('linea', { ascending: true }).limit(2000);
                if (!active) return;
                if (error) {
                    // Mantener el desglose disponible incluso si la consulta agrupada está restringida.
                    for (const doc of ids) {
                        const result = await supabase.rpc('get_ticket_lines', { p_numero_documento: doc });
                        if (!active) return;
                        grouped[doc] = (result.data ?? []).map((l: { articulo_nombre: string | null; cantidad: number | null; precio_unidad: number | null; importe_total: number | null }) => ({
                            name: String(l.articulo_nombre ?? 'Producto'), qty: Number(l.cantidad ?? 1),
                            price: Number(l.precio_unidad ?? 0), total: Number(l.importe_total ?? 0)
                        }));
                    }
                    continue;
                }
                const rows = data ?? [];
                const missingArt = [...new Set(rows.filter(x => !x.nombre && x.articulo_id).map(x => x.articulo_id as number))];
                const names = new Map<number, string>();
                if (missingArt.length) {
                    const catalog = await supabase.from('bdp_articulos').select('id,nombre').in('id', missingArt);
                    (catalog.data ?? []).forEach(a => names.set(Number(a.id), String(a.nombre)));
                }
                for (const doc of ids) grouped[doc] = [];
                for (const row of rows) {
                    const doc = String(row.numero_documento);
                    const name = String(row.nombre || names.get(Number(row.articulo_id)) || 'Producto');
                    const qty = Number(row.unidades ?? 1);
                    const price = Number(row.precio_unidad ?? 0);
                    const total = Number(row.importe_total ?? 0);
                    const list = grouped[doc] ?? (grouped[doc] = []);
                    const current = list.find(x => x.name === name && x.price === price);
                    if (current) { current.qty += qty; current.total += total; }
                    else list.push({ name, qty, price, total });
                }
            }
            if (active) {
                setLinesByTicket(prev => ({ ...prev, ...grouped }));
                setLinesLoading(false);
            }
        })();
        return () => { active = false; };
    }, [supabase, visibleTickets]);

    // Only the first seven tickets are fetched automatically; additional batches need a user click.
    const canLoadMore = !isSingleDay && loadedPeriod === periodKey && !dayLoading && hasMore;
    useEffect(() => {
        if (initializing) return;
        let active = true;
        // Load daily closing totals (not tickets) for the selected period and the
        // preceding 16 same-weekday comparisons used by /dashboard/history.
        const comparisonStart = format(subWeeks(parseISO(period.start), 16), 'yyyy-MM-dd');
        void supabase.from('cash_closings')
            .select('id,closing_date,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference,weather,dataphone_totals_photo_path,bdp_closing_ticket_photo_path')
            .gte('closing_date', comparisonStart).lte('closing_date', period.end).limit(4000)
            .then(({ data, error }) => {
                if (!active) return;
                const rows = error ? [] : (data ?? []) as CloseRow[];
                setHistoricalNetByDate(new Map(rows.map(row => [row.closing_date, Number(row.net_sales ?? 0)])));
                setPeriodClosings(rows.filter(row => row.closing_date >= period.start));
            });
        return () => { active = false; };
    }, [supabase, period.start, period.end, initializing]);

    const selectedClosing = isSingleDay ? periodClosings.find(c => c.closing_date === period.start) : undefined;
    useEffect(() => {
        let alive = true;
        setPhotos({ dataphoneUrl: null, bdpUrl: null });
        if (!selectedClosing?.dataphone_totals_photo_path && !selectedClosing?.bdp_closing_ticket_photo_path) return;
        void getCashClosingPhotoUrlsAction({
            dataphonePath: selectedClosing.dataphone_totals_photo_path ?? null,
            bdpPath: selectedClosing.bdp_closing_ticket_photo_path ?? null
        }).then(result => {
            if (alive && result.success) setPhotos({ dataphoneUrl: result.dataphoneUrl, bdpUrl: result.bdpUrl });
        }).catch(() => {});
        return () => { alive = false; };
    }, [selectedClosing?.id, selectedClosing?.dataphone_totals_photo_path, selectedClosing?.bdp_closing_ticket_photo_path]);

    const monthTotals = useMemo(() => monthClosings.reduce((a, c) => ({
        cash: a.cash + Number(c.cash_counted ?? 0), card: a.card + Number(c.sales_card ?? 0),
        pending: a.pending + Number(c.sales_pending ?? 0), recovered: a.recovered + Number(c.debt_recovered ?? 0),
        net: a.net + Number(c.net_sales ?? 0)
    }), { cash: 0, card: 0, pending: 0, recovered: 0, net: 0 }), [monthClosings]);
    const hasClosingData = periodClosings.length > 0;
    const periodTotals = useMemo(() => ({
        sales: closingSum(periodClosings, 'tpv_sales'),
        net: closingSum(periodClosings, 'net_sales'),
        cash: closingSum(periodClosings, 'cash_counted'),
        card: closingSum(periodClosings, 'sales_card'),
        pending: closingSum(periodClosings, 'sales_pending'),
        recovered: closingSum(periodClosings, 'debt_recovered'),
        difference: closingSum(periodClosings, 'difference')
    }), [periodClosings]);
    // "Rendimiento" follows the existing history definition: net sales
    // compared with the mean of up to eight prior same-weekday closings.
    // This is not accounting profitability; that would require product costs.
    const periodPerformance = useMemo(() => {
        let expectedSum = 0;
        let netSum = 0;
        for (const closing of periodClosings) {
            const expected = historicalExpectedNet(closing.closing_date, historicalNetByDate);
            if (expected !== null) {
                expectedSum += expected;
                netSum += Number(closing.net_sales ?? 0);
            }
        }
        return expectedSum > 0 ? (netSum - expectedSum) / expectedSum * 100 : null;
    }, [periodClosings, historicalNetByDate]);
    if (initializing) return <div className="mx-auto hidden w-full items-center justify-center py-16 text-sm text-white/60 lg:flex">Cargando último cierre…</div>;
    return (
        <div data-component="HistoryDesktopWorkspace" data-page="ventas-consolidated" className="history-desktop-workspace mx-auto hidden w-full min-w-0 flex-col px-3 pb-3 pt-1 lg:flex">
            <div className="mb-3 flex shrink-0 items-baseline justify-between gap-4 text-white">
                <div className="flex min-w-0 items-baseline gap-4">
                    <h1 className="text-xl font-black">Ventas y cierres</h1>
                    <span className="truncate text-xs capitalize text-white/60">{periodTitle}</span>
                </div>
            </div>
            <div className="history-desktop-board grid min-h-0 flex-1 items-start gap-4">
                <div data-element="summary-stack" className="min-h-0 min-w-0">
                    <SummaryCard title="Mensual" dateText={referenceLabel} report={monthReport} extras={monthTotals}/>
                </div>
                <div data-element="selected-day" className="min-h-0 min-w-0">
                    <section className="history-desktop-day flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/40 bg-[var(--color-envolvente-bajo)] text-white">
                        <header className="flex min-h-[36px] shrink-0 items-center justify-between gap-2 border-b border-white/15 px-3">
                            <strong className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase">{periodTitle}</strong>
                            {returnPeriod && (
                                <button type="button" onClick={restorePeriod} className="inline-flex max-w-[25%] shrink-0 items-center gap-1 truncate rounded border border-sky-400/35 px-2 py-1 text-[10px] text-sky-200 hover:bg-white/10" title={'Volver a ' + periodLabel(returnPeriod)}>
                                    <ArrowLeft size={13} className="shrink-0"/>
                                    <span className="truncate">Volver al periodo</span>
                                </button>
                            )}
                            <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 whitespace-nowrap text-[9px] text-white/70">
                                {isSingleDay && selectedClosing?.weather ? (
                                    <span className="inline-flex items-center gap-1" title="Clima del cierre">
                                        <CloudSun size={12}/> <span className="max-w-[80px] truncate">{selectedClosing.weather}</span>
                                    </span>
                                ) : null}
                                <span className="tabular-nums"><strong className="font-semibold text-white">{dailyReport?.summary.count != null ? Number(dailyReport.summary.count).toLocaleString('es-ES') : '—'}</strong> tickets</span>
                                <span className="tabular-nums"><strong className="font-semibold text-white">{dailyReport?.summary.avgTicket != null ? euro(dailyReport.summary.avgTicket) : '—'}</strong> medio</span>
                            </div>
                        </header>
                        <div className="grid shrink-0 grid-cols-3 gap-x-2 gap-y-2 border-b border-white/10 px-3 py-3 sm:grid-cols-4">
                            {([
                                ['Ventas TPV', hasClosingData ? euro(periodTotals.sales) : euro(dailyReport?.summary.totalSales)],
                                ['Venta neta', hasClosingData ? euro(periodTotals.net) : '—'],
                                ['Rendimiento', periodPerformance !== null ? `${Math.abs(periodPerformance).toFixed(1)}%` : '—'],
                                ['Tarjeta', hasClosingData ? euro(periodTotals.card) : '—'],
                                ['Efectivo', hasClosingData ? euro(periodTotals.cash) : '—'],
                                ['Pendiente', hasClosingData ? euro(periodTotals.pending) : '—'],
                                ['Cobros', hasClosingData ? euro(periodTotals.recovered) : '—'],
                                ['Diferencia', hasClosingData ? euro(periodTotals.difference) : '—']
                            ] as [string, string][]).map(([label, value]) => (
                                <div key={label} className="min-w-0 text-center">
                                    <strong className={cn("block truncate text-[12px] font-bold tabular-nums", label === 'Diferencia' && periodTotals.difference > 0 && 'text-emerald-400', label === 'Rendimiento' && periodPerformance !== null && (periodPerformance >= 0 ? 'text-emerald-400' : 'text-rose-400'))}>{label === 'Rendimiento' && periodPerformance !== null ? (periodPerformance >= 0 ? '▲ ' : '▼ ') : ''}{value}</strong>
                                    <span className="block truncate text-[8px] uppercase text-white/60">{label}</span>
                                </div>
                            ))}
                        </div>
                        {isSingleDay && selectedClosing && (
                            <div className="flex shrink-0 items-center justify-center gap-2 border-b border-white/10 px-3 py-2">
                                <button type="button" disabled={!photos.bdpUrl} onClick={() => photos.bdpUrl && setOpenPhoto({ src: photos.bdpUrl, alt: 'Informe TPV' })}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-3 py-1.5 text-[10px] text-white/80 enabled:hover:bg-white/10 disabled:opacity-40">
                                    <FileText size={14}/> Ver informe TPV
                                </button>
                                <button type="button" disabled={!photos.dataphoneUrl} onClick={() => photos.dataphoneUrl && setOpenPhoto({ src: photos.dataphoneUrl, alt: 'Totales datáfonos' })}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-3 py-1.5 text-[10px] text-white/80 enabled:hover:bg-white/10 disabled:opacity-40">
                                    <CreditCard size={14}/> Ver totales datáfonos
                                </button>
                            </div>
                        )}
                        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-4 pt-2">
                            <SalesBreakdown report={dailyReport}/>
                        </div>
                    </section>
                </div>
                <div data-element="calendar-column" className="flex min-h-0 min-w-0 flex-col">
                    <nav data-element="calendar-navigation" className="relative flex shrink-0 items-center justify-center gap-2 text-white" aria-label="Cambiar mes de ventas">
                        <button type="button" onClick={() => navigateMonth(-1)} aria-label="Mes anterior" className="rounded p-1.5 hover:bg-white/10"><ChevronLeft size={19}/></button>
                        <strong className="min-w-[128px] text-center text-sm font-semibold capitalize">{monthLabel}</strong>
                        <button type="button" onClick={() => navigateMonth(1)} aria-label="Mes siguiente" className="rounded p-1.5 hover:bg-white/10"><ChevronRight size={19}/></button>
                        <button type="button" onClick={() => { setFilterKind(isSingleDay ? 'day' : 'custom'); setFilterStart(period.start); setFilterEnd(period.end); setFilterOpen(true); }}
                            className="absolute right-0 inline-flex items-center gap-1 rounded border border-white/30 px-2 py-1 text-[11px] hover:bg-white/10" aria-label="Filtrar por fecha">
                            <Filter size={13}/> Filtro
                        </button>
                    </nav>
                    <section data-element="calendar" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radio-control)] border border-zinc-200 bg-white text-zinc-900">
                        <MonthCalendarFrame flush className="history-desktop-month-cal-chrome">
                            <div className="month-cal-weeks history-desktop-cal-weeks" style={{ gridTemplateRows: 'repeat(' + calendarWeeks.length + ',minmax(0,1fr))' }}>
                                {calendarWeeks.map((week, index) => (
                                    <div key={index} className="month-cal-week grid min-h-0 grid-cols-7 border-b border-gray-100 last:border-0">
                                        {week.map(day => {
                                            const iso = format(day, 'yyyy-MM-dd');
                                            const closing = byDate.get(iso);
                                            const net = closing?.net_sales == null ? null : Number(closing.net_sales);
                                            const dayPerformance = calendarPerformanceByDate.get(iso) ?? null;
                                            const tone = performanceColors(dayPerformance);
                                            const selected = isSingleDay && iso === period.start;
                                            const isWeekend = [0, 6].includes(day.getDay());
                                            return (
                                                <button key={iso} type="button" onClick={() => selectDate(iso)}
                                                    aria-pressed={selected}
                                                    aria-label={`Seleccionar ${iso}${net !== null ? ', venta neta ' + euro(net) : ''}${dayPerformance !== null ? ', rendimiento ' + dayPerformance.toFixed(1) + '%' : ''}`}
                                                    className={cn(
                                                        'month-cal-cell relative flex min-h-0 min-w-0 flex-col border-r border-gray-100 p-0.5 last:border-r-0 transition-colors hover:bg-indigo-50',
                                                        !isSameMonth(day, month) && 'opacity-35',
                                                        !selected && isWeekend && !tone && 'bg-violet-50/60',
                                                        !selected && tone?.cell,
                                                        !selected && iso >= period.start && iso <= period.end && 'ring-1 ring-inset ring-indigo-200',
                                                        selected && 'z-[1] bg-indigo-100 ring-2 ring-inset ring-indigo-500'
                                                    )}>
                                                    <span className={cn("absolute right-1 top-0.5 text-[9px] font-medium tabular-nums", selected ? "text-indigo-700" : "text-slate-400")}>{format(day, 'd')}</span>
                                                    {net !== null && Number.isFinite(net) ? (
                                                        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-px pt-2 text-center">
                                                            <span title={euro(net)} className="max-w-full truncate text-[clamp(8px,0.75vw,11px)] font-normal leading-none tracking-tight text-indigo-800 tabular-nums">
                                                                {Math.round(net).toLocaleString('es-ES')}€
                                                            </span>
                                                            <span className="text-[7px] font-medium leading-none tracking-[0.06em] text-slate-500">V NETA</span>
                                                            {dayPerformance !== null && tone ? (
                                                                <span className={cn("inline-flex max-w-full items-center justify-center gap-0.5 rounded px-1 py-px text-[clamp(8px,0.7vw,10px)] font-medium leading-none tabular-nums", tone.text)}
                                                                    title="Rendimiento respecto a cierres anteriores del mismo día de la semana">
                                                                    <span aria-hidden="true">{dayPerformance >= 0 ? '↗' : '↘'}</span>
                                                                    {Math.abs(dayPerformance).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </MonthCalendarFrame>
                    </section>
                    <section data-element="invoices" className="sales-desktop-invoices mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/25 bg-[var(--color-envolvente-bajo)] px-2 pb-2 pt-2 text-white">
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
                            <strong className="text-[11px] font-bold">Facturas simplificadas</strong>
                            <span className="shrink-0 text-[10px] text-white/60">{visibleTickets.length.toLocaleString('es-ES')} de {(dailyReport?.summary.count ?? tickets.length).toLocaleString('es-ES')}</span>
                        </div>
                        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-1">
                            {visibleTickets.map((ticket, i) => (
                                <SalesTicket key={ticket.numero_documento || i} ticket={ticket} items={linesByTicket[ticket.numero_documento] ?? EMPTY_ITEMS}
                                    expanded={expandedTicket === ticket.numero_documento}
                                    onToggle={() => setExpandedTicket(current => current === ticket.numero_documento ? null : ticket.numero_documento)}
                                    loadingItems={linesLoading && !Object.prototype.hasOwnProperty.call(linesByTicket, ticket.numero_documento)} />
                            ))}
                            {dayError && <p className="py-3 text-center text-xs text-rose-300">No se pudieron cargar las facturas simplificadas.</p>}
                            {!dayLoading && !dayError && loadedPeriod === periodKey && tickets.length === 0 && (
                                <p className="py-3 text-center text-xs text-white/55">No hay facturas simplificadas en este periodo.</p>
                            )}
                            {dayLoading && <p className="py-3 text-center text-[10px] text-white/50">Cargando facturas simplificadas…</p>}
                        </div>
                        {canLoadMore && (
                            <button type="button"
                                onClick={() => setPage(current => current + PAGE_SIZE)}
                                className="mt-1 shrink-0 rounded-md border border-white/25 px-3 py-1.5 text-center text-[11px] text-white/85 hover:bg-white/10">
                                <ChevronDown size={13} className="mr-1 inline-block"/> Ver más
                            </button>
                        )}
                    </section>
                </div>
            </div>
            {filterOpen && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4"
                    onMouseDown={e => { if (e.target === e.currentTarget) setFilterOpen(false); }}>
                    <div role="dialog" aria-modal="true" aria-label="Filtrar periodo de ventas" className="w-full max-w-[370px] rounded-xl border border-white/25 bg-[#122b57] p-4 text-white shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <strong className="flex items-center gap-2 text-sm"><CalendarRange size={17}/> Filtrar periodo</strong>
                            <button type="button" aria-label="Cerrar filtro" onClick={() => setFilterOpen(false)} className="rounded p-1 hover:bg-white/10"><X size={18}/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                ['day','Día'], ['week','Semana'], ['month','Mes'],
                                ['three','Últimos 3 meses'], ['custom','Personalizado']
                            ] as const).map(([value,label]) => (
                                <button type="button" key={value} onClick={() => setFilterKind(value)}
                                    className={cn("rounded-md border px-2 py-2 text-xs", filterKind === value ? 'border-sky-400 bg-sky-700/60' : 'border-white/20 hover:bg-white/10')}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        {filterKind !== 'three' && (
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <label className="col-span-2 flex flex-col gap-1 text-xs text-white/75">
                                    {filterKind === 'custom' ? 'Desde' : 'Fecha de referencia'}
                                    <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)}
                                        className="rounded border border-white/25 bg-[#091b3d] px-2 py-2 text-white [color-scheme:dark]" />
                                </label>
                                {filterKind === 'custom' && (
                                    <label className="col-span-2 flex flex-col gap-1 text-xs text-white/75">
                                        Hasta
                                        <input type="date" min={filterStart} value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
                                            className="rounded border border-white/25 bg-[#091b3d] px-2 py-2 text-white [color-scheme:dark]" />
                                    </label>
                                )}
                            </div>
                        )}
                        <p className="mt-3 text-[11px] text-white/55">El resumen incluye todo el periodo. Las facturas se muestran de siete en siete.</p>
                        <button type="button" onClick={applyFilter}
                            disabled={(filterKind === 'custom' && filterEnd < filterStart) || (filterKind !== 'three' && !filterStart)}
                            className="mt-4 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                            Aplicar filtro
                        </button>
                    </div>
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
                instance="ventas-consolidated-photo-preview"
            />
        </div>
    );
}
