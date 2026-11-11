'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { SearchField } from '@/components/ui/SearchField';
import type { Tables } from '@/types/supabase';

const FETCH_BATCH = 500;
const BUSINESS_TIME_ZONE = 'Europe/Madrid';

type OrderRow = Pick<
    Tables<'purchase_orders'>,
    'id' | 'order_number' | 'supplier_name' | 'created_at' | 'order_date' |
    'total_items' | 'dispatched_at' | 'pdf_url' | 'created_by'
>;

type OrderItemRow = Pick<
    Tables<'purchase_order_items'>,
    'id' | 'ingredient_name' | 'quantity' | 'unit'
>;

function formatOrderDate(value: string | null): string {
    if (!value) return 'Fecha desconocida';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
    return new Intl.DateTimeFormat('es-ES', {
        timeZone: BUSINESS_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

type CreatorName = { short: string; full: string };
type MonthGroup = { key: string; label: string; orders: OrderRow[] };

function normalized(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function orderDate(order: OrderRow): Date {
    return new Date(order.created_at ?? order.order_date);
}

function localDateParts(date: Date): { year: string; month: string; day: string } {
    const parts = new Intl.DateTimeFormat('es-ES', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
    return { year: get('year'), month: get('month'), day: get('day') };
}

function monthInfo(date: Date): { key: string; label: string } {
    if (Number.isNaN(date.getTime())) return { key: 'unknown', label: 'Fecha desconocida' };
    const { year, month } = localDateParts(date);
    const label = new Intl.DateTimeFormat('es-ES', {
        timeZone: BUSINESS_TIME_ZONE,
        month: 'long',
        year: 'numeric',
    }).format(date);
    return { key: year + '-' + month, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

function matchesOrderSearch(order: OrderRow, tokens: string[]): boolean {
    if (tokens.length === 0) return true;
    const date = orderDate(order);
    const dates: string[] = [];
    if (!Number.isNaN(date.getTime())) {
        const { year, month, day } = localDateParts(date);
        const monthName = new Intl.DateTimeFormat('es-ES', {
            timeZone: BUSINESS_TIME_ZONE, month: 'long',
        }).format(date);
        dates.push(
            day + '/' + month + '/' + year,
            day + '/' + month + '/' + year.slice(-2),
            day + '/' + month,
            day + '-' + month + '-' + year,
            year + '-' + month + '-' + day,
            month + '/' + year,
            year + '-' + month,
            monthName + ' ' + year,
            day + ' ' + monthName + ' ' + year,
            formatOrderDate(order.created_at ?? order.order_date),
        );
    }

    const text = normalized([
        order.supplier_name ?? '',
        order.order_number ?? '',
        ...dates,
    ].join(' '));

    return tokens.every(token => text.includes(token));
}

function formatQuantity(value: number): string {
    return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

export default function OrdersHistoryPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [search, setSearch] = useState('');
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [creatorNames, setCreatorNames] = useState<Record<string, CreatorName>>({});
    const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [namesWarning, setNamesWarning] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const [selected, setSelected] = useState<OrderRow | null>(null);
    const [items, setItems] = useState<OrderItemRow[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError(null);
            setNamesWarning(false);

            try {
                const allOrders: OrderRow[] = [];
                let offset = 0;

                // Leer todas las páginas para agrupar los meses completos, no solo 25 filas.
                while (true) {
                    const { data, error: queryError } = await supabase
                        .from('purchase_orders')
                        .select('id, order_number, supplier_name, created_at, order_date, total_items, dispatched_at, pdf_url, created_by')
                        .order('created_at', { ascending: false })
                        .range(offset, offset + FETCH_BATCH - 1);
                    if (queryError) throw queryError;
                    const batch = data ?? [];
                    allOrders.push(...batch);
                    if (batch.length < FETCH_BATCH) break;
                    offset += FETCH_BATCH;
                }

                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name');

                if (!active) return;
                const names: Record<string, CreatorName> = {};
                for (const profile of profiles ?? []) {
                    const first = profile.first_name?.trim() ?? '';
                    const last = profile.last_name?.trim() ?? '';
                    names[profile.id] = {
                        short: first || last || 'Nombre no disponible',
                        full: [first, last].filter(Boolean).join(' ') || 'Nombre no disponible',
                    };
                }
                setCreatorNames(names);
                setNamesWarning(Boolean(profilesError));
                setOrders(allOrders);
            } catch (queryError) {
                if (!active) return;
                console.error('Error cargando historial de pedidos:', queryError);
                setOrders([]);
                setError('No se pudo cargar el historial de pedidos.');
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [supabase, reloadKey]);

    const months = useMemo((): MonthGroup[] => {
        const tokens = normalized(search).split(/\s+/).filter(Boolean);
        const grouped = new Map<string, MonthGroup>();

        for (const order of orders) {
            if (!matchesOrderSearch(order, tokens)) continue;
            const month = monthInfo(orderDate(order));
            const group = grouped.get(month.key);
            if (group) {
                group.orders.push(order);
            } else {
                grouped.set(month.key, { ...month, orders: [order] });
            }
        }

        return Array.from(grouped.values());
    }, [orders, search]);

    useEffect(() => {
        if (!selected) return;
        let active = true;
        const load = async () => {
            const { data, error: queryError } = await supabase
                .from('purchase_order_items')
                .select('id, ingredient_name, quantity, unit')
                .eq('purchase_order_id', selected.id)
                .order('created_at', { ascending: true });

            if (!active) return;
            setItems(data ?? []);
            setDetailError(queryError ? 'No se pudieron consultar los productos del pedido.' : null);
            setDetailLoading(false);
        };
        void load();
        return () => { active = false; };
    }, [selected, supabase]);

    const openDetails = (order: OrderRow) => {
        setItems([]);
        setDetailError(null);
        setDetailLoading(true);
        setSelected(order);
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setExpandedMonths({});
    };

    const toggleMonth = (key: string) => {
        setExpandedMonths(previous => ({
            ...previous,
            [key]: !(previous[key] ?? Boolean(search.trim())),
        }));
    };

    const getCreatorName = (order: OrderRow, full = false): string => {
        const name = creatorNames[order.created_by ?? ''];
        return (full ? name?.full : name?.short) ?? 'Autor no disponible';
    };

    const pdfUrl = selected?.pdf_url?.startsWith('https://') ? selected.pdf_url : null;

    return (
        <DashboardDetailLayout
            title="Historial de pedidos"
            backHref="/orders/new"
            maxWidthClass="max-w-4xl"
            template="list"
            work="table"
            rightSlot={
                <Button
                    type="button"
                    variant="secondary"
                    instance="orders-history-new"
                    onClick={() => router.push('/orders/new')}
                >
                    Pedido nuevo
                </Button>
            }
            toolbarSlot={
                <SearchField
                    instance="orders-history-search"
                    placeholder="Buscar fecha o proveedor..."
                    value={search}
                    onChange={handleSearchChange}
                />
            }
        >
            <div className="flex min-w-0 flex-col gap-2">
                {error && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                        {error}
                        <button
                            type="button"
                            className="ml-3 font-semibold underline"
                            onClick={() => setReloadKey(value => value + 1)}
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {namesWarning && !loading && !error && (
                    <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        No se han podido cargar los nombres de los autores.
                    </p>
                )}

                {loading ? (
                    <div role="status" className="flex min-h-[220px] flex-col items-center justify-center gap-3">
                        <LoadingSpinner size="lg" />
                        <p className="text-sm text-zinc-500">Cargando pedidos...</p>
                    </div>
                ) : !error && months.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-500">
                        {search.trim() ? 'No hay pedidos que coincidan con la búsqueda.' : 'Todavía no hay pedidos registrados.'}
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {months.map(month => {
                            const expanded = expandedMonths[month.key] ?? Boolean(search.trim());
                            return (
                                <section key={month.key} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                                    <button
                                        type="button"
                                        aria-expanded={expanded}
                                        aria-controls={'orders-month-' + month.key}
                                        onClick={() => toggleMonth(month.key)}
                                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-zinc-800">{month.label}</p>
                                            <p className="mt-0.5 text-xs text-zinc-500">
                                                {month.orders.length} {month.orders.length === 1 ? 'pedido' : 'pedidos'}
                                            </p>
                                        </div>
                                        <ChevronDown
                                            size={18}
                                            aria-hidden
                                            className={'shrink-0 text-zinc-500 transition-transform ' + (expanded ? 'rotate-180' : '')}
                                        />
                                    </button>

                                    {expanded && (
                                        <div id={'orders-month-' + month.key} className="flex flex-col gap-1 border-t border-zinc-100 bg-zinc-50/60 p-2">
                                            {month.orders.map(order => (
                                                <button
                                                    key={order.id}
                                                    type="button"
                                                    onClick={() => openDetails(order)}
                                                    className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-3 text-left transition-colors hover:bg-zinc-50"
                                                    aria-label={'Consultar pedido ' + (order.order_number ?? '') + ' de ' + (order.supplier_name ?? 'proveedor') + ', realizado por ' + getCreatorName(order)}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                            <span className="min-w-0 break-words text-sm font-bold text-zinc-800">
                                                                {order.supplier_name || 'Proveedor sin nombre'}
                                                            </span>
                                                            <span className="text-xs font-semibold text-zinc-500">
                                                                · {getCreatorName(order)}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-zinc-500">
                                                            {order.order_number || 'Pedido sin número'} · {formatOrderDate(order.created_at ?? order.order_date)}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="text-xs font-semibold tabular-nums text-zinc-700">
                                                            {order.total_items ?? 0} productos
                                                        </p>
                                                        <p className="mt-1 text-[11px] text-zinc-500">
                                                            {order.dispatched_at ? 'Tramitado' : 'Generado'}
                                                        </p>
                                                    </div>
                                                    <ChevronRight size={16} className="shrink-0 text-zinc-400" aria-hidden />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>

            {selected && (
                <Modal
                    open
                    onClose={() => setSelected(null)}
                    title={selected.order_number || 'Detalle del pedido'}
                    variant="standard"
                    layer="base"
                    instance="orders-history-detail"
                    usageId="orders-history-detail"
                    usageLabel="Consulta de pedido generado"
                >
                    <div className="flex min-w-0 flex-col gap-4">
                        <div>
                            <p className="text-sm font-bold text-zinc-800">{selected.supplier_name || 'Proveedor sin nombre'}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                                {formatOrderDate(selected.created_at ?? selected.order_date)}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-zinc-700">
                                Realizado por: {getCreatorName(selected, true)}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                                {selected.dispatched_at
                                    ? 'Tramitado el ' + formatOrderDate(selected.dispatched_at)
                                    : 'Pedido generado'}
                            </p>
                        </div>

                        {detailLoading ? (
                            <div role="status" className="flex justify-center py-10">
                                <LoadingSpinner size="lg" />
                            </div>
                        ) : detailError ? (
                            <p role="alert" className="text-sm text-red-600">{detailError}</p>
                        ) : (
                            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-zinc-200">
                                <div className="grid grid-cols-[minmax(0,1fr)_72px_74px] gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500">
                                    <span>Producto</span>
                                    <span className="text-right">Cantidad</span>
                                    <span className="text-right">Unidad</span>
                                </div>
                                {items.map(item => (
                                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_72px_74px] items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs last:border-b-0">
                                        <span className="min-w-0 break-words text-zinc-700">{item.ingredient_name || 'Producto sin nombre'}</span>
                                        <span className="text-right font-semibold tabular-nums text-zinc-800">{formatQuantity(item.quantity)}</span>
                                        <span className="min-w-0 truncate text-right text-zinc-600" title={item.unit}>{item.unit}</span>
                                    </div>
                                ))}
                                {items.length === 0 && (
                                    <p className="px-3 py-6 text-center text-xs text-zinc-500">No constan productos en este pedido.</p>
                                )}
                            </div>
                        )}

                        {pdfUrl ? (
                            <Button
                                type="button"
                                variant="primary"
                                instance="orders-history-pdf"
                                onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                            >
                                Abrir PDF original
                            </Button>
                        ) : (
                            <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
                                <FileText size={16} className="mt-0.5 shrink-0" aria-hidden />
                                El PDF original ya no está disponible. Los productos y las cantidades del pedido permanecen guardados en este historial.
                            </p>
                        )}
                    </div>
                </Modal>
            )}
        </DashboardDetailLayout>
    );
}
