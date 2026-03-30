"use client";

import { useState } from 'react';
import { useKDS } from '@/hooks/useKDS';
import { CommandCard } from './CommandCard';
import { Loader2, Package, LayoutGrid, Info, AlertTriangle, ListChecks } from 'lucide-react';
import { KDSOrder } from './types';
import Image from 'next/image';

export default function KDSView() {
    const { orders, loading, isOffline, tacharProductos, completarComanda, recuperarComanda } = useKDS();
    const [showCompleted, setShowCompleted] = useState(false);

    const visibleOrders = orders.filter(o => 
        showCompleted ? o.estado === 'completada' : o.estado === 'activa'
    );

    const aggregatedItems = visibleOrders.reduce((acc, order) => {
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

    const getEffectiveStartTime = (order: KDSOrder) => {
        const pendingLines = order.lineas?.filter(l => l.estado === 'pendiente') || [];
        if (pendingLines.length > 0) return Math.min(...pendingLines.map(l => new Date(l.created_at).getTime()));
        if (order.lineas && order.lineas.length > 0) return Math.max(...order.lineas.map(l => new Date(l.created_at).getTime()));
        return new Date(order.created_at).getTime();
    };

    const sortedOrders = [...visibleOrders].sort((a, b) => getEffectiveStartTime(a) - getEffectiveStartTime(b));

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

            <header className="bg-slate-900 p-4 md:px-8 flex justify-between items-center z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-14 items-center justify-center flex">
                        <Image src="/icons/logo-white.png" alt="Bar Marbella" width={56} height={56} className="object-contain drop-shadow-lg opacity-90" />
                    </div>
                    <div className="hidden sm:block">
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`flex h-2 w-2 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                {isOffline ? 'DESCONECTADO' : 'Live'} • {visibleOrders.length} tickets {showCompleted ? 'terminados' : 'pendientes'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* BOTONES DE FILTRO CENTRALES / DERECHA */}
                <div className="flex bg-slate-800 p-1.5 rounded-2xl shadow-inner mx-auto sm:mx-0">
                    <button 
                         onClick={() => setShowCompleted(false)} 
                         className={`flex items-center gap-2 px-4 py-2.5 sm:px-6 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${!showCompleted ? 'bg-[#407080] text-white shadow-lg scale-100' : 'text-slate-400 hover:text-white scale-95'}`}
                    >
                        Cocina
                    </button>
                    <button 
                         onClick={() => setShowCompleted(true)} 
                         className={`flex items-center gap-2 px-4 py-2.5 sm:px-6 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${showCompleted ? 'bg-slate-600 text-white shadow-lg scale-100' : 'text-slate-400 hover:text-white scale-95'}`}
                    >
                        Finalizadas
                    </button>
                </div>

                <div className="hidden md:flex items-center gap-3">
                    <div className="bg-slate-800 px-4 py-3 rounded-xl border border-slate-700 flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vista</span>
                        <LayoutGrid size={18} className="text-[#407080]" />
                    </div>
                </div>
            </header>

            {/* CARRUSEL DE TOTALES HORIZONTAL */}
            <div className="bg-slate-800/80 border-y border-slate-700 p-2 md:px-8 flex items-center gap-3 overflow-x-auto custom-scrollbar-horizontal shadow-inner z-10 w-full shrink-0">
                <div className="flex items-center gap-2 mr-2 pl-2 shrink-0">
                    <Info size={16} className={showCompleted ? "text-slate-400" : "text-[#407080]"} />
                    <h2 className={`text-[11px] sm:text-xs font-black uppercase tracking-widest ${showCompleted ? 'text-slate-500' : 'text-slate-300'}`}>
                        {showCompleted ? 'Listado Finalizado' : 'Resumen Preparación'}
                    </h2>
                </div>
                {aggregatedItems.length === 0 ? (
                    <div className="text-slate-500 text-xs font-bold uppercase tracking-widest italic my-1.5 ml-4">
                        Nada que preparar
                    </div>
                ) : (
                    aggregatedItems.map(item => (
                        <div key={item.key} className="flex items-center gap-2 bg-slate-700/80 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-600 shrink-0 shadow-sm transition-colors">
                            <span className="text-[13px] sm:text-sm font-bold text-white max-w-[150px] truncate">{item.nombre}</span>
                            {item.notas && <span className="text-[10px] font-black tracking-tight text-amber-500 italic max-w-[100px] truncate">"{item.notas}"</span>}
                            <div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center font-black text-emerald-400 text-sm shadow-inner border border-slate-800/50">
                                x{item.cantidad}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isOffline && <div className="absolute inset-0 bg-red-900/10 pointer-events-none z-[90] backdrop-blur-[1px]" />}

            <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-hidden flex flex-col">

                {/* GRID DE COMANDAS COMPULSIVO */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {visibleOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[50vh] border-2 border-dashed border-slate-700 rounded-3xl bg-slate-800/30">
                            {showCompleted ? <ListChecks className="text-slate-600 mb-4" size={64} strokeWidth={1} /> : <Package className="text-slate-600 mb-4" size={64} strokeWidth={1} />}
                            <h3 className="text-lg font-bold text-slate-400 uppercase tracking-tighter">
                                {showCompleted ? 'Sin comandas finalizadas hoy' : 'No hay comandas pendientes'}
                            </h3>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                            {sortedOrders.map(order => (
                                <CommandCard
                                    key={order.id}
                                    order={order}
                                    onTacharProductos={tacharProductos}
                                    onCompletarComanda={completarComanda}
                                    onRecuperarComanda={recuperarComanda}
                                />
                            ))}
                        </div>
                    )}
                </div>

            </div>
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