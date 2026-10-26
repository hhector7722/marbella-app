'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUSINESS_HOURS } from '@/lib/constants';
import { createClient } from '@/utils/supabase/client';

type HourlySale = { hora: number; total: number };
export type HomeWidgetTopProduct = { name: string; quantity: number; revenue: number };
type HourProductResponse = { products?: { nombre_articulo: string | null; cantidad_total: number | null; total_ingresos: number | null }[] };

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
    const chartRef = useRef<HTMLDivElement>(null);
    const [hourSelection, setHourSelection] = useState<{ date: string; hour: number } | null>(null);
    const selectedHour = hourSelection?.date === date ? hourSelection.hour : null;
    const [filteredSnapshot, setFilteredSnapshot] = useState<{ key: string; products: HomeWidgetTopProduct[] } | null>(null);
    const [filterError, setFilterError] = useState<{ key: string } | null>(null);

    // Mismo crossfilter por tramo que el detalle de Ventas; no filtrar solo el top 3.
    const filterKey = selectedHour === null ? '' : `${date}/${selectedHour}`;
    useEffect(() => {
        if (selectedHour === null) return;
        const onPointer = (event: PointerEvent) => {
            if (event.target instanceof Node && chartRef.current?.contains(event.target)) return;
            setHourSelection(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setHourSelection(null);
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [selectedHour]);

    useEffect(() => {
        if (selectedHour === null || !hasSales || !date) return;
        let active = true;
        void supabase.rpc('get_ventas_crossfilter', {
            p_start_date: date, p_end_date: date, p_hour: selectedHour, p_offset: 0, p_limit: 1,
        }).then(({ data, error }) => {
            if (!active) return;
            if (error || !data) {
                console.warn('Filtro horario del widget:', error);
                setFilterError({ key: filterKey });
                return;
            }
            const response = data as HourProductResponse;
            setFilteredSnapshot({
                key: filterKey,
                products: (response.products ?? []).slice(0, 3).map(product => ({
                    name: String(product.nombre_articulo ?? 'Producto'),
                    quantity: Number(product.cantidad_total ?? 0),
                    revenue: Number(product.total_ingresos ?? 0),
                })),
            });
            setFilterError(null);
        });
        return () => { active = false; };
    }, [date, filterKey, hasSales, selectedHour, supabase]);

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

    // El detalle de Ventas muestra tramo seleccionado y los adyacentes;
    // conservar tres filas (también en los extremos del horario).
    const displayHours = useMemo<(HourlySale | null)[]>(() => {
        if (selectedHour === null) return rankedHours;
        return [selectedHour - 1, selectedHour, selectedHour + 1].map(hora => (
            hora < BUSINESS_HOURS.start || hora > BUSINESS_HOURS.end
                ? null
                : hours.find(item => Number(item.hora) === hora) ?? { hora, total: 0 }
        ));
    }, [hours, rankedHours, selectedHour]);
    const displayProducts = selectedHour === null
        ? products.slice(0, 3)
        : filteredSnapshot?.key === filterKey ? filteredSnapshot.products : [];
    const isFiltering = selectedHour !== null && filteredSnapshot?.key !== filterKey && filterError?.key !== filterKey;

    // Reutilizar el crossfilter: unidades de todas las líneas de ticket
    // por cada hora visible, no solo los tickets.
    const unitHours = useMemo(() => displayHours.filter((item): item is HourlySale => item !== null), [displayHours]);
    const hoursSignature = unitHours.map(item => `${item.hora}:${item.total}`).join('|');
    const snapshotKey = `${date}/${hoursSignature}`;
    const [unitSnapshot, setUnitSnapshot] = useState<{ key: string; values: Record<number, number> }>({
        key: '', values: {},
    });

    useEffect(() => {
        if (!hasSales || !date || unitHours.length === 0) return;
        let active = true;
        void Promise.all(unitHours.map(async ({ hora }) => {
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
    }, [date, hasSales, hoursSignature, snapshotKey, supabase, unitHours]);

    const hourUnits = unitSnapshot.key === snapshotKey ? unitSnapshot.values : {};

    const chartData = useMemo(() => {
        const values = Array.from(
            { length: BUSINESS_HOURS.end - BUSINESS_HOURS.start + 1 },
            (_, index) => Math.max(0, Number(hours.find(
                item => Number(item.hora) === BUSINESS_HOURS.start + index,
            )?.total ?? 0)),
        );
        const maximum = Math.max(0, ...values);
        if (maximum === 0) return null;
        const path = values.map((value, index) => {
            const x = (index / Math.max(1, values.length - 1)) * 160;
            const y = 19 - (value / maximum) * 15;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
        return { values, maximum, path };
    }, [hours]);

    const pointIndex = selectedHour === null ? -1 : selectedHour - BUSINESS_HOURS.start;
    const dotPosition = chartData && pointIndex >= 0 && pointIndex < chartData.values.length ? {
        left: `${pointIndex / Math.max(1, chartData.values.length - 1) * 100}%`,
        top: `${(19 - chartData.values[pointIndex] / chartData.maximum * 15) / 22 * 100}%`,
    } : null;

    return (
        <div data-element="mobile-sales-snapshot"
            className="grid min-h-0 w-full flex-1 grid-rows-[16px_16px_minmax(0,1fr)] gap-y-px overflow-hidden px-2 pb-0.5 pt-0 lg:grid">
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
                    <div ref={chartRef} data-element="mobile-sales-hour-chart"
                        className="relative flex h-[16px] w-full shrink-0 items-end">
                        {chartData ? (
                            <>
                                <svg viewBox="0 0 160 22" preserveAspectRatio="none"
                                    className="pointer-events-none block h-[15px] w-full shrink-0" role="img"
                                    aria-label="Gráfica de facturación por hora, de 7 a 23 h">
                                    <path d={chartData.path} fill="none" stroke="#4A9BDD" strokeWidth="1.6"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        vectorEffect="non-scaling-stroke" />
                                </svg>
                                {dotPosition && (
                                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[15px] lg:h-full">
                                        <span data-element="selected-hour-dot"
                                            className="absolute z-[2] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#4A9BDD] shadow-sm"
                                            style={dotPosition} />
                                    </span>
                                )}
                                {chartData.values.map((value, index) => {
                                    const hour = BUSINESS_HOURS.start + index;
                                    const totalSegments = chartData.values.length - 1;
                                    const left = (index === 0 ? 0 : (index - 0.5) / totalSegments) * 100;
                                    const width = (index === 0 || index === totalSegments ? 0.5 : 1) / totalSegments * 100;
                                    return (
                                        <button key={hour} type="button" data-home-sales-chart-trigger
                                            className="absolute inset-y-0 z-[1] cursor-pointer touch-manipulation focus-visible:outline focus-visible:outline-1 focus-visible:outline-sky-400"
                                            style={{ left: `${left}%`, width: `${width}%` }}
                                            onClick={() => setHourSelection(current => current?.date === date && current.hour === hour
                                                ? null : { date, hour })}
                                            aria-pressed={selectedHour === hour}
                                            aria-label={`${hour}h a ${hour + 1}h: ${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€; pulsar para ${selectedHour === hour ? 'quitar' : 'filtrar'}`} />
                                    );
                                })}
                            </>
                        ) : (
                            <span className="w-full text-center text-[8px] text-[var(--home-widget-ink-secondary)]">
                                Sin desglose horario disponible
                            </span>
                        )}
                    </div>
                    <div data-element="mobile-sales-rankings" className="grid w-full min-w-0 grid-cols-2 gap-x-5 tabular-nums">
                        <div data-element="mobile-sales-hours" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] content-start gap-x-1.5 gap-y-0.5 pr-1.5 text-left">
                            {displayHours.map((hour, index) => hour ? (
                                <div key={hour.hora} data-selected-hour={selectedHour === hour.hora ? 'true' : undefined}
                                    className="col-span-3 grid min-w-0 grid-cols-subgrid items-baseline rounded-sm text-[8px] leading-[1.15] data-[selected-hour=true]:bg-sky-500/15"
                                    title={`${hour.hora}h - ${hour.hora + 1}h: ${hourUnits[hour.hora] ?? '—'} unidades · ${hour.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}>
                                    <span className="min-w-0 truncate text-left text-[var(--home-widget-ink)]">
                                        {hour.hora}h - {hour.hora + 1}h
                                    </span>
                                    <span data-element="mobile-sales-units" className="justify-self-end whitespace-nowrap text-right text-[7px]">
                                        {hourUnits[hour.hora] !== undefined ? `${hourUnits[hour.hora].toLocaleString('es-ES')} u` : ''}
                                    </span>
                                    <span data-element="mobile-sales-amount" className="justify-self-end whitespace-nowrap text-right text-[var(--home-widget-ink-secondary)]">{Math.round(hour.total).toLocaleString('es-ES')}€</span>
                                </div>
                            ) : <div key={`empty-hour-${index}`} className="col-span-3" aria-hidden="true" />)}
                        </div>
                        <div data-element="mobile-sales-products" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] content-start gap-x-1.5 gap-y-0.5 text-left">
                            {displayProducts.map((product, index) => (
                                <div key={`${product.name}-${index}`}
                                    className="col-span-3 grid min-w-0 grid-cols-subgrid items-baseline text-[8px] leading-[1.15]"
                                    title={`${product.name}: ${product.quantity} unidades · ${product.revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}>
                                    <span className="min-w-0 truncate text-left text-[var(--home-widget-ink)]">
                                        {index + 1}. {product.name}
                                    </span>
                                    <span data-element="mobile-sales-units" className="justify-self-end whitespace-nowrap text-right text-[7px]">{product.quantity.toLocaleString('es-ES')} u</span>
                                    <span data-element="mobile-sales-amount" className="justify-self-end whitespace-nowrap text-right text-[var(--home-widget-ink-secondary)]">{product.revenue.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€</span>
                                </div>
                            ))}
                            {selectedHour !== null && displayProducts.length === 0 && (
                                <span className="col-span-3 truncate text-[8px] text-[var(--home-widget-ink-secondary)]" role="status">
                                    {isFiltering ? 'Filtrando productos…' : filterError?.key === filterKey
                                        ? 'No se pudieron cargar' : 'Sin productos en este tramo'}
                                </span>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
