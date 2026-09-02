'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { createManagerFichaje } from '@/app/actions/overtime';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { WorkerPersonRow } from '@/components/staff/WorkerPersonRow';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { canManageStaffAttendance } from '@/lib/staff/attendance-access';
import { createClient } from '@/utils/supabase/client';
import {
    filterVisiblePlantillaEmployees,
    PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';

export type EmployeeOption = { id: string; first_name: string; last_name: string };

export type DaySummaryLog = {
    id: string;
    user_id: string;
    first_name?: string;
    last_name?: string;
    employee_name?: string;
    in_time?: string;
    out_time?: string;
    clock_out_show_no_registrada?: boolean;
};

interface DaySummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    logs: DaySummaryLog[];
    onSelectLog: (userId: string) => void;
    employees?: EmployeeOption[];
    onFichajeCreated?: () => void;
    /** Fuerza el botón de crear fichaje (p. ej. Master por email). */
    allowCreateFichaje?: boolean;
    /** @deprecated Usar allowCreateFichaje */
    isManager?: boolean;
    canManageAttendance?: boolean;
    userRole?: string;
    viewerEmail?: string;
}

export function DaySummaryModal({
    isOpen,
    onClose,
    date,
    logs,
    onSelectLog,
    employees = [],
    onFichajeCreated,
    allowCreateFichaje,
    isManager,
    canManageAttendance,
    userRole,
    viewerEmail,
}: DaySummaryModalProps) {
    const trackDaySummary = useTrackModalApply('day-summary', 'Resumen de fichajes');
    const [showCreateFichaje, setShowCreateFichaje] = useState(false);
    const [createUserId, setCreateUserId] = useState('');
    const [createTime, setCreateTime] = useState('08:00');
    const [creating, setCreating] = useState(false);
    const [roster, setRoster] = useState<EmployeeOption[]>(employees);
    const [loadingRoster, setLoadingRoster] = useState(false);

    const canManage =
        allowCreateFichaje === true ||
        canManageAttendance === true ||
        isManager === true ||
        canManageStaffAttendance(userRole, viewerEmail);

    const employeeIdsWithLog = new Set((logs || []).map((l) => l.user_id));
    const availableEmployees = roster.filter((e) => !employeeIdsWithLog.has(e.id));

    const loadRoster = useCallback(async () => {
        setLoadingRoster(true);
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('profiles')
                .select(PLANTILLA_EMPLOYEE_SELECT)
                .order('first_name');

            if (error) throw error;

            const visible = filterVisiblePlantillaEmployees(data ?? []);
            setRoster(
                visible.map((emp) => ({
                    id: emp.id,
                    first_name: emp.first_name ?? '',
                    last_name: emp.last_name ?? '',
                })),
            );
        } catch (err) {
            console.error('DaySummaryModal loadRoster:', err);
            toast.error('No se pudo cargar la plantilla');
        } finally {
            setLoadingRoster(false);
        }
    }, []);

    useEffect(() => {
        if (employees.length > 0) {
            setRoster(employees);
        }
    }, [employees]);

    useEffect(() => {
        if (!isOpen || !canManage) return;
        if (roster.length > 0) return;
        void loadRoster();
    }, [isOpen, canManage, roster.length, loadRoster]);

    useEffect(() => {
        if (!isOpen) {
            setShowCreateFichaje(false);
            setCreateUserId('');
            setCreateTime('08:00');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!showCreateFichaje || createUserId) return;
        const first = availableEmployees[0]?.id;
        if (first) setCreateUserId(first);
    }, [showCreateFichaje, availableEmployees, createUserId]);

    const resetCreateForm = () => {
        setShowCreateFichaje(false);
        setCreateUserId('');
        setCreateTime('08:00');
    };

    const handleClose = () => {
        resetCreateForm();
        onClose();
    };

    const openCreateFichaje = () => {
        if (roster.length === 0 && !loadingRoster) {
            void loadRoster().then(() => {
                setShowCreateFichaje(true);
            });
            return;
        }
        if (availableEmployees.length === 0) {
            toast.error('Todos los empleados de la plantilla ya tienen fichaje este día');
            return;
        }
        setCreateUserId(availableEmployees[0]?.id ?? '');
        setShowCreateFichaje(true);
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
        } catch {
            toast.error('Error al crear fichaje');
        } finally {
            setCreating(false);
        }
    };

    const dateLabel = date ? format(date, "EEEE d 'de' MMMM", { locale: es }) : '';

    const addButton = (
        <button
            type="button"
            onClick={openCreateFichaje}
            className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
            aria-label="Nuevo fichaje"
        >
            <Plus size={18} strokeWidth={2.5} />
        </button>
    );

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
                headerTrailing={canManage ? addButton : undefined}
                footer={
                    <div className="flex w-full gap-2 px-ds-4">
                        {canManage ? (
                            <Button
                                type="button"
                                variant="primary"
                                instance="attendance-day-summary-create"
                                onClick={openCreateFichaje}
                                disabled={loadingRoster}
                                loading={loadingRoster}
                                loadingLabel="Cargando"
                                icon={<Plus size={16} strokeWidth={2.5} />}
                                className="flex-1"
                            >
                                Nuevo fichaje
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            variant="secondary"
                            instance="attendance-day-summary-close"
                            onClick={handleClose}
                            className={canManage ? 'flex-1' : 'w-full'}
                        >
                            Cerrar
                        </Button>
                    </div>
                }
            >
                <div>
                    {logs.length === 0 ? (
                        <EmptyState instance="attendance-day-summary-none" variant="none" title="No hay fichajes registrados" />
                    ) : (
                        <div>
                            {logs.map((log) => {
                                const firstName = log.first_name || log.employee_name || '?';
                                const lastName = log.last_name || '';
                                const name = `${firstName} ${lastName}`.trim() || '?';
                                const outLabel = log.clock_out_show_no_registrada
                                    ? 'Salida no registrada'
                                    : (log.out_time || '--:--');

                                return (
                                    <WorkerPersonRow
                                        key={log.id}
                                        name={name}
                                        subtitle={
                                            <>
                                                <span>{log.in_time || '--:--'}</span>
                                                <span className="text-zinc-300">·</span>
                                                <span className={log.clock_out_show_no_registrada ? 'text-rose-600' : undefined}>
                                                    {outLabel}
                                                </span>
                                            </>
                                        }
                                        onClick={() => {
                                            trackDaySummary(name, { selectedUserId: log.user_id });
                                            onSelectLog(log.user_id);
                                        }}
                                    />
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
                <div className="space-y-4">
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
