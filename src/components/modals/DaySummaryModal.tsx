'use client';

import React, { useState } from 'react';
import { Clock, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { createManagerFichaje } from '@/app/actions/overtime';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

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
    const trackDaySummary = useTrackModalApply('day-summary', 'Resumen de fichajes');
    const [showCreateFichaje, setShowCreateFichaje] = useState(false);
    const [createUserId, setCreateUserId] = useState('');
    const [createTime, setCreateTime] = useState('08:00');
    const [creating, setCreating] = useState(false);

    const employeeIdsWithLog = new Set((logs || []).map((l: { user_id: string }) => l.user_id));
    const availableEmployees = (employees || []).filter((e) => !employeeIdsWithLog.has(e.id));
    const canAddFichaje = isManager && availableEmployees.length > 0;

    const resetCreateForm = () => {
        setShowCreateFichaje(false);
        setCreateUserId('');
        setCreateTime('08:00');
    };

    const handleClose = () => {
        resetCreateForm();
        onClose();
    };

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
                resetCreateForm();
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

    const dateLabel = date ? format(date, "EEEE d 'de' MMMM", { locale: es }) : '';

    return (
        <>
            <Modal
                open={isOpen && !!date}
                onClose={handleClose}
                variant="standard"
                layer="base"
                instance="attendance-day-summary"
                usageId="day-summary"
                usageLabel="Resumen de fichajes"
                title="Resumen de Fichajes"
                subtitle={dateLabel}
                headerTone="petroleum"
                headerTrailing={
                    canAddFichaje ? (
                        <button
                            type="button"
                            onClick={() => setShowCreateFichaje(true)}
                            className="min-h-[48px] min-w-[48px] flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                            title="Nuevo fichaje"
                        >
                            <Plus size={20} strokeWidth={2.5} />
                        </button>
                    ) : undefined
                }
                footer={
                    <Button
                        type="button"
                        variant="secondary"
                        instance="attendance-day-summary-close"
                        onClick={handleClose}
                    >
                        Cerrar
                    </Button>
                }
            >
                <div className="p-4">
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
                                        onClick={() => {
                                            const summary = `${firstName} ${lastName}`.trim() || '?';
                                            trackDaySummary(summary, { selectedUserId: log.user_id });
                                            onSelectLog(log.user_id);
                                        }}
                                        className="w-full bg-zinc-50 hover:bg-zinc-100/80 active:scale-[0.98] transition-all px-3 py-2 rounded-2xl border border-zinc-100 flex items-center gap-2 group min-h-[48px]"
                                    >
                                        <span className="text-[11px] font-black text-zinc-800 uppercase tracking-tight truncate flex-1 min-w-0 text-left">
                                            {firstName} {lastName}
                                        </span>
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
            </Modal>

            <Modal
                open={isOpen && !!date && showCreateFichaje}
                onClose={() => {
                    if (!creating) resetCreateForm();
                }}
                variant="compact"
                layer="derived"
                instance="attendance-day-create-fichaje"
                parentInstance="attendance-day-summary"
                usageId="day-summary-create-fichaje"
                usageLabel="Nuevo fichaje día"
                title="Nuevo fichaje"
                subtitle={dateLabel}
                headerTone="petroleum"
                footer={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            instance="attendance-day-create-fichaje-cancel"
                            onClick={() => !creating && resetCreateForm()}
                            disabled={creating}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="attendance-day-create-fichaje-create"
                            onClick={() => void handleCreateFichaje()}
                            disabled={creating || !createUserId}
                            loading={creating}
                            loadingLabel="Crear"
                        >
                            Crear
                        </Button>
                    </>
                }
            >
                <div className="space-y-4 p-4">
                    <div>
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Empleado</label>
                        <select
                            value={createUserId}
                            onChange={(e) => setCreateUserId(e.target.value)}
                            className="w-full min-h-[48px] h-12 px-3 rounded-xl border-2 border-zinc-200 text-[11px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none"
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
                            className="w-full max-w-[140px] mx-auto min-h-[48px] h-12 px-3 rounded-xl border-2 border-zinc-200 text-[11px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none block"
                        />
                    </div>
                </div>
            </Modal>
        </>
    );
}
