'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, X, Check, Plus, Trash2, Save, Users, ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
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
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val < 0 ? `-${str}` : str;
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const str = Math.abs(val).toFixed(0);
    return val < 0 ? `-${str}€` : `${str}€`;
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
    const [editingDate, setEditingDate] = useState<string | null>(null);
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

    const nextMonth = () => {
        if (filterMonth === 11) {
            setFilterMonth(0);
            setFilterYear(prev => prev + 1);
        } else {
            setFilterMonth(prev => prev + 1);
        }
    };

    const prevMonth = () => {
        if (filterMonth === 0) {
            setFilterMonth(11);
            setFilterYear(prev => prev - 1);
        } else {
            setFilterMonth(prev => prev - 1);
        }
    };

    // --- EDICIÓN: Manager ---
    const openEdit = async (week: WeekData, specificDate?: string) => {
        const targetUserId = selectedEmployeeId || currentUserId;
        const startDate = specificDate || week.startDate;
        const endDate = specificDate || format(new Date(new Date(week.startDate).setDate(new Date(week.startDate).getDate() + 6)), 'yyyy-MM-dd');

        const { data: logs } = await supabase.from('time_logs')
            .select('id, clock_in, clock_out, event_type')
            .eq('user_id', targetUserId)
            .gte('clock_in', `${startDate}T00:00:00.000Z`)
            .lte('clock_in', `${endDate}T23:59:59.999Z`)
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
        setEditingDate(specificDate || null);
    };

    const addEntry = () => {
        if (!editingWeek) return;
        const defaultDate = editingDate || (editEntries.length > 0 ? editEntries[0].date : editingWeek.startDate);
        setEditEntries([...editEntries, { date: defaultDate, clock_in: '09:00', clock_out: '17:00', event_type: 'regular', isNew: true }]);
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
            setEditingDate(null);
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

                {/* FILTRO EMPLEADOS (MANUAL MANAGER) - MODAL ICONOS */}
                {isManager && (
                    <div className="flex flex-wrap justify-center items-center gap-4 py-2 mb-2 animate-in fade-in slide-in-from-top-4 duration-700">
                        <div className="relative z-20">
                            <button
                                onClick={() => setShowEmployeeDropdown(true)}
                                className={cn(
                                    "px-8 py-3 bg-white rounded-full shadow-xl border border-zinc-100 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-zinc-50 active:scale-95 text-zinc-800",
                                    viewingOther && "text-blue-600 ring-2 ring-blue-100"
                                )}
                            >
                                <Users size={14} className="mr-2 opacity-50" />
                                <span>{viewingOther ? selectedEmployeeName : "Mi Personal"}</span>
                                <ChevronDown size={14} className="ml-2 opacity-30" />
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
                    </div>
                )}


                {/* ── CONTENIDO PRINCIPAL DEL CALENDARIO UNIFICADO ── */}
                <div className="bg-white rounded-[20px] shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

                    {/* CABECERA AZUL MES/AÑO (NAVEGACIÓN) */}
                    <div className="bg-[#36606F] px-4 py-4 flex items-center justify-center relative">
                        <button onClick={prevMonth} className="absolute left-6 text-white hover:text-white/70 transition-colors p-2 active:scale-90 opacity-80 hover:opacity-100">
                            <span className="text-xl font-bold font-mono">{'<'}</span>
                        </button>

                        <h2 className="text-[14px] md:text-base font-black text-white uppercase tracking-widest">
                            {getMonthLabel(filterYear, filterMonth)}
                        </h2>

                        <button onClick={nextMonth} className="absolute right-6 text-white hover:text-white/70 transition-colors p-2 active:scale-90 opacity-80 hover:opacity-100">
                            <span className="text-xl font-bold font-mono">{'>'}</span>
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <LoadingSpinner size="md" className="text-[#36606F]" />
                        </div>
                    ) : weeksData.length === 0 ? (
                        <div className="py-20 text-center text-zinc-400">
                            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-bold">No hay registros este mes</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 p-4 bg-zinc-50/50">
                            {weeksData.map((week, idx) => (
                                <div key={week.weekNumber} className="relative bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.3)] flex flex-col">

                                    {/* FILA 1: Cabecera de Días (Roja) */}
                                    <div className="grid grid-cols-7 border-b border-gray-100 relative z-10 rounded-t-2xl overflow-hidden">
                                        {DAY_HEADERS.map(d => (
                                            <div key={d} className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md border-r border-white/30 last:border-r-0">
                                                <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{d}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* FILA 2: Días */}
                                    <div className="grid grid-cols-7 border-b border-gray-100">
                                        {week.days.map((day, di) => {
                                            const eventConfig = EVENT_TYPES.find(t => t.value === day.eventType);
                                            const isSpecial = day.eventType && day.eventType !== 'regular' && eventConfig;

                                            // Lógica Zero-Display
                                            const hFormatted = fmtHours(day.totalHours);
                                            const exFormatted = fmtHours(day.extraHours);

                                            return (
                                                <div
                                                    key={di}
                                                    onClick={() => isManager ? openEdit(week, day.date) : undefined}
                                                    className={cn(
                                                        "relative border-r border-gray-100 last:border-r-0 min-h-[85px] flex flex-col items-center bg-white p-1 pb-1",
                                                        day.isToday && "bg-blue-50/10",
                                                        isManager && "cursor-pointer hover:bg-zinc-50 transition-colors"
                                                    )}
                                                >
                                                    {/* Número de día superior derecha */}
                                                    <span className={cn(
                                                        "absolute top-1 right-1 text-[9px] font-bold",
                                                        day.isToday ? "text-blue-600" : "text-gray-400"
                                                    )}>
                                                        {day.dayNumber}
                                                    </span>

                                                    {/* Centro: evento especial o fichajes */}
                                                    <div className="flex-1 flex flex-col items-center justify-center mt-3 w-full">
                                                        {isSpecial ? (
                                                            <div className={cn("px-2 py-1 rounded shadow-sm text-center", eventConfig.color)}>
                                                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest leading-none block pt-0.5">{eventConfig.label}</span>
                                                            </div>
                                                        ) : day.hasLog ? (
                                                            <div className="flex flex-col items-center gap-0.5 w-full">
                                                                {/* Entrada */}
                                                                <div className="h-3 flex items-center justify-center gap-1">
                                                                    <div className="w-1 h-1 rounded-full bg-green-500 shrink-0" />
                                                                    <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                                </div>
                                                                {/* Salida */}
                                                                <div className="h-3 flex items-center justify-center gap-1">
                                                                    {day.clockOut ? (
                                                                        <>
                                                                            <div className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                        </>
                                                                    ) : day.isToday ? (
                                                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    {/* Pie: H y Ex en miniatura, Zero-Display */}
                                                    {!isSpecial && (
                                                        <div className="w-full space-y-0 mt-0.5 min-h-[20px]">
                                                            {day.hasLog && hFormatted ? (
                                                                <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                    <span className="ml-0.5">H</span>
                                                                    <span className="font-bold text-gray-800 pr-1">{hFormatted}</span>
                                                                </div>
                                                            ) : <div className="h-3" />}
                                                            {exFormatted ? (
                                                                <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                    <span className="ml-0.5">Ex</span>
                                                                    <span className="font-bold text-gray-800 pr-1">{exFormatted}</span>
                                                                </div>
                                                            ) : <div className="h-3" />}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* FILA 3: Resumen Semanal */}
                                    <div className="bg-[#487B8F] text-white flex items-center h-10 relative z-10 rounded-b-2xl overflow-hidden">
                                        {/* ZONA IZQUIERDA (Fija) */}
                                        <div className="w-16 pl-3 shrink-0 flex items-center h-full">
                                            <span className="font-black text-[7px] uppercase leading-none">
                                                SEMANA {week.weekNumber}
                                            </span>
                                        </div>

                                        {/* ZONA DERECHA (Grid de valores desplazado a la izquierda para el sello) */}
                                        <div className="flex-1 grid grid-cols-4 h-full relative z-20 pr-16 md:pr-24">
                                            {/* COL 1: HORAS */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span className="text-[9px] font-black leading-none text-white block">
                                                    {week.summary.totalHours > 0.05 ? week.summary.totalHours.toFixed(1).replace('.0', '') : " "}
                                                </span>
                                                <span className="text-[7px] text-white/60 font-black leading-none uppercase tracking-tighter">HORAS</span>
                                            </div>

                                            {/* COL 2: PENDIENTE */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span
                                                    className="text-[9px] font-black leading-none text-white block"
                                                >
                                                    {Math.abs(week.summary.startBalance ?? 0) > 0.05
                                                        ? `${week.summary.startBalance < 0 ? '-' : ''}${Math.abs(week.summary.startBalance).toFixed(1).replace('.0', '')}`
                                                        : " "}
                                                </span>
                                                <span className="text-[7px] text-white/60 font-black leading-none uppercase tracking-tighter text-center">PENDIENTES</span>
                                            </div>

                                            {/* COL 3: EXTRAS */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span className="text-[9px] font-black leading-none text-white block">
                                                    {(week.summary.weeklyBalance ?? 0) > 0.05 ? Math.abs(week.summary.weeklyBalance).toFixed(1).replace('.0', '') : " "}
                                                </span>
                                                <span className="text-[7px] text-white/60 font-black leading-none uppercase tracking-tighter">EXTRAS</span>
                                            </div>

                                            {/* COL 4: IMPORTE */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span
                                                    className="text-[9px] font-black leading-none text-white block"
                                                >
                                                    {(week.summary.estimatedValue ?? 0) > 0.05 ? fmtMoney(week.summary.estimatedValue) : " "}
                                                </span>
                                                <span className="text-[7px] text-white/60 font-black leading-none uppercase tracking-tighter">IMPORTE</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sello PAGADO dinámico anclado al contenedor semanal */}
                                    {week.summary.isPaid && (
                                        <img
                                            src="/sello/pagado.png"
                                            alt="PAGADO"
                                            className="absolute bottom-0 right-0 w-[72px] h-auto rotate-[0deg] z-30 pointer-events-none drop-shadow-xl -mt-1 md:w-20"
                                            style={{ transform: 'translate(10%, 15%) rotate(-15deg)' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {editingWeek !== null && (
                    <div
                        className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => { setEditingWeek(null); setEditingDate(null); setEditEntries([]); }}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white">
                                <div className="flex flex-col">
                                    <h3 className="text-base font-black uppercase tracking-wider leading-none">
                                        {editingDate ? "Editar Registro Día" : "Editar Registros"}
                                    </h3>
                                    <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                                        {editingDate
                                            ? format(new Date(editingDate + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es }).toUpperCase()
                                            : `Semana ${editingWeek.weekNumber}`
                                        }
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setEditingWeek(null); setEditingDate(null); setEditEntries([]); }}
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
                                                <div className="flex-1 bg-blue-500 rounded-lg border border-white/10 flex items-center px-2">
                                                    <input
                                                        type="date"
                                                        value={entry.date}
                                                        onChange={(e) => updateEntry(idx, 'date', e.target.value)}
                                                        className="w-full bg-transparent border-none p-0 text-[10px] font-black uppercase tracking-widest text-white outline-none focus:ring-0 cursor-pointer"
                                                    />
                                                </div>
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
                                            )
                                            }
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

            <StaffSelectionModal
                isOpen={showEmployeeDropdown}
                onClose={() => setShowEmployeeDropdown(false)}
                employees={employees}
                onSelect={(emp) => {
                    setSelectedEmployeeId(emp.id);
                    setShowEmployeeDropdown(false);
                }}
            />
        </div >
    );
}