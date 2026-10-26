'use client';

import { useEffect, useMemo, useState } from 'react';
import { BUSINESS_HOURS } from '@/lib/constants';
import { createClient } from '@/utils/supabase/client';

type HourlySale = { hora: number; total: number };
export type HomeWidgetTopProduct = { name: string; quantity: number; revenue: number };

export function HomeSalesMobileSummary({
    sales, net, date, hours, products, hasSales,
}: {
    sales: string;
    net: string;
    date: string;
    hours: HourlySale[];
    products: HomeWidgetTopProduct[];
    hasSales: boolean;
}) {
    const supabase = useMemo(() => createClient(), []);

    const rankedHours = useMemo(() =>
        hours
            .filter(item =>
                item.hora >= BUSINESS_HOURS.start &&
                item.hora <= BUSINESS_HOURS.end &&
                Number(item.total) > 0
            )
            .sort((a, b) => Number(b.total) - Number(a.total))
            .slice(0, 3),
    [hours]);

    // Reutilizar el crossfilter: suma las unidades de todas las líneas de ticket
    // por tramo horario, no el número de tickets.
    const hoursSignature = rankedHours.map(item => `${item.hora}:${item.total}`).join('|');
    const snapshotKey = `${date}/${hoursSignature}`;
    const [unitSnapshot, setUnitSnapshot] = useState<{ key: string; values: Record<number, number> }>({
        key: '', values: {},
    });

    useEffect(() => {
        if (!hasSales || !date || rankedHours.length === 0) return;
        let active = true;
        void Promise.all(rankedHours.map(async ({ hora }) => {
            const { data, error } = await supabase.rpc('get_ventas_crossfilter', {
                p_start_date: date, p_end_date: date, p_hour: hora, p_offset: 0, p_limit: 1,
            });
            if (error) {
                console.warn('Unidades por franja horaria:', error);
                return null;
            }
            const result = data as { products?: { cantidad_total?: number | null }[] } | null;
            const units = (result?.products ?? []).reduce(
                (sum, item) => sum + Number(item.cantidad_total ?? 0), 0,
            );
            return { hora, units };
        })).then(results => {
            if (!active) return;
            const values: Record<number, number> = {};
            for (const item of results) {
                if (item) values[item.hora] = item.units;
            }
            setUnitSnapshot({ key: snapshotKey, values });
        });
        return () => { active = false; };
    }, [date, hasSales, hoursSignature, rankedHours, snapshotKey, supabase]);

    const hourUnits = unitSnapshot.key === snapshotKey ? unitSnapshot.values : {};

    const chart = useMemo(() => {
        const values = Array.from(
            { length: BUSINESS_HOURS.end - BUSINESS_HOURS.start + 1 },
            (_, index) => Math.max(
                0,
                Number(hours.find(item => item.hora === BUSINESS_HOURS.start + index)?.total ?? 0),
            ),
        );
        const maximum = Math.max(0, ...values);
        if (maximum === 0) return null;

        return values.map((value, index) => {
            const x = (index / Math.max(1, values.length - 1)) * 160;
            const y = 19 - (value / maximum) * 15;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
    }, [hours]);

    return (
        <div data-element="mobile-sales-snapshot"
            className="grid min-h-0 w-full flex-1 grid-rows-[16px_16px_minmax(0,1fr)] gap-y-0.5 overflow-hidden px-2 pb-1 pt-0.5 lg:grid">
            {hasSales && (
                <>
                    <div className="grid w-full shrink-0 grid-cols-2 gap-2 tabular-nums">
                        <div className="flex min-w-0 items-center justify-between gap-1 rounded-md border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5">
                            <span className="shrink-0 text-[9px] font-medium leading-none text-[var(--home-widget-ink-secondary)]">Ventas</span>
                            <strong className="min-w-0 truncate text-right text-[10px] font-bold leading-none text-[var(--home-widget-ink)]"
                                title={sales}>{sales}</strong>
                        </div>
                        <div className="flex min-w-0 items-center justify-between gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5">
                            <span className="shrink-0 text-[9px] font-medium leading-none text-[var(--home-widget-ink-secondary)]">Venta neta</span>
                            <strong className="min-w-0 truncate text-right text-[10px] font-bold leading-none text-[var(--home-widget-ink)]"
                                title={net}>{net}</strong>
                        </div>
                    </div>
                    <div data-element="mobile-sales-hour-chart" className="flex h-[16px] w-full shrink-0 items-end">
                        {chart ? (
                            <svg viewBox="0 0 160 22" preserveAspectRatio="none"
                                className="block h-[15px] w-full shrink-0" role="img"
                                aria-label="Gráfica de facturación por hora, de 7 a 23 h">
                                <path d={chart} fill="none" stroke="#4A9BDD" strokeWidth="1.6"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke" />
                            </svg>
                        ) : (
                            <span className="w-full text-center text-[8px] text-[var(--home-widget-ink-secondary)]">
                                Sin desglose horario disponible
                            </span>
                        )}
                    </div>
                    <div data-element="mobile-sales-rankings" className="grid w-full min-w-0 grid-cols-2 gap-x-5 tabular-nums">
                        <div className="flex min-w-0 flex-col justify-start gap-0.5 text-left">
                            {rankedHours.map(hour => (
                                <div key={hour.hora}
                                    className="flex min-w-0 items-center justify-start gap-3.5 leading-[1.15]"
                                    title={`${hour.hora}h - ${hour.hora + 1}h: ${hourUnits[hour.hora] ?? '—'} unidades · ${hour.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}>
                                    <span className="shrink-0 text-[9px] text-[var(--home-widget-ink)]">
                                        {hour.hora}h - {hour.hora + 1}h
                                    </span>
                                    <span className="flex min-w-0 items-baseline gap-2.5 whitespace-nowrap text-[var(--home-widget-ink-secondary)]">
                                        {hourUnits[hour.hora] !== undefined && (
                                            <span data-element="mobile-sales-units" className="text-[7px]">{hourUnits[hour.hora].toLocaleString('es-ES')} u</span>
                                        )}
                                        <span className="text-[9px]">{Math.round(hour.total).toLocaleString('es-ES')}€</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex min-w-0 flex-col justify-start gap-0.5 text-left">
                            {products.slice(0, 3).map((product, index) => (
                                <div key={`${product.name}-${index}`}
                                    className="flex min-w-0 items-center justify-between gap-1 text-[8px] leading-[1.15]"
                                    title={`${product.name}: ${product.quantity} unidades · ${product.revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}>
                                    <span className="min-w-0 flex-1 truncate text-left text-[var(--home-widget-ink)]">
                                        {index + 1}. {product.name}
                                    </span>
                                    <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap text-right text-[var(--home-widget-ink-secondary)]">
                                        <span data-element="mobile-sales-units" className="text-[7px]">{product.quantity.toLocaleString('es-ES')} u</span>
                                        <span className="text-[8px]">{product.revenue.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
