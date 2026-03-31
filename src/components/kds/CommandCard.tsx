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
        if (elapsed >= 15) return 'animate-pulse-critical'; // Red 800 with pulse
        if (elapsed >= 10) return 'bg-rose-600'; // Red
        if (elapsed >= 5) return 'bg-amber-500';  // Amber
        return 'bg-emerald-600'; // Green
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
        <div className={`relative flex flex-col rounded-b-xl rounded-t-sm overflow-hidden shadow-2xl transition-all duration-300 border-x border-b border-slate-300 bg-white ${isCompleted
                ? 'opacity-60'
                : isFullyDone
                    ? 'opacity-90'
                    : ''
            }`}
            style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '8px solid #cbd5e1' }}
        >
            {/* Cabecera Coloreada con el indicador */}
            <div className={`px-3 pb-1.5 flex justify-between items-start transition-colors duration-500 relative font-black ${isCompleted ? 'bg-slate-200 text-slate-600' : `${getIndicatorColor()} text-white`}`}>
                {isCompleted && (
                    <div className="absolute top-0 right-3 bg-white/50 px-1.5 py-0.5 rounded-b-md text-[7px] font-black uppercase tracking-widest text-slate-700">
                        FINALIZADA
                    </div>
                )}

                <div className="flex items-center gap-3 w-full pt-1.5">
                    {/* Mesa: Círculo Invertido (Fondo Blanco) */}
                    <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm text-slate-900`}>
                        <span className="text-base sm:text-lg font-black tracking-tighter uppercase tabular-nums">
                            {(() => {
                                const mesaNum = parseInt(order.mesa || '');
                                if (!isNaN(mesaNum) && mesaNum > 1000) return '--';
                                return order.mesa || '--';
                            })()}
                        </span>
                    </div>

                    {/* Información y tiempo: TAMAÑO AUMENTADO */}
                    <div className="flex flex-col items-end flex-1 pr-1">
                        <div className="flex items-center gap-1 text-right w-full justify-end opacity-95">
                            <span className="text-[11px] sm:text-[12px] font-black uppercase tracking-widest truncate">
                                {orderTime} • HACE {formatElapsed(elapsed)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {order.notas_comanda && (
                <div className={`px-3 py-1.5 flex items-start gap-1.5 border-b border-slate-100 ${isCompleted ? 'bg-slate-50' : 'bg-red-50'}`}>
                    <AlertTriangle size={14} className={`${isCompleted ? 'text-slate-400' : 'text-red-500'} mt-0.5 shrink-0`} />
                    <p className={`text-[10px] font-black leading-tight uppercase tracking-tight ${isCompleted ? 'text-slate-500' : 'text-red-700'}`}>
                        {order.notas_comanda}
                    </p>
                </div>
            )}

            {/* Lista de Líneas */}
            <div className="flex-1 p-1.5 space-y-1">
                {groupedArray.map((group) => (
                    <div
                        key={group.ids.join(',')}
                        onClick={() => !isCompleted && group.estado !== 'cancelado' && onTacharProductos(group.ids, group.estado)}
                        className={`group relative flex items-center p-1.5 sm:p-2 select-none transition-all duration-200 border-b border-dashed border-slate-200/50 last:border-none ${isCompleted
                                ? 'opacity-40 cursor-default'
                                : group.estado === 'terminado'
                                    ? 'hover:bg-slate-50/50 cursor-pointer opacity-70'
                                    : group.estado === 'cancelado'
                                        ? 'opacity-60 cursor-not-allowed rounded-lg'
                                        : 'hover:bg-slate-50/50 cursor-pointer active:scale-[0.98]'
                            }`}
                    >
                        {/* Mostrar tick solo si NO está pendiente */}
                        {group.estado !== 'pendiente' && (
                            <div className={`w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded-xl transition-all duration-300 mr-2 ${isCompleted ? 'bg-slate-200 text-slate-400' :
                                    group.estado === 'terminado' ? 'bg-green-500 text-white scale-110' :
                                        group.estado === 'cancelado' ? 'bg-slate-300 text-slate-500' :
                                            'bg-slate-100 text-slate-400 border border-slate-300'
                                }`}>
                                {group.estado === 'cancelado' ? <X size={20} strokeWidth={3} /> : <CheckCircle size={20} strokeWidth={group.estado === 'terminado' ? 3 : 2} />}
                            </div>
                        )}

                        <div className="flex-1 min-w-0 flex items-center justify-between pointer-events-none">
                            <div className="flex flex-col pr-1 min-w-0">
                                {/* TEXTO DEL PRODUCTO MUCHO MÁS PEQUEÑO */}
                                <span className={`text-[10px] sm:text-[11px] leading-tight font-black transition-all duration-300 block truncate ${isCompleted ? 'text-slate-400 line-through' :
                                        group.estado === 'terminado' ? 'text-green-600/60 line-through decoration-2' :
                                            group.estado === 'cancelado' ? 'text-slate-400 line-through decoration-slate-400 decoration-2' :
                                                'text-slate-800'
                                    }`}>
                                    {group.producto_nombre}
                                </span>

                                {group.notas && (
                                    <div className="flex items-center gap-1 mt-px">
                                        <span className={`text-[8px] font-black text-red-600 italic ${group.estado === 'cancelado' || isCompleted ? 'opacity-50' : ''
                                            }`}>
                                            {group.notas}
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Multiplicador adaptado mini */}
                            {group.cantidad > 0 && (
                                <div className={`shrink-0 flex items-center justify-center rounded px-1.5 py-0.5 border-2 min-w-[1.5rem] ${
                                    group.estado === 'terminado' ? 'border-green-200 text-green-600 bg-green-50' : 
                                    'border-slate-800 text-slate-900 bg-slate-50'
                                }`}>
                                    <span className="text-sm sm:text-base font-black">{group.cantidad}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-2 border-t border-slate-100">
                {isCompleted ? (
                    <button
                        onClick={() => onRecuperarComanda(order.id)}
                        className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 active:translate-y-1"
                    >
                        Restaurar
                    </button>
                ) : (
                    <button
                        onClick={() => onCompletarComanda(order.id)}
                        className={`w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 active:translate-y-1 ${isFullyDone
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200 shadow-sm'
                                : 'bg-slate-100/80 text-slate-400 hover:bg-slate-200/80'
                            }`}
                    >
                        Finalizar
                    </button>
                )}
            </div>

            <style jsx>{`
        @keyframes pulse-critical {
          0%, 100% { background-color: #991b1b; } /* bg-red-800 */
          50% { background-color: #7f1d1d; } /* bg-red-900 */
        }
        .animate-pulse-critical {
          animation: pulse-critical 2s ease-in-out infinite;
        }
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