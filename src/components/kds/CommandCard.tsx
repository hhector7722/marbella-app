"use client";

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, ChevronRight, Info, AlertTriangle, X } from 'lucide-react';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from './types';

interface CommandCardProps {
    order: KDSOrder;
    onTacharItem: (lineId: string, currentState: KDSItemStatus) => void;
    onCompletarComanda: (orderId: string) => void;
    onRecuperarComanda: (orderId: string) => void;
}

export function CommandCard({ order, onTacharItem, onCompletarComanda, onRecuperarComanda }: CommandCardProps) {
    const [elapsed, setElapsed] = useState<number>(0);
    const isCompleted = order.estado === 'completada';

    // --- EL NÚCLEO DE LA SOLUCIÓN ---
    // Si el ticket es "fantasma" y nació ayer, lo ignoramos.
    // La tarjeta mostrará el tiempo de espera del plato pendiente más antiguo.
    const getEffectiveStartTime = () => {
        const pendingLines = order.lineas?.filter(l => l.estado === 'pendiente') || [];
        if (pendingLines.length > 0) {
            return Math.min(...pendingLines.map(l => new Date(l.created_at).getTime()));
        }
        if (order.lineas && order.lineas.length > 0) {
            return Math.max(...order.lineas.map(l => new Date(l.created_at).getTime()));
        }
        return new Date(order.created_at).getTime();
    };

    const effectiveStart = getEffectiveStartTime();

    // Calcular minutos transcurridos sobre la hora efectiva
    useEffect(() => {
        const calc = () => {
            const now = new Date().getTime();
            setElapsed(Math.floor((now - effectiveStart) / 60000));
        };
        calc();
        const timer = setInterval(calc, 60000);
        return () => clearInterval(timer);
    }, [effectiveStart]);

    const formatElapsed = (minutes: number) => {
        if (minutes < 0) return '0m';
        if (minutes < 60) return `${minutes}m`;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hrs}h ${mins}m`;
    };

    const getHeaderColor = () => {
        if (isCompleted) return 'bg-slate-700 border-slate-800';
        if (elapsed >= 15) return 'bg-[#cf6a6a] border-[#b55b5b]';
        if (elapsed >= 10) return 'bg-amber-600 border-amber-700';
        return 'bg-[#407080] border-[#36606F]';
    };

    const getIndicatorColor = () => {
        if (isCompleted) return 'bg-slate-600';
        if (elapsed >= 15) return 'bg-red-700';
        if (elapsed >= 10) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const orderTime = new Date(effectiveStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isFullyDone = (order.lineas?.length || 0) > 0 && order.lineas?.every(l => l.estado === 'terminado' || l.estado === 'cancelado');

    return (
        <div className={`flex flex-col rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 border-2 border-white/90 ${isCompleted
                ? 'bg-slate-800 opacity-60'
                : isFullyDone
                    ? 'bg-green-50/30'
                    : 'bg-slate-800/40'
            }`}>

            {/* Cabecera */}
            <div className={`p-4 text-white ${getHeaderColor()} flex justify-between items-center transition-colors duration-500 border-b relative font-black`}>
                {isCompleted && (
                    <div className="absolute top-0 right-0 bg-slate-900/50 px-2 py-0.5 rounded-bl-lg text-[8px] font-black uppercase tracking-widest">
                        FINALIZADA
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full border-2 border-white flex items-center justify-center shadow-lg shrink-0 ${getIndicatorColor()}`}>
                        <span className="text-xl font-black tracking-tighter uppercase tabular-nums">
                            {order.mesa || '--'}
                        </span>
                    </div>
                </div>

                {/* Información a la derecha */}
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-widest opacity-90">
                            {orderTime}
                        </span>
                        <span className="text-[11px] uppercase tracking-widest opacity-90">
                            • hace {formatElapsed(elapsed)}
                        </span>
                    </div>
                    <div className="text-[10px] font-mono opacity-80 mt-0.5">
                        TICKET #{order.origen_referencia?.slice(-4) || '----'}
                    </div>
                </div>
            </div>

            {order.notas_comanda && (
                <div className={`${isCompleted ? 'bg-slate-700/50' : 'bg-amber-100/10'} px-4 py-2.5 flex items-start gap-2 border-b border-amber-200/20`}>
                    <AlertTriangle size={16} className={`${isCompleted ? 'text-slate-400' : 'text-amber-500'} mt-0.5 shrink-0`} />
                    <p className={`text-xs font-black leading-tight uppercase tracking-tight ${isCompleted ? 'text-slate-400' : 'text-amber-200'}`}>
                        {order.notas_comanda}
                    </p>
                </div>
            )}

            {/* Lista de Líneas */}
            <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[450px] custom-scrollbar">
                {order.lineas?.map((line) => (
                    <div
                        key={line.id}
                        onClick={() => !isCompleted && line.estado !== 'cancelado' && onTacharItem(line.id, line.estado)}
                        className={`group relative flex items-center p-3 rounded-2xl select-none transition-all duration-200 shadow-[0_4px_20px_rgba(0,0,0,0.12)] ${isCompleted
                                ? 'opacity-40 cursor-default'
                                : line.estado === 'terminado'
                                    ? 'bg-green-500/20 grayscale-[0.5] cursor-pointer'
                                    : line.estado === 'cancelado'
                                        ? 'opacity-60 cursor-not-allowed'
                                        : 'bg-slate-700/40 hover:bg-slate-700/60 cursor-pointer active:scale-[0.98]'
                            }`}
                    >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-300 ${isCompleted ? 'bg-slate-600 text-slate-400' :
                                line.estado === 'terminado' ? 'bg-green-500 text-white scale-110' :
                                    line.estado === 'cancelado' ? 'bg-slate-400 text-white' :
                                        'bg-slate-800/80 text-slate-400 border border-slate-700'
                            }`}>
                            {line.estado === 'cancelado' ? <X size={18} strokeWidth={3} /> : <CheckCircle size={18} strokeWidth={line.estado === 'terminado' ? 3 : 2} />}
                        </div>

                        <div className="ml-3 flex-1 min-w-0">
                            <span className={`text-sm md:text-base font-black transition-all duration-300 block truncate ${isCompleted ? 'text-slate-500 line-through' :
                                    line.estado === 'terminado' ? 'text-green-300/60 line-through decoration-2' :
                                        line.estado === 'cancelado' ? 'text-slate-500 line-through decoration-slate-500 decoration-2' :
                                            'text-slate-100'
                                }`}>
                                {line.producto_nombre}
                            </span>

                            {line.notas && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg italic ${line.estado === 'cancelado' || isCompleted ? 'text-slate-500' : 'text-amber-500'
                                        }`}>
                                        "{line.notas}"
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-3">
                {isCompleted ? (
                    <button
                        onClick={() => onRecuperarComanda(order.id)}
                        className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-lg active:translate-y-1"
                    >
                        Restaurar
                    </button>
                ) : (
                    <button
                        onClick={() => onCompletarComanda(order.id)}
                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-300 active:translate-y-1 ${isFullyDone
                                ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-900/20'
                                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/80'
                            }`}
                    >
                        Finalizar
                    </button>
                )}
            </div>

            <style jsx>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
        </div>
    );
}