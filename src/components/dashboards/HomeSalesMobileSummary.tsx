'use client';

import { useMemo } from 'react';

type HourlySale = { hora: number; total: number };
export type HomeWidgetTopProduct = { name: string; quantity: number };

export function HomeSalesMobileSummary({
    sales, net, hours, products, loading = false,
}: {
    sales: string;
    net: string;
    hours: HourlySale[];
    products: HomeWidgetTopProduct[];
    loading?: boolean;
}) {
    const chart = useMemo(() => {
        const values = Array.from({ length: 16 }, (_, index) => {
            const hour = index + 7;
            return Math.max(0, Number(hours.find(item => item.hora === hour)?.total ?? 0));
        });
        const maximum = Math.max(1, ...values);
        return values.map((value, index) => {
            const x = index * (160 / 15);
            const y = 19 - (value / maximum) * 15;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
    }, [hours]);

    return (
        <div data-element="mobile-sales-snapshot"
            className="flex min-h-0 w-full flex-1 flex-col justify-between gap-px overflow-hidden px-2 pb-1 pt-0 lg:hidden">
            <svg viewBox="0 0 160 22" preserveAspectRatio="none"
                className="block h-[16px] w-full shrink-0" role="img"
                aria-label="Gráfica de facturación por hora, de las 7 a las 23 horas">
                <path d="M0 20 H160" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.6"/>
                <path d={chart} fill="none" stroke="#8CC5FF" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
            </svg>
            <div className="grid w-full shrink-0 grid-cols-2 gap-1 text-center tabular-nums">
                <div className="min-w-0">
                    <strong className="block truncate text-[clamp(10px,3vw,13px)] font-bold leading-[1.05] text-[var(--home-widget-ink)]"
                        title={sales}>{sales}</strong>
                    <span className="block text-[8px] leading-[1.15] text-[var(--home-widget-ink-secondary)]">Ventas</span>
                </div>
                <div className="min-w-0">
                    <strong className="block truncate text-[clamp(10px,3vw,13px)] font-bold leading-[1.05] text-[var(--home-widget-ink)]"
                        title={net}>{net}</strong>
                    <span className="block text-[8px] leading-[1.15] text-[var(--home-widget-ink-secondary)]">Venta neta</span>
                </div>
            </div>
            <div className="flex h-[13px] w-full shrink-0 items-center gap-1.5 overflow-hidden border-t border-white/10 pt-px text-[8px] leading-none text-[var(--home-widget-ink-secondary)]">
                <span className="shrink-0 font-bold uppercase tracking-wide">Top</span>
                {products.length ? products.slice(0, 2).map((product, index) => (
                    <span key={index} className="min-w-0 flex-1 truncate whitespace-nowrap"
                        title={`${index + 1}. ${product.name} · ${product.quantity} unidades`}>
                        <span className="font-semibold">{index + 1}.</span> {product.name}
                    </span>
                )) : (
                    <span className="min-w-0 truncate">{loading ? 'Cargando productos…' : 'Sin productos registrados'}</span>
                )}
            </div>
        </div>
    );
}
