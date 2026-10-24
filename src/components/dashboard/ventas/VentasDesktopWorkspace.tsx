'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, FileText, CreditCard, CloudSun, Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { formatTicketTimeMadrid } from '@/utils/date-utils';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import { timeFilterBounds, type TimeFilterValue } from '@/components/time/time-filter-types';
import { cn } from '@/lib/utils';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { getCashClosingPhotoUrlsAction } from '@/app/actions/cash-closing-photos';

type Ticket = { numero_documento: string; fecha: string; hora_cierre: string; total_documento: number; mesa: number | null };
type Item = { name: string; qty: number; price: number; total: number };
type TicketReport = {
    summary: { totalSales: number; count: number; avgTicket: number };
    products: { articulo_id?: number; nombre_articulo: string; cantidad_total: number; total_ingresos: number }[];
    hours: { hour: number; count: number; total: number }[];
};
type CrossScope = 'month' | 'period';
type CrossSelection =
    | { kind: 'hour'; hour: number; scope: CrossScope }
    | { kind: 'product'; productId: number; productName: string; scope: CrossScope }
    | { kind: 'payment'; payment: 'card' | 'cash' | 'pending' | 'collections'; scope: CrossScope };
type CrossResponse = TicketReport & { tickets: Ticket[]; hasMore: boolean };
const crossLabel = (selection: CrossSelection) =>
    selection.kind === 'hour' ? `${selection.hour}:00–${selection.hour + 1}:00`
        : selection.kind === 'product' ? selection.productName
        : ({card:'Tarjeta',cash:'Efectivo',pending:'Pendiente',collections:'Cobros'})[selection.payment];
const sameCross = (a: CrossSelection | null, b: CrossSelection) =>
    a !== null && a.kind === b.kind && a.scope === b.scope &&
    (a.kind === 'hour' && b.kind === 'hour' ? a.hour === b.hour
    : a.kind === 'product' && b.kind === 'product' ? a.productId === b.productId
    : a.kind === 'payment' && b.kind === 'payment' ? a.payment === b.payment : false);
type CloseRow = {
    id: string; closing_date: string; closed_at?: string | null; tickets_count?: number | null;
    tpv_sales: number | null; net_sales: number | null;
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

/** Dos filas de cierre con la misma fecha, hora de cierre y todas las cifras
 * idénticas representan el mismo cierre registrado dos veces. No tocamos los
 * registros en Supabase: solo impedimos que inflen los acumulados de Ventas.
 * Si hay dos cierres distintos para un día, se conservan ambos. */
function distinctCashClosings(rows: CloseRow[]): CloseRow[] {
    const seen = new Set<string>();
    return rows.filter(row => {
        const signature = JSON.stringify([
            row.closing_date, row.closed_at, row.tpv_sales, row.net_sales,
            row.sales_card, row.cash_counted, row.sales_pending,
            row.debt_recovered, row.difference, row.tickets_count
        ]);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });
}

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

/** Curvas por semana; los días sin cierre dejan huecos y no se interpretan como cero ventas. */
function calendarWeekChart(values: (number | null)[], floor: number, ceil: number) {
    const topY = 14;
    const baseline = 94;
    const drawableHeight = baseline - topY;
    const denominator = Math.max(1, ceil - floor);
    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    values.forEach((value, index) => {
        if (value === null) {
            if (run.length) runs.push(run);
            run = [];
            return;
        }
        const ratio = Math.min(1, Math.max(0, (value - floor) / denominator));
        run.push({ x: (index + 0.5) * 100, y: baseline - ratio * drawableHeight });
    });
    if (run.length) runs.push(run);
    return runs.map(points => {
        // El tramo comienza y termina en los BORDES de las casillas con datos.
        // Se mantienen sus puntos en el centro para que cada importe represente su día.
        const first = points[0];
        const last = points[points.length - 1];
        const startX = first.x - 50;
        const endX = last.x + 50;
        let line = `M ${startX} ${first.y} L ${first.x} ${first.y}`;
        for (let i = 1; i < points.length; i++) {
            const previous = points[i - 1];
            const current = points[i];
            const mid = (previous.x + current.x) / 2;
            line += ` C ${mid} ${previous.y}, ${mid} ${current.y}, ${current.x} ${current.y}`;
        }
        line += ` L ${endX} ${last.y}`;
        return {
            line,
            area: `${line} L ${endX} ${baseline} L ${startX} ${baseline} Z`
        };
    });
}

// One continuous 7–23 h axis: each slot lives BETWEEN consecutive hour ticks.
// All sixteen intervals and the full graph fit into the card without scrolling.
// Detail values stay available through pointer hover, keyboard focus and touch.
const FIRST_SALES_HOUR = 7;
const LAST_SALES_HOUR = 22;
const SALES_HOUR_COUNT = LAST_SALES_HOUR - FIRST_SALES_HOUR + 1;
type HourSlot = { hour: number; sales: number; tickets: number };

function HourlySalesTimeline({ hours, onChooseHour, selectedHour, contextLabel }: {
    hours?: TicketReport['hours'];
    onChooseHour?: (hour: number) => void;
    selectedHour?: number | null;
    contextLabel?: string | null;
}) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const byHour = new Map((hours ?? []).map(item => [Number(item.hour), item]));
    const slots: HourSlot[] = Array.from({ length: SALES_HOUR_COUNT }, (_, index) => {
        const hour = FIRST_SALES_HOUR + index;
        const record = byHour.get(hour);
        return {
            hour,
            sales: Number(record?.total ?? 0),
            tickets: Number(record?.count ?? 0)
        };
    });
    const peak = Math.max(1, ...slots.map(slot => slot.sales));
    const baseline = 79;
    const revenueY = (sales: number) => baseline - Math.max(0, sales) / peak * 62;
    const points = slots.map((slot, index) => ({
        x: (index + 0.5) * 100, y: revenueY(slot.sales)
    }));
    const path = points.map((point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ).join(' ');
    const area = `${path} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
    const bestHours = slots.filter(slot => slot.tickets > 0).sort((a, b) => b.sales - a.sales || a.hour - b.hour).slice(0, 3);
    // Keep the same three-column layout on hover. The hovered interval is
    // always centered between its immediate chronological neighbours.
    // Missing neighbours at 7 h and 22 h leave a genuinely empty column.
    const displayHours: (HourSlot | null)[] = activeIndex === null
        ? [bestHours[0] ?? null, bestHours[1] ?? null, bestHours[2] ?? null]
        : [
            activeIndex > 0 ? slots[activeIndex - 1] : null,
            slots[activeIndex],
            activeIndex < slots.length - 1 ? slots[activeIndex + 1] : null
        ];

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div data-element="hours-header" className="mb-2 flex h-5 shrink-0 items-center justify-between gap-2">
                <h3 className="shrink-0 text-xs font-bold uppercase">Horas</h3>
                <span className="min-w-0 max-w-[75%] truncate text-right text-[9px] text-white/50" title={contextLabel ?? undefined}>
                    {contextLabel ?? 'Facturación · 7–23 h'}
                </span>
            </div>
            <div className="w-full shrink-0">
                <div data-element="hours-plot" className="relative h-[82px] w-full" onMouseLeave={() => setActiveIndex(null)}>
                <svg className="block h-full w-full text-[#70b5ff]"
                    viewBox="0 0 1600 90" preserveAspectRatio="none"
                    role="img" aria-label="Evolución de facturación desde las 7 h hasta las 23 h, con datos por tramo al pasar el cursor">
                    <path d={`M 0 ${baseline} H 1600`} stroke="currentColor" strokeOpacity=".28"
                        strokeWidth="1" vectorEffect="non-scaling-stroke"/>
                    {Array.from({ length: SALES_HOUR_COUNT + 1 }, (_, index) => (
                        <path key={index} d={`M ${index * 100} 10 V ${baseline}`}
                            stroke="currentColor" strokeOpacity=".10"
                            strokeWidth="1" vectorEffect="non-scaling-stroke"/>
                    ))}
                    <path d={area} fill="currentColor" fillOpacity=".12"/>
                    <path d={path} fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
                </svg>
                {/* The interaction layer ends at the chart baseline: axis labels never change color. */}
                {slots.map((slot, index) => (
                    <button key={slot.hour} type="button" data-crossfilter-trigger
                        style={{ left: `${index / SALES_HOUR_COUNT * 100}%`, width: `${100 / SALES_HOUR_COUNT}%` }}
                        className={cn('absolute inset-y-0 z-[1] cursor-pointer border-x border-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-sky-300',
                            (activeIndex === index || selectedHour === slot.hour) && 'bg-sky-200/10')}
                        aria-pressed={selectedHour === slot.hour}
                        aria-label={`${slot.hour} a ${slot.hour + 1} horas: ${slot.tickets} tickets, ticket medio ${euro(slot.tickets > 0 ? slot.sales / slot.tickets : 0)}, facturación ${euro(slot.sales)}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onFocus={() => setActiveIndex(index)}
                        onBlur={() => setActiveIndex(null)}
                        onClick={() => onChooseHour?.(slot.hour)}
                    />
                ))}
                </div>
                <div data-element="hours-axis" className="relative h-[20px] w-full border-t border-white/10">
                    {Array.from({ length: SALES_HOUR_COUNT + 1 }, (_, index) => (
                        <span key={index} style={{ left: `${index / SALES_HOUR_COUNT * 100}%` }}
                            className={cn(
                                'pointer-events-none absolute top-1 whitespace-nowrap text-[8px] font-medium leading-none tabular-nums text-white/75',
                                index === 0 ? '' : index === SALES_HOUR_COUNT ? '-translate-x-full' : '-translate-x-1/2'
                            )}>
                            {FIRST_SALES_HOUR + index} h
                        </span>
                    ))}
                </div>

            </div>
            {/* Fixed detail strip below the axis. Hover preserves exactly
                three columns: previous, selected, next. No placeholders. */}
            <div data-element="hours-details" className="mt-2 h-[78px] w-full shrink-0 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1.5">
                <div className="grid h-full grid-cols-3" aria-live="polite"
                    aria-label={activeIndex === null ? 'Tres tramos horarios con mayor facturación' : 'Tramo señalado y tramos anterior y posterior'}>
                    {displayHours.map((slot, position) => {
                        if (!slot) return <div key={`empty-${position}`} aria-hidden="true" />;
                        const isHighlighted = activeIndex !== null && position === 1;
                        return (
                            <div key={slot.hour}
                                className={cn(
                                    'flex min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 text-center',
                                    position !== 2 && displayHours[position + 1] && 'border-r border-white/10',
                                    isHighlighted && 'rounded-md bg-sky-300/15 ring-1 ring-inset ring-sky-300/35',
                                    activeIndex !== null && !isHighlighted && 'opacity-75'
                                )}
                                title={`${slot.hour}:00–${slot.hour + 1}:00`}>
                                <span className={cn(
                                    'w-full text-left text-[12px] font-semibold leading-tight tabular-nums',
                                    isHighlighted ? 'text-sky-100' : 'text-white/85'
                                )}>
                                    {slot.hour}–{slot.hour + 1} h
                                </span>
                                <strong className={cn(
                                    'max-w-full truncate text-[clamp(11px,1vw,15px)] font-semibold leading-tight tabular-nums',
                                    isHighlighted ? 'text-teal-100' : 'text-teal-200'
                                )}>
                                    {euro(slot.sales)}
                                </strong>
                                <span className="mt-1.5 max-w-full truncate text-[11px] leading-tight tabular-nums text-white/80">
                                    {slot.tickets.toLocaleString('es-ES')} tick · {euro(slot.tickets > 0 ? slot.sales / slot.tickets : 0)} med
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
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
        <div className="min-w-0 shrink-0" data-crossfilter-trigger>
            <button type="button" aria-expanded={canExpand && expanded} disabled={!canExpand} onClick={canExpand ? onToggle : undefined}
                className={cn("ventas-ticket-strip flex h-[28px] w-full min-w-0 items-center gap-1.5 overflow-hidden bg-[rgb(255_255_255/0.97)] pl-[18px] pr-[18px] text-left text-[#1a2854] transition-colors", canExpand ? "cursor-pointer hover:bg-white" : "cursor-default")}>
                <strong className="w-[32px] shrink-0 text-[10px] font-semibold tabular-nums">{formatTicketTimeMadrid(ticket.hora_cierre, ticket.fecha)}</strong>
                <span className="w-[68px] shrink-0 border-l border-[#182d5f]/20 pl-1.5 text-right text-[8px] font-medium tabular-nums text-[#1a2854]/55">{compactDoc(ticket.numero_documento)}</span>
                {ticket.mesa != null && Number(ticket.mesa) > 0 && <span className="inline-flex h-[18px] w-[34px] shrink-0 items-center justify-center rounded bg-[#e1eaff] text-center text-[9px] font-semibold tabular-nums">{ticket.mesa}</span>}
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
            const next = Math.max(0, Math.floor(holder.clientHeight / 28) * 28);
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

// Shared product ranking and chronological hourly chart for monthly/period cards.
function SalesBreakdown({ report, baseReport, scope, selection, onSelect }: {
    report: TicketReport | null; baseReport: TicketReport | null; scope: CrossScope;
    selection: CrossSelection | null; onSelect: (value: CrossSelection) => void;
}) {
    // Clicking a product filters the *other* sections but must never reorder,
    // hide, or resize the product ranking the user selected from.
    const productRankingReport = selection?.scope === scope && selection.kind === 'product'
        ? baseReport : report;
    const products = productRankingReport?.products ?? [];
    const maxProductSales = Math.max(1, ...products.map(p => Number(p.total_ingresos ?? 0)));
    const totalSales = Number(productRankingReport?.summary?.totalSales ?? 0);
    const shareLabel = (sales: number) => totalSales > 0
        ? (sales / totalSales * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '% del total'
        : 'Sin total de ventas disponible';
    const barWidth = (sales: number, maximum: number) => Math.max(0, Math.min(100, sales / maximum * 100)) + '%';

    return (
        <div data-element="sales-breakdown" className="flex h-full min-h-0 flex-1 flex-col gap-3 pt-3">
            <section data-element="products-section" className="flex min-h-0 flex-1 flex-col border-b border-white/15 pb-3">
                <div className="mb-2 flex h-4 shrink-0 items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase">Productos</h3>
                    <span className="max-w-[68%] truncate text-right text-[9px] text-sky-200/85" title={selection?.scope === scope ? crossLabel(selection) : undefined}>
                        {selection?.scope === scope ? crossLabel(selection) : 'Ventas por producto'}
                    </span>
                </div>
                <RankingViewport>
                    {products.map((product, index) => {
                        const sales = Number(product.total_ingresos ?? 0);
                        const label = shareLabel(sales);
                        return (
                            <button key={product.articulo_id ?? index} type="button" data-crossfilter-trigger
                                disabled={product.articulo_id == null}
                                onClick={() => product.articulo_id != null && onSelect({
                                    kind: 'product', productId: product.articulo_id,
                                    productName: product.nombre_articulo, scope
                                })}
                                aria-pressed={selection?.scope === scope && selection?.kind === 'product' && selection.productId === product.articulo_id}
                                className={cn('grid h-7 w-full min-w-0 snap-start snap-always grid-cols-[minmax(0,1.2fr)_auto_minmax(50px,0.9fr)_auto] items-center gap-x-2 border-b border-white/5 text-left text-[11px]',
                                    product.articulo_id != null && 'cursor-pointer hover:bg-white/10',
                                    selection?.scope === scope && selection?.kind === 'product' && selection.productId === product.articulo_id && 'bg-sky-200/15')}
                                title={product.nombre_articulo + ' · ' + euro(sales) + ' · ' + label}>
                                <span className="min-w-0 truncate text-white/85">{index + 1}. {product.nombre_articulo}</span>
                                <span className="shrink-0 tabular-nums text-white/60">{Number(product.cantidad_total).toLocaleString('es-ES')} u</span>
                                <div role="img" aria-label={label} className="h-[10px] min-w-0 overflow-hidden rounded-sm bg-white/10">
                                    <div className="h-full rounded-sm bg-[#64a4ff]" style={{ width: barWidth(sales, maxProductSales) }}/>
                                </div>
                                <strong className="min-w-[66px] shrink-0 text-right text-[12px] font-semibold tabular-nums">{euro(sales)}</strong>
                            </button>
                        );
                    })}
                </RankingViewport>
            </section>
            <section data-element="hours-section" className="h-[214px] min-h-0 shrink-0">
                <HourlySalesTimeline hours={report?.hours}
                    contextLabel={selection?.scope === scope ? crossLabel(selection) : null}
                    selectedHour={selection?.scope === scope && selection.kind === 'hour' ? selection.hour : null}
                    onChooseHour={hour => onSelect({ kind: 'hour', hour, scope })}/>
            </section>
        </div>
    );
}


type PaymentKpiType = 'card' | 'cash' | 'pending' | 'collections';
type SummaryKpiItem = { label: string; value: string; payment?: PaymentKpiType; tone?: string };
type FinancialExtras = { cash: number; card: number; pending: number; recovered: number; net: number; difference: number };

// Keep monthly and selected-period labels, tones and cross-filter actions identical.
// A missing financial figure is intentionally empty (not a dash).
function financialSummaryItems(extras?: FinancialExtras, performance: number | null = null, abbreviated = false): SummaryKpiItem[] {
    const items: SummaryKpiItem[] = [
        {
            label: 'Rendimiento',
            value: performance === null ? '' : (performance >= 0 ? '▲ ' : '▼ ') + Math.abs(performance).toFixed(1) + '%',
            tone: performance === null ? 'border-white/15 bg-white/[0.035]' : (performance >= 0 ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-rose-400/55 bg-rose-500/15')
        },
        { label: 'Tarjeta', value: extras ? euro(extras.card) : '', payment: 'card', tone: 'border-sky-400/50 bg-sky-500/10' },
        { label: 'Efectivo', value: extras ? euro(extras.cash) : '', payment: 'cash', tone: 'border-emerald-400/50 bg-emerald-500/10' },
        { label: 'Pendiente', value: extras ? euro(extras.pending) : '', payment: 'pending', tone: 'border-amber-400/55 bg-amber-500/10' },
        { label: 'Cobros', value: extras ? euro(extras.recovered) : '', payment: 'collections', tone: 'border-violet-400/55 bg-violet-500/10' },
        { label: 'Diferencia', value: extras ? euro(extras.difference) : '', tone: 'border-teal-400/50 bg-teal-500/10' }
    ];
    if (!abbreviated) return items;
    const labels: Record<string, string> = {
        Rendimiento: 'Rend', Tarjeta: 'Tar', Efectivo: 'Efec',
        Pendiente: 'Pend', Cobros: 'Cobr', Diferencia: 'Dif'
    };
    return items.map(item => ({ ...item, label: labels[item.label] ?? item.label }));
}

function TicketHeaderStats({ report }: { report: TicketReport | null }) {
    return (
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 whitespace-nowrap text-[10px] text-white/70">
            {report && (
                <>
                    <span className="tabular-nums"><strong className="font-semibold text-white">{Number(report.summary.count).toLocaleString('es-ES')}</strong> tickets</span>
                    <span className="tabular-nums"><strong className="font-semibold text-white">{euro(report.summary.avgTicket)}</strong> medio</span>
                </>
            )}
        </div>
    );
}

// Two compact columns of three finance metrics each, alongside the revenue tiles.
function FinancialKpiHeader({ sales, net, items, scope, selection, onSelect }: {
    sales: string; net: string; items: SummaryKpiItem[];
    scope: CrossScope; selection: CrossSelection | null;
    onSelect: (value: CrossSelection) => void;
}) {
    return (
        <div className="flex w-full min-w-0 shrink-0 items-stretch gap-3">
            <div className="flex max-w-[52%] shrink-0 flex-col items-start gap-1.5">
                {([
                    { label: 'Ventas', value: sales, tone: 'border-sky-400/35 bg-sky-500/10' },
                    { label: 'Venta neta', value: net, tone: 'border-emerald-400/30 bg-emerald-500/10' }
                ] as const).map(item => (
                    <div key={item.label}
                        className={cn('flex min-h-[57px] w-fit max-w-full flex-1 flex-col justify-center rounded-lg border px-2.5 py-1.5', item.tone)}>
                        <span className="text-[11px] font-medium leading-tight text-white/80">{item.label}</span>
                        <strong className="block max-w-full whitespace-nowrap text-[clamp(16px,1.75vw,25px)] font-bold leading-tight tabular-nums text-white">
                            {item.value}
                        </strong>
                    </div>
                ))}
            </div>
            <div className="grid min-w-0 flex-1 grid-flow-col grid-cols-2 grid-rows-3 gap-x-3 gap-y-1">
                {items.map(item => {
                    const selected = selection?.scope === scope && selection.kind === 'payment' && selection.payment === item.payment;
                    const content = (
                        <>
                            <span className="w-full min-w-0 truncate text-[11px] font-medium leading-tight text-white/80" title={item.label}>{item.label}</span>
                            <strong className="block w-full min-w-0 truncate whitespace-nowrap text-left text-[clamp(13px,1vw,16px)] font-bold leading-tight tabular-nums text-white" title={item.value}>{item.value}</strong>
                        </>
                    );
                    const rowClass = cn(
                        'flex min-h-[42px] w-full min-w-0 flex-col items-start justify-center gap-0.5 rounded-md border px-2 py-1 text-left',
                        item.tone ?? 'border-white/15 bg-white/[0.035]',
                        item.payment && 'cursor-pointer transition-colors hover:brightness-125',
                        selected && 'ring-1 ring-inset ring-white/75'
                    );
                    return item.payment ? (
                        <button key={item.label} type="button" data-crossfilter-trigger
                            className={rowClass} aria-pressed={selected}
                            onClick={() => onSelect({ kind: 'payment', payment: item.payment!, scope })}>
                            {content}
                        </button>
                    ) : (
                        <div key={item.label} className={rowClass}>{content}</div>
                    );
                })}
            </div>
        </div>
    );
}

function SummaryCard({ title, dateText, report, extras, breakdownReport, scope, selection, onSelect }: {
    title: string; dateText: string; report: TicketReport | null;
    extras?: FinancialExtras;
    breakdownReport: TicketReport | null; scope: CrossScope;
    selection: CrossSelection | null; onSelect: (value: CrossSelection) => void;
}) {
    const sales = report ? Number(report.summary.totalSales) : null;
    return (
        <div className="history-desktop-summary flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/25 bg-white/10 px-3 pb-4 pt-2 text-white">
            <div className="mb-3 flex min-h-[36px] min-w-0 shrink-0 items-center justify-between gap-2 border-b border-white/15">
                <div className="flex min-w-0 items-baseline gap-3">
                    <strong className="shrink-0 text-sm font-bold">{title}</strong>
                    <span className="min-w-0 truncate text-[10px] capitalize text-white/60">{dateText}</span>
                </div>
                <TicketHeaderStats report={report}/>
            </div>
            <FinancialKpiHeader
                sales={sales !== null ? euro(sales) : ''}
                net={extras ? euro(extras.net) : ''}
                items={financialSummaryItems(extras, null, true)} scope={scope} selection={selection} onSelect={onSelect}/>
            <SalesBreakdown report={breakdownReport} baseReport={report} scope={scope} selection={selection} onSelect={onSelect}/>
        </div>
    );
}

export default function VentasDesktopWorkspace() {
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    const [canEditClosings, setCanEditClosings] = useState(false);
    useEffect(() => {
        let alive = true;
        void (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
            if (alive) setCanEditClosings(data?.role === 'manager');
        })();
        return () => { alive = false; };
    }, [supabase]);
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [period, setPeriod] = useState<Period>(todayPeriod);
    const [initializing, setInitializing] = useState(true);
    const [returnPeriod, setReturnPeriod] = useState<Period | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [activeFilter, setActiveFilter] = useState<TimeFilterValue | null>(null);
    const [lastClosingDate, setLastClosingDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [returnFilter, setReturnFilter] = useState<TimeFilterValue | null>(null);
    const [periodClosings, setPeriodClosings] = useState<CloseRow[]>([]);
    const [historicalNetByDate, setHistoricalNetByDate] = useState<Map<string, number>>(() => new Map());
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
    const [crossSelection, setCrossSelection] = useState<CrossSelection | null>(null);
    const [crossResult, setCrossResult] = useState<CrossResponse | null>(null);
    const [crossPage, setCrossPage] = useState(0);
    const [crossLoading, setCrossLoading] = useState(false);
    const [crossError, setCrossError] = useState(false);
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
    const visibleTickets = crossSelection ? (crossResult?.tickets ?? []) : tickets;
    const monthBreakdown = crossSelection?.scope === 'month' ? crossResult : monthReport;
    const periodBreakdown = crossSelection?.scope === 'period' ? crossResult : dailyReport;
    const crossScopeStart = crossSelection?.scope === 'month' ? monthStart : period.start;
    const crossScopeEnd = crossSelection?.scope === 'month' ? monthEnd : period.end;
    const onChooseCross = (value: CrossSelection) => {
        setCrossSelection(current => sameCross(current, value) ? null : value);
        setCrossResult(null);
        setCrossPage(0);
        setCrossError(false);
    };
    const initialTimeFilter = useMemo<TimeFilterValue>(
        () => activeFilter ?? { kind: 'date', date: period.start },
        [activeFilter, period.start]
    );
    const lastThreeMonthsPreset = useMemo(() => {
        const lastComplete = subMonths(startOfMonth(new Date()), 1);
        return {
            label: 'Últimos 3 meses',
            value: {
                kind: 'range' as const,
                startDate: format(subMonths(startOfMonth(lastComplete), 2), 'yyyy-MM-dd'),
                endDate: format(endOfMonth(lastComplete), 'yyyy-MM-dd')
            }
        };
    }, []);
    const calendarWeeks = useMemo(() => {
        const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start, end });
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        return weeks;
    }, [month]);
    const byDate = useMemo(() => new Map(calendarClosings.map(c => [c.closing_date, c])), [calendarClosings]);
    const calendarWeekSeries = useMemo(() => calendarWeeks.map(week => week.map(day => {
        const closing = byDate.get(format(day, 'yyyy-MM-dd'));
        const value = closing?.net_sales == null ? null : Number(closing.net_sales);
        return value !== null && Number.isFinite(value) ? value : null;
    })), [calendarWeeks, byDate]);
    // Escala común mensual basada en mínimo y máximo reales, con margen visual.
    const calendarNetValues = calendarWeekSeries.flat().filter((value): value is number => value !== null);
    const calendarMinNet = calendarNetValues.length ? Math.min(...calendarNetValues) : 0;
    const calendarMaxNet = calendarNetValues.length ? Math.max(...calendarNetValues) : 1;
    const calendarRangePadding = Math.max((calendarMaxNet - calendarMinNet) * 0.12, 40);
    const calendarChartFloor = Math.max(0, calendarMinNet - calendarRangePadding);
    const calendarChartCeil = calendarMaxNet + calendarRangePadding;

    const changePeriod = (next: Period, keepReturn = false) => {
        setCrossSelection(null);
        setCrossResult(null);
        setCrossPage(0);
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
        if (!returnPeriod && (period.start !== date || period.end !== date) && period.kind !== 'day') {
            setReturnPeriod(period);
            setReturnFilter(activeFilter);
        }
        setActiveFilter({ kind: 'date', date });
        changePeriod({ start: date, end: date, kind: 'day' }, true);
    };
    const restorePeriod = () => {
        if (returnPeriod) {
            setActiveFilter(returnFilter);
            changePeriod(returnPeriod);
            setReturnFilter(null);
        }
    };
    const navigateMonth = (delta: number) => setMonth(current => delta < 0 ? subMonths(current, 1) : addMonths(current, 1));
    const applyFilter = (value: TimeFilterValue) => {
        const bounds = timeFilterBounds(value);
        if (!bounds) return;
        setActiveFilter(value);
        setReturnFilter(null);
        changePeriod({
            start: bounds.startDate, end: bounds.endDate,
            kind: value.kind === 'month' ? 'month' : value.kind === 'week' ? 'week' : bounds.startDate === bounds.endDate ? 'day' : 'range',
        });
        setFilterOpen(false);
    };
    const clearAllFilters = () => {
        setActiveFilter(null);
        setReturnFilter(null);
        setFilterOpen(false);
        changePeriod({ start: lastClosingDate, end: lastClosingDate, kind: 'day' });
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
                setLastClosingDate(lastDate);
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
                supabase.rpc('get_ventas_crossfilter', { p_start_date: monthStart, p_end_date: monthEnd, p_limit: 1 }),
                supabase.from('cash_closings').select('id,closing_date,closed_at,tickets_count,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference').gte('closing_date', monthStart).lte('closing_date', monthEnd)
            ]);
            if (!active) return;
            setMonthReport(monthly.error ? null : monthly.data as unknown as TicketReport);
            setMonthClosings(distinctCashClosings((closes.data ?? []) as CloseRow[]));

        };
        void load();
        return () => { active = false; };
    }, [supabase, monthStart, monthEnd]);

    useEffect(() => {
        let active = true;
        // Incluir las fechas colindantes visibles para no cortar la curva semanal.
        const start = format(calendarWeeks[0][0], 'yyyy-MM-dd');
        const end = format(calendarWeeks[calendarWeeks.length - 1][6], 'yyyy-MM-dd');
        void supabase.from('cash_closings')
            .select('id,closing_date,closed_at,tickets_count,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference')
            .gte('closing_date', start).lte('closing_date', end)
            .then(({ data, error }) => {
                if (active) setCalendarClosings(distinctCashClosings(error ? [] : (data ?? []) as CloseRow[]));
            });
        return () => { active = false; };
    }, [supabase, calendarWeeks]);

    useEffect(() => {
        if (initializing) return;
        let active = true;
        setDailyReport(null);
        void supabase.rpc('get_ventas_crossfilter', { p_start_date: period.start, p_end_date: period.end, p_limit: 1 })
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


    // Cross-filtering is performed against all receipts in the selected scope,
    // not merely the seven rendered rows. All joins stay in the database.
    useEffect(() => {
        if (!crossSelection || initializing) {
            setCrossLoading(false);
            return;
        }
        let alive = true;
        setCrossLoading(true);
        setCrossError(false);
        const load = async () => {
            const params = {
                p_start_date: crossScopeStart,
                p_end_date: crossScopeEnd,
                p_hour: crossSelection.kind === 'hour' ? crossSelection.hour : null,
                p_product_id: crossSelection.kind === 'product' ? crossSelection.productId : null,
                p_payment: crossSelection.kind === 'payment' ? crossSelection.payment : null
            };
            const limit = crossScopeStart === crossScopeEnd ? 200 : PAGE_SIZE;
            let offset = crossPage;
            let result: CrossResponse | null = null;
            const rows: Ticket[] = [];
            do {
                const { data, error } = await supabase.rpc('get_ventas_crossfilter', {
                    ...params, p_offset: offset, p_limit: limit
                });
                if (!alive) return;
                if (error || !data) {
                    setCrossError(true);
                    setCrossLoading(false);
                    return;
                }
                result = data as CrossResponse;
                rows.push(...(result.tickets ?? []));
                if (crossScopeStart !== crossScopeEnd || !result.hasMore) break;
                offset += limit;
            } while (alive);
            if (!alive || !result) return;
            setCrossResult(previous => ({
                ...result,
                tickets: crossPage > 0 ? [...(previous?.tickets ?? []), ...rows] : rows
            }));
            setCrossLoading(false);
        };
        void load();
        return () => { alive = false; };
    }, [supabase, crossSelection, crossScopeStart, crossScopeEnd, crossPage, initializing]);

    // Any click outside a selector clears only the crossfilter, preserving
    // the existing day/week/month time filter and ticket pagination.
    useEffect(() => {
        if (!crossSelection) return;
        const onPointer = (event: PointerEvent) => {
            if (!(event.target instanceof Element)) return;
            if (event.target.closest('[data-crossfilter-trigger]')) return;
            setCrossSelection(null);
            setCrossResult(null);
            setCrossPage(0);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setCrossSelection(null);
            setCrossResult(null);
            setCrossPage(0);
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [crossSelection]);

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
    const canLoadMore = crossSelection
        ? crossScopeStart !== crossScopeEnd && !crossLoading && !crossError && (crossResult?.hasMore ?? false)
        : !isSingleDay && loadedPeriod === periodKey && !dayLoading && hasMore;
    useEffect(() => {
        if (initializing) return;
        let active = true;
        // Load daily closing totals (not tickets) for the selected period and the
        // preceding 16 same-weekday comparisons used by /dashboard/history.
        const comparisonStart = format(subWeeks(parseISO(period.start), 16), 'yyyy-MM-dd');
        void supabase.from('cash_closings')
            .select('id,closing_date,closed_at,tickets_count,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference,weather,dataphone_totals_photo_path,bdp_closing_ticket_photo_path')
            .gte('closing_date', comparisonStart).lte('closing_date', period.end).limit(4000)
            .then(({ data, error }) => {
                if (!active) return;
                const rows = distinctCashClosings(error ? [] : (data ?? []) as CloseRow[]);
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
        net: a.net + Number(c.net_sales ?? 0), difference: a.difference + Number(c.difference ?? 0)
    }), { cash: 0, card: 0, pending: 0, recovered: 0, net: 0, difference: 0 }), [monthClosings]);
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
                    <SummaryCard title="Mensual" dateText={referenceLabel} report={monthReport}
                        breakdownReport={monthBreakdown}
                        extras={monthClosings.length ? monthTotals : undefined}
                        scope="month" selection={crossSelection} onSelect={onChooseCross}/>
                </div>
                <div data-element="selected-day" className="min-h-0 min-w-0">
                    <section className="history-desktop-day flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/40 bg-[var(--color-envolvente-bajo)] text-white">
                        <header className="flex min-h-[36px] shrink-0 items-center justify-between gap-2 border-b border-white/15 px-3">
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <strong className="min-w-0 truncate text-[11px] font-bold uppercase" title={periodTitle}>{periodTitle}</strong>
                                {isSingleDay && selectedClosing && canEditClosings && (
                                    <button type="button"
                                        aria-label={`Editar cierre del ${periodTitle}`}
                                        title="Editar cierre"
                                        onClick={() => router.push(`/dashboard/history?closingId=${encodeURIComponent(selectedClosing.id)}&edit=1`)}
                                        className="inline-flex h-6 w-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 font-normal text-white/65 shadow-none hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70">
                                        <Pencil size={14} strokeWidth={1.6} aria-hidden="true"/>
                                    </button>
                                )}
                            </div>
                            {returnPeriod && (
                                <button type="button" onClick={restorePeriod} className="inline-flex max-w-[25%] shrink-0 items-center gap-1 truncate rounded border border-sky-400/35 px-2 py-1 text-[10px] text-sky-200 hover:bg-white/10" title={'Volver a ' + periodLabel(returnPeriod)}>
                                    <ArrowLeft size={13} className="shrink-0"/>
                                    <span className="truncate">Volver al periodo</span>
                                </button>
                            )}
                            <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
                                {isSingleDay && selectedClosing?.weather ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-white/70" title="Clima del cierre">
                                        <CloudSun size={12}/> <span className="max-w-[80px] truncate">{selectedClosing.weather}</span>
                                    </span>
                                ) : null}
                                <TicketHeaderStats report={dailyReport}/>
                            </div>
                        </header>
                        <div data-element="day-financials" className="shrink-0 border-b border-white/10 px-3 py-3">
                            <FinancialKpiHeader
                                sales={dailyReport ? euro(dailyReport.summary.totalSales) : ''}
                                net={hasClosingData ? euro(periodTotals.net) : ''}
                                items={financialSummaryItems(hasClosingData ? periodTotals : undefined, periodPerformance)}
                                scope="period" selection={crossSelection} onSelect={onChooseCross}/>
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
                        <div data-element="day-breakdown" className="min-h-0 flex-1 overflow-hidden px-3 pb-4 pt-2">
                            <SalesBreakdown report={periodBreakdown} baseReport={dailyReport} scope="period"
                                selection={crossSelection} onSelect={onChooseCross}/>
                        </div>
                    </section>
                </div>
                <div data-element="calendar-column" className="flex min-h-0 min-w-0 flex-col">
                    <nav data-element="calendar-navigation" className="relative flex shrink-0 items-center justify-center gap-2 text-white" aria-label="Cambiar mes de ventas">
                        <button type="button" onClick={() => navigateMonth(-1)} aria-label="Mes anterior" className="rounded p-1.5 hover:bg-white/10"><ChevronLeft size={19}/></button>
                        <strong className="min-w-[128px] text-center text-sm font-semibold capitalize">{monthLabel}</strong>
                        <button type="button" onClick={() => navigateMonth(1)} aria-label="Mes siguiente" className="rounded p-1.5 hover:bg-white/10"><ChevronRight size={19}/></button>
                        <div className="absolute right-0 top-0 inline-flex pr-2 pt-1">
                            <button type="button" onClick={() => setFilterOpen(true)}
                                className="inline-flex items-center gap-1 rounded border border-white/30 px-2 py-1 text-[11px] hover:bg-white/10"
                                aria-label="Filtrar por fecha">
                                <Filter size={13}/> Filtro
                            </button>
                            {activeFilter !== null && (
                                <button type="button" onClick={clearAllFilters}
                                    className="absolute right-0 top-0 z-10 flex h-[17px] w-[17px] items-center justify-center rounded-full border border-white bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700"
                                    title="Quitar todos los filtros"
                                    aria-label="Quitar todos los filtros">
                                    <X size={11} strokeWidth={3}/>
                                </button>
                            )}
                        </div>
                    </nav>
                    <section data-element="calendar" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radio-control)] border border-zinc-200 bg-white text-zinc-900">
                        <MonthCalendarFrame flush className="history-desktop-month-cal-chrome">
                            <div className="month-cal-weeks history-desktop-cal-weeks" style={{ gridTemplateRows: 'repeat(' + calendarWeeks.length + ',minmax(0,1fr))' }}>
                                {calendarWeeks.map((week, index) => {
                                    const chart = calendarWeekChart(calendarWeekSeries[index], calendarChartFloor, calendarChartCeil);
                                    return (
                                        <div key={index} className="month-cal-week relative grid min-h-0 grid-cols-7 overflow-hidden border-b border-gray-100 last:border-0">
                                            {chart.length > 0 && (
                                                <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"
                                                    viewBox="0 0 700 100" preserveAspectRatio="none">
                                                    {chart.map((segment, chartIndex) => (
                                                        <g key={chartIndex}>
                                                            {segment.area && <path d={segment.area} fill="#60a5fa" fillOpacity="0.13"/>}
                                                            {segment.line && <path d={segment.line} fill="none" stroke="#60a5fa" strokeWidth="2"
                                                                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
                                                        </g>
                                                    ))}
                                                </svg>
                                            )}
                                            {week.map(day => {
                                                const iso = format(day, 'yyyy-MM-dd');
                                                const closing = byDate.get(iso);
                                                const net = closing?.net_sales == null ? null : Number(closing.net_sales);
                                                const selected = isSingleDay && iso === period.start;
                                                return (
                                                    <button key={iso} type="button" onClick={() => selectDate(iso)}
                                                        aria-pressed={selected}
                                                        aria-label={`Seleccionar ${iso}${net !== null && Number.isFinite(net) ? ', venta neta ' + euro(net) : ''}`}
                                                        className={cn(
                                                            'month-cal-cell relative z-[1] flex min-h-0 min-w-0 flex-col border-r border-gray-100 bg-transparent p-0.5 last:border-r-0 transition-colors hover:bg-zinc-50/40',
                                                            !isSameMonth(day, month) && 'opacity-35',
                                                            !selected && iso >= period.start && iso <= period.end && 'ring-1 ring-inset ring-zinc-300',
                                                            selected && 'ring-2 ring-inset ring-zinc-900'
                                                        )}>
                                                        <span className={cn('absolute right-1 top-0.5 text-[9px] font-medium tabular-nums',
                                                            selected ? 'text-zinc-700' : 'text-slate-400')}>{format(day, 'd')}</span>
                                                        {net !== null && Number.isFinite(net) && (
                                                            <div className="flex min-h-0 w-full flex-1 items-center justify-center px-0.5 pt-2 text-center">
                                                                <span title={euro(net)} className="inline-flex max-w-full items-center justify-center truncate rounded-md border border-emerald-500 bg-emerald-100/95 px-1.5 py-1 text-[clamp(9px,0.78vw,12px)] font-semibold leading-none tracking-[-0.025em] text-zinc-900 tabular-nums">
                                                                    {Math.round(net).toLocaleString('es-ES')}€
                                                                </span>
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </MonthCalendarFrame>
                    </section>
                    <section data-element="invoices" className="sales-desktop-invoices mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/25 bg-[var(--color-envolvente-bajo)] px-2 pb-2 pt-2 text-white">
                        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
                            <strong className="text-[11px] font-bold">Facturas simplificadas</strong>
                            {crossSelection && (
                                <span className="min-w-0 flex-1 truncate text-right text-[10px] text-sky-200"
                                    title={`${crossScopeStart} – ${crossScopeEnd} · ${crossLabel(crossSelection)}`}>
                                    {crossScopeStart !== crossScopeEnd ? format(parseISO(crossScopeStart),'dd/MM') + '–' + format(parseISO(crossScopeEnd),'dd/MM') + ' · ' : ''}
                                    {crossLabel(crossSelection)}
                                </span>
                            )}
                            <span className="shrink-0 text-[10px] text-white/60">
                                {visibleTickets.length.toLocaleString('es-ES')} de {crossSelection
                                    ? (crossResult?.summary.count ?? 0).toLocaleString('es-ES')
                                    : (dailyReport?.summary.count ?? tickets.length).toLocaleString('es-ES')}
                            </span>
                        </div>
                        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-1">
                            {visibleTickets.map((ticket, i) => (
                                <SalesTicket key={ticket.numero_documento || i} ticket={ticket} items={linesByTicket[ticket.numero_documento] ?? EMPTY_ITEMS}
                                    expanded={expandedTicket === ticket.numero_documento}
                                    onToggle={() => setExpandedTicket(current => current === ticket.numero_documento ? null : ticket.numero_documento)}
                                    loadingItems={linesLoading && !Object.prototype.hasOwnProperty.call(linesByTicket, ticket.numero_documento)} />
                            ))}
                            {(crossSelection ? crossError : dayError) && (
                                <p className="py-3 text-center text-xs text-rose-300">No se pudieron cargar las facturas simplificadas.</p>
                            )}
                            {crossSelection?.kind === 'payment' && crossSelection.payment === 'collections' && !crossLoading && (
                                <p className="py-3 text-center text-[11px] leading-relaxed text-amber-200">
                                    Los cobros de deudas son movimientos de caja sin identificador de factura.
                                    No pueden asignarse con precisión a productos, horas ni tickets.
                                </p>
                            )}
                            {crossSelection ? (!crossLoading && !crossError && crossResult && !visibleTickets.length &&
                                !(crossSelection.kind === 'payment' && crossSelection.payment === 'collections') &&
                                <p className="py-3 text-center text-xs text-white/55">No hay facturas para esta selección.</p>)
                                : (!dayLoading && !dayError && loadedPeriod === periodKey && tickets.length === 0 &&
                                    <p className="py-3 text-center text-xs text-white/55">No hay facturas simplificadas en este periodo.</p>)}
                            {(crossSelection ? crossLoading : dayLoading) && <p className="py-3 text-center text-[10px] text-white/50">Cargando facturas simplificadas…</p>}
                        </div>
                        {canLoadMore && (
                            <button type="button" data-crossfilter-trigger={crossSelection ? true : undefined}
                                onClick={() => crossSelection
                                    ? setCrossPage(current => current + PAGE_SIZE)
                                    : setPage(current => current + PAGE_SIZE)}
                                className="mt-1 shrink-0 rounded-md border border-white/25 px-3 py-1.5 text-center text-[11px] text-white/85 hover:bg-white/10">
                                <ChevronDown size={13} className="mr-1 inline-block"/> Ver más
                            </button>
                        )}
                    </section>
                </div>
            </div>
            <TimeFilterModal
                isOpen={filterOpen}
                onClose={() => setFilterOpen(false)}
                allowedKinds={['date', 'range', 'week', 'month', 'year']}
                initialValue={initialTimeFilter}
                defaultKind={activeFilter?.kind ?? 'date'}
                quickRangePreset={lastThreeMonthsPreset}
                onApply={applyFilter}
            />
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
