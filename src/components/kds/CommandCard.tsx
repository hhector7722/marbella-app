"use client";

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { KDSOrder, KDSItemStatus } from './types';

interface CommandCardProps {
    order: KDSOrder;
    onTacharItem: (lineId: string, currentState: KDSItemStatus) => void;
    onCompletarComanda: (orderId: string) => void;
    onRecuperarComanda: (orderId: string) => void;
}

export function CommandCard({ order, onTacharItem, onCompletarComanda, onRecuperarComanda }: CommandCardProps) {
    const [elapsed, setElapsed] = useState<number>(0);
    const isCompleted = order.estado === 'completada';

    useEffect(() => {
        const calc = () => {
            const start = new Date(order.created_at).getTime();
            setElapsed(Math.floor((new Date().getTime() - start) / 60000));
        };
        calc();
        const timer = setInterval(calc, 60000);
        return () => clearInterval(timer);
    }, [order.created_at]);

    const formatElapsed = (minutes: number) => {
        if (minutes < 60) return `${minutes}m`;
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    };

    const getHeaderColor = () => {
        if (isCompleted) return 'bg-slate-700 border-slate-800';
        if (elapsed >= 15) return 'bg-[#cf6a6a] border-[#b55b5b]';
        if (elapsed >= 10) return 'bg-amber-600 border-amber-700';
        return 'bg-[#407080] border-[#36606F]';
    };

    const orderTime = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // AGRUPACIÓN VISUAL INTELIGENTE (Segura para TS)
    const lineasSeguras = order.lineas || [];

    const groupedLines = lineasSeguras.reduce((acc: any[], line) => {
        if (line.estado === 'cancelado') return acc;
        const key = `${line.producto_nombre}-${line.notas || ''}-${line.estado}`;
        const existing = acc.find(g => g.key === key);
        if (existing) {
            existing.quantity += 1;
            existing.lineIds.push(line.id);
        } else {
            acc.push({ key, ...line, quantity: 1, lineIds: [line.id] });
        }
        return acc;
    }, []) || [];

    const isFullyDone = lineasSeguras.length > 0 && lineasSeguras.every(l => l.estado === 'terminado' || l.estado === 'cancelado');

    return (
        <div className={`flex flex-col rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 border-2 border-white/90 ${isCompleted ? 'bg-slate-800 opacity-60' : isFullyDone ? 'bg-green-50/30' : 'bg-slate-800/40'}`}>
            <div className={`p-4 text-white ${getHeaderColor()} flex justify-between items-center transition-colors duration-500 border-b relative font-black`}>
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full border-2 border-white flex items-center justify-center shadow-lg shrink-0 ${isCompleted ? 'bg-slate-600' : elapsed >= 15 ? 'bg-red-700' : elapsed >= 10 ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                        <span className="text-xl font-black uppercase tabular-nums">{order.mesa || '--'}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-widest opacity-90">{orderTime}</span>
                        <span className="text-[11px] uppercase tracking-widest opacity-90">• hace {formatElapsed(elapsed)}</span>
                    </div>
                </div>
            </div>

            {order.notas_comanda && (
                <div className={`${isCompleted ? 'bg-slate-700/50' : 'bg-amber-100/10'} px-4 py-2.5 flex items-start gap-2 border-b border-amber-200/20`}>
                    <AlertTriangle size={16} className={`${isCompleted ? 'text-slate-400' : 'text-amber-500'} mt-0.5 shrink-0`} />
                    <p className={`text-xs font-black uppercase ${isCompleted ? 'text-slate-400' : 'text-amber-200'}`}>{order.notas_comanda}</p>
                </div>
            )}

            <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[450px] custom-scrollbar">
                {groupedLines.map((group) => (
                    <div
                        key={group.key}
                        onClick={() => onTacharItem(group.lineIds[0], group.estado)}
                        className={`group relative flex items-center p-3 rounded-2xl select-none transition-all duration-200 shadow-sm cursor-pointer active:scale-[0.98] ${group.estado === 'terminado' ? 'bg-green-500/20 grayscale-[0.5]' : 'bg-slate-700/40 hover:bg-slate-700/60'
                            }`}
                    >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-300 ${group.estado === 'terminado' ? 'bg-green-500 text-white scale-110' : 'bg-slate-800/80 text-slate-400 border border-slate-700'
                            }`}>
                            <CheckCircle size={18} strokeWidth={group.estado === 'terminado' ? 3 : 2} />
                        </div>
                        <div className="ml-3 flex-1 min-w-0">
                            <span className={`text-sm md:text-base font-black transition-all block truncate ${group.estado === 'terminado' ? 'text-green-300/60 line-through' : 'text-slate-100'
                                }`}>
                                <span className="text-amber-400 mr-2">{group.quantity}x</span>
                                {group.producto_nombre}
                            </span>
                            {group.notas && (
                                <span className={`text-[10px] font-black italic ${group.estado === 'terminado' ? 'text-slate-500' : 'text-amber-500'}`}>
                                    "{group.notas}"
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-3">
                {isCompleted ? (
                    <button onClick={() => onRecuperarComanda(order.id)} className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-[0.2em] shadow-lg active:translate-y-1">
                        Recuperar Comanda
                    </button>
                ) : (
                    <button onClick={() => onCompletarComanda(order.id)} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all active:translate-y-1 ${isFullyDone ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/80'}`}>
                        Finalizar Servicio
                    </button>
                )}
            </div>
        </div>
    );
}