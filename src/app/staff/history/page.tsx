'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, X, Check, Plus, Trash2, Save
} from 'lucide-react';
import { format } from 'date-fns';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';

// --- TIPOS ---
interface DayData {
    date: string;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
    extraHours: number;
    eventType: string;
    isToday: boolean;
}

interface WeekSummary {
    totalHours: number;
    startBalance: number;
    weeklyBalance: number;
    finalBalance: number;
    estimatedValue: number;
    isPaid: boolean;
}

interface WeekData {
    weekNumber: number;
    startDate: string;
    isCurrentWeek: boolean;
    days: DayData[];
    summary: WeekSummary;
}

interface TimeLogEntry {
    id?: string;
    date: string;
    clock_in: string;
    clock_out: string;
    event_type: string;
    isNew?: boolean;
    toDelete?: boolean;
}

// --- CONSTANTES ---
const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'festivo', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'enfermedad', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'baja', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', initial: 'P', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
];

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

// --- HELPERS VISUALES ---
const fmtHours = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const rounded = Math.round(val * 2) / 2;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    return `${val.toFixed(0)}€`;
};

const fmtBalance = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const rounded = Math.round(val * 2) / 2;
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val > 0 ? `+${str}` : str;
};

const getMonthLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

// --- LÓGICA ROUNDING (solo usada en saveEdits del modal de edición) ---
const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

export default function HistoryPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<WeekData[]>([]);

    // Auth & Rol
    const [userRole, setUserRole] = useState<string>('staff');
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

    // Filtros de mes
    const [showFilter, setShowFilter] = useState(false);
    const [isFilterActive, setIsFilterActive] = useState(false);
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth()); // 0-indexed

    // Edición (Manager)
    const [editingWeek, setEditingWeek] = useState<WeekData | null>(null);
    const [editEntries, setEditEntries] = useState<TimeLogEntry[]>([]);
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => { initUser(); }, []);
    useEffect(() => {
        if (currentUserId) fetchCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployeeId, currentUserId, filterYear, filterMonth]);

    async function initUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);
        setSelectedEmployeeId(user.id);

        const { data: profile } = await supabase.from('profiles')
            .select('role')
            .eq('id', user.id).single();

        if (profile) {
            setUserRole(profile.role);
        }

        if (profile?.role === 'manager') {
            const { data: emps } = await supabase.from('profiles')
                .select('id, first_name, last_name')
                .order('first_name');
            setEmployees(emps || []);
        }
    }

    async function fetchCalendar() {
        setLoading(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;
            // p_month es 1-indexed en PostgreSQL
            const { data, error } = await supabase.rpc('get_monthly_timesheet', {
                p_user_id: targetUserId,
                p_year: filterYear,
                p_month: filterMonth + 1,
            });

            if (error) {
                console.error('Error fetching calendar:', error);
                setWeeksData([]);
                return;
            }

            setWeeksData((data as WeekData[]) || []);
        } catch (err) {
            console.error('fetchCalendar error:', err);
        } finally {
            setLoading(false);
        }
    }

    const applyFilter = () => {
        setIsFilterActive(true);
        setShowFilter(false);
        // El useEffect ya disparará fetchCalendar con los nuevos valores
    };

    const clearFilter = () => {
        const now = new Date();
        setFilterYear(now.getFullYear());
        setFilterMonth(now.getMonth());
        setIsFilterActive(false);
    };

    // --- EDICIÓN: Manager ---
    const openEdit = async (week: WeekData) => {
        const targetUserId = selectedEmployeeId || currentUserId;
        const mondayISO = week.startDate;
        const sundayDate = new Date(mondayISO);
        sundayDate.setDate(sundayDate.getDate() + 6);
        const sundayISO = format(sundayDate, 'yyyy-MM-dd');

        const { data: logs } = await supabase.from('time_logs')
            .select('id, clock_in, clock_out, event_type')
            .eq('user_id', targetUserId)
            .gte('clock_in', `${mondayISO}T00:00:00.000Z`)
            .lte('clock_in', `${sundayISO}T23:59:59.999Z`)
            .order('clock_in', { ascending: true });

        const entries: TimeLogEntry[] = (logs || []).map(l => ({
            id: l.id,
            date: new Date(l.clock_in).toISOString().split('T')[0],
            clock_in: new Date(l.clock_in).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            clock_out: l.clock_out ? new Date(l.clock_out).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
            event_type: l.event_type || 'regular'
        }));

        setEditEntries(entries);
        setEditingWeek(week);
    };

    const addEntry = () => {
        if (!editingWeek) return;
        setEditEntries([...editEntries, { date: editingWeek.startDate, clock_in: '09:00', clock_out: '17:00', event_type: 'regular', isNew: true }]);
    };

    const removeEntry = (idx: number) => {
        const entry = editEntries[idx];
        if (entry.isNew) {
            setEditEntries(editEntries.filter((_, i) => i !== idx));
        } else {
            const updated = [...editEntries];
            updated[idx] = { ...entry, toDelete: true };
            setEditEntries(updated);
        }
    };

    const updateEntry = (idx: number, field: keyof TimeLogEntry, value: string) => {
        const updated = [...editEntries];
        updated[idx] = { ...updated[idx], [field]: value };
        if (field === 'event_type' && value !== 'regular') {
            updated[idx].clock_in = '09:00';
            updated[idx].clock_out = '17:00';
        }
        setEditEntries(updated);
    };

    const saveEdits = async () => {
        if (!editingWeek) return;
        setSavingEdit(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;

            const toDelete = editEntries.filter(e => e.toDelete && e.id);
            for (const entry of toDelete) {
                await supabase.from('time_logs').delete().eq('id', entry.id!);
            }

            const toUpdate = editEntries.filter(e => !e.isNew && !e.toDelete && e.id);
            for (const entry of toUpdate) {
                let clockInDT: Date;
                let clockOutDT: Date | null = null;
                let totalHours: number | null = null;
                if (entry.event_type !== 'regular') {
                    clockInDT = new Date(`${entry.date}T09:00:00`);
                    clockOutDT = new Date(`${entry.date}T17:00:00`);
                    totalHours = 8;
                } else {
                    clockInDT = new Date(`${entry.date}T${entry.clock_in}:00`);
                    clockOutDT = entry.clock_out ? new Date(`${entry.date}T${entry.clock_out}:00`) : null;
                    if (clockOutDT) {
                        totalHours = applyRoundingRule((clockOutDT.getTime() - clockInDT.getTime()) / 60000);
                    }
                }
                await supabase.from('time_logs').update({
                    clock_in: clockInDT.toISOString(),
                    clock_out: clockOutDT?.toISOString() ?? null,
                    total_hours: totalHours,
                    event_type: entry.event_type
                }).eq('id', entry.id!);
            }

            const toInsert = editEntries.filter(e => e.isNew && !e.toDelete);
            for (const entry of toInsert) {
                let clockInDT: Date;
                let clockOutDT: Date | null = null;
                let totalHours: number | null = null;
                if (entry.event_type !== 'regular') {
                    clockInDT = new Date(`${entry.date}T09:00:00`);
                    clockOutDT = new Date(`${entry.date}T17:00:00`);
                    totalHours = 8;
                } else {
                    clockInDT = new Date(`${entry.date}T${entry.clock_in}:00`);
                    clockOutDT = entry.clock_out ? new Date(`${entry.date}T${entry.clock_out}:00`) : null;
                    if (clockOutDT) {
                        totalHours = applyRoundingRule((clockOutDT.getTime() - clockInDT.getTime()) / 60000);
                    }
                }
                await supabase.from('time_logs').insert({
                    user_id: targetUserId,
                    clock_in: clockInDT.toISOString(),
                    clock_out: clockOutDT?.toISOString() ?? null,
                    total_hours: totalHours,
                    is_manual_entry: true,
                    event_type: entry.event_type
                });
            }

            setEditingWeek(null);
            setEditEntries([]);
            fetchCalendar();
        } catch (err) {
            console.error('Error saving edits:', err);
        } finally {
            setSavingEdit(false);
        }
    };

    const isManager = userRole === 'manager';
    const viewingOther = isManager && selectedEmployeeId && selectedEmployeeId !== currentUserId;
    const selectedEmployeeName = viewingOther
        ? employees.find(e => e.id === selectedEmployeeId)?.first_name || ''
        : '';

    return (
        <div className="pb-10">
            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">

                {/* ── PANEL DE FILTROS ── */}
                <div className="flex flex-wrap justify-center items-center gap-4 py-2 mb-2 animate-in fade-in slide-in-from-top-4 duration-700">

                    {/* Selector Empleado (Manager) */}
                    {isManager && (
                        <>
                            <div className="relative z-20">
                                <button
                                    onClick={() => setShowEmployeeDropdown(true)}
                                    className={cn(
                                        "px-8 py-3 bg-white rounded-full shadow-xl border border-zinc-100 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-zinc-50 active:scale-95",
                                        viewingOther ? "text-blue-600 ring-2 ring-blue-100" : "text-zinc-800"
                                    )}
                                >
                                    <span>{viewingOther ? selectedEmployeeName : "Seleccionar Empleado"}</span>
                                </button>
                                {viewingOther && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedEmployeeId(currentUserId); }}
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-30"
                                    >
                                        <X size={12} strokeWidth={3} />
                                    </button>
                                )}
                            </div>

                            {showEmployeeDropdown && (
                                <div
                                    className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300"
                                    onClick={() => setShowEmployeeDropdown(false)}
                                >
                                    <div
                                        className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="bg-white px-8 py-6 flex justify-between items-center border-b border-zinc-100 shrink-0">
                                            <div className="flex flex-col">
                                                <h3 className="text-xl font-black text-zinc-900 leading-tight">Personal</h3>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Selecciona un trabajador</p>
                                            </div>
                                            <button onClick={() => setShowEmployeeDropdown(false)} className="h-12 w-12 flex items-center justify-center bg-zinc-100 rounded-full hover:bg-zinc-200 text-zinc-500 transition-all active:scale-90">
                                                <X size={20} />
                                            </button>
                                        </div>
                                        <div className="p-4 overflow-y-auto">
                                            <button
                                                onClick={() => { setSelectedEmployeeId(currentUserId); setShowEmployeeDropdown(false); }}
                                                className={cn("w-full px-6 py-4 text-left text-sm font-black uppercase tracking-wider flex items-center gap-4 rounded-xl transition-all mb-2", selectedEmployeeId === currentUserId ? "bg-[#36606F] text-white shadow-lg" : "text-zinc-600 hover:bg-zinc-50")}
                                            >
                                                <div className={cn("w-2 h-2 rounded-full", selectedEmployeeId === currentUserId ? "bg-white" : "bg-blue-500")} />
                                                Mi Historial
                                            </button>
                                            <div className="h-px bg-zinc-100 my-4" />
                                            {employees.filter(e => e.id !== currentUserId).map(emp => (
                                                <button
                                                    key={emp.id}
                                                    onClick={() => { setSelectedEmployeeId(emp.id); setShowEmployeeDropdown(false); }}
                                                    className={cn("w-full px-6 py-4 text-left text-sm font-black uppercase tracking-wider flex items-center gap-4 rounded-xl transition-all mb-2", selectedEmployeeId === emp.id ? "bg-[#36606F] text-white shadow-lg" : "text-zinc-600 hover:bg-zinc-50")}
                                                >
                                                    <div className={cn("w-2 h-2 rounded-full", selectedEmployeeId === emp.id ? "bg-white" : "bg-zinc-300")} />
                                                    {emp.first_name} {emp.last_name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Selector Mes/Año */}
                    {!loading && (
                        <div className="relative z-10">
                            <button
                                onClick={() => setShowFilter(true)}
                                className={cn(
                                    "flex items-center gap-3 px-8 py-3 bg-white rounded-full shadow-xl border border-zinc-100",
                                    "text-[10px] font-black uppercase tracking-[0.2em]",
                                    isFilterActive ? "text-blue-600 ring-2 ring-blue-100" : "text-zinc-800",
                                    "active:scale-95 transition-all duration-300 hover:bg-zinc-50 hover:shadow-2xl"
                                )}
                            >
                                <span>{getMonthLabel(filterYear, filterMonth)}</span>
                            </button>
                            {isFilterActive && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); clearFilter(); }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-30"
                                >
                                    <X size={12} strokeWidth={3} />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── CONTENIDO PRINCIPAL ── */}
                {loading ? (
                    <div className="py-10 flex justify-center">
                        <LoadingSpinner size="md" className="text-white" />
                    </div>
                ) : weeksData.length === 0 ? (
                    <div className="py-10 text-center text-white/50 bg-white/5 rounded-2xl border border-dashed border-white/10 max-w-xl mx-auto">
                        <Calendar size={40} fill="currentColor" className="mx-auto mb-2 opacity-50" />
                        <p>No hay registros este mes</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* Header días de semana */}
                        <div className="grid grid-cols-7 bg-gradient-to-b from-red-500 to-red-600">
                            {DAY_HEADERS.map(d => (
                                <div key={d} className="flex items-center justify-center py-2">
                                    <span className="text-[9px] font-black text-white uppercase tracking-wider">{d}</span>
                                </div>
                            ))}
                        </div>

                        {/* Semanas */}
                        {weeksData.map((week) => (
                            <div key={week.weekNumber} className="border-t border-gray-100 first:border-t-0">

                                {/* Fila de 7 días */}
                                <div className="grid grid-cols-7">
                                    {week.days.map((day, di) => {
                                        const eventConfig = EVENT_TYPES.find(t => t.value === day.eventType);
                                        const isSpecial = day.eventType && day.eventType !== 'regular' && eventConfig;

                                        return (
                                            <div
                                                key={di}
                                                onClick={() => isManager ? openEdit(week) : undefined}
                                                className={cn(
                                                    "relative border-r border-gray-100 last:border-r-0 min-h-[100px] flex flex-col p-1",
                                                    day.isToday && "bg-blue-50/40",
                                                    isManager && "cursor-pointer hover:bg-zinc-50 transition-colors"
                                                )}
                                            >
                                                {/* Número de día */}
                                                <span className={cn(
                                                    "self-end text-[9px] font-bold leading-none mb-1",
                                                    day.isToday ? "text-blue-600" : "text-gray-400"
                                                )}>
                                                    {day.dayNumber}
                                                </span>

                                                {/* Centro: evento especial o fichajes */}
                                                <div className="flex-1 flex flex-col items-center justify-center">
                                                    {isSpecial ? (
                                                        <div className={cn("px-1.5 py-0.5 rounded shadow-sm text-center", eventConfig.color)}>
                                                            <span className="text-[8px] font-black uppercase tracking-widest leading-none">{eventConfig.label}</span>
                                                        </div>
                                                    ) : day.hasLog ? (
                                                        <div className="flex flex-col items-center gap-0.5 w-full">
                                                            {/* Entrada */}
                                                            <div className="flex items-center justify-center gap-0.5">
                                                                <div className="w-1 h-1 rounded-full bg-green-500 shrink-0" />
                                                                <span className="text-[8px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                            </div>
                                                            {/* Salida */}
                                                            {day.clockOut ? (
                                                                <div className="flex items-center justify-center gap-0.5">
                                                                    <div className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                                                    <span className="text-[8px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                </div>
                                                            ) : day.isToday ? (
                                                                <div className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {/* Pie: H y Ex */}
                                                {!isSpecial && (
                                                    <div className="w-full space-y-0 min-h-[24px]">
                                                        {day.hasLog && day.totalHours > 0 ? (
                                                            <div className="flex justify-between items-center text-[7px] h-3">
                                                                <span className="text-gray-400 font-bold">H</span>
                                                                <span className="font-black text-gray-800">{fmtHours(day.totalHours)}</span>
                                                            </div>
                                                        ) : <div className="h-3" />}
                                                        {day.extraHours > 0.05 ? (
                                                            <div className="flex justify-between items-center text-[7px] h-3">
                                                                <span className="text-gray-400 font-bold">Ex</span>
                                                                <span className="font-black text-emerald-600">{fmtHours(day.extraHours)}</span>
                                                            </div>
                                                        ) : <div className="h-3" />}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Resumen semanal */}
                                <div className="col-span-full bg-[#36606F] px-3 py-2 flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] font-black text-white/60 uppercase tracking-wider">S-{week.weekNumber}</span>
                                        {week.isCurrentWeek && (
                                            <span className="text-[7px] font-black bg-blue-400 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">En curso</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 ml-auto">
                                        {/* Horas */}
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-black text-white">{fmtHours(week.summary.totalHours) || '0'}</span>
                                            <span className="text-[7px] font-bold text-white/50 uppercase">Horas</span>
                                        </div>

                                        {/* Pendiente */}
                                        <div className="flex flex-col items-center">
                                            <span className={cn("text-[10px] font-black", (week.summary.startBalance ?? 0) >= 0 ? "text-emerald-300" : "text-red-300")}>
                                                {fmtBalance(week.summary.startBalance) || '0'}
                                            </span>
                                            <span className="text-[7px] font-bold text-white/50 uppercase">Pendiente</span>
                                        </div>

                                        {/* Extras */}
                                        <div className="flex flex-col items-center">
                                            <span className={cn("text-[10px] font-black", (week.summary.weeklyBalance ?? 0) >= 0 ? "text-white" : "text-red-300")}>
                                                {fmtBalance(week.summary.weeklyBalance) || '0'}
                                            </span>
                                            <span className="text-[7px] font-bold text-white/50 uppercase">Extras</span>
                                        </div>

                                        {/* Importe */}
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-black text-emerald-300">
                                                {fmtMoney(week.summary.estimatedValue) || '—'}
                                            </span>
                                            <span className="text-[7px] font-bold text-white/50 uppercase">Importe</span>
                                        </div>

                                        {/* Sello PAGADO */}
                                        {week.summary.isPaid && (
                                            <img src="/sello/pagado.png" alt="PAGADO" className="w-8 h-8 object-contain opacity-90 rotate-[-12deg] drop-shadow-md" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── MODAL: Filtro de Fecha ── */}
                {showFilter && (
                    <div
                        className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => setShowFilter(false)}
                    >
                        <div
                            className="bg-zinc-50/90 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-white px-8 py-6 flex justify-between items-center border-b border-zinc-100">
                                <div className="flex flex-col">
                                    <h3 className="text-xl font-black text-zinc-900 leading-tight">Calendario</h3>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Selecciona periodo</p>
                                </div>
                                <button onClick={() => setShowFilter(false)} className="h-12 w-12 flex items-center justify-center bg-zinc-100 rounded-full hover:bg-zinc-200 text-zinc-500 transition-all active:scale-90">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-8 space-y-8">
                                {/* Año */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <div className="w-1 h-3 bg-blue-600 rounded-full" />
                                        <span className="text-[11px] font-black text-zinc-800 uppercase tracking-wider">Año</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[2024, 2025, 2026, 2027].map(year => (
                                            <button
                                                key={year}
                                                onClick={() => setFilterYear(year)}
                                                className={cn("h-12 rounded-2xl text-[13px] font-black transition-all active:scale-95 border-2", filterYear === year ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-white text-zinc-500 border-transparent hover:border-zinc-200')}
                                            >
                                                {year}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Mes */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <div className="w-1 h-3 bg-blue-600 rounded-full" />
                                        <span className="text-[11px] font-black text-zinc-800 uppercase tracking-wider">Mes</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {Array.from({ length: 12 }).map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setFilterMonth(i)}
                                                className={cn("h-14 rounded-2xl text-[11px] font-bold transition-all active:scale-95 capitalize border-2", filterMonth === i ? 'bg-blue-50 text-blue-700 border-blue-500 shadow-sm' : 'bg-white text-zinc-400 border-transparent hover:bg-white hover:border-zinc-100')}
                                            >
                                                {new Date(0, i).toLocaleDateString('es-ES', { month: 'long' })}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Acciones */}
                                <div className="pt-2 space-y-3">
                                    <button
                                        onClick={applyFilter}
                                        className="w-full h-16 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                    >
                                        <Check size={20} strokeWidth={3} /> Aplicar Filtro
                                    </button>
                                    {isFilterActive && (
                                        <button
                                            onClick={() => { clearFilter(); setShowFilter(false); }}
                                            className="w-full h-14 bg-white text-zinc-400 font-bold rounded-2xl hover:bg-zinc-100 active:scale-95 transition-all text-xs uppercase tracking-widest"
                                        >
                                            Limpiar Filtro
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MODAL: Editar Registros (Manager) ── */}
                {editingWeek !== null && (
                    <div
                        className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => { setEditingWeek(null); setEditEntries([]); }}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white">
                                <div className="flex flex-col">
                                    <h3 className="text-base font-black uppercase tracking-wider leading-none">Editar Registros</h3>
                                    <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                                        Semana {editingWeek.weekNumber}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setEditingWeek(null); setEditEntries([]); }}
                                    className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white active:scale-90"
                                >
                                    <X size={20} strokeWidth={3} />
                                </button>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto p-4 space-y-3">
                                {editEntries.filter(e => !e.toDelete).length === 0 && (
                                    <div className="py-6 text-center text-zinc-400 text-sm font-medium italic">
                                        No hay registros esta semana
                                    </div>
                                )}
                                {editEntries.map((entry, idx) => {
                                    if (entry.toDelete) return null;
                                    const isRegular = entry.event_type === 'regular';
                                    const eventConfig = EVENT_TYPES.find(t => t.value === entry.event_type);
                                    return (
                                        <div key={idx} className="bg-zinc-50 rounded-2xl p-3 border border-zinc-100 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={entry.event_type}
                                                    onChange={(e) => updateEntry(idx, 'event_type', e.target.value)}
                                                    className="bg-white text-[10px] font-black uppercase text-zinc-500 rounded-lg border border-zinc-200 h-8 px-2 outline-none focus:border-blue-400"
                                                >
                                                    {EVENT_TYPES.map(type => (
                                                        <option key={type.value} value={type.value}>{type.label}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="date"
                                                    value={entry.date}
                                                    onChange={(e) => updateEntry(idx, 'date', e.target.value)}
                                                    className="flex-1 h-8 px-2 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                                                />
                                                <button
                                                    onClick={() => removeEntry(idx)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all active:scale-90 shrink-0"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            {isRegular ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 flex items-center gap-1.5">
                                                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                                        <input
                                                            type="time"
                                                            value={entry.clock_in}
                                                            onChange={(e) => updateEntry(idx, 'clock_in', e.target.value)}
                                                            className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none"
                                                        />
                                                    </div>
                                                    <div className="flex-1 flex items-center gap-1.5">
                                                        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                                        <input
                                                            type="time"
                                                            value={entry.clock_out}
                                                            onChange={(e) => updateEntry(idx, 'clock_out', e.target.value)}
                                                            className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2 bg-white border border-zinc-100 rounded-xl p-3 shadow-sm">
                                                    <div className={cn("w-3 h-3 rounded-full", (eventConfig?.color || 'bg-gray-400').split(' ')[0])} />
                                                    <span className="text-xs font-black text-zinc-500 uppercase">
                                                        8 Horas - {eventConfig?.label || 'Evento'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="p-4 border-t border-zinc-100 flex gap-3">
                                <button
                                    onClick={addEntry}
                                    className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-95 transition-all text-sm"
                                >
                                    <Plus size={18} /> Añadir
                                </button>
                                <button
                                    onClick={saveEdits}
                                    disabled={savingEdit}
                                    className="flex-1 h-12 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200 text-sm disabled:opacity-50"
                                >
                                    {savingEdit ? <LoadingSpinner size="sm" className="text-white" /> : <><Save size={18} /> Guardar</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}