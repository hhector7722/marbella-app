import { CLOSING_WEATHER_OPTIONS, weatherIdFromLabel } from '@/lib/cash-closing-weather';

export type ClosingMetricType = 'net_sales' | 'tpv_sales' | 'avg_ticket' | 'tickets_count' | 'cash_counted';

export type LastClosingMetrics = {
    weatherLabel: string | null;
    weatherIcon: string | null;
    tickets: number;
    avgTicket: number;
    tpvSales: number;
    netSales: number;
    salesCard: number;
    cashCounted: number;
    salesPending: number;
    debtRecovered: number;
    difference: number;
};

export function formatCurrencySpanish(val: number): string {
    const isWhole = Math.abs(val - Math.round(val)) < 0.005;
    const formatted = val.toLocaleString('es-ES', {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: 2,
    });
    return `${formatted}€`;
}

/**
 * Único productor de las métricas del último cierre (PRINCIPIOS §3).
 * La card de /dashboard/history y el widget del mosaico Master usan esta misma
 * magnitud, no cada uno la suya.
 */
export function buildLastClosingMetrics(closing: Record<string, unknown> | null): LastClosingMetrics {
    if (!closing) {
        return {
            weatherLabel: null,
            weatherIcon: null,
            tickets: 0,
            avgTicket: 0,
            tpvSales: 0,
            netSales: 0,
            salesCard: 0,
            cashCounted: 0,
            salesPending: 0,
            debtRecovered: 0,
            difference: 0,
        };
    }

    const num = (key: string): number => Number(closing[key] ?? 0);
    const tickets = num('tickets_count');
    const tpvSales = num('tpv_sales');
    const weatherId = weatherIdFromLabel(closing.weather as string | null);
    const weatherOpt = CLOSING_WEATHER_OPTIONS.find((o) => o.id === weatherId);

    return {
        weatherLabel: (closing.weather as string) || null,
        weatherIcon: weatherOpt?.icon ?? null,
        tickets,
        avgTicket: tickets > 0 ? tpvSales / tickets : 0,
        tpvSales,
        netSales: num('net_sales'),
        salesCard: num('sales_card'),
        cashCounted: num('cash_counted'),
        salesPending: num('sales_pending'),
        debtRecovered: num('debt_recovered'),
        difference: num('difference'),
    };
}

/** Cero en lectura se muestra como espacio en blanco: CONTENIDO-Y-TONO §3. */
export function formatClosingValue(val: number, type: ClosingMetricType): string {
    if (type === 'tickets_count') return val === 0 ? ' ' : val.toLocaleString('es-ES');
    if (val === 0) return ' ';
    return formatCurrencySpanish(val);
}

/** Descuadre de cero se muestra: CONTENIDO-Y-TONO §3. */
export function formatClosingDifference(val: number): string {
    return formatCurrencySpanish(val);
}