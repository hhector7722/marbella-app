'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar, Save, Trash2, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { updateWeeklyWorkerConfig } from '@/app/actions/overtime';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface DayDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    userId: string | null;
    userRole: 'manager' | 'supervisor' | 'staff';
    onSuccess: () => void;
}

const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermedad', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'adjustment', label: 'Baja', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
];

export function DayDetailModal({ isOpen, onClose, date, userId, userRole, onSuccess }: DayDetailModalProps) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
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
                is_deleted: false
            })) || [];

            // Aseguramos que siempre haya al menos un objeto de log para editar
            if (rawLogs.length === 0) {
                setLogs([{ in_time: '00:00', out_time: '00:00', event_type: 'regular', is_deleted: false }]);
            } else {
                setLogs(rawLogs);
            }
        } catch (err) {
            console.error(err);
            toast.error("Error al cargar registros");
        } finally {
            setLoading(false);
        }
    }

    const addLog = () => {
        setLogs([...logs, {
            in_time: '09:00',
            out_time: '17:00',
            event_type: 'regular',
            is_deleted: false
        }]);
    };

    const updateLog = (index: number, field: string, value: any) => {
        const newLogs = [...logs];
        newLogs[index] = { ...newLogs[index], [field]: value };
        if (field === 'event_type' && value !== 'regular') {
            newLogs[index].in_time = '09:00';
            newLogs[index].out_time = '17:00';
        }
        setLogs(newLogs);
    };

    const removeLog = (index: number) => {
        const newLogs = [...logs];
        if (newLogs[index].id) {
            newLogs[index].is_deleted = true;
        } else {
            newLogs.splice(index, 1);
        }
        setLogs(newLogs);
    };

    const handleSave = async () => {
        if (!date || !userId) return;
        setIsSaving(true);

        try {
            // week_start es el lunes de esa semana
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
                    // Si sale antes de entrar, sumamos un día (cruce de medianoche)
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
                    is_deleted: l.is_deleted
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

        // Regla: 0-20min -> 0.0 | 21-50min -> 0.5 | 51-59min -> 1.0
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        let fraction = 0;
        if (minutes > 20 && minutes <= 50) fraction = 0.5;
        else if (minutes > 50) fraction = 1.0;
        return hours + fraction;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[150] p-6 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-[320px] aspect-square bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Red Header - Match Weekly Summary Gradient */}
                <div className="bg-gradient-to-b from-red-500 to-red-600 h-[64px] flex items-center justify-center px-6 relative shrink-0 shadow-md">
                    <h3 className="text-white text-[11px] font-black uppercase tracking-[0.2em] drop-shadow-sm">
                        {date ? format(date, "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()) : ''}
                    </h3>
                    <button onClick={onClose} className="absolute right-4 top-4 text-white/50 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-8 pb-8 pt-4 flex-1 flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3">
                            <LoadingSpinner size="lg" className="text-[#D65D67]" />
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cargando...</p>
                        </div>
                    ) : (
                        <div className="w-full flex-1 flex flex-col justify-between">
                            {(() => {
                                const log = logs.filter(l => !l.is_deleted)[0] || { in_time: '00:00', out_time: '00:00', event_type: 'regular' };
                                const workedHours = calculateLogHours(log.in_time, log.out_time);

                                return (
                                    <div className="flex-1 flex flex-col justify-between pt-2">
                                        {/* Times with Dots */}
                                        <div className="flex flex-col items-center gap-4 py-2">
                                            {/* Entry */}
                                            <div className="flex items-center gap-4">
                                                <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
                                                {isManager ? (
                                                    <input
                                                        type="time"
                                                        value={log.in_time}
                                                        onChange={(e) => updateLog(0, 'in_time', e.target.value)}
                                                        className="text-4xl font-mono font-black text-gray-600 bg-transparent border-none p-0 focus:ring-0 w-[140px] text-center"
                                                    />
                                                ) : (
                                                    <span className="text-4xl font-mono font-black text-gray-600">
                                                        {log.in_time || '00:00'}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Exit */}
                                            <div className="flex items-center gap-4">
                                                <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                                                {isManager ? (
                                                    <input
                                                        type="time"
                                                        value={log.out_time}
                                                        onChange={(e) => updateLog(0, 'out_time', e.target.value)}
                                                        className="text-4xl font-mono font-black text-gray-600 bg-transparent border-none p-0 focus:ring-0 w-[140px] text-center"
                                                    />
                                                ) : (
                                                    <span className="text-4xl font-mono font-black text-gray-600">
                                                        {log.out_time || '00:00'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Metrics: HORAS and HORAS EXTRAS */}
                                        <div className="space-y-3 py-4 border-t border-gray-50">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-xs font-black text-[#7C8B9C] uppercase tracking-[0.15em]">HORAS</span>
                                                <span className="text-lg font-black text-gray-800">{workedHours > 0 ? workedHours.toFixed(0) : "0"}</span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-xs font-black text-[#7C8B9C] uppercase tracking-[0.15em]">HORAS EXTRAS</span>
                                                <span className="text-lg font-black text-gray-800">{workedHours > 8 ? (workedHours - 8).toFixed(0) : 0}</span>
                                            </div>
                                        </div>

                                        {/* Footer Actions - Monetary Modal Style */}
                                        <div className="pt-2 flex items-center justify-between gap-3">
                                            {isManager ? (
                                                <>
                                                    <div className="flex-1 flex flex-col">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Tipo Evento</span>
                                                        <select
                                                            value={log.event_type}
                                                            onChange={(e) => updateLog(0, 'event_type', e.target.value)}
                                                            className="text-[10px] font-black text-gray-600 uppercase tracking-widest border-none p-0 focus:ring-0 bg-transparent"
                                                        >
                                                            {EVENT_TYPES.map(t => (
                                                                <option key={t.value} value={t.value} className="text-gray-900 bg-white">
                                                                    {t.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={onClose}
                                                            className="h-10 px-4 rounded-xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-1.5"
                                                        >
                                                            <X size={14} strokeWidth={3} />
                                                            <span>SALIR</span>
                                                        </button>
                                                        <button
                                                            onClick={handleSave}
                                                            disabled={isSaving}
                                                            className="h-10 px-4 rounded-xl bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                        >
                                                            {isSaving ? <LoadingSpinner size="sm" /> : <Save size={14} strokeWidth={3} />}
                                                            <span>GUARDAR</span>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={onClose}
                                                    className="w-full h-10 rounded-xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-1.5"
                                                >
                                                    <X size={14} strokeWidth={3} />
                                                    <span>Cerrar</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

