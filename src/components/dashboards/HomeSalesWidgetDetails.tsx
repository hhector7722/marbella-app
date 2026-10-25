'use client';

import { BUSINESS_HOURS } from '@/lib/constants';

export type HomeRankingProduct = {
    nombre_articulo: string;
    cantidad_total: number;
};

export function HomeTopProducts({ products }: { products: HomeRankingProduct[] }) {
    const top = products.slice(0, 4);
    return (
        <div data-element="home-top-products" className="min-w-0 shrink-0 border-t border-[var(--home-widget-separator)] px-2 pt-0.5 lg:mt-1 lg:px-3 lg:pt-1.5">
            <div className="hidden text-[10px] font-semibold text-[var(--home-widget-ink-secondary)] lg:block">Productos más vendidos</div>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[9px] leading-3 text-[var(--home-widget-ink-secondary)] lg:hidden">
                {top.length ? top.slice(0, 2).map((p, i) => (
                    <span key={i} className="min-w-0 max-w-[50%] truncate" title={p.nombre_articulo}>
                        <span className="font-bold">{i + 1}.</span> {p.nombre_articulo}
                    </span>
                )) : <span className="opacity-60">Sin productos registrados</span>}
            </div>
            <div className="hidden min-w-0 flex-col gap-0.5 pt-1 lg:flex">
                {top.length ? top.map((p, i) => (
                    <div key={i} className="flex min-w-0 items-center gap-2 border-b border-[var(--home-widget-separator)] py-0.5 text-[11px] last:border-0">
                        <span className="w-3 shrink-0 tabular-nums text-[var(--home-widget-ink-secondary)]">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate text-[var(--home-widget-ink)]" title={p.nombre_articulo}>{p.nombre_articulo}</span>
                        <span className="shrink-0 tabular-nums text-[var(--home-widget-ink-secondary)]">{Number(p.cantidad_total).toLocaleString('es-ES')} u</span>
                    </div>
                )) : <span className="text-[11px] text-[var(--home-widget-ink-secondary)]">Sin productos registrados</span>}
            </div>
        </div>
    );
}

export function HomeHourlySalesChart({ hours }: { hours: { hora: number; total: number }[] }) {
    const start = BUSINESS_HOURS.start;
    const end = BUSINESS_HOURS.end;
    const values = Array.from({ length: end - start + 1 }, (_, i) =>
        Number(hours.find(h => h.hora === start + i)?.total ?? 0)
    );
    const max = Math.max(1, ...values);
    const points = values.map((v, i) => {
        const x = (i / Math.max(1, values.length - 1)) * 160;
        const y = 26 - Math.max(0, v) / max * 22;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return (
        <div data-element="home-hour-chart" className="w-full min-w-0 shrink-0 px-2 lg:px-3" aria-label="Facturación por horas, de 7 a 23 h">
            <svg viewBox="0 0 160 30" preserveAspectRatio="none"
                className="block h-3 w-full text-ds-marca lg:h-7" role="img"
                aria-label="Gráfica de ventas por hora">
                <path d={`M ${points.join(' L ')}`} fill="none" stroke="currentColor"
                    strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"/>
            </svg>
            <div className="hidden justify-between text-[9px] leading-none text-[var(--home-widget-ink-secondary)] lg:flex">
                <span>7 h</span><span>23 h</span>
            </div>
        </div>
    );
}
