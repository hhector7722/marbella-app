"use client";

import { useKDS } from '@/hooks/useKDS';
import { CommandCard } from './CommandCard';
import { Loader2, ChefHat, Package, LayoutGrid, Info, AlertTriangle } from 'lucide-react';
import { KDSOrder } from './types';

export default function KDSView() {
    const { orders, loading, isOffline, tacharProducto, completarComanda, recuperarComanda } = useKDS();

    const aggregatedItems = orders.reduce((acc, order) => {
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
        .sort((a, b) => b.cantidad - a.cantidad);

    // --- ORDENACIÓN CORREGIDA ---
    // Ordenamos usando la misma lógica que la tarjeta, para que la mesa fantasma
    // no se quede la primera de la lista eternamente.
    const getEffectiveStartTime = (order: KDSOrder) => {
        const pendingLines = order.lineas?.filter(l => l.estado === 'pendiente') || [];
        if (pendingLines.length > 0) return Math.min(...pendingLines.map(l => new Date(l.created_at).getTime()));
        if (order.lineas && order.lineas.length > 0) return Math.max(...order.lineas.map(l => new Date(l.created_at).getTime()));
        return new Date(order.created_at).getTime();
    };

    const sortedOrders = [...orders].sort((a, b) => getEffectiveStartTime(a) - getEffectiveStartTime(b));

    if (loading && orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
                <Loader2 className="animate-spin mb-4" size={48} strokeWidth={1} />
                <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Sincronizando Cocina...</p>
            </div>
        );
    }

    return (
        <div className={`fixed inset-0 z-[100] flex flex-col bg-slate-900 transition-all duration-500 ${isOffline ? 'grayscale-[0.5]' : ''}`}>

            {isOffline && (
                <div className="bg-red-600 text-white py-4 px-6 flex items-center justify-center gap-4 z-[110] relative shadow-2xl">
                    <AlertTriangle size={32} className="shrink-0 animate-pulse" />
                    <div className="flex flex-col">
                        <span className="text-xl font-black uppercase tracking-tighter">⚠️ DESCONECTADO DEL SERVIDOR</span>
                        <span className="text-xs font-bold opacity-90 uppercase tracking-[0.1em]">Las nuevas comandas no entrarán. Reintentando...</span>
                    </div>
                </div>
            )}

            <header className="bg-slate-900 border-b border-slate-800 p-4 md:px-8 flex justify-between items-center z-20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#407080] rounded-2xl flex items-center justify-center text-white shadow-lg">
                        <ChefHat size={28} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter leading-none">Kitchen Display System</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`flex h-2 w-2 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                {isOffline ? 'DESCONECTADO' : 'Live'} • {orders.length} comandas activas
                            </p>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-3">
                    <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vista</span>
                        <LayoutGrid size={18} className="text-[#407080]" />
                    </div>
                </div>
            </header>

            {isOffline && <div className="absolute inset-0 bg-red-900/10 pointer-events-none z-[90] backdrop-blur-[1px]" />}

            <div className="flex flex-col lg:flex-row flex-1 p-4 md:p-6 lg:p-8 gap-6 overflow-hidden">

                {/* PANEL IZQUIERDO: GRID DE COMANDAS */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed border-slate-700 rounded-3xl bg-slate-800/30">
                            <Package className="text-slate-600 mb-4" size={64} strokeWidth={1} />
                            <h3 className="text-lg font-bold text-slate-400 uppercase tracking-tighter">No hay comandas entrantes</h3>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                            {sortedOrders.map(order => (
                                <CommandCard
                                    key={order.id}
                                    order={order}
                                    onTacharItem={tacharProducto}
                                    onCompletarComanda={completarComanda}
                                    onRecuperarComanda={recuperarComanda}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* PANEL DERECHO: AGRUPADOR (Dark Mode) */}
                <aside className="lg:w-80 w-full flex flex-col bg-slate-800/40 rounded-3xl border border-slate-700/50 overflow-hidden shrink-0 h-fit max-h-[calc(100vh-200px)] lg:sticky lg:top-24">
                    <div className="p-5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-200">
                            <Info size={16} className="text-[#407080]" />
                            <h2 className="text-sm font-black uppercase tracking-tighter">Preparación Total</h2>
                        </div>
                        <span className="bg-[#407080] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {aggregatedItems.length} tipos
                        </span>
                    </div>

                    <div className="p-4 overflow-y-auto custom-scrollbar">
                        {aggregatedItems.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nada pendiente</p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {aggregatedItems.map((item) => (
                                    <li
                                        key={item.key}
                                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-800 border border-slate-700 group transition-all duration-300 hover:bg-slate-700"
                                    >
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors truncate">
                                                {item.nombre}
                                            </span>
                                            {item.notas && (
                                                <span className="text-[10px] font-black text-amber-500 truncate mt-0.5">
                                                    "{item.notas}"
                                                </span>
                                            )}
                                        </div>
                                        <div className="bg-slate-900 h-8 min-w-[32px] px-2 rounded-lg border border-slate-700 flex items-center justify-center shadow-inner shrink-0">
                                            <span className="text-sm font-black text-emerald-400 tabular-nums">x{item.cantidad}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="p-4 bg-slate-800/90 mt-auto border-t border-slate-700">
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            <ChefHat size={14} />
                            <span>Optimiza los tiempos de fuego</span>
                        </div>
                    </div>
                </aside>

            </div>
            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
        </div>
    );
}