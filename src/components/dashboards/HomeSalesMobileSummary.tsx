'use client';

import { useMemo } from 'react';
import { BUSINESS_HOURS } from '@/lib/constants';

type HourlySale = { hora: number; total: number };
export type HomeWidgetTopProduct = { name: string; quantity: number };

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
                    <div className="grid min-h-0 w-full flex-1 grid-cols-3 items-center gap-x-1.5 tabular-nums">
                        <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center">
                            <div className="min-w-0 w-full">
                                <strong className="block truncate text-[clamp(10px,2.8vw,13px)] font-bold leading-none text-[var(--home-widget-ink)]"
                                    title={sales}>{sales}</strong>
                                <span className="block text-[7px] leading-[1.15] text-[var(--home-widget-ink-secondary)]">Ventas</span>
                            </div>
                            <div className="min-w-0 w-full">
                                <strong className="block truncate text-[clamp(10px,2.8vw,13px)] font-bold leading-none text-[var(--home-widget-ink)]"
                                    title={net}>{net}</strong>
                                <span className="block text-[7px] leading-[1.15] text-[var(--home-widget-ink-secondary)]">Venta neta</span>
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-center">
                            <span className="w-full truncate text-[8px] font-semibold leading-none text-[var(--home-widget-ink-secondary)]">
                                Horas punta
                            </span>
                            {rankedHours.map((hour) => (
                                <span key={hour.hora}
                                    className="w-full truncate text-[8px] leading-[1.15] text-[var(--home-widget-ink)]"
                                    title={`${hour.hora}:00 · ${hour.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}>
                                    {hour.hora}h · {Math.round(hour.total).toLocaleString('es-ES')}€
                                </span>
                            ))}
                        </div>
                        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-center">
                            <span className="w-full truncate text-[8px] font-semibold leading-none text-[var(--home-widget-ink-secondary)]">
                                Productos top
                            </span>
                            {products.slice(0, 3).map((product, index) => (
                                <span key={`${product.name}-${index}`}
                                    className="w-full truncate text-[8px] leading-[1.15] text-[var(--home-widget-ink)]"
                                    title={`${index + 1}. ${product.name} · ${product.quantity} unidades`}>
                                    {index + 1}. {product.name}
                                </span>
                            ))}
                        </div>
                    </div>
                    {chart && (
                        <svg viewBox="0 0 160 22" preserveAspectRatio="none"
                            className="mt-auto block h-[13px] w-full shrink-0" role="img"
                            aria-label="Gráfica de facturación por hora, de 7 a 23 h">
                            <path d={chart} fill="none" stroke="#8CC5FF" strokeWidth="1.6"
                                strokeLinecap="round" strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke" />
                        </svg>
                    )}
                </>
            )}
        </div>
    );
}
