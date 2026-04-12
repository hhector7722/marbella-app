"use client";

import { useState, useMemo, useLayoutEffect, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useKDS } from '@/hooks/useKDS';
import { CommandCard } from './CommandCard';
import { Loader2, Package, ListChecks, Check, X } from 'lucide-react';
import { KDSOrder } from './types';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Máximo de comandas por fila (pantalla ancha). */
const KDS_MAX_COLS = 4;
/** Ancho de reserva hasta medir la tarjeta real (evita filas vacías en el primer paint). */
const KDS_MIN_CARD_PX = 200;

/** Cache-bust al sustituir `public/icons/riel.png` (porta comandas). */
const RIEL_PNG_VERSION = '20260412c';

const KDS_BG = '#5A5D60';
const KDS_FOOTER_BG = '#484b4e';

type KdsAggregatedLine = { key: string; nombre: string; notas: string | null; cantidad: number };

const FOOTER_CHIP_MIN_PX = 104;
const FOOTER_GAP_PX = 8;
const FOOTER_VER_MAS_MIN_PX = 80;

function maxProductChipsFit(rowWidth: number, totalItems: number): { show: number; verMas: boolean } {
    if (totalItems <= 0) return { show: 0, verMas: false };
    if (rowWidth <= 0) return { show: Math.min(4, totalItems), verMas: totalItems > 4 };
    const needAll = totalItems * FOOTER_CHIP_MIN_PX + Math.max(0, totalItems - 1) * FOOTER_GAP_PX;
    if (needAll <= rowWidth) return { show: totalItems, verMas: false };
    for (let k = totalItems - 1; k >= 1; k--) {
        const w =
            k * FOOTER_CHIP_MIN_PX +
            Math.max(0, k - 1) * FOOTER_GAP_PX +
            FOOTER_GAP_PX +
            FOOTER_VER_MAS_MIN_PX;
        if (w <= rowWidth) return { show: k, verMas: true };
    }
    return { show: Math.min(1, totalItems), verMas: totalItems > 1 };
}

function KDSFooterProductChips({
    items,
    onOpen,
}: {
    items: KdsAggregatedLine[];
    onOpen: () => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState<{ show: number; verMas: boolean }>({ show: 8, verMas: false });

    const recalc = useCallback(() => {
        const el = rowRef.current;
        if (!el || items.length === 0) {
            setLayout({ show: 0, verMas: false });
            return;
        }
        setLayout(maxProductChipsFit(el.clientWidth, items.length));
    }, [items.length]);

    useLayoutEffect(() => {
        recalc();
        const el = rowRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => recalc());
        ro.observe(el);
        return () => ro.disconnect();
    }, [recalc]);

    const { show, verMas } = layout;
    const shown = verMas ? items.slice(0, show) : items;

    return (
        <div
            ref={rowRef}
            className="flex min-h-[3.25rem] w-full min-w-0 flex-1 flex-nowrap items-stretch gap-2 overflow-hidden py-0.5"
        >
            {shown.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={onOpen}
                    className={cn(
                        'flex min-h-[48px] min-w-[100px] shrink-0 flex-col justify-center rounded-xl px-2.5 py-1.5 text-left transition',
                        'bg-black/20 hover:bg-black/30 active:scale-[0.99]',
                        'max-w-[200px] flex-[1_0_104px]'
                    )}
                    title={`${item.nombre} ×${item.cantidad}`}
                >
                    <span className="truncate text-xs font-black uppercase tracking-[0.06em] text-white/95 sm:text-sm">
                        {item.nombre}
                    </span>
                    <span className="font-black tabular-nums text-white/85 text-base sm:text-lg">×{item.cantidad}</span>
                </button>
            ))}
            {verMas && (
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex min-h-[48px] min-w-[80px] shrink-0 items-center justify-center rounded-xl bg-black/25 px-2 text-xs font-black uppercase tracking-[0.12em] text-white/90 hover:bg-black/35"
                >
                    Ver más
                </button>
            )}
        </div>
    );
}

/**
 * Agrupa comandas en filas: hasta KDS_MAX_COLS, mientras que la suma de anchos
 * (medidos o fallback) no supere el ancho disponible. El flex usa gap-0; justify-evenly reparte el hueco sobrante.
 */
function packOrdersIntoRows(
    orders: KDSOrder[],
    widthById: Record<string, number>,
    availablePx: number,
    fallbackWidth: number
): KDSOrder[][] {
    if (orders.length === 0) return [];
    const avail = Math.max(1, availablePx);
    const wOf = (o: KDSOrder) => widthById[o.id] ?? fallbackWidth;

    const rows: KDSOrder[][] = [];
    let i = 0;
    while (i < orders.length) {
        const row: KDSOrder[] = [];
        let sum = 0;
        while (i < orders.length && row.length < KDS_MAX_COLS) {
            const o = orders[i];
            const w = wOf(o);
            if (row.length === 0) {
                row.push(o);
                sum = w;
                i++;
                if (w > avail) break;
                continue;
            }
            if (sum + w <= avail) {
                row.push(o);
                sum += w;
                i++;
            } else {
                break;
            }
        }
        rows.push(row);
    }
    return rows;
}

function KDSCardCell({
    order,
    onMeasuredWidth,
    children,
}: {
    order: KDSOrder;
    onMeasuredWidth: (id: string, w: number) => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const w = Math.ceil(entries[0]?.contentRect.width ?? 0);
            if (w > 0) onMeasuredWidth(order.id, w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [order.id, onMeasuredWidth]);
    return (
        <div
            ref={ref}
            className="shrink-0 w-fit max-w-[min(92vw,48rem)] min-w-0 self-start"
        >
            {children}
        </div>
    );
}

/** Riel + filas: hasta 4 comandas/fila según ancho disponible + anchos medidos de cada tarjeta. */
function KDSOrderRowsLayout({
    sortedOrders,
    renderCommandCard,
}: {
    sortedOrders: KDSOrder[];
    renderCommandCard: (order: KDSOrder) => ReactNode;
}) {
    const measureRef = useRef<HTMLDivElement>(null);
    const [availableWidth, setAvailableWidth] = useState(0);
    const [cardWidths, setCardWidths] = useState<Record<string, number>>({});

    const [widthFallback] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1024
    );

    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            setAvailableWidth(el.clientWidth);
        });
        ro.observe(el);
        setAvailableWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const ids = new Set(sortedOrders.map((o) => o.id));
        setCardWidths((prev) => {
            let dirty = false;
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                if (!ids.has(k)) {
                    delete next[k];
                    dirty = true;
                }
            }
            return dirty ? next : prev;
        });
    }, [sortedOrders]);

    const handleCardWidth = useCallback((id: string, w: number) => {
        setCardWidths((prev) => {
            if (prev[id] === w) return prev;
            return { ...prev, [id]: w };
        });
    }, []);

    const avail = availableWidth > 0 ? availableWidth : widthFallback;

    const layoutRows = useMemo(
        () =>
            sortedOrders.length === 0
                ? []
                : packOrdersIntoRows(sortedOrders, cardWidths, avail, KDS_MIN_CARD_PX),
        [sortedOrders, cardWidths, avail]
    );

    return (
        <div ref={measureRef} className="w-full min-w-0">
            {layoutRows.length > 0 && (
                <div className="flex flex-col gap-y-10 w-full">
                    {layoutRows.map((row, rowIdx) => (
                        <div
                            key={`row-${row.map((o) => o.id).join('-')}-${rowIdx}`}
                            className="flex flex-col w-full min-w-0"
                        >
                            {/*
                              Porta comandas: `riel.png` más ancha que la pantalla (recorte lateral
                              con overflow-hidden). Comandas debajo; -mt + z-index = efecto sujeta comandas.
                            */}
                            <div
                                className={cn(
                                    'relative z-20 w-screen max-w-[100vw] shrink-0 overflow-hidden',
                                    'left-1/2 -translate-x-1/2'
                                )}
                            >
                                <img
                                    src={`/icons/riel.png?v=${RIEL_PNG_VERSION}`}
                                    alt=""
                                    className="pointer-events-none relative left-1/2 block h-[min(120px,26vw)] w-[152vw] max-w-none -translate-x-1/2 select-none object-cover object-bottom"
                                    draggable={false}
                                />
                            </div>
                            {/*
                              justify-evenly: hueco en filas con 1–4 comandas. z-10 < riel para el “clip” visual.
                            */}
                            <div
                                className={cn(
                                    'relative z-10 w-screen max-w-[100vw] left-1/2 -translate-x-1/2',
                                    'flex flex-row flex-nowrap justify-evenly items-start',
                                    '-mt-[clamp(22px,6.5vw,52px)] pt-0 px-1 sm:px-2 gap-0'
                                )}
                            >
                                {row.map((order) => (
                                    <KDSCardCell
                                        key={order.id}
                                        order={order}
                                        onMeasuredWidth={handleCardWidth}
                                    >
                                        {renderCommandCard(order)}
                                    </KDSCardCell>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function KDSView() {
    const { orders, loading, isOffline, syncStatus, tacharProductos, completarComanda, recuperarComanda, updateLineNotes, updateOrderNotes } = useKDS();
    const [showCompleted, setShowCompleted] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);

    const visibleOrders = useMemo(
        () =>
            orders.filter((o) => {
                if (showCompleted) {
                    return o.estado === 'completada' && (o.lineas?.length || 0) > 0;
                }
                return o.estado === 'activa' && (o.lineas?.length || 0) > 0;
            }),
        [orders, showCompleted]
    );

    const aggregatedItems = useMemo(() => visibleOrders.reduce((acc, order) => {
        order.lineas?.filter(l => l.estado === 'pendiente').forEach(line => {
            const key = line.notas ? `${line.producto_nombre} | ${line.notas}` : line.producto_nombre;
            const existing = acc.find(i => i.key === key);
            if (existing) {
                existing.cantidad += 1;
            } else {
                acc.push({ key, nombre: line.producto_nombre, notas: line.notas, cantidad: 1 });
            }
        });
        return acc;
    }, [] as { key: string; nombre: string; notas: string | null; cantidad: number }[])
        .sort((a, b) => b.cantidad - a.cantidad), [visibleOrders]);

    const getEffectiveStartTime = (order: KDSOrder) => {
        const pendingLines = order.lineas?.filter(l => l.estado === 'pendiente') || [];
        if (pendingLines.length > 0) return Math.min(...pendingLines.map(l => new Date(l.created_at).getTime()));
        if (order.lineas && order.lineas.length > 0) return Math.max(...order.lineas.map(l => new Date(l.created_at).getTime()));
        return new Date(order.created_at).getTime();
    };

    const sortedOrders = useMemo(() => [...visibleOrders].sort(
        (a, b) => getEffectiveStartTime(a) - getEffectiveStartTime(b)
    ), [visibleOrders]);

    const lastCompletedOrderId = useMemo(() => {
        const completed = orders
            .filter((o) => o.estado === 'completada' && o.completed_at)
            .sort((a, b) => new Date(b.completed_at as string).getTime() - new Date(a.completed_at as string).getTime());
        return completed[0]?.id ?? null;
    }, [orders]);

    /** Remonta el layout cuando cambian ids o tamaño de comandas (anchura de tarjeta / saltos de línea). */
    const rowsLayoutKey = useMemo(
        () => sortedOrders.map((o) => `${o.id}:${(o.lineas ?? []).length}`).join('|'),
        [sortedOrders]
    );

    const renderCommandCard = useCallback(
        (order: KDSOrder) => (
            <CommandCard
                order={order}
                kdsRailAttached
                onTacharProductos={tacharProductos}
                onCompletarComanda={completarComanda}
                onRecuperarComanda={recuperarComanda}
                onUpdateLineNotes={updateLineNotes}
                onUpdateOrderNotes={updateOrderNotes}
            />
        ),
        [tacharProductos, completarComanda, recuperarComanda, updateLineNotes, updateOrderNotes]
    );

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col transition-all duration-500 ${isOffline ? 'grayscale-[0.5]' : ''}`}
            style={{ backgroundColor: KDS_BG }}
        >

            {isOffline && <div className="absolute inset-0 bg-red-900/10 pointer-events-none z-[90] backdrop-blur-[1px]" />}

            <div className="flex flex-1 min-h-0 flex-col relative" style={{ backgroundColor: KDS_BG }}>

                {/* Área principal: comandas (scroll) */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-4 pb-3 custom-scrollbar">
                    {loading && orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 animate-in fade-in duration-700">
                            <Loader2 className="animate-spin mb-4 opacity-20" size={56} strokeWidth={1} />
                            <p className="text-sm font-black uppercase tracking-[0.35em] opacity-40 animate-pulse">Sincronizando...</p>
                        </div>
                    ) : visibleOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[50vh] border-2 border-dashed border-white/15 rounded-3xl bg-black/10 mt-8 mx-auto max-w-2xl animate-in zoom-in-95 duration-500">
                            {showCompleted ? <ListChecks className="text-slate-600 mb-4" size={64} strokeWidth={1} /> : <Package className="text-slate-600 mb-4" size={64} strokeWidth={1} />}
                            <h3 className="text-2xl font-bold text-white/55 uppercase tracking-wide">
                                {showCompleted ? 'Sin comandas finalizadas hoy' : 'No hay comandas pendientes'}
                            </h3>
                        </div>
                    ) : (
                        <KDSOrderRowsLayout
                            key={rowsLayoutKey}
                            sortedOrders={sortedOrders}
                            renderCommandCard={renderCommandCard}
                        />
                    )}
                </div>

            </div>

            {/* Pie fijo: un poco más oscuro que el fondo principal */}
            <footer
                className="shrink-0 z-30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 min-h-[5.5rem] sm:min-h-[6rem] px-3 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-x-hidden border-t border-black/20"
                style={{ backgroundColor: KDS_FOOTER_BG }}
            >
                <div className="flex items-center gap-4 shrink-0 border-b border-black/15 sm:border-b-0 pb-3 sm:pb-0 sm:border-r sm:border-black/15 sm:pr-6">
                    <div className="flex items-center justify-center shrink-0">
                        <Image src="/icons/logo-white.png" alt="Bar Marbella" width={52} height={52} className="object-contain drop-shadow-lg opacity-90" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                        <Link href="/dashboard/sala" className="flex items-center gap-2 mb-1 cursor-pointer">
                            <span className={`block h-2.5 w-2.5 rounded-full ${isOffline ? 'bg-rose-400' : 'bg-emerald-400'} animate-pulse shrink-0`} />
                            <p className="text-sm sm:text-base font-black text-white/80 uppercase tracking-[0.2em] leading-none">
                                {isOffline ? 'DESCONECTADO' : 'Live'}
                            </p>
                        </Link>
                        <p className="text-base sm:text-lg font-black text-white/90 uppercase tracking-[0.22em] leading-tight text-center">
                            {visibleOrders.length === 0 ? ' ' : String(visibleOrders.length)}
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-stretch gap-2 min-w-0 min-h-[3.25rem] overflow-x-hidden">
                    {aggregatedItems.length === 0 ? (
                        !loading && (
                            <div className="text-white/45 text-base sm:text-lg font-bold uppercase tracking-[0.12em] italic my-auto px-1">
                                Nada que preparar
                            </div>
                        )
                    ) : (
                        <KDSFooterProductChips
                            items={aggregatedItems}
                            onOpen={() => setIsSummaryOpen(true)}
                        />
                    )}
                </div>

                <div className="flex items-center justify-end gap-4 shrink-0 pt-3 sm:pt-0 border-t border-black/15 sm:border-t-0 sm:border-l sm:border-black/15 sm:pl-6">
                    <div
                        className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-500 overflow-hidden ${syncStatus === 'idle' ? 'w-0 opacity-0' : 'w-11 opacity-100 bg-slate-800 border border-slate-600/50 shadow-inner'}`}
                    >
                        {syncStatus === 'syncing' && <Loader2 size={22} className="text-blue-400 animate-spin" />}
                        {syncStatus === 'success' && <Check size={22} className="text-emerald-400" strokeWidth={2.5} />}
                        {syncStatus === 'error' && <X size={22} className="text-rose-400" strokeWidth={2.5} />}
                    </div>

                    <div className="flex bg-slate-800 p-1.5 rounded-xl shadow-inner min-h-[52px] items-center">
                        {!showCompleted ? (
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    disabled={!lastCompletedOrderId}
                                    onClick={() => {
                                        if (!lastCompletedOrderId) return;
                                        recuperarComanda(lastCompletedOrderId);
                                    }}
                                    className="min-h-[48px] px-5 rounded-lg text-base sm:text-lg font-black uppercase tracking-[0.12em] transition-all duration-300 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-40 disabled:hover:bg-emerald-600"
                                >
                                    Recup Última
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCompleted(true)}
                                    className="min-h-[48px] px-5 rounded-lg text-base sm:text-lg font-black uppercase tracking-[0.12em] transition-all duration-300 bg-red-600 hover:bg-red-700 text-white shadow-md"
                                >
                                    Finalizadas
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowCompleted(false)}
                                className="min-h-[48px] px-5 rounded-lg text-base sm:text-lg font-black uppercase tracking-[0.12em] transition-all duration-300 bg-[#407080] text-white shadow-md"
                            >
                                Pendientes
                            </button>
                        )}
                    </div>
                </div>
            </footer>

            {/* Modal Resumen completo */}
            {isSummaryOpen && (
                <div
                    className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-2 sm:p-3"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsSummaryOpen(false);
                    }}
                >
                    <div className="w-full max-w-4xl max-h-[86vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="px-4 sm:px-5 py-3 bg-[#36606F] text-white flex items-start justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-black uppercase tracking-[0.12em] truncate">
                                    Resumen
                                </div>
                                <div className="text-sm sm:text-base font-bold text-white/70 tracking-wide truncate">
                                    {showCompleted ? 'Finalizadas' : 'Pendientes'}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSummaryOpen(false)}
                                className="shrink-0 w-12 h-12 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center"
                                aria-label="Cerrar"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {aggregatedItems.map((item) => (
                                    <div
                                        key={item.key}
                                        className="flex items-center gap-2 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="text-lg sm:text-xl font-black text-slate-900 truncate tracking-[0.06em]">
                                                {item.nombre}
                                            </div>
                                            {item.notas && (
                                                <div className="text-sm sm:text-base font-bold tracking-wide text-slate-600 italic truncate">
                                                    {item.notas}
                                                </div>
                                            )}
                                        </div>
                                        <span className="shrink-0 bg-[#407080] text-white text-lg sm:text-xl font-black px-2.5 py-1 rounded-lg border border-[#36606F] tracking-wide">
                                            ×{item.cantidad}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.25); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.35); }

      `}</style>
        </div>
    );
}