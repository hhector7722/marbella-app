'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { formatTicketTimeMadrid } from '@/utils/date-utils';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { cn } from '@/lib/utils';

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
};
const euro = (v: unknown) => (Number(v ?? 0)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const compactDoc = (id: string) => id.replace(/(B)0+(?=[1-9])/i, '$1');
const EMPTY_ITEMS: Item[] = [];
const PAGE_SIZE = 150;

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
        <span key={i} className="inline-flex shrink-0 items-center gap-1 border-l border-[#172c61]/35 px-2.5 text-[10px] text-[#1a2854]">
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
    return (
        <div className="min-w-0">
            <button type="button" aria-expanded={expanded} onClick={onToggle}
                className="ventas-ticket-strip flex h-[38px] w-full min-w-0 items-center gap-2 overflow-hidden bg-[rgb(255_255_255/0.97)] px-3 text-left text-[#1a2854] transition-colors hover:bg-white">
                <strong className="w-[38px] shrink-0 text-[12px] font-extrabold tabular-nums">{formatTicketTimeMadrid(ticket.hora_cierre, ticket.fecha)}</strong>
                <span className="shrink-0 border-l border-[#182d5f]/20 pl-2 text-[9px] font-medium tabular-nums text-[#1a2854]/55">{compactDoc(ticket.numero_documento)}</span>
                {ticket.mesa != null && Number(ticket.mesa) > 0 && <span className="shrink-0 rounded-md bg-[#e1eaff] px-2 py-0.5 text-[11px] font-bold tabular-nums">{ticket.mesa}</span>}
                <TicketProductPreview items={items} onOverflowChange={setHasHiddenProducts}/>
                {hasHiddenProducts && (expanded
                    ? <ChevronUp size={13} className="shrink-0 text-[#8992a8]" aria-label="Ocultar productos" />
                    : <ChevronDown size={13} className="shrink-0 text-[#8992a8]" aria-label="Mostrar más productos" />)}
                <strong className="ml-auto shrink-0 text-[13px] font-extrabold tabular-nums text-emerald-500">{euro(ticket.total_documento)}</strong>
            </button>
            {expanded && (
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

function SalesBreakdown({ report }: { report: TicketReport | null }) {
    const products = report?.products ?? [];
    const hours = useMemo(() => [...(report?.hours ?? [])].filter(h => Number(h.total) > 0).sort((a, b) => Number(b.total) - Number(a.total)), [report]);
    return (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 pt-3">
            <section className="flex min-h-0 min-w-0 flex-col">
                <h3 className="mb-2 shrink-0 text-xs font-bold uppercase">Productos</h3>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                    {products.map((p, i) => (
                        <div key={i} className="grid h-6 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 text-[10px]">
                            <span className="truncate text-white/85">{i + 1}. {p.nombre_articulo}</span>
                            <span className="tabular-nums text-white/55">{Number(p.cantidad_total).toLocaleString('es-ES')} u</span>
                            <strong className="shrink-0 tabular-nums">{euro(p.total_ingresos)}</strong>
                        </div>
                    ))}
                </div>
            </section>
            <section className="flex min-h-0 min-w-0 flex-col">
                <h3 className="mb-2 shrink-0 text-xs font-bold uppercase">Horas</h3>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                    {hours.map(h => (
                        <div key={h.hour} className="flex h-6 items-center justify-between gap-1 text-[10px]">
                            <strong className="shrink-0 tabular-nums">{h.hour}-{(h.hour + 1) % 24}</strong>
                            <span className="truncate tabular-nums text-white/50">{h.count} tick</span>
                            <strong className="shrink-0 tabular-nums">{euro(h.total)}</strong>
                        </div>
                    ))}
                </div>
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
        <div className="history-desktop-summary flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/25 bg-white/10 px-3 pb-5 pt-2 text-white">
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
    const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [dailyReport, setDailyReport] = useState<TicketReport | null>(null);
    const [monthReport, setMonthReport] = useState<TicketReport | null>(null);
    const [lastReport, setLastReport] = useState<TicketReport | null>(null);
    const [lastClosing, setLastClosing] = useState<CloseRow | null>(null);
    const [monthClosings, setMonthClosings] = useState<CloseRow[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [linesByTicket, setLinesByTicket] = useState<Record<string, Item[]>>({});
    const [linesLoading, setLinesLoading] = useState(false);
    const [dayLoading, setDayLoading] = useState(true);
    const [loadedDate, setLoadedDate] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [dayError, setDayError] = useState(false);
    const loadSentinel = useRef<HTMLDivElement>(null);
    const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');
    const monthLabel = format(month, 'MMMM yyyy', { locale: es });
    const calendarWeeks = useMemo(() => {
        const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start, end });
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        return weeks;
    }, [month]);
    const byDate = useMemo(() => new Map(monthClosings.map(c => [c.closing_date, c])), [monthClosings]);

    const selectDate = (date: string) => {
        setSelectedDate(date);
        setMonth(startOfMonth(parseISO(date)));
        setTickets([]);
        setLoadedDate(null);
        setLinesByTicket({});
        setExpandedTicket(null);
        setHasMore(true);
        setPage(0);
    };
    const navigateMonth = (delta: number) => {
        const next = delta < 0 ? subMonths(month, 1) : addMonths(month, 1);
        selectDate(format(startOfMonth(next), 'yyyy-MM-dd'));
    };

    useEffect(() => {
        let active = true;
        const load = async () => {
            const [monthly, closes, latest] = await Promise.all([
                supabase.rpc('get_full_period_ticket_sales_detail', { p_start_date: monthStart, p_end_date: monthEnd }),
                supabase.from('cash_closings').select('id,closing_date,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference').gte('closing_date', monthStart).lte('closing_date', monthEnd),
                supabase.from('cash_closings').select('id,closing_date,tpv_sales,net_sales,sales_card,cash_counted,sales_pending,debt_recovered,difference').order('closing_date', { ascending: false }).limit(1).maybeSingle()
            ]);
            if (!active) return;
            setMonthReport(monthly.error ? null : monthly.data as unknown as TicketReport);
            setMonthClosings((closes.data ?? []) as CloseRow[]);
            const last = latest.data as CloseRow | null;
            setLastClosing(last);
        };
        void load();
        return () => { active = false; };
    }, [supabase, monthStart, monthEnd]);

    useEffect(() => {
        if (!lastClosing) return;
        let active = true;
        void supabase.rpc('get_full_period_ticket_sales_detail', { p_start_date: lastClosing.closing_date, p_end_date: lastClosing.closing_date })
            .then(({ data, error }) => { if (active) setLastReport(error ? null : data as unknown as TicketReport); });
        return () => { active = false; };
    }, [supabase, lastClosing]);

    useEffect(() => {
        let active = true;
        setDailyReport(null);
        void supabase.rpc('get_full_period_ticket_sales_detail', { p_start_date: selectedDate, p_end_date: selectedDate })
            .then(({ data, error }) => { if (active) setDailyReport(error ? null : data as unknown as TicketReport); });
        return () => { active = false; };
    }, [supabase, selectedDate]);

    useEffect(() => {
        let active = true;
        setDayLoading(true);
        setDayError(false);
        const load = async () => {
            const { data, error } = await supabase.rpc('get_tickets_marbella_page', {
                p_start_date: selectedDate, p_end_date: selectedDate, p_limit: PAGE_SIZE, p_offset: page,
                p_start_time: null, p_end_time: null
            });
            if (!active) return;
            if (error) {
                setDayError(true);
                setDayLoading(false);
                return;
            }
            const batch = (data ?? []) as Ticket[];
            setTickets(prev => page === 0 ? batch : [...prev, ...batch]);
            if (page === 0) setLoadedDate(selectedDate);
            setHasMore(batch.length === PAGE_SIZE);
            setDayLoading(false);
        };
        void load();
        return () => { active = false; };
    }, [supabase, selectedDate, page]);

    // Obtener los nombres y cantidades de las líneas por lotes, no con una consulta por ticket.
    useEffect(() => {
        let active = true;
        const missing = tickets.filter(t => !Object.prototype.hasOwnProperty.call(linesByTicket, t.numero_documento));
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
    }, [supabase, tickets]);

    useEffect(() => {
        const node = loadSentinel.current;
        // Never request page two before page one has actually been loaded for this date.
        if (!node || loadedDate !== selectedDate || !hasMore || dayLoading) return;
        const observer = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting) setPage(current => current + PAGE_SIZE);
        }, { rootMargin: '120px' });
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, dayLoading, tickets.length, loadedDate, selectedDate]);

    const monthTotals = useMemo(() => monthClosings.reduce((a, c) => ({
        cash: a.cash + Number(c.cash_counted ?? 0), card: a.card + Number(c.sales_card ?? 0),
        pending: a.pending + Number(c.sales_pending ?? 0), recovered: a.recovered + Number(c.debt_recovered ?? 0),
        net: a.net + Number(c.net_sales ?? 0)
    }), { cash: 0, card: 0, pending: 0, recovered: 0, net: 0 }), [monthClosings]);
    const lastTotals = lastClosing ? {
        cash: Number(lastClosing.cash_counted ?? 0), card: Number(lastClosing.sales_card ?? 0),
        pending: Number(lastClosing.sales_pending ?? 0), recovered: Number(lastClosing.debt_recovered ?? 0),
        net: Number(lastClosing.net_sales ?? 0)
    } : undefined;
    return (
        <div data-component="HistoryDesktopWorkspace" className="history-desktop-workspace mx-auto hidden w-full min-w-0 flex-col px-3 pb-3 pt-1 lg:flex">
            <div className="mb-3 flex shrink-0 items-baseline gap-4 text-white">
                <h1 className="text-xl font-black">Ventas</h1>
                <span className="text-xs capitalize text-white/60">{monthLabel}</span>
            </div>
            <div className="history-desktop-board grid min-h-0 flex-1 items-start gap-4">
                <div data-element="summary-stack" className="min-h-0 min-w-0">
                    <SummaryCard title="Último cierre" dateText={lastClosing ? format(parseISO(lastClosing.closing_date), "EEEE d 'de' MMMM", { locale: es }) : '—'} report={lastReport} extras={lastTotals}/>
                    <SummaryCard title="Mensual" dateText={monthLabel} report={monthReport} extras={monthTotals}/>
                </div>
                <div data-element="selected-day" className="min-h-0 min-w-0">
                    <section className="history-desktop-day flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-white/40 bg-[var(--color-envolvente-bajo)] text-white">
                        <header className="flex min-h-[34px] shrink-0 items-center justify-between gap-2 border-b border-white/15 px-3">
                            <strong className="truncate text-[10px] font-bold uppercase">{format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}</strong>
                            <span className="shrink-0 text-[10px] text-white/65">{dailyReport?.summary.count ?? 0} tickets</span>
                        </header>
                        <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-white/10 px-3 py-3 text-center">
                            {[
                                ['Ventas', euro(dailyReport?.summary.totalSales)],
                                ['Tickets', String(dailyReport?.summary.count ?? 0)],
                                ['Ticket medio', euro(dailyReport?.summary.avgTicket)]
                            ].map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                    <strong className="block truncate text-sm font-bold tabular-nums">{value}</strong>
                                    <span className="text-[9px] uppercase text-white/65">{label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-3 pt-2 custom-scrollbar">
                            {tickets.map((ticket, i) => (
                                <SalesTicket key={ticket.numero_documento || i} ticket={ticket} items={linesByTicket[ticket.numero_documento] ?? EMPTY_ITEMS}
                                    expanded={expandedTicket === ticket.numero_documento}
                                    onToggle={() => setExpandedTicket(current => current === ticket.numero_documento ? null : ticket.numero_documento)}
                                    loadingItems={linesLoading && !Object.prototype.hasOwnProperty.call(linesByTicket, ticket.numero_documento)}/>
                            ))}
                            {!dayLoading && tickets.length === 0 && <p className="py-8 text-center text-xs text-white/55">Sin tickets en este día.</p>}
                            {dayError && <p className="text-center text-xs text-rose-300">No se pudieron cargar los tickets.</p>}
                            <div ref={loadSentinel} className="shrink-0 text-center text-[10px] text-white/50">{dayLoading ? 'Cargando tickets…' : hasMore ? 'Cargar más tickets' : ''}</div>
                            {hasMore && !dayLoading && <button type="button" onClick={() => setPage(current => current + PAGE_SIZE)} className="text-center text-[10px] text-white/70 underline">Cargar más</button>}
                        </div>
                    </section>
                </div>
                <div data-element="calendar-column" className="flex min-h-0 min-w-0 flex-col">
                    <nav data-element="calendar-navigation" className="flex shrink-0 items-center justify-center gap-2 text-white" aria-label="Cambiar mes de ventas">
                        <button type="button" onClick={() => navigateMonth(-1)} aria-label="Mes anterior" className="rounded p-1.5 hover:bg-white/10"><ChevronLeft size={19}/></button>
                        <strong className="min-w-[128px] text-center text-sm font-semibold capitalize">{monthLabel}</strong>
                        <button type="button" onClick={() => navigateMonth(1)} aria-label="Mes siguiente" className="rounded p-1.5 hover:bg-white/10"><ChevronRight size={19}/></button>
                    </nav>
                    <section data-element="calendar" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radio-control)] border border-zinc-200 bg-white text-zinc-900">
                        <MonthCalendarFrame flush className="history-desktop-month-cal-chrome">
                            <div className="month-cal-weeks history-desktop-cal-weeks" style={{ gridTemplateRows: 'repeat(' + calendarWeeks.length + ',minmax(0,1fr))' }}>
                                {calendarWeeks.map((week, index) => (
                                    <div key={index} className="month-cal-week grid min-h-0 grid-cols-7 border-b border-gray-100 last:border-0">
                                        {week.map(day => {
                                            const iso = format(day, 'yyyy-MM-dd');
                                            const closing = byDate.get(iso);
                                            const dayValue = iso === selectedDate ? Number(dailyReport?.summary.totalSales ?? closing?.tpv_sales ?? 0) : Number(closing?.tpv_sales ?? 0);
                                            return (
                                                <button key={iso} type="button" onClick={() => selectDate(iso)} aria-pressed={iso === selectedDate} aria-label={'Seleccionar ' + iso}
                                                    className={cn('month-cal-cell relative flex min-h-0 min-w-0 flex-col border-r border-gray-100 p-1 last:border-r-0 hover:bg-blue-50/50', !isSameMonth(day, month) && 'opacity-35', iso === selectedDate && 'z-[1] ring-2 ring-inset ring-zinc-900')}>
                                                    <span className="absolute right-1 top-1 text-[9px] font-medium text-gray-400">{format(day, 'd')}</span>
                                                    <div className="flex min-h-0 flex-1 items-center justify-center pt-2">
                                                        {dayValue !== 0 && <strong className="text-[clamp(9px,0.8vw,13px)] font-extrabold tabular-nums">{Math.round(dayValue)}€</strong>}
                                                    </div>
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
