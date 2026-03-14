'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Coins, Landmark, Calendar, Plus } from 'lucide-react';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { updateWeeklyWorkerConfig, createManagerFichaje } from '@/app/actions/overtime';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';

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
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editWeekModalOpen, setEditWeekModalOpen] = useState(false);
    const [showCreateFichaje, setShowCreateFichaje] = useState(false);
    const [createTime, setCreateTime] = useState('09:00');
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

            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('time_logs')
                .select('*')
                .eq('user_id', userId)
                .gte('clock_in', startOfDay.toISOString())
                .lte('clock_in', endOfDay.toISOString())
                .order('clock_in', { ascending: true });

            if (error) throw error;

            const rawLogs = data?.map(l => ({
                id: l.id,
                in_time: format(parseISO(l.clock_in), 'HH:mm'),
                out_time: l.clock_out ? format(parseISO(l.clock_out), 'HH:mm') : '',
                event_type: l.event_type || 'regular',
                is_deleted: false,
                clock_out_show_no_registrada: l.clock_out_show_no_registrada === true
            })) || [];

            setLogs(rawLogs);
        } catch (err) {
            console.error(err);
            toast.error("Error al cargar registros");
        } finally {
            setLoading(false);
        }
    }

    const updateLog = (index: number, field: string, value: any) => {
        const newLogs = [...logs];
        newLogs[index] = { ...newLogs[index], [field]: value };
        if (field === 'event_type' && value !== 'regular') {
            if (!newLogs[index].in_time) newLogs[index].in_time = '09:00';
            if (!newLogs[index].out_time) newLogs[index].out_time = '17:00';
        }
        setLogs(newLogs);
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

            const logsToUpdate = logs.map(l => {
                let inTimeIso = '';
                let outTimeIso = '';

                if (l.in_time) {
                    const [h, m] = l.in_time.split(':').map(Number);
                    const d = new Date(date);
                    d.setHours(h, m, 0, 0);
                    inTimeIso = d.toISOString();
                }

                if (l.out_time) {
                    const [h, m] = l.out_time.split(':').map(Number);
                    const d = new Date(date);
                    d.setHours(h, m, 0, 0);
                    if (l.in_time) {
                        const [inH] = l.in_time.split(':').map(Number);
                        if (h < inH) d.setDate(d.getDate() + 1);
                    }
                    outTimeIso = d.toISOString();
                }

                return {
                    id: l.id,
                    date: format(date, 'yyyy-MM-dd'),
                    in_time: l.in_time,
                    out_time: l.out_time,
                    inTimeIso,
                    outTimeIso,
                    event_type: l.event_type,
                    is_deleted: l.is_deleted,
                    ...(l.total_hours_override !== undefined && l.total_hours_override !== null && { total_hours_override: l.total_hours_override }),
                    clock_out_show_no_registrada: l.clock_out_show_no_registrada === true
                };
            });

            const result = await updateWeeklyWorkerConfig(userId, weekStartStr, { logs: logsToUpdate });

            if (result.success) {
                toast.success("Registros actualizados correctamente");
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

    const calculateLogHours = (inStr: string, outStr: string) => {
        if (!inStr || !outStr) return 0;
        const [inH, inM] = inStr.split(':').map(Number);
        const [outH, outM] = outStr.split(':').map(Number);
        const inDate = new Date(); inDate.setHours(inH, inM, 0, 0);
        const outDate = new Date(); outDate.setHours(outH, outM, 0, 0);
        if (outDate < inDate) outDate.setDate(outDate.getDate() + 1);
        const diffMinutes = (outDate.getTime() - inDate.getTime()) / (1000 * 60);

        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        let fraction = 0;
        if (minutes > 20 && minutes <= 50) fraction = 0.5;
        else if (minutes > 50) fraction = 1.0;
        return hours + fraction;
    };

    const activeLogs = logs.filter(l => !l.is_deleted);
    const showAddFichajeButton = isManager && !loading && activeLogs.length === 0 && !!userId && !!date;

    const handleCreateFichaje = async () => {
        if (!date || !userId || !createTime.trim()) return;
        setCreating(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const result = await createManagerFichaje(userId, dateStr, createTime.trim());
            if (result.success) {
                toast.success('Fichaje creado');
                setShowCreateFichaje(false);
                setCreateTime('09:00');
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-[300px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 h-fit max-h-[90vh]" onClick={e => e.stopPropagation()}>
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

                <div className="px-4 pb-4 pt-2 flex flex-col shrink-0">
                    {loading ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-1.5">
                            <LoadingSpinner size="md" className="text-red-500" />
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Cargando...</p>
                        </div>
                    ) : (
                        (() => {
                            const activeLogsInner = logs.filter(l => !l.is_deleted);
                            if (activeLogsInner.length === 0) {
                                if (showCreateFichaje && isManager && userId && date) {
                                    return (
                                        <div className="space-y-3">
                                            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Nuevo fichaje — Hora entrada</span>
                                            <input
                                                type="time"
                                                value={createTime}
                                                onChange={(e) => setCreateTime(e.target.value)}
                                                className="w-full h-12 px-3 rounded-xl border-2 border-zinc-200 text-[13px] font-bold text-zinc-800 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none"
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
                                        </div>
                                    );
                                }
                                return (
                                    <div className="py-8 flex flex-col items-center justify-center">
                                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest text-center">Sin datos</span>
                                    </div>
                                );
                            }

                            const log = activeLogsInner[0];
                            const workedHours = log.total_hours_override !== undefined
                                ? log.total_hours_override
                                : calculateLogHours(log.in_time || '', log.out_time || '');

                            const updateHours = (val: number) => {
                                updateLog(0, 'total_hours_override', val);
                            };

                            return (
                                <>
                                    {/* Entrada + Salida en una fila */}
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="bg-zinc-50 rounded-xl py-1.5 pl-2 pr-1 border border-zinc-100 relative overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />
                                            <span className="text-[6px] font-black text-emerald-600 uppercase tracking-widest block">Entrada</span>
                                            {isManager ? (
                                                <input
                                                    type="time"
                                                    value={log.in_time ?? ''}
                                                    onChange={(e) => updateLog(0, 'in_time', e.target.value)}
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
                                                    onChange={(e) => updateLog(0, 'out_time', e.target.value)}
                                                    className="text-[13px] font-black text-gray-800 bg-transparent border-none p-0 focus:ring-0 w-full leading-tight"
                                                />
                                            ) : (
                                                <span className="text-[13px] font-black text-gray-800 tracking-tight block">{log.out_time || ' '}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Un solo checkbox: mostrar "No registrada" en listados cuando tú lo decidas (p. ej. olvidó fichar salida) */}
                                    {isManager && log.event_type === 'regular' && log.out_time && (
                                        <label className="flex items-center gap-2 mt-1.5 py-1.5 px-2 rounded-xl bg-zinc-50 border border-zinc-100 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={log.clock_out_show_no_registrada === true}
                                                onChange={(e) => updateLog(0, 'clock_out_show_no_registrada', e.target.checked)}
                                                className="rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                                            />
                                            <span className="text-[9px] font-bold text-zinc-700">Mostrar &quot;No registrada&quot; en listados</span>
                                        </label>
                                    )}

                                    {/* Horas + H Extras */}
                                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                                        <div className="bg-white rounded-xl py-1.5 px-2 border border-zinc-100">
                                            <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">Horas</span>
                                            {isManager ? (
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    value={workedHours > 0 ? workedHours : ''}
                                                    placeholder=" "
                                                    onChange={(e) => updateHours(parseFloat(e.target.value) || 0)}
                                                    className="text-[12px] font-black text-zinc-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                                                />
                                            ) : (
                                                <span className="text-[12px] font-black text-zinc-800 block">{workedHours > 0 ? workedHours.toFixed(1).replace('.0', '') : ' '}</span>
                                            )}
                                        </div>
                                        <div className="bg-white rounded-xl py-1.5 px-2 border border-zinc-100">
                                            <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">H Extras</span>
                                            {isManager ? (
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    value={workedHours > 8 ? workedHours - 8 : ''}
                                                    placeholder=" "
                                                    onChange={(e) => updateHours(8 + (parseFloat(e.target.value) || 0))}
                                                    className="text-[12px] font-black text-red-600 bg-transparent border-none p-0 focus:ring-0 w-full"
                                                />
                                            ) : (
                                                <span className="text-[12px] font-black text-red-600 block">{workedHours > 8 ? (workedHours - 8).toFixed(1).replace('.0', '') : ' '}</span>
                                            )}
                                        </div>
                                    </div>

                                    {isManager && (
                                        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                                            <div className="bg-zinc-50 rounded-xl py-1.5 px-2 border border-zinc-100 min-w-0">
                                                <span className="text-[6px] font-black text-zinc-400 uppercase tracking-widest block">Evento</span>
                                                <select
                                                    value={log.event_type}
                                                    onChange={(e) => updateLog(0, 'event_type', e.target.value)}
                                                    className="text-[9px] font-black text-zinc-800 uppercase tracking-widest border-none p-0 focus:ring-0 bg-transparent w-full"
                                                >
                                                    {EVENT_TYPES.map(t => (
                                                        <option key={t.value} value={t.value} className="text-gray-900 bg-white">
                                                            {t.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-stretch min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditWeekModalOpen(true)}
                                                    className="w-full min-h-[48px] rounded-xl border border-[#36606F] bg-[#36606F]/10 text-[#36606F] flex items-center justify-center gap-1.5 py-2 px-2 hover:bg-[#36606F]/20 transition-colors active:scale-95"
                                                >
                                                    <Calendar size={14} strokeWidth={2.5} />
                                                    <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Editar semana</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

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

                                    {/* Botonera fija abajo */}
                                    <div className="mt-3 flex gap-1.5 shrink-0">
                                        {isManager ? (
                                            <>
                                                <button
                                                    onClick={onClose}
                                                    className="flex-1 h-9 rounded-xl bg-white border border-rose-100 text-rose-500 font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1"
                                                >
                                                    <X size={11} strokeWidth={3} />
                                                    <span>SALIR</span>
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={isSaving}
                                                    className="flex-[1.5] h-9 rounded-xl bg-emerald-500 text-white font-black text-[8px] uppercase tracking-widest active:scale-95 transition-all shadow-md flex items-center justify-center gap-1 disabled:opacity-50"
                                                >
                                                    {isSaving ? <LoadingSpinner size="sm" /> : <Save size={11} strokeWidth={3} />}
                                                    <span>OK</span>
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={onClose}
                                                className="w-full h-9 rounded-xl bg-rose-500 text-white font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <X size={14} strokeWidth={3} />
                                                <span>Cerrar</span>
                                            </button>
                                        )}
                                    </div>
                                </>
                            );
                        })()
                    )}
                </div>
            </div>
        </div>
    );
}