'use client';

import React, { useState } from 'react';
import { X, Clock, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { createManagerFichaje } from '@/app/actions/overtime';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';

export type EmployeeOption = { id: string; first_name: string; last_name: string };

interface DaySummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    logs: any[];
    onSelectLog: (userId: string) => void;
    /** Lista de empleados (plantilla). Solo managers ven el botón + y empleados sin fichaje. */
    employees?: EmployeeOption[];
    /** Llamado tras crear un fichaje para refrescar datos. */
    onFichajeCreated?: () => void;
    isManager?: boolean;
}

export function DaySummaryModal({ isOpen, onClose, date, logs, onSelectLog, employees = [], onFichajeCreated, isManager }: DaySummaryModalProps) {
    const [showCreateFichaje, setShowCreateFichaje] = useState(false);
    const [createUserId, setCreateUserId] = useState('');
    const [createTime, setCreateTime] = useState('09:00');
    const [creating, setCreating] = useState(false);

    const employeeIdsWithLog = new Set((logs || []).map((l: { user_id: string }) => l.user_id));
    const availableEmployees = (employees || []).filter((e) => !employeeIdsWithLog.has(e.id));
    const canAddFichaje = isManager && availableEmployees.length > 0;

    const handleCreateFichaje = async () => {
        if (!date || !createUserId || !createTime.trim()) {
            toast.error('Selecciona empleado y hora');
            return;
        }
        setCreating(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const result = await createManagerFichaje(createUserId, dateStr, createTime.trim());
            if (result.success) {
                toast.success('Fichaje creado');
                setShowCreateFichaje(false);
                setCreateUserId('');
                setCreateTime('09:00');
                onFichajeCreated?.();
            } else {
                toast.error(result.error ?? 'Error al crear fichaje');
            }
        } catch (e) {
            toast.error('Error al crear fichaje');
        } finally {
            setCreating(false);
        }
    };

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
                    <div className="flex items-center gap-1">
                        {canAddFichaje && (
                            <button
                                type="button"
                                onClick={() => setShowCreateFichaje(true)}
                                className="min-h-[48px] min-w-[48px] flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                                title="Nuevo fichaje"
                            >
                                <Plus size={20} strokeWidth={2.5} />
                            </button>
                        )}
                        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors bg-white/10 p-2 rounded-xl min-h-[48px] min-w-[48px] flex items-center justify-center">
                            <X size={18} />
                        </button>
                    </div>
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

            {/* Modal crear fichaje (empleado + hora) */}
            {showCreateFichaje && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[142] p-4 rounded-[32px]" onClick={() => !creating && setShowCreateFichaje(false)}>
                    <div className="w-full max-w-[280px] bg-white rounded-2xl shadow-2xl p-4 space-y-4" onClick={e => e.stopPropagation()}>
                        <h4 className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">Nuevo fichaje</h4>
                        <div>
                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Empleado</label>
                            <select
                                value={createUserId}
                                onChange={(e) => setCreateUserId(e.target.value)}
                                className="w-full h-12 px-3 rounded-xl border-2 border-zinc-200 text-[11px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none"
                            >
                                <option value="">Seleccionar</option>
                                {availableEmployees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.first_name} {emp.last_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Hora entrada</label>
                            <input
                                type="time"
                                value={createTime}
                                onChange={(e) => setCreateTime(e.target.value)}
                                className="w-full max-w-[140px] mx-auto h-12 px-3 rounded-xl border-2 border-zinc-200 text-[11px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none block"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => !creating && setShowCreateFichaje(false)}
                                className="flex-1 h-12 rounded-xl bg-zinc-100 text-zinc-600 font-black text-[9px] uppercase tracking-widest active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateFichaje}
                                disabled={creating || !createUserId}
                                className={cn("flex-1 h-12 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-1 min-h-[48px]", creating || !createUserId ? "bg-zinc-200 text-zinc-400" : "bg-emerald-500 text-white")}
                            >
                                {creating ? <LoadingSpinner size="sm" /> : <Plus size={14} />}
                                Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
