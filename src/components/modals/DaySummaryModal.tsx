'use client';

import React from 'react';
import { X, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DaySummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    logs: any[];
    onSelectLog: (userId: string) => void;
}

export function DaySummaryModal({ isOpen, onClose, date, logs, onSelectLog }: DaySummaryModalProps) {
    if (!isOpen || !date) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[140] p-6 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-[400px] bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 h-fit max-h-[80vh]" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-[#36606F] h-[60px] flex items-center justify-between px-6 shrink-0">
                    <div className="flex flex-col">
                        <h3 className="text-white text-[11px] font-black uppercase tracking-widest leading-none mb-1">
                            Resumen de Fichajes
                        </h3>
                        <span className="text-white/70 text-[9px] font-bold uppercase tracking-wider">
                            {format(date, "EEEE d 'de' MMMM", { locale: es })}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors bg-white/10 p-2 rounded-xl">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 overflow-y-auto no-scrollbar">
                    {logs.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100">
                                <Clock className="text-zinc-300" size={24} />
                            </div>
                            <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest text-center">
                                No hay fichajes registrados
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {logs.map((log) => {
                                const firstName = log.first_name || log.employee_name || '?';
                                const lastName = log.last_name || '';

                                return (
                                    <button
                                        key={log.id}
                                        onClick={() => onSelectLog(log.user_id)}
                                        className="w-full bg-zinc-50 hover:bg-zinc-100/80 active:scale-[0.98] transition-all px-3 py-2 rounded-2xl border border-zinc-100 flex items-center gap-2 group"
                                    >
                                        {/* Name */}
                                        <span className="text-[11px] font-black text-zinc-800 uppercase tracking-tight truncate flex-1 min-w-0 text-left">
                                            {firstName} {lastName}
                                        </span>
                                        {/* Times (same row, right of name) */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <div className="flex items-center gap-0.5">
                                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">
                                                    {log.in_time || '--:--'}
                                                </span>
                                            </div>
                                            <span className="text-zinc-300 text-[8px]">-</span>
                                            <div className="flex items-center gap-0.5" title={log.clock_out_show_no_registrada ? 'Salida no registrada (olvidó fichar)' : undefined}>
                                                <div className="w-1 h-1 rounded-full bg-rose-500" />
                                                <span className={log.clock_out_show_no_registrada ? 'text-rose-600 font-bold text-[10px] uppercase' : 'text-[10px] font-mono font-bold text-zinc-500 uppercase'}>
                                                    {log.clock_out_show_no_registrada ? 'No registrada' : (log.out_time || '--:--')}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-zinc-50/50 border-t border-zinc-100">
                    <button
                        onClick={onClose}
                        className="w-full h-11 rounded-2xl bg-white border border-zinc-200 text-zinc-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                        Cerrar Resumen
                    </button>
                </div>
            </div>
        </div>
    );
}
