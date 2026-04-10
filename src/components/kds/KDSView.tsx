"use client";

import { useState, useEffect, useMemo } from 'react';
import { useKDS } from '@/hooks/useKDS';
import { CommandCard } from './CommandCard';
import { Loader2, Package, Info, ListChecks, Check, X } from 'lucide-react';
import { KDSOrder } from './types';
import Image from 'next/image';
import Link from 'next/link';

/** Menos columnas en pantallas grandes = tarjetas más anchas y texto más legible en cocina */
function useColumns() {
    const [cols, setCols] = useState(2);
    useEffect(() => {
        const update = () => {
            // Cocina: priorizamos legibilidad extrema.
            // 1 columna en pantallas pequeñas, 2 columnas en la mayoría de monitores.
            if (window.innerWidth >= 768) setCols(2);
            else setCols(1);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return cols;
}

export default function KDSView() {
    const { orders, loading, isOffline, syncStatus, tacharProductos, completarComanda, recuperarComanda, updateLineNotes, updateOrderNotes } = useKDS();
    const [showCompleted, setShowCompleted] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);

    const visibleOrders = useMemo(() => orders.filter(o =>
        (showCompleted ? o.estado === 'completada' : o.estado === 'activa') &&
        (o.lineas?.length || 0) > 0
    ), [orders, showCompleted]);

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

    const cols = useColumns();
    const orderRows = useMemo(() => {
        const rows = [];
        for (let i = 0; i < sortedOrders.length; i += cols) {
            rows.push(sortedOrders.slice(i, i + cols));
        }
        return rows;
    }, [sortedOrders, cols]);

    const lastCompletedOrderId = useMemo(() => {
        const completed = orders
            .filter((o) => o.estado === 'completada' && o.completed_at)
            .sort((a, b) => new Date(b.completed_at as string).getTime() - new Date(a.completed_at as string).getTime());
        return completed[0]?.id ?? null;
    }, [orders]);



    return (
        <div className={`fixed inset-0 z-[100] flex flex-col bg-slate-900 transition-all duration-500 ${isOffline ? 'grayscale-[0.5]' : ''}`}>

            {isOffline && <div className="absolute inset-0 bg-red-900/10 pointer-events-none z-[90] backdrop-blur-[1px]" />}

            <div className="flex flex-1 min-h-0 flex-col bg-[#0f1522] relative">

                {/* Área principal: comandas (scroll) */}
                <div className="flex-1 min-h-0 overflow-y-auto pt-4 pb-3 custom-scrollbar">
                    {loading && orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 animate-in fade-in duration-700">
                            <Loader2 className="animate-spin mb-4 opacity-20" size={56} strokeWidth={1} />
                            <p className="text-sm font-black uppercase tracking-[0.35em] opacity-40 animate-pulse">Sincronizando...</p>
                        </div>
                    ) : visibleOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[50vh] border-2 border-dashed border-slate-700/50 rounded-3xl bg-slate-800/20 mt-8 mx-auto max-w-2xl animate-in zoom-in-95 duration-500">
                            {showCompleted ? <ListChecks className="text-slate-600 mb-4" size={64} strokeWidth={1} /> : <Package className="text-slate-600 mb-4" size={64} strokeWidth={1} />}
                            <h3 className="text-2xl font-bold text-slate-400 uppercase tracking-wide">
                                {showCompleted ? 'Sin comandas finalizadas hoy' : 'No hay comandas pendientes'}
                            </h3>
                        </div>
                    ) : (
                        orderRows.map((row, rowIdx) => (
                            <div key={rowIdx} className="w-full relative pt-4 sm:pt-5 mb-3 sm:mb-6">
                                {/* THE METAL RAIL (Comandero) PER ROW STRETCHED */}
                                <img
                                    src="/icons/comandero.png"
                                    className="absolute top-0 left-[-220px] right-[-220px] w-auto h-6 sm:h-8 z-20 shadow-lg object-fill border-b border-slate-900/50 opacity-80"
                                    alt="Comandero rail"
                                />

                                <div
                                    className="px-5 sm:px-8 md:px-10 lg:px-12 relative z-10 w-full grid gap-4 sm:gap-6 -mt-2 items-start"
                                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                                >
                                    {row.map(order => (
                                        <CommandCard
                                            key={order.id}
                                            order={order}
                                            onTacharProductos={tacharProductos}
                                            onCompletarComanda={completarComanda}
                                            onRecuperarComanda={recuperarComanda}
                                            onUpdateLineNotes={updateLineNotes}
                                            onUpdateOrderNotes={updateOrderNotes}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>

            {/* Pie fijo: logo, resumen horizontal, controles (antes cabecera superior) */}
            <footer className="shrink-0 z-30 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 min-h-[5.5rem] sm:min-h-[6rem] px-3 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-4 shrink-0 border-b border-slate-800/80 sm:border-b-0 pb-3 sm:pb-0 sm:border-r sm:pr-6">
                    <div className="flex items-center justify-center shrink-0">
                        <Image src="/icons/logo-white.png" alt="Bar Marbella" width={52} height={52} className="object-contain drop-shadow-lg opacity-90" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                        <Link href="/dashboard/sala" className="flex items-center gap-2 mb-1 cursor-pointer">
                            <span className={`block h-2.5 w-2.5 rounded-full ${isOffline ? 'bg-rose-400' : 'bg-emerald-400'} animate-pulse shrink-0`} />
                            <p className="text-sm sm:text-base font-black text-slate-300 uppercase tracking-[0.2em] leading-none">
                                {isOffline ? 'DESCONECTADO' : 'Live'}
                            </p>
                        </Link>
                        <p className="text-base sm:text-lg font-black text-slate-200 uppercase tracking-[0.22em] leading-tight text-center">
                            {visibleOrders.length === 0 ? ' ' : String(visibleOrders.length)}
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar-horizontal gap-3 min-h-[3.25rem] px-1">
                    {aggregatedItems.length === 0 ? (
                        !loading && (
                            <div className="text-slate-500 text-base sm:text-lg font-bold uppercase tracking-[0.12em] italic my-auto">
                                Nada que preparar
                            </div>
                        )
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsSummaryOpen(true)}
                            className="flex-1 min-w-0 text-left"
                            title="Ver resumen completo"
                        >
                            <div className="flex items-center gap-3 min-w-0 max-h-[3.25rem] overflow-hidden">
                                {aggregatedItems.slice(0, 4).map(item => (
                                    <div
                                        key={item.key}
                                        className="flex items-center gap-2 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 shrink-0 shadow-sm"
                                    >
                                        <span className="text-lg sm:text-xl font-black text-slate-900 max-w-[min(18rem,40vw)] truncate tracking-[0.06em]">
                                            {item.nombre}
                                        </span>
                                        {item.notas && (
                                            <span className="text-sm sm:text-base font-bold tracking-wide text-slate-600 italic max-w-[10rem] truncate">
                                                {item.notas}
                                            </span>
                                        )}
                                        <span className="bg-[#407080] text-white text-lg sm:text-xl font-black px-2.5 py-1 rounded-lg border border-[#36606F] tracking-wide">
                                            ×{item.cantidad}
                                        </span>
                                    </div>
                                ))}
                                {aggregatedItems.length > 4 && (
                                    <div className="shrink-0 text-slate-300 font-black uppercase tracking-[0.18em]">
                                        +{aggregatedItems.length - 4}
                                    </div>
                                )}
                            </div>
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-end gap-4 shrink-0 pt-3 sm:pt-0 border-t border-slate-800/80 sm:border-t-0 sm:border-l sm:pl-6">
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
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }

        .custom-scrollbar-horizontal::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar-horizontal::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-horizontal::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar-horizontal::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
        </div>
    );
}