"use client";

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, ChevronRight, Info, AlertTriangle, X } from 'lucide-react';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from './types';

interface CommandCardProps {
    order: KDSOrder;
    onTacharProductos: (lineIds: string[], currentState: KDSItemStatus) => void;
    onCompletarComanda: (orderId: string) => void;
    onRecuperarComanda: (orderId: string) => void;
}

export function CommandCard({ order, onTacharProductos, onCompletarComanda, onRecuperarComanda }: CommandCardProps) {
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
        if (elapsed >= 15) return 'bg-[#b84a4a] border-[#a13f3f]';
        if (elapsed >= 10) return 'bg-[#cf6a6a] border-[#b55b5b]';
        return 'bg-[#d65f5f] border-[#b55b5b]'; // Rojo similar al pantallazo
    };

    const getIndicatorColor = () => {
        if (isCompleted) return 'bg-slate-600';
        if (elapsed >= 15) return 'bg-[#a33b3b]';
        if (elapsed >= 10) return 'bg-[#c25a5a]';
        return 'bg-[#cc5151]';
    };

    const orderTime = new Date(effectiveStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isFullyDone = (order.lineas?.length || 0) > 0 && order.lineas?.every(l => l.estado === 'terminado' || l.estado === 'cancelado');

    // Agrupamiento de líneas iguales (mismo nombre, notas y estado)
    const groupedLines = (order.lineas || []).reduce((acc, line) => {
        const key = `${line.producto_nombre}_${line.notas || ''}_${line.estado}`;
        if (!acc[key]) {
            acc[key] = {
                ids: [line.id],
                producto_nombre: line.producto_nombre,
                notas: line.notas,
                estado: line.estado,
                cantidad: 1
            };
        } else {
            acc[key].ids.push(line.id);
            acc[key].cantidad++;
        }
        return acc;
    }, {} as Record<string, { ids: string[]; producto_nombre: string; notas: string | null; estado: KDSItemStatus; cantidad: number }>);

    const groupedArray = Object.values(groupedLines);

    return (
        <div className={`relative flex flex-col rounded-b-2xl rounded-t-sm overflow-hidden shadow-2xl transition-all duration-300 border border-slate-700/50 bg-[#1e293b] mt-4 ${isCompleted
                ? 'opacity-60'
                : isFullyDone
                    ? 'opacity-90'
                    : ''
            }`}>

            {/* Cabecera Tipo Ticket */}
            <div className={`p-3 text-white ${getHeaderColor()} flex justify-between items-center transition-colors duration-500 border-b relative font-black`}>
                {isCompleted && (
                    <div className="absolute top-0 right-0 bg-slate-900/50 px-2 py-0.5 rounded-bl-lg text-[8px] font-black uppercase tracking-widest">
                        FINALIZADA
                    </div>
                )}

                <div className="flex items-center gap-3 w-full">
                    {/* Mesa - Exactamente como la foto (Circulo con numero) */}
                    <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-white/90 flex items-center justify-center shrink-0 ${getIndicatorColor()}`}>
                        <span className="text-sm sm:text-base font-black tracking-tighter uppercase tabular-nums">
                            {order.mesa || '--'}
                        </span>
                    </div>

                    {/* Información y tiempo */}
                    <div className="flex flex-col items-end flex-1 pr-1">
                        <div className="flex items-center gap-1.5 text-right w-full justify-end">
                            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest opacity-90 truncate">
                                {orderTime} • HACE {formatElapsed(elapsed)}
                            </span>
                        </div>
                        <div className="text-[7px] sm:text-[8px] font-mono opacity-80 mt-0.5 uppercase tracking-widest text-[#ffebeb]">
                            TICKET #{order.origen_referencia?.slice(-5) || '-----'}
                        </div>
                    </div>
                </div>
            </div>

            {order.notas_comanda && (
                <div className={`${isCompleted ? 'bg-slate-700/50' : 'bg-amber-100/10'} px-4 py-2 flex items-start gap-2 border-b border-white/10`}>
                    <AlertTriangle size={16} className={`${isCompleted ? 'text-slate-400' : 'text-amber-500'} mt-0.5 shrink-0`} />
                    <p className={`text-xs font-black leading-tight uppercase tracking-tight ${isCompleted ? 'text-slate-400' : 'text-amber-200'}`}>
                        {order.notas_comanda}
                    </p>
                </div>
            )}

            {/* Lista de Líneas */}
            <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[450px] custom-scrollbar">
                {groupedArray.map((group) => (
                    <div
                        key={group.ids.join(',')}
                        onClick={() => !isCompleted && group.estado !== 'cancelado' && onTacharProductos(group.ids, group.estado)}
                        className={`group relative flex items-center p-3 sm:p-4 rounded-xl select-none transition-all duration-200 shadow-md border ${isCompleted
                                ? 'opacity-40 cursor-default bg-white/50 border-gray-300'
                                : group.estado === 'terminado'
                                    ? 'bg-green-100/90 grayscale-[0.5] cursor-pointer border-green-300'
                                    : group.estado === 'cancelado'
                                        ? 'bg-white/50 opacity-60 cursor-not-allowed border-gray-300'
                                        : 'bg-white/95 hover:bg-white cursor-pointer active:scale-[0.98] border-gray-200'
                            }`}
                    >
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center rounded-xl transition-all duration-300 ${isCompleted ? 'bg-slate-200 text-slate-400' :
                                group.estado === 'terminado' ? 'bg-green-500 text-white scale-110' :
                                    group.estado === 'cancelado' ? 'bg-slate-300 text-slate-500' :
                                        'bg-slate-100 text-slate-400 border border-slate-300'
                            }`}>
                            {group.estado === 'cancelado' ? <X size={20} strokeWidth={3} /> : <CheckCircle size={20} strokeWidth={group.estado === 'terminado' ? 3 : 2} />}
                        </div>

                        <div className="ml-3 sm:ml-4 flex-1 min-w-0 flex items-center justify-between">
                            <div className="flex flex-col pr-2 min-w-0">
                                <span className={`text-[15px] sm:text-[17px] font-black transition-all duration-300 block truncate ${isCompleted ? 'text-slate-500 line-through' :
                                        group.estado === 'terminado' ? 'text-green-800/60 line-through decoration-2' :
                                            group.estado === 'cancelado' ? 'text-slate-500 line-through decoration-slate-500 decoration-2' :
                                                'text-slate-900'
                                    }`}>
                                    {group.producto_nombre}
                                </span>

                                {group.notas && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <span className={`text-[11px] font-bold px-2 py-0.5 bg-amber-100 border border-amber-200 rounded-lg italic ${group.estado === 'cancelado' || isCompleted ? 'text-slate-500 border-slate-200 bg-slate-100' : 'text-amber-800'
                                            }`}>
                                            "{group.notas}"
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Mostramos el multiplicador bien grande */}
                            {group.cantidad > 0 && (
                                <div className={`shrink-0 flex items-center justify-center rounded-lg px-2 py-1 border-2 min-w-[2.5rem] ${
                                    group.estado === 'terminado' ? 'border-green-300 text-green-700 bg-green-50' : 
                                    'border-slate-800 text-slate-900 bg-slate-100'
                                }`}>
                                    <span className="text-xl sm:text-2xl font-black">{group.cantidad}</span>
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