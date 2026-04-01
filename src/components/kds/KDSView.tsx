"use client";

import { useState, useEffect } from 'react';
import { useKDS } from '@/hooks/useKDS';
import { CommandCard } from './CommandCard';
import { Loader2, Package, LayoutGrid, Info, AlertTriangle, ListChecks } from 'lucide-react';
import { KDSOrder } from './types';
import Image from 'next/image';

function useColumns() {
    const [cols, setCols] = useState(6);
    useEffect(() => {
        const update = () => {
            if (window.innerWidth >= 1920) setCols(7);
            else if (window.innerWidth >= 1536) setCols(6);
            else if (window.innerWidth >= 1280) setCols(5);
            else if (window.innerWidth >= 1024) setCols(4);
            else if (window.innerWidth >= 768) setCols(3);
            else if (window.innerWidth >= 640) setCols(2);
            else setCols(1);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return cols;
}

export default function KDSView() {
    const { orders, loading, isOffline, tacharProductos, completarComanda, recuperarComanda } = useKDS();
    const [showCompleted, setShowCompleted] = useState(false);

    const visibleOrders = orders.filter(o => 
        (showCompleted ? o.estado === 'completada' : o.estado === 'activa') && 
        (o.lineas?.length || 0) > 0
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

    const cols = useColumns();
    const orderRows = [];
    for (let i = 0; i < sortedOrders.length; i += cols) {
        orderRows.push(sortedOrders.slice(i, i + cols));
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

            {/* CABECERA UNIFICADA DE COCINA */}
            <header className="bg-slate-900 border-b border-black md:px-0 flex items-center justify-between z-20 shrink-0 h-16 w-full relative">
                
                {/* 1. Izquierda: Logo y Status */}
                <div className="flex items-center gap-3 shrink-0 h-full px-4 border-r border-slate-800">
                    <div className="flex items-center justify-center">
                        <Image src="/icons/logo-white.png" alt="Bar Marbella" width={40} height={40} className="object-contain drop-shadow-lg opacity-90" />
                    </div>
                    <div className="hidden sm:flex flex-col justify-center">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`block h-1.5 w-1.5 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                {isOffline ? 'DESCONECTADO' : 'Live'}
                            </p>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                            {visibleOrders.length} TICKETS
                        </p>
                    </div>
                </div>

                {/* 2. Centro: Resumen Preparación (Scroll Horizontal Intenso) */}
                <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar-horizontal gap-2 px-4 h-full">
                    <div className="hidden lg:flex items-center gap-1.5 shrink-0 pr-2">
                        <Info size={14} className={showCompleted ? "text-slate-500" : "text-[#407080]"} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${showCompleted ? 'text-slate-500' : 'text-slate-400'}`}>
                            {showCompleted ? 'FINALIZADOS' : 'RESUMEN'}
                        </span>
                    </div>
                    {aggregatedItems.length === 0 ? (
                        !loading && (
                            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic my-auto">
                                Nada que preparar
                            </div>
                        )
                    ) : (
                        aggregatedItems.map(item => (
                            <div key={item.key} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-md border border-slate-700 shrink-0 shadow-sm transition-colors cursor-default my-auto">
                                <span className="text-[11px] font-bold text-slate-300 max-w-[120px] truncate">{item.nombre}</span>
                                {item.notas && <span className="text-[9px] font-black tracking-tighter text-amber-500 italic max-w-[80px] truncate">{item.notas}</span>}
                                <span className="bg-[#17253a] text-emerald-400 text-[10px] font-black px-1.5 py-0.5 rounded border border-emerald-900/40">
                                    x{item.cantidad}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* 3. Derecha: Toggles y Controles */}
                <div className="flex items-center gap-3 shrink-0 h-full px-4 border-l border-slate-800">
                    <div className="flex bg-slate-800 p-1 rounded-lg shadow-inner">
                        <button 
                             onClick={() => setShowCompleted(false)} 
                             className={`px-3 py-1.5 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${!showCompleted ? 'bg-[#407080] text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            Cocina
                        </button>
                        <button 
                             onClick={() => setShowCompleted(true)} 
                             className={`px-3 py-1.5 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${showCompleted ? 'bg-slate-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            Finalizadas
                        </button>
                    </div>
                </div>
            </header>

            {isOffline && <div className="absolute inset-0 bg-red-900/10 pointer-events-none z-[90] backdrop-blur-[1px]" />}

            <div className="flex-1 overflow-hidden flex flex-col bg-[#0f1522] relative">

                {/* AREA PRINCIPAL: ROWS DE COMANDAS CON SUS RIELES */}
                <div className="flex-1 overflow-y-auto pt-10 pb-12 custom-scrollbar">
                    {loading && orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 animate-in fade-in duration-700">
                            <Loader2 className="animate-spin mb-4 opacity-20" size={48} strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 animate-pulse">Sincronizando...</p>
                        </div>
                    ) : visibleOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[50vh] border-2 border-dashed border-slate-700/50 rounded-3xl bg-slate-800/20 mt-8 mx-auto max-w-2xl animate-in zoom-in-95 duration-500">
                            {showCompleted ? <ListChecks className="text-slate-600 mb-4" size={64} strokeWidth={1} /> : <Package className="text-slate-600 mb-4" size={64} strokeWidth={1} />}
                            <h3 className="text-lg font-bold text-slate-400 uppercase tracking-tighter">
                                {showCompleted ? 'Sin comandas finalizadas hoy' : 'No hay comandas pendientes'}
                            </h3>
                        </div>
                    ) : (
                        orderRows.map((row, rowIdx) => (
                            <div key={rowIdx} className="w-full relative pt-5 sm:pt-6 mb-2 sm:mb-4">
                                {/* THE METAL RAIL (Comandero) PER ROW STRETCHED */}
                                <img 
                                    src="/icons/comandero.png" 
                                    className="absolute top-0 left-0 w-full h-8 sm:h-10 z-20 shadow-lg object-fill border-b border-slate-900/50" 
                                    alt="Comandero rail"
                                />
                                
                                <div 
                                    className="px-6 md:px-12 lg:px-16 xl:px-20 relative z-10 w-full grid gap-2 sm:gap-3 -mt-2 items-start"
                                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                                >
                                    {row.map(order => (
                                        <CommandCard
                                            key={order.id}
                                            order={order}
                                            onTacharProductos={tacharProductos}
                                            onCompletarComanda={completarComanda}
                                            onRecuperarComanda={recuperarComanda}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
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