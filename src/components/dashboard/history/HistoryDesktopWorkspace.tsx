'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, format, isSameMonth, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CloudSun, Pencil } from 'lucide-react';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import type { Tables } from '@/types/supabase';
import { getCashClosingPhotoUrlsAction } from '@/app/actions/cash-closing-photos';
import { buildLastClosingMetrics, formatClosingDifference, formatClosingValue, formatCurrencySpanish } from '@/lib/cash-closing-metrics';
import { cn } from '@/lib/utils';

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

const currency = (v: number | null | undefined) => formatCurrencySpanish(Number(v ?? 0));
const timeLine = (date: string) => format(parseISO(date), "EEEE d 'de' MMMM", { locale: es });

function HistoryDesktopDailyCard({
    date, closing, selected, onSelect, onOpen, expectedSales,
}: {
    date: string;
    closing: HistoryDesktopClosing | null;
    selected: boolean;
    onSelect: () => void;
    onOpen: () => void;
    expectedSales: number;
}) {
    const [photos, setPhotos] = useState<{ dataphoneUrl: string | null; bdpUrl: string | null }>({
        dataphoneUrl: null, bdpUrl: null,
    });

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
            data-selected={selected ? 'true' : 'false'}
            className={cn('history-desktop-day relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radio-control)] border transition-opacity', selected ? 'border-white/55 bg-[rgb(6_20_49/0.72)] opacity-100' : 'border-white/15 bg-[rgb(5_17_44/0.55)] opacity-[0.47] hover:opacity-80')}
        >
            <div className="flex min-h-[29px] shrink-0 items-center justify-between gap-2 border-b border-white/15 bg-[rgb(8_26_60/0.72)] px-3 py-1 text-white">
                <button
                    type="button"
                    className="min-w-0 truncate text-left text-[10px] font-bold uppercase tracking-wide text-white"
                    onClick={onSelect}
                    aria-current={selected ? 'date' : undefined}
                    aria-label={`Seleccionar ${timeLine(date)}`}
                >
                    {timeLine(date)}
                    <span className="ml-2 text-[8px] font-normal normal-case text-white/50">Detalle de cierre</span>
                </button>
                <div className="flex shrink-0 items-center gap-2 text-[9px] text-white/55">
                    {closing?.weather ? <span className="inline-flex items-center gap-1"><CloudSun size={12} />{closing.weather}</span> : null}
                    {values ? <span>{values.tickets} tickets</span> : null}
                    {values && values.avgTicket > 0 ? <span>{currency(values.avgTicket)} ticket medio</span> : null}
                    {closing ? (
                        <button type="button" onClick={onOpen} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white" aria-label={`Abrir detalle completo del ${timeLine(date)}`} title="Abrir detalle completo">
                            <Pencil size={14} aria-hidden />
                        </button>
                    ) : null}
                </div>
            </div>
            {closing && values ? (
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(105px,0.78fr)] gap-2 px-3 py-2 text-white">
                    <div className="flex min-w-0 flex-col justify-center gap-1">
                        {metrics.slice(0, 4).map(([name, val]) => (
                            <div key={name} className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-0.5">
                                <span className="truncate text-[9px] font-semibold uppercase text-white/75">{name}</span>
                                <strong className="shrink-0 text-[11px] tabular-nums">{currency(val)}</strong>
                            </div>
                        ))}
                    </div>
                    <div className="flex min-w-0 flex-col justify-center gap-1">
                        {metrics.slice(4).map(([name, val]) => (
                            <div key={name} className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-0.5">
                                <span className="truncate text-[9px] font-semibold uppercase text-white/75">{name}</span>
                                <strong className="shrink-0 text-[11px] tabular-nums">{currency(val)}</strong>
                            </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-0.5">
                            <span className="text-[9px] font-semibold uppercase text-white/75">Diferencia</span>
                            <strong className={cn('text-[11px] tabular-nums', values.difference > 0 ? 'text-emerald-300' : values.difference < 0 ? 'text-rose-300' : '')}>{currency(values.difference)}</strong>
                        </div>
                        {expectedSales > 0 ? (
                            <div className="pt-1 text-center text-[8px] text-white/50">
                                Esperado: {currency(expectedSales)}
                                <span className="ml-1">· {((values.netSales - expectedSales) / expectedSales * 100).toFixed(0)}%</span>
                            </div>
                        ) : null}
                    </div>
                    <div className="grid min-h-0 grid-cols-2 gap-2">
                        {([
                            ['bdpUrl', 'Informe TPV', 'bdp_closing_ticket_photo_path'],
                            ['dataphoneUrl', 'Totales datáfonos', 'dataphone_totals_photo_path'],
                        ] as const).map(([photoKey, label, pathKey]) => (
                            <button
                                type="button" key={photoKey} onClick={onOpen}
                                className="flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-white/5 p-1.5 hover:bg-white/10"
                                aria-label={`Ver ${label.toLowerCase()} del ${timeLine(date)}`}
                            >
                                {photos[photoKey] ? (
                                    <img src={photos[photoKey]!} alt="" loading="lazy" className="max-h-[75px] min-h-0 w-full flex-1 object-contain" />
                                ) : (
                                    <span className="flex flex-1 items-center text-center text-[9px] text-white/45">{closing[pathKey] ? 'Cargando imagen…' : 'Sin imagen'}</span>
                                )}
                                <span className="text-center text-[8px] font-bold uppercase leading-tight text-white/65">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <button type="button" onClick={onSelect} className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-white/55">
                    Sin cierre registrado · Seleccionar este día
                </button>
            )}
        </article>
    );
}

function HistoryDesktopSummary({ title, subtitle, metrics, onClick }: {
    title: string; subtitle?: string; metrics: { label: string; value: string }[]; onClick?: () => void;
}) {
    return (
        <section className="history-desktop-summary rounded-[var(--radio-control)] border border-white/25 bg-[rgb(15_40_85/0.65)] px-4 py-3 text-white">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold">{title}</h2>
                {subtitle ? <span className="truncate text-[9px] text-white/50">{subtitle}</span> : null}
                {onClick ? <button type="button" onClick={onClick} className="ml-auto text-[10px] text-white/65 underline-offset-2 hover:text-white hover:underline">Ver detalle</button> : null}
            </div>
            <div className="grid grid-cols-4 gap-2">
                {metrics.map(({ label, value }) => (
                    <div key={label} className="flex min-w-0 flex-col items-center justify-center text-center">
                        <strong className="max-w-full truncate text-[clamp(10px,0.9vw,15px)] font-black tabular-nums">{value}</strong>
                        <span className="text-[8px] font-semibold uppercase leading-tight text-white/60">{label}</span>
                    </div>
                ))}
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
    const selected = useMemo(() => parseISO(selectedDate), [selectedDate]);
    const days = useMemo(() => [addDays(selected, -1), selected, addDays(selected, 1)], [selected]);
    const monthly = useMemo(() => ({
        card: monthlyClosings.reduce((sum, row) => sum + Number(row.sales_card ?? 0), 0),
        cash: monthlyClosings.reduce((sum, row) => sum + Number(row.cash_counted ?? 0), 0),
        pending: monthlyClosings.reduce((sum, row) => sum + Number(row.sales_pending ?? 0), 0),
        recovered: monthlyClosings.reduce((sum, row) => sum + Number(row.debt_recovered ?? 0), 0),
        difference: monthlyClosings.reduce((sum, row) => sum + Number(row.difference ?? 0), 0),
    }), [monthlyClosings]);
    const last = buildLastClosingMetrics(lastClosing ? { ...lastClosing } : null);
    const monthlyKpis = [
        { label: 'Ventas', value: currency(summary.totalGross) },
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
                    <button type="button" className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/10" onClick={onMonthlySales}>Ventas del mes</button>
                    <button type="button" className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/10" onClick={onPeriodPerformance}>Rendimiento</button>
                    <button type="button" className="rounded-md border border-white/35 px-3 py-1 text-xs text-white hover:bg-white/10" onClick={onShowTable}>Tabla</button>
                </div>
            </div>
            <div className="history-desktop-board grid min-h-0 flex-1 gap-4">
                <div data-element="day-stack" className="grid min-h-0 grid-rows-3 gap-3">
                    {days.map((day, index) => {
                        const dayIso = format(day, 'yyyy-MM-dd');
                        const closing = getClosingForDate(dayIso);
                        return (
                            <HistoryDesktopDailyCard
                                key={dayIso}
                                date={dayIso}
                                closing={closing}
                                selected={index === 1}
                                onSelect={() => onSelectDate(dayIso)}
                                onOpen={() => { if (closing) onOpenClosing(closing); }}
                                expectedSales={closing ? getExpectedSales(day) : 0}
                            />
                        );
                    })}
                </div>
                <div data-element="side-widgets" className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
                    <HistoryDesktopSummary title="Mensual" subtitle={monthLabel} metrics={monthlyKpis} onClick={onMonthlySales} />
                    <HistoryDesktopSummary title="Último cierre" subtitle={lastClosing ? timeLine(lastClosing.closing_date) : undefined} metrics={lastKpis} onClick={lastClosing ? () => onOpenClosing(lastClosing) : undefined} />
                    {/* Mismo componente y cromo del calendario móvil de Cierres:
                        panel blanco, cabecera roja y cifras negras. Es un selector,
                        no abre el modal hasta pulsar una de las tarjetas de la izquierda. */}
                    <section data-element="calendar" className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radio-control)] border border-zinc-200 bg-white text-zinc-900">
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
                            <h2 className="text-sm font-bold text-zinc-900">Calendario</h2>
                            <div className="flex items-center gap-1">
                                <button type="button" onClick={onPrevMonth} className="rounded-md p-1 text-zinc-700 hover:bg-zinc-100" aria-label="Mes anterior">
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="min-w-[112px] text-center text-[11px] font-semibold capitalize text-zinc-800">
                                    {format(startOfMonth(viewMonth), 'MMMM yyyy', { locale: es })}
                                </span>
                                <button type="button" onClick={onNextMonth} className="rounded-md p-1 text-zinc-700 hover:bg-zinc-100" aria-label="Mes siguiente">
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
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
