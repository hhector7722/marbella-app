'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Coins, Landmark, Calendar, Plus, Trash2 } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { fromZonedTime } from 'date-fns-tz';
import { updateWeeklyWorkerConfig, createManagerFichaje, deleteManagerDayLogs } from '@/app/actions/overtime';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn, calculateRoundedHours } from '@/lib/utils';
import { formatMadridHmFromIso, madridDayUtcRangeIso } from '@/lib/madrid-date-bounds';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';

interface AttendanceDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    userId: string | null;
    userRole: string;
    onSuccess: () => void;
}

const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermedad', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
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
    /** Fuente de verdad de horas al guardar (override / BD). */
    total_hours_override?: number | null;
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

function resolveDraftHours(log: DayLogDraft): number {
    if (log.total_hours_override !== undefined && log.total_hours_override !== null) {
        return Number(log.total_hours_override) || 0;
    }
    return calculateLogHours(log.in_time || '', log.out_time || '');
}

/** Reloj sintético para horas justificadas (solo persistencia; no es jornada real).
 * Usa franja tarde (20:00+) para no chocar con fichajes reales ni caer en día Madrid previo. */
function syntheticTimesForHours(hours: number): { in_time: string; out_time: string } {
    const safe = Math.max(0.5, calculateRoundedHours(hours) || 0.5);
    const totalMin = Math.round(safe * 60);
    const startH = 20;
    const startM = 0;
    const endTotal = startH * 60 + startM + totalMin;
    const outH = Math.floor(endTotal / 60) % 24;
    const outM = endTotal % 60;
    return {
        in_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
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
    const [contractedHours, setContractedHours] = useState(40);
    const [preferStock, setPreferStock] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

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
                setContractedHours(Number(contracted) || 40);
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

    if (!isOpen) return null;

    const weekStartDate = weekStart ? (() => {
        const [y, m, d] = weekStart.split('-').map(Number);
        return new Date(y, m - 1, d);
    })() : null;
    const weekEndDate = weekStartDate ? addDays(weekStartDate, 6) : null;
    const weekLabel = weekStartDate && weekEndDate
        ? `${format(weekStartDate, 'd', { locale: es })} al ${format(weekEndDate, 'd MMM yyyy', { locale: es })}`
        : '';

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[160] p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-[320px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] h-[44px] flex items-center justify-center px-4 relative shrink-0">
                    <h3 className="text-white text-[9px] font-black uppercase tracking-[0.15em]">
                        Editar semana
                    </h3>
                    <button onClick={onClose} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-1">
                        <X size={16} />
                    </button>
                </div>
                <div className="px-4 py-4 space-y-4">
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
                                <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={contractedHours || ''}
                                    onChange={(e) => setContractedHours(Number(e.target.value) || 0)}
                                    className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-black text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none"
                                />
                            </div>
                            <div className="flex gap-2 pt-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 h-12 rounded-xl bg-zinc-100 text-zinc-600 font-black text-[9px] uppercase tracking-widest active:scale-95"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 h-12 rounded-xl bg-emerald-500 text-white font-black text-[9px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
                                >
                                    {saving ? <LoadingSpinner size="sm" /> : <Save size={14} />}
                                    Guardar
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function AttendanceDetailModal({ isOpen, onClose, date, userId, userRole, onSuccess }: AttendanceDetailModalProps) {
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
    const [creating, setCreating] = useState(false);
    const isManager = userRole === 'manager';

    useEffect(() => {
        if (isOpen && date && userId) {
            fetchDayLogs();
        }
    }, [isOpen, date, userId]);

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

            const rawLogs: DayLogDraft[] = data?.map((l) => ({
                id: l.id,
                in_time: formatMadridHmFromIso(l.clock_in) ?? '',
                out_time: l.clock_out ? (formatMadridHmFromIso(l.clock_out) ?? '') : '',
                event_type: l.event_type || 'regular',
                is_deleted: false,
                clock_out_show_no_registrada: l.clock_out_show_no_registrada === true,
                // Siempre cargar total_hours de BD: en eventos especiales el reloj es sintético.
                total_hours_override: l.total_hours != null ? Number(l.total_hours) : null,
            })) || [];

            setLogs(rawLogs);
            setShowCreateFichaje(false);
        } catch (err) {
            console.error(err);
            toast.error("Error al cargar registros");
        } finally {
            setLoading(false);
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
            }
            next[index] = current;
            return next;
        });
    };

    const addJustifiedHours = () => {
        const times = syntheticTimesForHours(1);
        setLogs((prev) => [
            ...prev,
            {
                _localKey: `justified-${Date.now()}`,
                in_time: times.in_time,
                out_time: times.out_time,
                event_type: 'personal',
                is_deleted: false,
                total_hours_override: 1,
                clock_out_show_no_registrada: false,
            },
        ]);
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
    const showAddFichajeButton = isManager && !loading && activeLogs.length === 0 && !!userId && !!date;
    const dayTotalHours = activeLogs.reduce((acc, l) => acc + resolveDraftHours(l), 0);

    const handleCreateFichaje = async () => {
        if (!date || !userId || !createTime.trim()) return;
        setCreating(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const result = await createManagerFichaje(userId, dateStr, createTime.trim());
            if (result.success) {
                toast.success('Fichaje creado');
                setShowCreateFichaje(false);
                setCreateTime('08:00');
                fetchDayLogs();
                onSuccess();
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="w-full max-w-[320px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-gradient-to-b from-red-500 to-red-600 h-[44px] flex items-center justify-center px-4 relative shrink-0">
                    <h3 className="text-white text-[9px] font-black uppercase tracking-[0.15em] drop-shadow-sm">
                        {date ? format(date, "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()) : ''}
                    </h3>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {showAddFichajeButton && (
                            <button
                                type="button"
                                onClick={() => setShowCreateFichaje(true)}
                                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-white/80 hover:text-white rounded-lg transition-colors"
                                title="Nuevo fichaje"
                            >
                                <Plus size={18} strokeWidth={2.5} />
                            </button>
                        )}
                        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-4 pb-4 pt-2 flex flex-col flex-1 min-h-0 overflow-y-auto">
                    {loading ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-1.5">
                            <LoadingSpinner size="md" className="text-red-500" />
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Cargando...</p>
                        </div>
                    ) : activeLogs.length === 0 ? (
                        showCreateFichaje && isManager && userId && date ? (
                            <div className="space-y-3">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Nuevo fichaje — Hora entrada</span>
                                <input
                                    type="time"
                                    value={createTime}
                                    onChange={(e) => setCreateTime(e.target.value)}
                                    className="w-full max-w-[140px] mx-auto h-12 px-3 rounded-xl border-2 border-zinc-200 text-[13px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none block"
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateFichaje(false)}
                                        className="flex-1 h-9 rounded-xl bg-zinc-100 text-zinc-600 font-black text-[8px] uppercase tracking-widest active:scale-95"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateFichaje}
                                        disabled={creating}
                                        className="flex-1 h-9 rounded-xl bg-emerald-500 text-white font-black text-[8px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50 min-h-[48px]"
                                    >
                                        {creating ? <LoadingSpinner size="sm" /> : <Plus size={12} />}
                                        Crear
                                    </button>
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
                                        <button
                                            type="button"
                                            onClick={() => setEditWeekModalOpen(true)}
                                            className="w-full max-w-[160px] min-h-[48px] rounded-xl border border-[#36606F] bg-[#36606F]/10 text-[#36606F] flex items-center justify-center gap-1.5 py-2 px-2 hover:bg-[#36606F]/20 transition-colors active:scale-95"
                                        >
                                            <Calendar size={14} strokeWidth={2.5} />
                                            <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Editar semana</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col gap-2">
                            {logs.map((log, index) => {
                                if (log.is_deleted) return null;
                                const workedHours = resolveDraftHours(log);
                                const justified = isJustifiedEvent(log.event_type);
                                const eventLabel = EVENT_TYPES.find((t) => t.value === log.event_type)?.label ?? log.event_type;

                                return (
                                    <div
                                        key={log.id ?? log._localKey ?? `log-${index}`}
                                        className={cn(
                                            'rounded-xl border p-2',
                                            justified ? 'border-blue-100 bg-blue-50/40' : 'border-zinc-100 bg-white',
                                        )}
                                    >
                                        {justified ? (
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <span className="text-[7px] font-black uppercase tracking-widest text-blue-700">
                                                    Justificadas · {eventLabel}
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

                                        {!justified && (
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

                                        {isManager && !justified && log.event_type === 'regular' && log.out_time ? (
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

                                        <div className={cn('grid gap-1.5', justified ? 'grid-cols-1' : 'grid-cols-2', !justified && 'mt-1.5')}>
                                            <div className="bg-white rounded-xl py-1.5 px-2 border border-zinc-100">
                                                <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">
                                                    {justified ? 'Horas que computan' : 'Horas'}
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
                                            {!justified && (
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

                                        {isManager && (
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

                            {activeLogs.length > 1 || dayTotalHours > 0 ? (
                                <div className="rounded-xl border border-zinc-100 bg-zinc-50 py-1.5 px-2 flex items-center justify-between">
                                    <span className="text-[7px] font-black uppercase tracking-widest text-zinc-500">Total día</span>
                                    <span className="text-[12px] font-black text-zinc-800">
                                        {dayTotalHours > 0 ? fmtMarbellaHours(dayTotalHours) : ' '}
                                    </span>
                                </div>
                            ) : null}

                            {isManager && (
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={addJustifiedHours}
                                        className="w-full min-h-[48px] rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-black text-[8px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                        <Plus size={14} strokeWidth={2.5} />
                                        Horas justificadas
                                    </button>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setEditWeekModalOpen(true)}
                                            className="w-full min-h-[48px] rounded-xl border border-[#36606F] bg-[#36606F]/10 text-[#36606F] flex items-center justify-center gap-1.5 py-2 px-2 hover:bg-[#36606F]/20 transition-colors active:scale-95"
                                        >
                                            <Calendar size={14} strokeWidth={2.5} />
                                            <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Semana</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDeleteDay}
                                            disabled={isSaving}
                                            className="w-full min-h-[48px] rounded-xl bg-red-50 border border-red-100 text-red-600 font-black text-[8px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-1.5 hover:bg-red-100/50 disabled:opacity-50"
                                        >
                                            <Trash2 size={12} strokeWidth={2.5} />
                                            <span>Borrar día</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-1 flex gap-1.5 shrink-0">
                                {isManager ? (
                                    <>
                                        <button
                                            onClick={onClose}
                                            className="flex-1 min-h-[48px] rounded-xl bg-white border border-rose-100 text-rose-500 font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1"
                                        >
                                            <X size={11} strokeWidth={3} />
                                            <span>SALIR</span>
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="flex-[1.5] min-h-[48px] rounded-xl bg-emerald-500 text-white font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all shadow-md flex items-center justify-center gap-1 disabled:opacity-50"
                                        >
                                            {isSaving ? <LoadingSpinner size="sm" /> : <Save size={11} strokeWidth={3} />}
                                            <span>OK</span>
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={onClose}
                                        className="w-full min-h-[48px] rounded-xl bg-rose-500 text-white font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <X size={14} strokeWidth={3} />
                                        <span>Cerrar</span>
                                    </button>
                                )}
                            </div>
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
            </div>
        </div>
    );
}