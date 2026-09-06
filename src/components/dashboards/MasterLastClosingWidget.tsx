'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CloudSun } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { randomId } from '@/lib/random-id';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    buildLastClosingMetrics,
    formatClosingValue,
    formatClosingDifference,
    formatCurrencySpanish,
    type LastClosingMetrics,
} from '@/lib/cash-closing-metrics';

const parseLocalSafe = (dateStr: string | null) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
};

type LastClosingKpi = {
    label: string;
    format: (m: LastClosingMetrics) => string;
};

const PRIMARY_KPIS: readonly LastClosingKpi[] = [
    { label: 'Ventas', format: (m) => formatClosingValue(m.tpvSales, 'tpv_sales') },
    { label: 'Venta neta', format: (m) => formatClosingValue(m.netSales, 'net_sales') },
    { label: 'Tarjeta', format: (m) => formatClosingValue(m.salesCard, 'tpv_sales') },
    { label: 'Efectivo', format: (m) => formatClosingValue(m.cashCounted, 'cash_counted') },
];

const SECONDARY_KPIS: readonly LastClosingKpi[] = [
    { label: 'Pendiente pago', format: (m) => formatClosingValue(m.salesPending, 'tpv_sales') },
    { label: 'Cobros pendientes', format: (m) => formatClosingValue(m.debtRecovered, 'tpv_sales') },
    { label: 'Diferencia', format: (m) => formatClosingDifference(m.difference) },
];

const pillClassName =
    'relative shrink-0 inline-flex items-center justify-center text-[8px] font-black uppercase tracking-wider ' +
    'text-[var(--home-widget-ink)] transition-all active:scale-[0.98] hover:opacity-80 ' +
    'before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']';

/**
 * Último cierre en el mosaico Master: misma magnitud que la card de
 * /dashboard/history (un solo productor, PRINCIPIOS §3). 4×1: cabecera con la
 * fecha, el tiempo y los tickets, y dos bandas de KPIs (4 principales + 3 de
 * diferencia). El cero se muestra como espacio en blanco (CONTENIDO-Y-TONO §3).
 */
export function MasterLastClosingWidget() {
    const supabase = useMemo(() => createClient(), []);
    const [closing, setClosing] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const fetchLastClosing = async () => {
            const { data, error } = await supabase
                .from('cash_closings')
                .select('*')
                .order('closing_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (cancelled) return;
            if (error) {
                console.error(error);
                toast.error('No se pudo cargar el último cierre');
            }
            setClosing((data ?? null) as Record<string, unknown> | null);
            setLoading(false);
        };

        void fetchLastClosing();

        const channel = supabase
            .channel(`master:last-closing:${randomId()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'cash_closings' },
                () => {
                    void fetchLastClosing();
                },
            )
            .subscribe();

        return () => {
            cancelled = true;
            void supabase.removeChannel(channel);
        };
    }, [supabase]);

    const metrics = useMemo(() => buildLastClosingMetrics(closing), [closing]);

    const dateLabel = useMemo(() => {
        if (!closing) return '';
        const raw = format(parseLocalSafe(closing.closing_date as string), 'EEE d MMM', { locale: es });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }, [closing]);

    const renderKpiGrid = (kpis: readonly LastClosingKpi[], gridClass: 'grid-cols-3' | 'grid-cols-4') => (
        <div className={`grid gap-x-1.5 ${gridClass}`}>
            {kpis.map((kpi) => (
                <div key={kpi.label} className="flex min-w-0 flex-col items-center justify-center text-center">
                    <span className="text-[9px] md:text-[10px] tabular-nums leading-none text-[var(--home-widget-ink)]">
                        {kpi.format(metrics)}
                    </span>
                    <span className="mt-1 text-[7px] md:text-[8px] leading-none text-[var(--home-widget-ink-secondary)]">
                        {kpi.label}
                    </span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-1.5">
                <Link href="/dashboard/history" className={pillClassName}>
                    Último cierre
                </Link>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[7px] md:text-[8px] font-medium tabular-nums text-[var(--home-widget-ink-secondary)]">
                    {closing ? <span className="shrink-0">{dateLabel}</span> : null}
                    {metrics.weatherLabel ? (
                        <span className="inline-flex shrink-0 items-center gap-1">
                            {metrics.weatherIcon ? (
                                <img src={metrics.weatherIcon} alt="" className="h-2.5 w-2.5 object-contain" />
                            ) : (
                                <CloudSun size={10} className="shrink-0 opacity-70" aria-hidden />
                            )}
                            <span>{metrics.weatherLabel}</span>
                        </span>
                    ) : null}
                    <span className="shrink-0">
                        {metrics.tickets === 0
                            ? ' '
                            : `${metrics.tickets.toLocaleString('es-ES')} tickets`}
                    </span>
                    <span className="shrink-0">
                        {metrics.avgTicket === 0
                            ? ' '
                            : `${formatCurrencySpanish(metrics.avgTicket)} t medio`}
                    </span>
                </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-y-3 px-2 pb-1.5">
                {loading ? (
                    <div
                        className="flex flex-1 items-center justify-center"
                        role="status"
                        aria-label="Cargando último cierre"
                    >
                        <LoadingSpinner size="sm" className="text-[var(--home-widget-ink)]" />
                    </div>
                ) : !closing ? (
                    <EmptyState instance="master-ultimo-cierre-none" variant="none" title="Sin cierre" />
                ) : (
                    <>
                        {renderKpiGrid(PRIMARY_KPIS, 'grid-cols-4')}
                        {renderKpiGrid(SECONDARY_KPIS, 'grid-cols-3')}
                    </>
                )}
            </div>
        </div>
    );
}