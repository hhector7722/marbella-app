'use client';

import { useMemo } from 'react';
import { BUSINESS_HOURS } from '@/lib/constants';

type HourlySale = { hora: number; total: number };
export type HomeWidgetTopProduct = { name: string; quantity: number; revenue: number };

export function HomeSalesMobileSummary({
    sales, net, hours, products, hasSales,
}: {
    sales: string;
    net: string;
    hours: HourlySale[];
    products: HomeWidgetTopProduct[];
    hasSales: boolean;
}) {
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
            className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-2 pb-1 pt-0 lg:hidden">
            {hasSales && (
                <>
                    <div className="grid w-full shrink-0 grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
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
                        <div className="flex min-w-0 flex-col justify-start gap-0.5 text-left">
                            {rankedHours.map(hour => (
                                <div key={hour.hora} className="flex min-w-0 items-center justify-between gap-1 text-[9px] leading-[1.15]">
                                    <span className="shrink-0 text-[var(--home-widget-ink)]">
                                        {hour.hora}h - {hour.hora + 1}h
                                    </span>
                                    <span className="min-w-0 truncate text-right tabular-nums text-[var(--home-widget-ink-secondary)]"
                                        title={hour.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}>
                                        {Math.round(hour.total).toLocaleString('es-ES')}€
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex min-w-0 flex-col justify-start gap-0.5 text-left">
                            {products.slice(0, 3).map((product, index) => (
                                <div key={`${product.name}-${index}`}
                                    className="flex min-w-0 items-center justify-between gap-1 text-[9px] leading-[1.15]"
                                    title={`${product.name}: ${product.quantity} unidades · ${product.revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}>
                                    <span className="min-w-0 flex-1 truncate text-left text-[var(--home-widget-ink)]">
                                        {index + 1}. {product.name}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-[var(--home-widget-ink-secondary)]">
                                        {product.revenue.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div data-element="mobile-sales-hour-chart" className="mt-auto flex min-h-[18px] w-full shrink-0 items-end">
                        {chart ? (
                            <svg viewBox="0 0 160 22" preserveAspectRatio="none"
                                className="block h-[17px] w-full shrink-0" role="img"
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
                </>
            )}
        </div>
    );
}
