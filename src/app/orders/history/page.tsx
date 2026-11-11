'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileText } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { SearchField } from '@/components/ui/SearchField';
import type { Tables } from '@/types/supabase';

const PAGE_SIZE = 25;

type OrderRow = Pick<
    Tables<'purchase_orders'>,
    'id' | 'order_number' | 'supplier_name' | 'created_at' | 'order_date' |
    'total_items' | 'dispatched_at' | 'pdf_url'
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
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatQuantity(value: number): string {
    return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

export default function OrdersHistoryPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [search, setSearch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(0);
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [hasNext, setHasNext] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [selected, setSelected] = useState<OrderRow | null>(null);
    const [items, setItems] = useState<OrderItemRow[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    useEffect(() => {
        const timeout = window.setTimeout(() => setSearchTerm(search.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [search]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError(null);

            const safe = searchTerm.slice(0, 80).replace(/[,%()\\]/g, ' ').trim();
            let request = supabase
                .from('purchase_orders')
                .select('id, order_number, supplier_name, created_at, order_date, total_items, dispatched_at, pdf_url');

            if (safe) {
                request = request.or(
                    'supplier_name.ilike.%' + safe + '%,order_number.ilike.%' + safe + '%'
                );
            }

            const { data, error: queryError } = await request
                .order('created_at', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

            if (!active) return;
            if (queryError) {
                setOrders([]);
                setHasNext(false);
                setError('No se pudo cargar el historial de pedidos.');
            } else {
                setOrders((data ?? []).slice(0, PAGE_SIZE));
                setHasNext((data?.length ?? 0) > PAGE_SIZE);
            }
            setLoading(false);
        };
        void load();
        return () => { active = false; };
    }, [supabase, searchTerm, page, reloadKey]);

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
        setPage(0);
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
                    placeholder="Buscar proveedor o número..."
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

                {loading ? (
                    <div role="status" className="flex min-h-[220px] flex-col items-center justify-center gap-3">
                        <LoadingSpinner size="lg" />
                        <p className="text-sm text-zinc-500">Cargando pedidos...</p>
                    </div>
                ) : !error && orders.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-500">
                        {searchTerm ? 'No hay pedidos que coincidan con la búsqueda.' : 'Todavía no hay pedidos registrados.'}
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {orders.map(order => (
                            <button
                                key={order.id}
                                type="button"
                                onClick={() => openDetails(order)}
                                className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left transition-colors hover:bg-zinc-50"
                                aria-label={'Consultar pedido ' + (order.order_number ?? '') + ' de ' + (order.supplier_name ?? 'proveedor')}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-zinc-800">
                                        {order.supplier_name || 'Proveedor sin nombre'}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-zinc-500">
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
                                <ChevronRight size={17} className="shrink-0 text-zinc-400" aria-hidden />
                            </button>
                        ))}
                    </div>
                )}

                {!error && (page > 0 || hasNext) && (
                    <div className="flex items-center justify-between gap-3 py-3">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="orders-history-previous"
                            disabled={loading || page === 0}
                            onClick={() => setPage(value => Math.max(0, value - 1))}
                        >
                            Anterior
                        </Button>
                        <span className="text-xs tabular-nums text-zinc-500">
                            Página {page + 1}
                        </span>
                        <Button
                            type="button"
                            variant="secondary"
                            instance="orders-history-next"
                            disabled={loading || !hasNext}
                            onClick={() => setPage(value => value + 1)}
                        >
                            Siguiente
                        </Button>
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
