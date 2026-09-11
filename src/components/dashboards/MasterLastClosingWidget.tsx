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
import { Modal } from '@/components/ui/modal';
import { CashBreakdownModal } from '@/components/cash/CashBreakdownModal';
import { BUSINESS_HOURS } from '@/lib/constants';
import { getBusinessHourFromTicket, cn } from '@/lib/utils';
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

function hourToSlotLabel(h: number): string | null {
    if (h >= 7 && h <= 22) {
        const start = `${String(h).padStart(2, '0')}:00`;
        const end = `${String(h + 1).padStart(2, '0')}:00`;
        return `${start} - ${end}`;
    }
    if (h === 23) return '23:00 - 24:00';
    return null;
}

type LastClosingKpi = {
    label: string;
    format: (m: LastClosingMetrics) => string;
};

const PRIMARY_KPIS: readonly LastClosingKpi[] = [
    { label: 'Ventas', format: (m) => formatClosingValue(m.tpvSales, 'tpv_sales') },
    { label: 'Venta neta', format: (m) => formatClosingValue(m.netSales, 'net_sales') },
];

const SECONDARY_KPIS: readonly LastClosingKpi[] = [
    { label: 'Tarjeta', format: (m) => formatClosingValue(m.salesCard, 'tpv_sales') },
    { label: 'Efectivo', format: (m) => formatClosingValue(m.cashCounted, 'cash_counted') },
    { label: 'Diferencia', format: (m) => formatClosingDifference(m.difference) },
];

const pillClassName =
    'relative shrink-0 inline-flex items-center justify-center text-[8px] lg:text-[10px] font-black uppercase tracking-wider ' +
    'text-[var(--home-widget-ink)] transition-all active:scale-[0.98] hover:opacity-80 ' +
    'before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']';

/**
 * Último cierre en el mosaico Master: misma magnitud que la card de
 * /dashboard/history (un solo productor, PRINCIPIOS §3). 4×1: cabecera con la
 * fecha, el tiempo y los tickets, y dos bandas de KPIs (Ventas + Venta neta, y
 * Tarjeta + Efectivo + Diferencia). El cero se muestra como espacio en blanco
 * (CONTENIDO-Y-TONO §3).
 */
export function MasterLastClosingWidget() {
    const supabase = useMemo(() => createClient(), []);
    const [closing, setClosing] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);

    // Modals states
    const [isCashModalOpen, setIsCashModalOpen] = useState(false);
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [salesModalLoading, setSalesModalLoading] = useState(false);
    const [salesProducts, setSalesProducts] = useState<any[]>([]);
    const [salesChartData, setSalesChartData] = useState<{ hora: number; total: number }[]>([]);
    const [topHours, setTopHours] = useState<any[]>([]);
    const [salesSummary, setSalesSummary] = useState({ totalSales: 0, count: 0, avgTicket: 0 });

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

    const titleDate = useMemo(() => {
        if (!closing) return '';
        const d = parseLocalSafe(closing.closing_date as string);
        return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee d MMM', { locale: es });
    }, [closing]);

    const fetchSalesData = async (rawClosingDate: string) => {
        const closingDate = rawClosingDate.split('T')[0];
        setSalesModalLoading(true);
        try {
            // 1. Fetch top 5 products ranking
            const { data: productsData, error: productsError } = await supabase.rpc('get_product_sales_ranking', {
                p_start_date: closingDate,
                p_end_date: closingDate,
                p_start_time: null,
                p_end_time: null,
            });

            if (productsError) {
                console.error("Error fetching products ranking:", productsError);
            }
            const ranking = (productsData || []).map((p: any, idx: number) => ({
                ...p,
                rank: idx + 1,
            })).slice(0, 5);
            setSalesProducts(ranking);

            // 2. Fetch tickets for hourly calculations and top 3 hours
            const { data: ticketsData, error: ticketsError } = await supabase
                .from('tickets_marbella')
                .select('hora_cierre, total_documento, fecha')
                .eq('fecha', closingDate);

            if (ticketsError) {
                console.error("Error fetching tickets:", ticketsError);
            }

            // Aggregate hourly sales
            const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
            const ticketsList = ticketsData || [];
            ticketsList.forEach((t: any) => {
                const hour = getBusinessHourFromTicket(t);
                hourly[hour].total += Number(t.total_documento) || 0;
            });
            setSalesChartData(hourly);

            // Calculate hourSlotsRows
            const map = new Map<string, { count: number; sum: number }>();
            for (const t of ticketsList) {
                const h = getBusinessHourFromTicket(t);
                const label = hourToSlotLabel(h);
                if (!label) continue;
                const amt = Number(t.total_documento) || 0;
                const prev = map.get(label) ?? { count: 0, sum: 0 };
                prev.count += 1;
                prev.sum += amt;
                map.set(label, prev);
            }
            const rows: any[] = [];
            for (const [label, { count, sum }] of map) {
                if (count === 0) continue;
                rows.push({
                    label,
                    cant: count,
                    media: sum / count,
                    total: sum
                });
            }
            rows.sort((a, b) => b.total - a.total);
            setTopHours(rows.slice(0, 3));

            // Calculate KPIs
            const totalSales = ticketsList.reduce((acc: number, t: any) => acc + (Number(t.total_documento) || 0), 0);
            const count = ticketsList.length;
            const avgTicket = count > 0 ? totalSales / count : 0;
            setSalesSummary({ totalSales, count, avgTicket });

        } catch (err) {
            console.error("Error fetching sales data for closing date:", err);
            toast.error("Error al cargar detalles de ventas");
        } finally {
            setSalesModalLoading(false);
        }
    };

    const cashTotal = Number(closing?.cash_counted ?? 0);
    const displayBreakdown = (closing?.breakdown ?? {}) as Record<string, any>;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-1.5 lg:px-3 lg:pt-2">
                <Link href="/dashboard/history" className={pillClassName}>
                    Último cierre
                </Link>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[7px] md:text-[8px] lg:text-[10px] font-medium tabular-nums text-[var(--home-widget-ink-secondary)]">
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
            <div className="flex min-h-0 flex-1 flex-col justify-start px-2 pb-3.5 pt-3 lg:px-3 lg:pb-3 lg:pt-0">
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
                    <div className="flex flex-col gap-y-2.5 lg:gap-y-2 w-full">
                        {/* Primera fila: Ventas y Venta neta alineados matemáticamente con los midpoints de la segunda fila */}
                        <div className="grid grid-cols-6 gap-x-1 w-full">
                            {/* Ventas: col-start-2 col-span-2 (centrado a 1/3 del ancho, entre Tarjeta y Efectivo) */}
                            {(() => {
                                const kpi = PRIMARY_KPIS[0];
                                const handleClick = () => {
                                    if (closing?.closing_date) {
                                        void fetchSalesData(closing.closing_date as string);
                                        setIsSalesModalOpen(true);
                                    }
                                };
                                return (
                                    <div
                                        onClick={handleClick}
                                        className="col-start-2 col-span-2 flex min-w-0 flex-col items-center justify-center text-center select-none cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all relative before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleClick();
                                            }
                                        }}
                                    >
                                        <span className="font-bold tabular-nums leading-none text-[12px] md:text-[14px] lg:text-[20px] text-[var(--home-widget-ink)]">
                                            {kpi.format(metrics)}
                                        </span>
                                        <span className="mt-1 text-[9px] md:text-[10px] lg:text-[12px] leading-none text-[var(--home-widget-ink-secondary)]">
                                            {kpi.label}
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* Venta neta: col-start-4 col-span-2 (centrado a 2/3 del ancho, entre Efectivo y Diferencia) */}
                            {(() => {
                                const kpi = PRIMARY_KPIS[1];
                                return (
                                    <div
                                        className="col-start-4 col-span-2 flex min-w-0 flex-col items-center justify-center text-center select-none"
                                    >
                                        <span className="font-bold tabular-nums leading-none text-[12px] md:text-[14px] lg:text-[20px] text-[var(--home-widget-ink)]">
                                            {kpi.format(metrics)}
                                        </span>
                                        <span className="mt-1 text-[9px] md:text-[10px] lg:text-[12px] leading-none text-[var(--home-widget-ink-secondary)]">
                                            {kpi.label}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Segunda fila: Tarjeta, Efectivo, Diferencia — valor arriba, etiqueta debajo */}
                        <div className="grid grid-cols-3 gap-x-1 w-full">
                            {SECONDARY_KPIS.map((kpi) => {
                                const isClickable = kpi.label === 'Efectivo';
                                const handleClick = () => {
                                    if (kpi.label === 'Efectivo') {
                                        setIsCashModalOpen(true);
                                    }
                                };

                                return (
                                    <div
                                        key={kpi.label}
                                        onClick={isClickable ? handleClick : undefined}
                                        className={cn(
                                            "flex min-w-0 flex-col items-center justify-center text-center select-none",
                                            isClickable && "cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all relative before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                                        )}
                                        role={isClickable ? "button" : undefined}
                                        tabIndex={isClickable ? 0 : undefined}
                                        onKeyDown={isClickable ? (e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleClick();
                                            }
                                        } : undefined}
                                    >
                                        <span className="font-bold tabular-nums leading-none text-[9px] md:text-[11px] lg:text-[15px] text-[var(--home-widget-ink)]">
                                            {kpi.format(metrics)}
                                        </span>
                                        <span className="mt-0.5 text-[8px] md:text-[9px] lg:text-[11px] leading-none text-[var(--home-widget-ink-secondary)]">
                                            {kpi.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Desglose Monetario de Efectivo */}
            <CashBreakdownModal
                isOpen={isCashModalOpen}
                onClose={() => setIsCashModalOpen(false)}
                breakdown={displayBreakdown}
                date={closing?.closing_date as string}
                total={cashTotal}
                layer="base"
                instance="master-last-closing-cash-breakdown"
            />

            {/* Modal Resumen de Ventas */}
            <Modal
                open={isSalesModalOpen}
                onClose={() => setIsSalesModalOpen(false)}
                variant="compact"
                layer="base"
                instance="master-last-closing-sales-summary"
                title="Resumen de Ventas"
                subtitle={titleDate}
                scheme="dark"
                scrollContent={true}
            >
                <div className="text-white flex flex-col min-h-full select-none">
                    <div className="p-4 flex flex-col flex-1">
                        {salesModalLoading ? (
                            <div className="flex justify-center items-center py-16 flex-1">
                                <LoadingSpinner size="lg" className="text-white" />
                            </div>
                        ) : (
                        <>
                            {/* KPIs */}
                            <div className="grid grid-cols-3 mb-3 shrink-0">
                                <div className="flex flex-col items-center justify-center text-center">
                                    <span className="text-base md:text-xl font-black tabular-nums leading-none text-white">
                                        {salesSummary.totalSales > 0 ? `${salesSummary.totalSales.toFixed(2)}€` : " "}
                                    </span>
                                    <span className="text-[6.5px] md:text-[8px] font-black text-white/60 uppercase tracking-widest mt-0.5">Ventas Totales</span>
                                </div>

                                <div className="flex flex-col items-center justify-center text-center border-l border-white/10">
                                    <span className="text-base md:text-xl font-black tabular-nums leading-none text-white">
                                        {salesSummary.count > 0 ? salesSummary.count : " "}
                                    </span>
                                    <span className="text-[6.5px] md:text-[8px] font-black text-white/60 uppercase tracking-widest mt-0.5">Nº Tickets</span>
                                </div>

                                <div className="flex flex-col items-center justify-center text-center border-l border-white/10 italic">
                                    <span className="text-base md:text-xl font-black tabular-nums leading-none text-white">
                                        {salesSummary.avgTicket > 0 ? `${salesSummary.avgTicket.toFixed(2)}€` : " "}
                                    </span>
                                    <span className="text-[6.5px] md:text-[8px] font-black text-white/60 uppercase tracking-widest mt-0.5">Ticket Medio</span>
                                </div>
                            </div>

                            {/* Horizonal Graph */}
                            {(() => {
                                const rangeData = salesChartData.slice(BUSINESS_HOURS.start, BUSINESS_HOURS.end + 1);
                                const maxMain = Math.max(...rangeData.map(d => d.total), 0);
                                const scaleMax = Math.max(maxMain, 1);
                                const hasData = maxMain > 0;
                                if (!hasData) return null;
                                const numPoints = rangeData.length;
                                const toPath = (data: { hora: number; total: number }[]) => {
                                    const pts = data.map((d, i) => {
                                        const x = (i / (numPoints - 1 || 1)) * 120;
                                        const y = 22 - (d.total / scaleMax) * 18;
                                        return `${x},${y}`;
                                    });
                                    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
                                };
                                return (
                                    <div className="w-full mb-3 shrink-0">
                                        <div className="w-full relative">
                                            <svg viewBox="0 0 120 24" className="w-full h-6 block select-none" preserveAspectRatio="none">
                                                <path
                                                    d={toPath(rangeData)}
                                                    fill="none"
                                                    stroke="white"
                                                    strokeWidth="2"
                                                    strokeLinecap="butt"
                                                    strokeLinejoin="miter"
                                                    vectorEffect="non-scaling-stroke"
                                                />
                                            </svg>
                                        </div>
                                        <div className="flex justify-between px-0 text-[8px] font-mono text-white/60 leading-none select-none pointer-events-none mt-0.5">
                                            <span>7h</span>
                                            <span>23h</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Tables Container */}
                            <div className="flex flex-col gap-4 mt-3">
                                {/* Top 5 Products */}
                                <div>
                                    <h3 className="text-[10px] font-black uppercase text-white/70 tracking-wider mb-1.5">
                                        Top 5 Productos
                                    </h3>
                                    {salesProducts.length === 0 ? (
                                        <p className="text-[10px] text-white/40 font-medium italic">No hay productos registrados.</p>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/10 text-[8px] font-black uppercase text-white/40">
                                                    <th className="pb-1 w-[55%]">Producto</th>
                                                    <th className="pb-1 text-center w-[15%]">Cant</th>
                                                    <th className="pb-1 text-center w-[15%]">Media</th>
                                                    <th className="pb-1 text-right w-[15%]">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-bold text-[10px] text-white/70">
                                                {salesProducts.map((prod, idx) => (
                                                    <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                                        <td className="py-1 text-white truncate max-w-[150px]">
                                                            <span className="text-white/35 tabular-nums">{prod.rank} </span>
                                                            {prod.nombre_articulo}
                                                        </td>
                                                        <td className="py-1 text-center text-white/60 tabular-nums">
                                                            {Number(prod.cantidad_total).toFixed(0)}
                                                        </td>
                                                        <td className="py-1 text-center text-white/50 tabular-nums">
                                                            {Number(prod.precio_medio).toFixed(1)}€
                                                        </td>
                                                        <td className="py-1 text-right font-black tabular-nums text-emerald-400">
                                                            {Number(prod.total_ingresos).toFixed(1)}€
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Top 3 Hours */}
                                <div className="border-t border-white/10 pt-3">
                                    <h3 className="text-[10px] font-black uppercase text-white/70 tracking-wider mb-1.5">
                                        Horas con más Facturación
                                    </h3>
                                    {topHours.length === 0 ? (
                                        <p className="text-[10px] text-white/40 font-medium italic">No hay registros horarios.</p>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-white/10 text-[8px] font-black uppercase text-white/40">
                                                    <th className="pb-1 w-[45%]">Horas</th>
                                                    <th className="pb-1 text-center w-[15%]">Cant</th>
                                                    <th className="pb-1 text-center w-[20%]">Media</th>
                                                    <th className="pb-1 text-right w-[20%]">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-bold text-[10px] text-white/70">
                                                {topHours.map((row, idx) => (
                                                    <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                                        <td className="py-1 font-mono font-bold text-white tabular-nums">
                                                            {row.label}
                                                        </td>
                                                        <td className="py-1 text-center text-white/70 tabular-nums">
                                                            {row.cant}
                                                        </td>
                                                        <td className="py-1 text-center text-white/50 tabular-nums">
                                                            {row.media.toFixed(1)}€
                                                        </td>
                                                        <td className="py-1 text-right font-black tabular-nums text-emerald-400">
                                                            {row.total.toFixed(1)}€
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}