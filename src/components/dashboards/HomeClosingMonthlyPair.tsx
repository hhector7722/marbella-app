'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, endOfMonth, format, isAfter, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { formatCurrencySpanish, formatNumberSpanish } from '@/lib/cash-closing-metrics';
import { MasterLastClosingWidget } from './MasterLastClosingWidget';

type MonthlySnapshot = {
    key: string;
    sales: number;
    net: number | null;
    tickets: number;
    average: number;
    daily: number | null;
    closingDays: number;
};

function MonthlyMetric({ label, value, tone, title }: {
    label: string;
    value: string;
    tone?: 'sales' | 'net';
    title?: string;
}) {
    return (
        <div data-metric={tone} title={title}
            className={'flex h-fit w-max max-w-full min-w-0 flex-col items-start justify-center rounded-md px-1 py-0.5 ' + (
                tone === 'sales' ? 'border border-sky-400/25 bg-sky-500/10'
                    : tone === 'net' ? 'border border-emerald-400/25 bg-emerald-500/10'
                        : '')}>
            <span className="block whitespace-nowrap text-[7px] leading-tight text-white/65">{label}</span>
            <strong className={'block whitespace-nowrap leading-tight tracking-tight text-white ' +
                (tone ? 'text-[clamp(8px,1.8vw,13px)] font-bold' : 'text-[clamp(8px,1.4vw,10px)] font-semibold')}
                title={value}>{value}</strong>
        </div>
    );
}

function HomeMonthlySalesWidget() {
    const supabase = useMemo(() => createClient(), []);
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [snapshot, setSnapshot] = useState<MonthlySnapshot | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');
    const key = monthStart + ':' + monthEnd;
    const isCurrentMonth = format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM');
    const visible = snapshot?.key === key ? snapshot : null;
    const failed = errorKey === key;

    const refresh = useCallback(async (signal?: AbortSignal) => {
        // Reutilizar las mismas fuentes que el resumen mensual de /dashboard/ventas.
        // La RPC contiene todas las facturas del periodo, independientemente del cierre.
        const [ticketsResult, closingsResult] = await Promise.all([
            supabase.rpc('get_ventas_crossfilter', {
                p_start_date: monthStart, p_end_date: monthEnd, p_limit: 1,
            }),
            supabase.from('cash_closings')
                .select('closing_date,closed_at,tpv_sales,net_sales')
                .gte('closing_date', monthStart).lte('closing_date', monthEnd)
                .order('closed_at', { ascending: true }),
        ]);
        if (signal?.aborted) return;
        if (ticketsResult.error) {
            console.warn('No se pudieron cargar las ventas mensuales', ticketsResult.error);
            setErrorKey(key);
            return;
        }
        const summary = (ticketsResult.data as { summary?: { totalSales?: number; count?: number } } | null)?.summary;
        if (!summary) {
            setErrorKey(key);
            return;
        }
        const sales = Number(summary.totalSales ?? 0);
        const tickets = Number(summary.count ?? 0);
        // Un cierre por día; nunca duplicar cierres si un día se reabre.
        const unique = new Map<string, { tpv_sales: number; net_sales: number }>();
        for (const c of closingsResult.data ?? []) {
            unique.set(String(c.closing_date), {
                tpv_sales: Number(c.tpv_sales ?? 0),
                net_sales: Number(c.net_sales ?? 0),
            });
        }
        const positiveDays = [...unique.values()].filter(item => item.tpv_sales > 0);
        const closingDays = positiveDays.length;
        const closedSales = positiveDays.reduce((sum, item) => sum + item.tpv_sales, 0);
        setSnapshot({
            key, sales, net: closingsResult.error ? null :
                [...unique.values()].reduce((sum, item) => sum + item.net_sales, 0),
            tickets, average: tickets > 0 ? sales / tickets : 0,
            daily: closingDays ? closedSales / closingDays : null,
            closingDays,
        });
        setErrorKey(null);
    }, [supabase, monthStart, monthEnd, key]);

    useEffect(() => {
        const controller = new AbortController();
        // Evitar un setState síncrono dentro de useEffect y cancelar consultas obsoletas.
        const initial = window.setTimeout(() => { void refresh(controller.signal); }, 0);
        // El mes abierto se actualiza automáticamente; meses históricos son estáticos.
        if (!isCurrentMonth) return () => { controller.abort(); window.clearTimeout(initial); };
        const interval = window.setInterval(() => { void refresh(controller.signal); }, 90_000);
        return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(interval); };
    }, [refresh, isCurrentMonth]);

    return (
        <section data-element="monthly-half"
            className="flex h-full min-h-0 min-w-0 flex-col justify-center gap-1 px-1.5 py-1 text-white tabular-nums"
            aria-label="Resumen mensual de ventas">
            <div className="flex h-[15px] shrink-0 items-center justify-center gap-0.5">
                <button type="button" aria-label="Mes anterior" title="Mes anterior"
                    onClick={() => setMonth(value => subMonths(value, 1))}
                    className="shrink-0 rounded p-0.5 text-white/75 hover:bg-white/10"><ChevronLeft size={12}/></button>
                <span className="whitespace-nowrap text-center text-[10px] font-bold capitalize leading-none text-white">
                    {format(month, 'MMMM yyyy', { locale: es })}
                </span>
                <button type="button" aria-label="Mes siguiente" title="Mes siguiente"
                    disabled={isCurrentMonth || isAfter(addMonths(month, 1), startOfMonth(new Date()))}
                    onClick={() => setMonth(value => addMonths(value, 1))}
                    className="shrink-0 rounded p-0.5 text-white/75 hover:bg-white/10 disabled:opacity-25"><ChevronRight size={12}/></button>
            </div>
            {!visible && !failed ? (
                <p role="status" className="flex flex-1 items-center justify-center text-[10px] text-white/65">Cargando mes…</p>
            ) : !visible && failed ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
                    <span className="text-[10px] text-amber-200">Error al cargar el mes</span>
                    <button type="button" onClick={() => void refresh()} className="text-[10px] underline">Reintentar</button>
                </div>
            ) : visible ? (
                <>
                    <div className="grid min-h-0 grid-cols-2 items-start gap-0.5">
                        <div className="flex min-w-0 justify-center"><MonthlyMetric label="Ventas" value={formatCurrencySpanish(visible.sales)} tone="sales"/></div>
                        <div className="flex min-w-0 justify-center"><MonthlyMetric label="Venta neta" value={visible.net === null ? '—' : formatCurrencySpanish(visible.net)}
                            tone="net" title="Ventas netas de los cierres registrados. El día abierto puede estar pendiente de cierre."/></div>
                    </div>
                    <div className="grid min-w-0 grid-cols-3 items-start gap-0.5 text-left [&>div]:!items-start [&>div]:!justify-start [&>div]:!text-left">
                        <MonthlyMetric label="Media" value={visible.daily === null ? '—' : formatCurrencySpanish(visible.daily)}
                            title={`Media de ventas entre los ${visible.closingDays} días con cierre y ventas positivas`}/>
                        <MonthlyMetric label="Tickets" value={formatNumberSpanish(visible.tickets)}/>
                        <MonthlyMetric label="T. medio" value={visible.tickets ? formatCurrencySpanish(visible.average) : '—'}/>
                    </div>
                </>
            ) : null}
        </section>
    );
}

/** Un solo hueco de HomeScreen, dividido en dos tarjetas iguales: no desplaza horarios ni accesos. */
export function HomeClosingMonthlyPair() {
    return (
        <div data-element="home-closing-monthly-pair" className="grid h-full min-h-0 w-full grid-cols-2 gap-2">
            <section data-element="closing-half" className="min-h-0 min-w-0 overflow-hidden">
                <MasterLastClosingWidget compact/>
            </section>
            <div data-element="monthly-container" className="min-h-0 min-w-0 overflow-hidden">
                <HomeMonthlySalesWidget/>
            </div>
        </div>
    );
}
