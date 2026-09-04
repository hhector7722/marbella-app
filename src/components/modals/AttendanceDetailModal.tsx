'use client';

import React, { useState, useEffect } from 'react';
import { Coins, Landmark, Calendar, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { fromZonedTime } from 'date-fns-tz';
import { updateWeeklyWorkerConfig, createManagerFichaje, deleteManagerDayLogs } from '@/app/actions/overtime';
import { createClient } from '@/utils/supabase/client';
import LaborConditionsView from '@/components/profile/LaborConditionsView';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn, calculateRoundedHours } from '@/lib/utils';
import { formatMadridHmFromIso, madridDayUtcRangeIso } from '@/lib/madrid-date-bounds';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';
import type { EmployeeOption } from '@/components/modals/DaySummaryModal';
import { canManageStaffAttendance } from '@/lib/staff/attendance-access';

interface AttendanceDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    userId: string | null;
    userRole: string;
    /** Email del usuario que abre el modal (Master por email puede gestionar aunque role sea staff). */
    viewerEmail?: string;
    onSuccess: () => void;
    /** Plantilla visible: permite crear fichaje para otro trabajador sin fichaje ese día. */
    employees?: EmployeeOption[];
}

const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermo', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'adjustment', label: 'Baja', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
    { value: 'no_registered', label: 'No registrado', color: 'bg-red-600 text-white', border: 'border-red-200 bg-red-50', showCross: true },
];

/** Tipos que computan en contrato/banco pero no son jornada trabajada (ni propinas). */
const JUSTIFIED_EVENT_TYPES = new Set(['holiday', 'weekend', 'adjustment', 'personal']);

type DayLogDraft = {
    id?: string;
    in_time: string;
    out_time: string;
    event_type: string;
    is_deleted: boolean;
    clock_out_show_no_registrada?: boolean;
    /** Horas trabajadas (reloj o override manual). No incluye justificadas. */
    total_hours_override?: number | null;
    /** Horas acreditadas (examen/permiso) en el MISMO fichaje — idx_one_shift_per_day. */
    justified_hours?: number;
    /** Clave local para logs nuevos sin id. */
    _localKey?: string;
};

function isJustifiedEvent(eventType: string): boolean {
    return JUSTIFIED_EVENT_TYPES.has(eventType);
}

/** Solo enteros o .5 (regla Marbella). */
function fmtMarbellaHours(hours: number): string {
    const r = calculateRoundedHours(Math.abs(hours));
    const s = r % 1 === 0 ? String(r) : r.toFixed(1);
    return hours < 0 ? `-${s}` : s;
}

function calculateLogHours(inStr: string, outStr: string) {
    if (!inStr || !outStr) return 0;
    const [inH, inM] = inStr.split(':').map(Number);
    const [outH, outM] = outStr.split(':').map(Number);
    const inDate = new Date();
    inDate.setHours(inH, inM, 0, 0);
    const outDate = new Date();
    outDate.setHours(outH, outM, 0, 0);
    if (outDate < inDate) outDate.setDate(outDate.getDate() + 1);
    const diffMinutes = (outDate.getTime() - inDate.getTime()) / (1000 * 60);

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    let fraction = 0;
    if (minutes > 20 && minutes <= 50) fraction = 0.5;
    else if (minutes > 50) fraction = 1.0;
    return hours + fraction;
}

function resolveWorkedHours(log: DayLogDraft): number {
    if (log.total_hours_override !== undefined && log.total_hours_override !== null) {
        return Number(log.total_hours_override) || 0;
    }
    return calculateLogHours(log.in_time || '', log.out_time || '');
}

function resolveJustifiedHours(log: DayLogDraft): number {
    return Math.max(0, Number(log.justified_hours) || 0);
}

/** Total que computa: trabajadas + justificadas (mismo registro). */
function resolveDraftHours(log: DayLogDraft): number {
    if (isJustifiedEvent(log.event_type)) {
        // Día completo F/E/B/P: el total del evento es lo que computa
        if (log.total_hours_override !== undefined && log.total_hours_override !== null) {
            return Number(log.total_hours_override) || 0;
        }
        return calculateLogHours(log.in_time || '', log.out_time || '');
    }
    return resolveWorkedHours(log) + resolveJustifiedHours(log);
}

/** Reloj sintético para días solo-especiales (F/E/B/P sin fichaje real). */
function syntheticTimesForHours(hours: number): { in_time: string; out_time: string } {
    const safe = Math.max(0.5, calculateRoundedHours(hours) || 0.5);
    const totalMin = Math.round(safe * 60);
    const startH = 9;
    const endTotal = startH * 60 + totalMin;
    const outH = Math.floor(endTotal / 60) % 24;
    const outM = endTotal % 60;
    return {
        in_time: `${String(startH).padStart(2, '0')}:00`,
        out_time: `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`,
    };
}

interface EditWeekModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    userId: string | null;
    onSuccess: () => void;
}

function EditWeekModal({ isOpen, onClose, date, userId, onSuccess }: EditWeekModalProps) {
    const [contractedHours, setContractedHours] = useState<number>(40);
    const [preferStock, setPreferStock] = useState<boolean>(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [contractModalOpen, setContractModalOpen] = useState(false);

    useModalUsageTracking({
        open: isOpen,
        usageId: 'attendance-edit-week',
        usageLabel: 'Editar semana asistencia',
    });
    const trackEditWeekSave = useTrackModalApply('attendance-edit-week', 'Editar semana asistencia');

    const weekStart = date
        ? format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        : '';

    useEffect(() => {
        if (!isOpen || !userId || !weekStart) return;
        setLoading(true);
        (async () => {
            try {
                const { createClient } = await import('@/utils/supabase/client');
                const supabase = createClient();
                const [snapRes, profileRes] = await Promise.all([
                    supabase
                        .from('weekly_snapshots')
                        .select('contracted_hours_snapshot, prefer_stock_hours_override')
                        .eq('user_id', userId)
                        .eq('week_start', weekStart)
                        .maybeSingle(),
                    supabase.from('profiles').select('contracted_hours_weekly, prefer_stock_hours').eq('id', userId).single(),
                ]);
                const snap = snapRes.data;
                const profile = profileRes.data;
                const contracted = snap?.contracted_hours_snapshot ?? profile?.contracted_hours_weekly ?? 40;
                const prefer = snap?.prefer_stock_hours_override ?? profile?.prefer_stock_hours ?? false;
                setContractedHours(typeof contracted === 'number' ? contracted : (Number(contracted) ?? 0));
                setPreferStock(!!prefer);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, [isOpen, userId, weekStart]);

    const handleSave = async () => {
        if (!userId || !weekStart) return;
        setSaving(true);
        try {
            const result = await updateWeeklyWorkerConfig(userId, weekStart, {
                contractedHours,
                preferStock,
            });
            if (result.success) {
                toast.success('Semana actualizada');
                trackEditWeekSave(`Semana ${weekStart} · ${preferStock ? 'Bolsa horas' : 'Nómina'}`);
                onSuccess();
                onClose();
            } else {
                toast.error(result.error ?? 'Error al guardar');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const weekStartDate = weekStart ? (() => {
        const [y, m, d] = weekStart.split('-').map(Number);
        return new Date(y, m - 1, d);
    })() : null;
    const weekEndDate = weekStartDate ? addDays(weekStartDate, 6) : null;
    const weekLabel = weekStartDate && weekEndDate
        ? `${format(weekStartDate, 'd', { locale: es })} al ${format(weekEndDate, 'd MMM yyyy', { locale: es })}`
        : '';

    return (
        <>
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Editar semana"
            instance="attendance-edit-week"
            variant="compact"
            layer="derived"
            parentInstance="attendance-detail"
            headerTone="petroleum"
            footer={
                !loading ? (
                    <div className="flex w-full items-center justify-end gap-2">
                        <Button type="button" variant="secondary" instance="attendance-detail-cancel" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="attendance-detail-save"
                            onClick={handleSave}
                            loading={saving}
                            loadingLabel="Guardar"
                        >
                            Guardar
                        </Button>
                    </div>
                ) : undefined
            }
        >
                <div className="space-y-4">
                    {weekLabel && (
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{weekLabel}</p>
                    )}
                    {loading ? (
                        <div className="py-6 flex justify-center">
                            <LoadingSpinner size="md" className="text-[#36606F]" />
                        </div>
                    ) : (
                        <>
                            <div>
                                <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Overtime</span>
                                <div className="flex bg-zinc-200 p-0.5 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setPreferStock(false)}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded text-[9px] font-black transition-all min-h-[48px]",
                                            !preferStock ? "bg-white text-emerald-600 shadow" : "text-zinc-500"
                                        )}
                                    >
                                        <Coins size={14} />
                                        PAGO
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPreferStock(true)}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded text-[9px] font-black transition-all min-h-[48px]",
                                            preferStock ? "bg-white text-blue-600 shadow" : "text-zinc-500"
                                        )}
                                    >
                                        <Landmark size={14} />
                                        BOLSA
                                    </button>
                                </div>
                            </div>
                            <div>
                                <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Horas contratadas (semana)</span>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="number"
                                        readOnly
                                        value={contractedHours !== undefined && contractedHours !== null ? contractedHours : 0}
                                        className="flex-1 h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-black text-zinc-500 bg-zinc-100 cursor-not-allowed outline-none"
                                        aria-label="Horas contratadas (semana)"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setContractModalOpen(true)}
                                        className="h-12 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center transition-colors shrink-0 shadow-sm"
                                    >
                                        Contrato
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
        </Modal>

        {userId && (
            <Modal
                open={contractModalOpen}
                onClose={() => setContractModalOpen(false)}
                title="Condiciones Laborales y Contrato"
                instance="attendance-contract"
                variant="standard"
                layer="system"
            >
                <LaborConditionsView
                    employeeId={userId}
                    onSaveSuccess={async () => {
                        setContractModalOpen(false);
                        onSuccess();
                        const supabase = createClient();
                        const { data: snap } = await supabase
                            .from('weekly_snapshots')
                            .select('contracted_hours_snapshot')
                            .eq('user_id', userId)
                            .eq('week_start', weekStart)
                            .maybeSingle();
                        if (snap && typeof snap.contracted_hours_snapshot === 'number') {
                            setContractedHours(snap.contracted_hours_snapshot);
                        }
                    }}
                    onClose={() => setContractModalOpen(false)}
                />
            </Modal>
        )}
        </>
    );
}

export function AttendanceDetailModal({ isOpen, onClose, date, userId, userRole, viewerEmail, onSuccess, employees = [] }: AttendanceDetailModalProps) {
    useModalUsageTracking({
        open: isOpen,
        usageId: 'attendance-detail',
        usageLabel: 'Detalle de asistencia',
    });
    const trackAttendanceDaySave = useTrackModalApply('attendance-detail', 'Detalle de asistencia');

    const [logs, setLogs] = useState<DayLogDraft[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editWeekModalOpen, setEditWeekModalOpen] = useState(false);
    const [showCreateFichaje, setShowCreateFichaje] = useState(false);
    const [createTime, setCreateTime] = useState('08:00');
    const [createUserId, setCreateUserId] = useState('');
    const [busyEmployeeIds, setBusyEmployeeIds] = useState<Set<string>>(() => new Set());
    const [creating, setCreating] = useState(false);
    const isManager = canManageStaffAttendance(userRole, viewerEmail);

    const availableEmployees = React.useMemo(() => {
        const roster: EmployeeOption[] = employees.length
            ? employees
            : userId
              ? [{ id: userId, first_name: '', last_name: '' }]
              : [];
        return roster.filter((employee) => !busyEmployeeIds.has(employee.id));
    }, [employees, busyEmployeeIds, userId]);

    const canCreateFichaje = isManager && !!date && availableEmployees.length > 0;

    const openCreateFichaje = () => {
        const preferred =
            (userId && availableEmployees.some((employee) => employee.id === userId) ? userId : null) ??
            availableEmployees[0]?.id ??
            '';
        setCreateUserId(preferred);
        setShowCreateFichaje(true);
    };

    const resetCreateFichaje = () => {
        setShowCreateFichaje(false);
        setCreateUserId('');
        setCreateTime('08:00');
    };

    useEffect(() => {
        if (isOpen && date && userId) {
            void fetchDayLogs();
            if (isManager) {
                void fetchBusyEmployeeIds();
            } else {
                setBusyEmployeeIds(new Set());
            }
        }
    }, [isOpen, date, userId, isManager]);

    async function fetchDayLogs() {
        if (!date || !userId) return;
        setLoading(true);
        try {
            const { createClient } = await import('@/utils/supabase/client');
            const supabase = createClient();

            const dateStr = format(date, 'yyyy-MM-dd');
            const { startIso, endIso } = madridDayUtcRangeIso(dateStr);

            const { data, error } = await supabase
                .from('time_logs')
                .select('*')
                .eq('user_id', userId)
                .gte('clock_in', startIso)
                .lte('clock_in', endIso)
                .order('clock_in', { ascending: true });

            if (error) throw error;

            const rawLogs: DayLogDraft[] = data?.map((l) => {
                const justified = Math.max(0, Number((l as { justified_hours?: number }).justified_hours) || 0);
                const total = l.total_hours != null ? Number(l.total_hours) : 0;
                const clockWorked = calculateLogHours(
                    formatMadridHmFromIso(l.clock_in) ?? '',
                    l.clock_out ? (formatMadridHmFromIso(l.clock_out) ?? '') : '',
                );
                const eventType = l.event_type || 'regular';
                // Trabajadas = total − justificadas (o reloj si aún no hay desglose)
                const worked = isJustifiedEvent(eventType)
                    ? total
                    : (clockWorked > 0 ? clockWorked : Math.max(0, total - justified));

                return {
                    id: l.id,
                    in_time: formatMadridHmFromIso(l.clock_in) ?? '',
                    out_time: l.clock_out ? (formatMadridHmFromIso(l.clock_out) ?? '') : '',
                    event_type: eventType,
                    is_deleted: false,
                    clock_out_show_no_registrada: l.clock_out_show_no_registrada === true,
                    total_hours_override: worked,
                    justified_hours: isJustifiedEvent(eventType) ? 0 : justified,
                };
            }) || [];

            setLogs(rawLogs);
            resetCreateFichaje();
        } catch (err) {
            console.error(err);
            toast.error("Error al cargar registros");
        } finally {
            setLoading(false);
        }
    }

    async function fetchBusyEmployeeIds() {
        if (!date) return;
        try {
            const supabase = createClient();
            const dateStr = format(date, 'yyyy-MM-dd');
            const { startIso, endIso } = madridDayUtcRangeIso(dateStr);
            const { data, error } = await supabase
                .from('time_logs')
                .select('user_id')
                .gte('clock_in', startIso)
                .lte('clock_in', endIso);

            if (error) throw error;
            setBusyEmployeeIds(new Set((data ?? []).map((row) => row.user_id)));
        } catch (err) {
            console.error(err);
            setBusyEmployeeIds(new Set());
        }
    }

    const updateLog = (index: number, field: keyof DayLogDraft, value: unknown) => {
        setLogs((prev) => {
            const next = [...prev];
            const current = { ...next[index]!, [field]: value } as DayLogDraft;
            if (field === 'event_type' && typeof value === 'string' && isJustifiedEvent(value)) {
                const hours = resolveDraftHours(current) || 1;
                const times = syntheticTimesForHours(hours);
                current.in_time = times.in_time;
                current.out_time = times.out_time;
                current.total_hours_override = hours;
            }
            if ((field === 'in_time' || field === 'out_time') && !isJustifiedEvent(current.event_type)) {
                current.total_hours_override = calculateLogHours(current.in_time || '', current.out_time || '');
            }
            next[index] = current;
            return next;
        });
    };

    const setLogHours = (index: number, hours: number) => {
        const rounded = calculateRoundedHours(Math.max(0, hours));
        setLogs((prev) => {
            const next = [...prev];
            const current = { ...next[index]! };
            current.total_hours_override = rounded;
            if (isJustifiedEvent(current.event_type)) {
                const times = syntheticTimesForHours(rounded || 0.5);
                current.in_time = times.in_time;
                current.out_time = times.out_time;
                current.justified_hours = 0;
            }
            next[index] = current;
            return next;
        });
    };

    const setJustifiedHours = (index: number, hours: number) => {
        const rounded = calculateRoundedHours(Math.max(0, hours));
        setLogs((prev) => {
            const next = [...prev];
            const current = { ...next[index]! };
            current.justified_hours = rounded;
            next[index] = current;
            return next;
        });
    };

    /**
     * Añade 1h justificada al fichaje del día (mismo registro: idx_one_shift_per_day).
     * Si no hay fichaje, crea un día Personal con 1h.
     */
    const addJustifiedHours = () => {
        setLogs((prev) => {
            const next = [...prev];
            const idx = next.findIndex((l) => !l.is_deleted && !isJustifiedEvent(l.event_type));
            if (idx >= 0) {
                const current = { ...next[idx]! };
                current.justified_hours = calculateRoundedHours(
                    (Number(current.justified_hours) || 0) + 1,
                );
                next[idx] = current;
                return next;
            }
            const anyIdx = next.findIndex((l) => !l.is_deleted);
            if (anyIdx >= 0) {
                toast.error('Cambia el evento a Regular para añadir permiso parcial, o edita las horas del día especial.');
                return prev;
            }
            const times = syntheticTimesForHours(1);
            return [
                {
                    _localKey: `justified-${Date.now()}`,
                    in_time: times.in_time,
                    out_time: times.out_time,
                    event_type: 'personal',
                    is_deleted: false,
                    total_hours_override: 1,
                    justified_hours: 0,
                    clock_out_show_no_registrada: false,
                },
            ];
        });
    };

    const markLogDeleted = (index: number) => {
        setLogs((prev) => {
            const next = [...prev];
            const log = next[index];
            if (!log) return prev;
            if (log.id) {
                next[index] = { ...log, is_deleted: true };
            } else {
                next.splice(index, 1);
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (!date || !userId) return;
        setIsSaving(true);

        try {
            const dayOfWeek = date.getDay();
            const diffToMonday = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const monday = new Date(date);
            monday.setDate(diffToMonday);
            const weekStartStr = format(monday, 'yyyy-MM-dd');

            const logsToUpdate = logs.map((l) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                let inTimeIso = '';
                let outTimeIso = '';

                if (l.in_time) {
                    const [h, m] = l.in_time.split(':').map(Number);
                    const hh = String(h).padStart(2, '0');
                    const mm = String(m).padStart(2, '0');
                    inTimeIso = fromZonedTime(`${dateStr}T${hh}:${mm}:00`, 'Europe/Madrid').toISOString();
                }

                if (l.out_time) {
                    let outDateStr = dateStr;
                    const [h, m] = l.out_time.split(':').map(Number);
                    if (l.in_time) {
                        const [inH] = l.in_time.split(':').map(Number);
                        if (h < inH) {
                            const next = new Date(date);
                            next.setDate(next.getDate() + 1);
                            outDateStr = format(next, 'yyyy-MM-dd');
                        }
                    }
                    const hh = String(h).padStart(2, '0');
                    const mm = String(m).padStart(2, '0');
                    outTimeIso = fromZonedTime(`${outDateStr}T${hh}:${mm}:00`, 'Europe/Madrid').toISOString();
                }

                const hours = resolveDraftHours(l);
                const justified = isJustifiedEvent(l.event_type) ? 0 : resolveJustifiedHours(l);

                return {
                    ...(l.id ? { id: l.id } : {}),
                    date: dateStr,
                    in_time: l.in_time,
                    out_time: l.out_time,
                    inTimeIso,
                    outTimeIso,
                    event_type: l.event_type,
                    is_deleted: l.is_deleted,
                    total_hours_override: hours,
                    justified_hours: justified,
                    clock_out_show_no_registrada: l.clock_out_show_no_registrada === true,
                };
            });

            const result = await updateWeeklyWorkerConfig(userId, weekStartStr, { logs: logsToUpdate });

            if (result.success) {
                toast.success("Registros actualizados correctamente");
                trackAttendanceDaySave(formatYmdShort(format(date, 'yyyy-MM-dd')), { userId });
                onSuccess();
                onClose();
            } else {
                toast.error("Error al guardar: " + result.error);
            }
        } catch (err) {
            console.error(err);
            toast.error("Error crítico al guardar");
        } finally {
            setIsSaving(false);
        }
    };

    const activeLogs = logs.filter((l) => !l.is_deleted);
    const showAddFichajeButton = canCreateFichaje && !loading;
    const dayTotalHours = activeLogs.reduce((acc, l) => acc + resolveDraftHours(l), 0);

    const handleCreateFichaje = async () => {
        if (!date || !createUserId || !createTime.trim()) return;
        setCreating(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const result = await createManagerFichaje(createUserId, dateStr, createTime.trim());
            if (result.success) {
                toast.success('Fichaje creado');
                resetCreateFichaje();
                await fetchBusyEmployeeIds();
                if (createUserId === userId) {
                    await fetchDayLogs();
                } else {
                    onSuccess();
                    onClose();
                }
            } else {
                toast.error(result.error ?? 'Error al crear fichaje');
            }
        } catch (e) {
            toast.error('Error al crear fichaje');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteDay = async () => {
        if (!date || !userId) return;
        if (!confirm('¿Estás seguro de que deseas eliminar TODOS los registros de este día?')) return;

        setIsSaving(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const result = await deleteManagerDayLogs(userId, dateStr);
            if (result.success) {
                toast.success('Día eliminado correctamente');
                onSuccess();
                onClose();
            } else {
                toast.error(result.error ?? 'Error al eliminar el día');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error al eliminar el día');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={date ? format(date, "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()) : ''}
            instance="attendance-detail"
            variant="compact"
            layer="base"
            footer={
                !loading ? (
                    isManager ? (
                        <>
                            <Button
                                type="button"
                                variant="destructive"
                                instance="attendance-detail-borrar-dia"
                                onClick={handleDeleteDay}
                                disabled={isSaving}
                            >
                                Borrar día
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                instance="attendance-detail-salir"
                                onClick={onClose}
                            >
                                Salir
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                instance="attendance-detail-guardar"
                                onClick={handleSave}
                                loading={isSaving}
                                loadingLabel="Guardar"
                            >
                                Guardar
                            </Button>
                        </>
                    ) : (
                        <Button
                            type="button"
                            variant="secondary"
                            instance="attendance-detail-cerrar"
                            onClick={onClose}
                        >
                            Cerrar
                        </Button>
                    )
                ) : undefined
            }
            headerTrailing={
                showAddFichajeButton ? (
                    <button
                        type="button"
                        onClick={() => openCreateFichaje()}
                        className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                        aria-label="Nuevo fichaje"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                    </button>
                ) : null
            }
            scrollContent={false}
        >
                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    {loading ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-1.5">
                            <LoadingSpinner size="md" className="text-red-500" />
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Cargando...</p>
                        </div>
                    ) : activeLogs.length === 0 ? (
                        showCreateFichaje && isManager && createUserId && date ? (
                            <div className="space-y-3">
                                {availableEmployees.length > 1 ? (
                                    <div>
                                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Empleado</label>
                                        <select
                                            value={createUserId}
                                            onChange={(e) => setCreateUserId(e.target.value)}
                                            className="w-full min-h-[48px] h-12 px-3 rounded-xl border-2 border-zinc-200 text-[11px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none"
                                        >
                                            {availableEmployees.map((employee) => (
                                                <option key={employee.id} value={employee.id}>
                                                    {[employee.first_name, employee.last_name].filter(Boolean).join(' ') || 'Empleado'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : null}
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Nuevo fichaje — Hora entrada</span>
                                <input
                                    type="time"
                                    value={createTime}
                                    onChange={(e) => setCreateTime(e.target.value)}
                                    className="w-full max-w-[140px] mx-auto h-12 px-3 rounded-xl border-2 border-zinc-200 text-[13px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none block"
                                />
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        instance="attendance-detail-crear-cancelar"
                                        onClick={() => resetCreateFichaje()}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        instance="attendance-detail-crear"
                                        onClick={handleCreateFichaje}
                                        disabled={creating}
                                        loading={creating}
                                        loadingLabel="Crear"
                                        className="flex-1"
                                    >
                                        Crear
                                    </Button>
                                </div>
                                {isManager && (
                                    <button
                                        type="button"
                                        onClick={addJustifiedHours}
                                        className="w-full min-h-[48px] rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-black text-[8px] uppercase tracking-widest active:scale-95"
                                    >
                                        + Horas justificadas
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="py-6 flex flex-col items-center justify-center gap-3">
                                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest text-center">Sin datos</span>
                                {canCreateFichaje ? (
                                    <Button
                                        type="button"
                                        variant="primary"
                                        instance="attendance-detail-nuevo-fichaje"
                                        onClick={openCreateFichaje}
                                    >
                                        Nuevo fichaje
                                    </Button>
                                ) : null}
                                {isManager && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={addJustifiedHours}
                                            className="w-full max-w-[200px] min-h-[48px] rounded-xl border border-blue-200 bg-blue-50 text-blue-700 flex items-center justify-center gap-1.5 py-2 px-2 active:scale-95"
                                        >
                                            <Plus size={14} strokeWidth={2.5} />
                                            <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Horas justificadas</span>
                                        </button>
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="attendance-detail-editar-semana-empty"
                                            onClick={() => setEditWeekModalOpen(true)}
                                        >
                                            Editar semana
                                        </Button>
                                    </>
                                )}
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col gap-2">
                            {logs.map((log, index) => {
                                if (log.is_deleted) return null;
                                const specialDay = isJustifiedEvent(log.event_type);
                                const workedHours = specialDay ? resolveDraftHours(log) : resolveWorkedHours(log);
                                const justifiedAmt = resolveJustifiedHours(log);
                                const dayTotal = resolveDraftHours(log);
                                const eventLabel = EVENT_TYPES.find((t) => t.value === log.event_type)?.label ?? log.event_type;

                                return (
                                    <div
                                        key={log.id ?? log._localKey ?? `log-${index}`}
                                        className={cn(
                                            'rounded-xl border p-2',
                                            specialDay ? 'border-blue-100 bg-blue-50/40' : 'border-zinc-100 bg-white',
                                        )}
                                    >
                                        {specialDay ? (
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <span className="text-[7px] font-black uppercase tracking-widest text-blue-700">
                                                    Día {eventLabel}
                                                </span>
                                                {isManager && (
                                                    <button
                                                        type="button"
                                                        onClick={() => markLogDeleted(index)}
                                                        className="min-h-[32px] min-w-[32px] flex items-center justify-center text-rose-400 hover:text-rose-600 rounded-lg"
                                                        title="Quitar"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ) : null}

                                        {!specialDay && (
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="bg-zinc-50 rounded-xl py-1.5 pl-2 pr-1 border border-zinc-100 relative overflow-hidden">
                                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />
                                                    <span className="text-[6px] font-black text-emerald-600 uppercase tracking-widest block">Entrada</span>
                                                    {isManager ? (
                                                        <input
                                                            type="time"
                                                            value={log.in_time ?? ''}
                                                            onChange={(e) => updateLog(index, 'in_time', e.target.value)}
                                                            className="text-[13px] font-black text-gray-800 bg-transparent border-none p-0 focus:ring-0 w-full leading-tight"
                                                        />
                                                    ) : (
                                                        <span className="text-[13px] font-black text-gray-800 tracking-tight block">{log.in_time || ' '}</span>
                                                    )}
                                                </div>
                                                <div className="bg-zinc-50 rounded-xl py-1.5 pl-2 pr-1 border border-zinc-100 relative overflow-hidden">
                                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-rose-500" />
                                                    <span className="text-[6px] font-black text-rose-600 uppercase tracking-widest block">Salida</span>
                                                    {isManager ? (
                                                        <input
                                                            type="time"
                                                            value={log.out_time ?? ''}
                                                            onChange={(e) => updateLog(index, 'out_time', e.target.value)}
                                                            className="text-[13px] font-black text-gray-800 bg-transparent border-none p-0 focus:ring-0 w-full leading-tight"
                                                        />
                                                    ) : (
                                                        <span className="text-[13px] font-black text-gray-800 tracking-tight block">{log.out_time || ' '}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {isManager && !specialDay && log.event_type === 'regular' && log.out_time ? (
                                            <label className="flex items-center gap-2 mt-1.5 py-1.5 px-2 rounded-xl bg-zinc-50 border border-zinc-100 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={log.clock_out_show_no_registrada === true}
                                                    onChange={(e) => updateLog(index, 'clock_out_show_no_registrada', e.target.checked)}
                                                    className="rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                                                />
                                                <span className="text-[9px] font-bold text-zinc-700">Mostrar &quot;No registrada&quot; en listados</span>
                                            </label>
                                        ) : null}

                                        <div className={cn('grid gap-1.5', specialDay ? 'grid-cols-1' : 'grid-cols-2', !specialDay && 'mt-1.5')}>
                                            <div className="bg-white rounded-xl py-1.5 px-2 border border-zinc-100">
                                                <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">
                                                    {specialDay ? 'Horas que computan' : 'Horas'}
                                                </span>
                                                {isManager ? (
                                                    <input
                                                        type="number"
                                                        step="0.5"
                                                        min={0}
                                                        value={workedHours > 0 ? workedHours : ''}
                                                        placeholder=" "
                                                        onChange={(e) => setLogHours(index, parseFloat(e.target.value) || 0)}
                                                        className="text-[12px] font-black text-zinc-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                                                    />
                                                ) : (
                                                    <span className="text-[12px] font-black text-zinc-800 block">
                                                        {workedHours > 0 ? fmtMarbellaHours(workedHours) : ' '}
                                                    </span>
                                                )}
                                            </div>
                                            {!specialDay && (
                                                <div className="bg-white rounded-xl py-1.5 px-2 border border-zinc-100">
                                                    <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">H Extras</span>
                                                    {isManager ? (
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={workedHours > 8 ? workedHours - 8 : ''}
                                                            placeholder=" "
                                                            onChange={(e) => setLogHours(index, 8 + (parseFloat(e.target.value) || 0))}
                                                            className="text-[12px] font-black text-red-600 bg-transparent border-none p-0 focus:ring-0 w-full"
                                                        />
                                                    ) : (
                                                        <span className="text-[12px] font-black text-red-600 block">
                                                            {workedHours > 8 ? fmtMarbellaHours(workedHours - 8) : ' '}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {!specialDay && (
                                            <div className={cn('mt-1.5 grid gap-1.5', isManager ? 'grid-cols-2' : 'grid-cols-1')}>
                                                <div className="bg-blue-50 rounded-xl py-1.5 px-2 border border-blue-100">
                                                    <span className="text-[6px] font-black text-blue-600 uppercase tracking-widest block">
                                                        Horas justificadas (computan)
                                                    </span>
                                                    {isManager ? (
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            min={0}
                                                            value={justifiedAmt > 0 ? justifiedAmt : ''}
                                                            placeholder="0"
                                                            onChange={(e) => setJustifiedHours(index, parseFloat(e.target.value) || 0)}
                                                            className="text-[12px] font-black text-blue-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                                                        />
                                                    ) : (
                                                        <span className="text-[12px] font-black text-blue-800 block">
                                                            {justifiedAmt > 0 ? fmtMarbellaHours(justifiedAmt) : ' '}
                                                        </span>
                                                    )}
                                                    {dayTotal > 0 && justifiedAmt > 0 ? (
                                                        <span className="text-[7px] font-bold text-blue-500 mt-0.5 block">
                                                            Total día: {fmtMarbellaHours(dayTotal)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {isManager && (
                                                    <div className="bg-zinc-50 rounded-xl py-1.5 px-2 border border-zinc-100 min-w-0">
                                                        <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">Evento</span>
                                                        <select
                                                            value={log.event_type}
                                                            onChange={(e) => updateLog(index, 'event_type', e.target.value)}
                                                            className="text-[9px] font-black text-zinc-800 uppercase tracking-widest border-none p-0 focus:ring-0 bg-transparent w-full min-h-[28px]"
                                                        >
                                                            {EVENT_TYPES.map((t) => (
                                                                <option key={t.value} value={t.value} className="text-gray-900 bg-white">
                                                                    {t.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {specialDay && isManager && (
                                            <div className="mt-1.5 bg-zinc-50 rounded-xl py-1.5 px-2 border border-zinc-100 min-w-0">
                                                <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">Evento</span>
                                                <select
                                                    value={log.event_type}
                                                    onChange={(e) => updateLog(index, 'event_type', e.target.value)}
                                                    className="text-[9px] font-black text-zinc-800 uppercase tracking-widest border-none p-0 focus:ring-0 bg-transparent w-full min-h-[28px]"
                                                >
                                                    {EVENT_TYPES.map((t) => (
                                                        <option key={t.value} value={t.value} className="text-gray-900 bg-white">
                                                            {t.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {activeLogs.length > 1 || dayTotalHours > 0 || isManager ? (
                                <div className="rounded-xl border border-zinc-100 bg-zinc-50 py-1.5 px-2 flex items-center justify-between gap-2">
                                    <div className="flex items-baseline gap-1.5 min-w-0">
                                        <span className="text-[7px] font-black uppercase tracking-widest text-zinc-500">Total día</span>
                                        <span className="text-[12px] font-black text-zinc-800">
                                            {dayTotalHours > 0 ? fmtMarbellaHours(dayTotalHours) : ' '}
                                        </span>
                                    </div>
                                    {isManager && (
                                        <button
                                            type="button"
                                            onClick={() => setEditWeekModalOpen(true)}
                                            className="min-h-[48px] shrink-0 rounded-xl border border-[#36606F] bg-[#36606F]/10 text-[#36606F] flex items-center justify-center gap-1.5 py-2 px-2 hover:bg-[#36606F]/20 transition-colors active:scale-95"
                                        >
                                            <Calendar size={14} strokeWidth={2.5} />
                                            <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Semana</span>
                                        </button>
                                    )}
                                </div>
                            ) : null}

                            </div>
                    )}
                </div>

                <EditWeekModal
                    isOpen={editWeekModalOpen}
                    onClose={() => setEditWeekModalOpen(false)}
                    date={date}
                    userId={userId}
                    onSuccess={() => {
                        onSuccess();
                        setEditWeekModalOpen(false);
                    }}
                />
        </Modal>
    );
}