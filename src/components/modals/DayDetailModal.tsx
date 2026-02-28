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

            setLogs(data?.map(l => ({
                id: l.id,
                in_time: format(parseISO(l.clock_in), 'HH:mm'),
                out_time: l.clock_out ? format(parseISO(l.clock_out), 'HH:mm') : '',
                event_type: l.event_type || 'regular',
                is_deleted: false
            })) || []);
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header Petrol */}
                <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner">
                            <Clock size={16} strokeWidth={3} />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest leading-none">Detalle del Día</h3>
                            <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                                {date ? format(date, 'EEEE, d MMM', { locale: es }) : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl hover:bg-rose-500 transition-all text-white active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-gray-50/30">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <LoadingSpinner size="lg" className="text-blue-500" />
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cargando...</p>
                        </div>
                    ) : (
                        <>
                            {logs.length === 0 && !isManager && (
                                <div className="text-center py-12">
                                    <p className="text-sm font-bold text-gray-400 italic">No hay registros.</p>
                                </div>
                            )}

                            <div className="space-y-3">
                                {logs.filter(l => !l.is_deleted).map((log, idx) => {
                                    const workedHours = calculateLogHours(log.in_time, log.out_time);

                                    return (
                                        <div key={idx} className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden flex flex-col animate-in slide-in-from-bottom-2">
                                            {/* Sub-header for Event Type */}
                                            <div className={cn(
                                                "h-6 flex items-center justify-between px-3 border-b border-gray-100",
                                                EVENT_TYPES.find(t => t.value === log.event_type)?.color || "bg-blue-600 text-white"
                                            )}>
                                                {isManager ? (
                                                    <select
                                                        value={log.event_type}
                                                        onChange={(e) => updateLog(idx, 'event_type', e.target.value)}
                                                        className="bg-transparent text-[8px] font-bold uppercase tracking-widest border-none p-0 focus:ring-0 cursor-pointer text-white appearance-none"
                                                    >
                                                        {EVENT_TYPES.map(t => (
                                                            <option key={t.value} value={t.value} className="text-gray-900 bg-white">
                                                                {t.label.toUpperCase()}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className="text-[8px] font-bold uppercase tracking-widest">
                                                        {EVENT_TYPES.find(t => t.value === log.event_type)?.label || 'Regular'}
                                                    </span>
                                                )}

                                                {isManager && (
                                                    <button
                                                        onClick={() => removeLog(idx)}
                                                        className="text-white/60 hover:text-white transition-colors"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Metrics Row (Weekly Summary Aesthetic) */}
                                            <div className="p-2 flex items-center justify-between gap-0 h-14">
                                                {/* IN Metric */}
                                                <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                                    {isManager ? (
                                                        <input
                                                            type="time"
                                                            value={log.in_time}
                                                            onChange={(e) => updateLog(idx, 'in_time', e.target.value)}
                                                            className="text-[11px] font-black text-emerald-600 font-mono w-full text-center bg-transparent focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="text-[11px] font-black text-emerald-600 font-mono">{log.in_time || '--:--'}</span>
                                                    )}
                                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Entrada</span>
                                                </div>

                                                {/* OUT Metric */}
                                                <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                                    {isManager ? (
                                                        <input
                                                            type="time"
                                                            value={log.out_time}
                                                            onChange={(e) => updateLog(idx, 'out_time', e.target.value)}
                                                            className="text-[11px] font-black text-rose-500 font-mono w-full text-center bg-transparent focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="text-[11px] font-black text-rose-500 font-mono">{log.out_time || '--:--'}</span>
                                                    )}
                                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Salida</span>
                                                </div>

                                                {/* TOTAL HOURS Metric */}
                                                <div className="flex flex-col items-center flex-1">
                                                    <div className="h-4 flex items-center">
                                                        <span className="font-black text-gray-800 text-[11px] leading-none">
                                                            {workedHours > 0 ? workedHours.toFixed(1) : " "}
                                                        </span>
                                                    </div>
                                                    <span className="text-[7px] font-bold text-gray-400 uppercase leading-none mt-1">Horas (H)</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {isManager && (
                                <button
                                    onClick={addLog}
                                    className="w-full h-10 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-2 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all font-black text-[9px] uppercase tracking-widest bg-white/50"
                                >
                                    <Plus size={14} />
                                    <span>NUEVA LÍNEA</span>
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                {isManager && (logs.length > 0 || logs.some(l => l.is_deleted)) && (
                    <div className="p-4 bg-white shrink-0 border-t border-gray-100 flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 h-12 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex-1 h-12 rounded-xl bg-[#5B8FB9] text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 shadow-blue-200"
                        >
                            {isSaving ? <LoadingSpinner size="sm" /> : <Save size={16} />}
                            <span>GUARDAR</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

