'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, ChevronDown, Filter, X, Check, Pencil, Plus, Trash2, Save
} from 'lucide-react';
import { isSameWeek, format } from 'date-fns';
import { cn } from '@/lib/utils';

// --- TIPOS ---
interface DailyLog {
    date: Date; dayName: string; dayNumber: number; hasLog: boolean; clockIn: string; clockOut: string; totalHours: number; extraHours: number; isToday: boolean;
}

interface WeeklyData {
    weekNumber: number; startDate: Date; endDate: Date; days: DailyLog[];
    isCurrentWeek: boolean;
    summary: {
        totalHours: number;
        weeklyBalance: number;
        estimatedValue: number;
        startBalance: number;
        finalBalance: number;
        isPaid: boolean;
    };
}

interface TimeLogEntry {
    id?: string;
    date: string;
    clock_in: string;
    clock_out: string;
    isNew?: boolean;
    toDelete?: boolean;
}

// --- LÓGICA DE NEGOCIO: REDONDEO 20/40 ---
const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

const roundHoursValue = (hours: number): number => {
    const minutes = Math.round(hours * 60);
    return applyRoundingRule(minutes);
};

// --- HELPERS VISUALES ---
const formatNumber = (val: number) => {
    if (Math.abs(val) < 0.1) return ' ';
    const rounded = Math.round(val * 2) / 2;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
};

const formatValue = (val: number) => formatNumber(val);
const formatBalance = (val: number) => formatNumber(val);

const formatMoney = (val: number) => {
    if (Math.abs(val) < 0.1) return " ";
    return `${val.toFixed(0)}€`;
};

const getMonthLabel = (d: Date) => d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

function getWeekNumber(d: Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function HistoryPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weeksData, setWeeksData] = useState<WeeklyData[]>([]);
    const [userName, setUserName] = useState('');

    // Preferencia Stock
    const [preferStock, setPreferStock] = useState(false);

    // Rol y empleados
    const [userRole, setUserRole] = useState<string>('staff');
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

    // Filtros
    const [showFilter, setShowFilter] = useState(false);
    const [isFilterActive, setIsFilterActive] = useState(false);
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth());

    // Edición (Manager)
    const [editingWeekIdx, setEditingWeekIdx] = useState<number | null>(null);
    const [editEntries, setEditEntries] = useState<TimeLogEntry[]>([]);
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => { initUser(); }, []);
    useEffect(() => { if (currentUserId) fetchHistory(); }, [currentDate, selectedEmployeeId, currentUserId]);

    async function initUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);
        setSelectedEmployeeId(user.id);

        const { data: profile } = await supabase.from('profiles')
            .select('first_name, role, prefer_stock_hours')
            .eq('id', user.id).single();

        if (profile) {
            setUserName(profile.first_name);
            setUserRole(profile.role);
            setPreferStock(profile.prefer_stock_hours || false);
        }

        // Si es manager, cargar lista de empleados
        if (profile?.role === 'manager') {
            const { data: emps } = await supabase.from('profiles')
                .select('id, first_name, last_name')
                .order('first_name');
            setEmployees(emps || []);
        }
    }

    async function fetchHistory() {
        setLoading(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;

            const { data: profile } = await supabase.from('profiles')
                .select('first_name, role, contracted_hours_weekly, overtime_cost_per_hour, is_fixed_salary, prefer_stock_hours, hours_balance')
                .eq('id', targetUserId).single();

            if (profile && targetUserId === currentUserId) {
                setUserName(profile.first_name);
                setPreferStock(profile.prefer_stock_hours || false);
            }

            const contractHours = profile?.contracted_hours_weekly || 40;
            const overtimeRate = profile?.overtime_cost_per_hour || 0;
            const isFixedSalary = profile?.is_fixed_salary || false;
            const isTargetManager = profile?.role === 'manager';
            const userPreferStock = profile?.prefer_stock_hours || false;
            const historicalBalance = profile?.hours_balance || 0;

            // RANGO DE FECHAS
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

            const today = new Date(); today.setHours(23, 59, 59, 999);

            const startView = new Date(startOfMonth);
            const dayOfWeek = startView.getDay();
            const diffToMonday = startView.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startView.setDate(diffToMonday); startView.setHours(0, 0, 0, 0);

            // 1. FETCH LOGS — extender al domingo de la última semana visible
            const endView = new Date(endOfMonth);
            const endDayOfWeek = endView.getDay();
            if (endDayOfWeek !== 0) {
                endView.setDate(endView.getDate() + (7 - endDayOfWeek));
            }
            endView.setHours(23, 59, 59, 999);

            // effectiveEndDate: usa endView (no endOfMonth) para cubrir semanas completas
            const effectiveEndDate = endView > today ? today : endView;

            const { data: logs } = await supabase.from('time_logs')
                .select('*')
                .eq('user_id', targetUserId)
                .gte('clock_in', startView.toISOString())
                .lte('clock_in', endView.toISOString())
                .order('clock_in', { ascending: true });

            // 2. FETCH SNAPSHOTS
            const searchSnapshotStart = new Date(startView);
            searchSnapshotStart.setDate(searchSnapshotStart.getDate() - 7);

            const { data: snapshots } = await supabase.from('weekly_snapshots')
                .select('week_start, total_hours, balance_hours, pending_balance, final_balance, is_paid')
                .eq('user_id', targetUserId)
                .gte('week_start', searchSnapshotStart.toISOString().split('T')[0])
                .lte('week_start', endView.toISOString().split('T')[0])
                .order('week_start', { ascending: true });

            // 3. GENERAR SEMANAS
            const weeks: WeeklyData[] = [];
            let currentWeekStart = new Date(startView);

            while (currentWeekStart <= effectiveEndDate) {
                const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 });

                const weekDays: DailyLog[] = [];
                let weekTotalHours = 0;
                let currentAccumulated = 0;
                const effContract = (isTargetManager || isFixedSalary) ? 0 : contractHours;

                for (let i = 0; i < 7; i++) {
                    const d = new Date(currentWeekStart); d.setDate(currentWeekStart.getDate() + i);
                    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

                    const log = logs?.find(l => {
                        const ld = new Date(l.clock_in);
                        return ld.getDate() === d.getDate() && ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear();
                    });

                    let h = 0, cin = '', cout = '', dayExtras = 0;
                    if (log) {
                        const inD = new Date(log.clock_in); cin = inD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        if (log.clock_out) { const outD = new Date(log.clock_out); cout = outD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
                        h = log.total_hours ? roundHoursValue(log.total_hours) : 0;
                        weekTotalHours += h;

                        const newAccumulated = currentAccumulated + h;
                        if (newAccumulated > effContract) {
                            dayExtras = (currentAccumulated >= effContract) ? h : (newAccumulated - effContract);
                        }
                        currentAccumulated = newAccumulated;
                    }

                    weekDays.push({
                        date: d, dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i], dayNumber: d.getDate(),
                        hasLog: !!log, clockIn: cin, clockOut: cout, totalHours: h, extraHours: dayExtras, isToday: isToday
                    });
                }

                // Para semana en curso: si todos los días son futuros, no mostrar
                const hasPastDays = weekDays.some(d => d.date <= today);
                if (!hasPastDays) break;

                // --- LÓGICA DE RESUMEN ---
                const weekStartISO = format(currentWeekStart, 'yyyy-MM-dd');
                const snapshot = snapshots?.find(s => s.week_start === weekStartISO);

                let summaryStartBalance = 0;
                let summaryWeeklyBalance = 0;
                let summaryTotalHours = 0;
                let summaryFinalBalance = 0;

                if (isCurrentWeek) {
                    // Semana en curso: cálculo dinámico como el dashboard
                    summaryTotalHours = weekTotalHours;
                    if (isTargetManager || isFixedSalary) {
                        summaryWeeklyBalance = weekTotalHours;
                    } else {
                        summaryWeeklyBalance = weekTotalHours - contractHours;
                    }
                    summaryStartBalance = historicalBalance;
                    summaryFinalBalance = summaryStartBalance + summaryWeeklyBalance;
                } else if (snapshot) {
                    summaryStartBalance = snapshot.pending_balance;
                    summaryWeeklyBalance = snapshot.balance_hours;
                    summaryTotalHours = snapshot.total_hours;
                    summaryFinalBalance = snapshot.final_balance ?? (snapshot.pending_balance + snapshot.balance_hours);
                } else {
                    summaryTotalHours = weekTotalHours;
                    if (isTargetManager || isFixedSalary) {
                        summaryWeeklyBalance = weekTotalHours;
                        summaryTotalHours = 40 + weekTotalHours;
                    } else {
                        summaryWeeklyBalance = weekTotalHours - contractHours;
                    }

                    const prevWeekDate = new Date(currentWeekStart);
                    prevWeekDate.setDate(prevWeekDate.getDate() - 7);
                    const prevWeekISO = format(prevWeekDate, 'yyyy-MM-dd');
                    const prevSnapshot = snapshots?.find(s => s.week_start === prevWeekISO);

                    if (prevSnapshot) {
                        if (!userPreferStock && prevSnapshot.final_balance > 0) {
                            summaryStartBalance = 0;
                        } else {
                            summaryStartBalance = prevSnapshot.final_balance;
                        }
                    }
                    summaryFinalBalance = summaryStartBalance + summaryWeeklyBalance;
                }

                let estimatedValue = 0;
                if (summaryFinalBalance > 0 && !userPreferStock) {
                    estimatedValue = summaryFinalBalance * overtimeRate;
                }

                weeks.push({
                    weekNumber: getWeekNumber(currentWeekStart),
                    startDate: new Date(currentWeekStart),
                    endDate: new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() + 6),
                    days: weekDays,
                    isCurrentWeek,
                    summary: {
                        totalHours: summaryTotalHours > 0 ? summaryTotalHours : weekTotalHours,
                        weeklyBalance: summaryWeeklyBalance,
                        estimatedValue,
                        startBalance: summaryStartBalance,
                        finalBalance: summaryFinalBalance,
                        isPaid: snapshot?.is_paid || false
                    }
                });
                currentWeekStart.setDate(currentWeekStart.getDate() + 7);
            }

            setWeeksData(weeks.reverse());

        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    }

    const changeMonth = (d: number) => { const n = new Date(currentDate); n.setMonth(n.getMonth() + d); setCurrentDate(n); };
    const applyFilter = () => { setCurrentDate(new Date(filterYear, filterMonth, 1)); setIsFilterActive(true); setShowFilter(false); };
    const clearFilter = () => { setCurrentDate(new Date()); setIsFilterActive(false); };

    // --- EDICIÓN: Manager ---
    const openEdit = async (weekIdx: number) => {
        const week = weeksData[weekIdx];
        const targetUserId = selectedEmployeeId || currentUserId;

        const mondayISO = format(week.startDate, 'yyyy-MM-dd');
        const sundayDate = new Date(week.startDate);
        sundayDate.setDate(sundayDate.getDate() + 6);
        const sundayISO = format(sundayDate, 'yyyy-MM-dd');

        const { data: logs } = await supabase.from('time_logs')
            .select('id, clock_in, clock_out')
            .eq('user_id', targetUserId)
            .gte('clock_in', `${mondayISO}T00:00:00.000Z`)
            .lte('clock_in', `${sundayISO}T23:59:59.999Z`)
            .order('clock_in', { ascending: true });

        const entries: TimeLogEntry[] = (logs || []).map(l => ({
            id: l.id,
            date: new Date(l.clock_in).toISOString().split('T')[0],
            clock_in: new Date(l.clock_in).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            clock_out: l.clock_out ? new Date(l.clock_out).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
        }));

        setEditEntries(entries);
        setEditingWeekIdx(weekIdx);
    };

    const addEntry = () => {
        if (editingWeekIdx === null) return;
        const week = weeksData[editingWeekIdx];
        const dateStr = format(week.startDate, 'yyyy-MM-dd');
        setEditEntries([...editEntries, { date: dateStr, clock_in: '09:00', clock_out: '17:00', isNew: true }]);
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
        setEditEntries(updated);
    };

    const saveEdits = async () => {
        if (editingWeekIdx === null) return;
        setSavingEdit(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;

            // 1. Delete entries marked for deletion
            const toDelete = editEntries.filter(e => e.toDelete && e.id);
            for (const entry of toDelete) {
                await supabase.from('time_logs').delete().eq('id', entry.id!);
            }

            // 2. Update existing entries
            const toUpdate = editEntries.filter(e => !e.isNew && !e.toDelete && e.id);
            for (const entry of toUpdate) {
                const clockInDT = new Date(`${entry.date}T${entry.clock_in}:00`);
                const clockOutDT = entry.clock_out ? new Date(`${entry.date}T${entry.clock_out}:00`) : null;
                let totalHours: number | null = null;
                if (clockOutDT) {
                    const diffMinutes = (clockOutDT.getTime() - clockInDT.getTime()) / 60000;
                    totalHours = applyRoundingRule(diffMinutes);
                }
                await supabase.from('time_logs').update({
                    clock_in: clockInDT.toISOString(),
                    clock_out: clockOutDT ? clockOutDT.toISOString() : null,
                    total_hours: totalHours,
                }).eq('id', entry.id!);
            }

            // 3. Insert new entries
            const toInsert = editEntries.filter(e => e.isNew && !e.toDelete);
            for (const entry of toInsert) {
                const clockInDT = new Date(`${entry.date}T${entry.clock_in}:00`);
                const clockOutDT = entry.clock_out ? new Date(`${entry.date}T${entry.clock_out}:00`) : null;
                let totalHours: number | null = null;
                if (clockOutDT) {
                    const diffMinutes = (clockOutDT.getTime() - clockInDT.getTime()) / 60000;
                    totalHours = applyRoundingRule(diffMinutes);
                }
                await supabase.from('time_logs').insert({
                    user_id: targetUserId,
                    clock_in: clockInDT.toISOString(),
                    clock_out: clockOutDT ? clockOutDT.toISOString() : null,
                    total_hours: totalHours,
                    is_manual_entry: true,
                });
            }

            setEditingWeekIdx(null);
            setEditEntries([]);
            fetchHistory();
        } catch (error) {
            console.error('Error saving edits:', error);
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

            <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-3">

                {/* Filtro por empleado (solo manager) */}
                {isManager && (
                    <div className="relative">
                        <button
                            onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                            className="w-full h-12 bg-white rounded-2xl shadow-sm border border-zinc-100 px-4 flex items-center justify-between text-sm font-bold text-zinc-700 active:scale-[0.98] transition-all"
                        >
                            <span>{viewingOther ? `Historial de ${selectedEmployeeName}` : 'Mi Historial'}</span>
                            <ChevronDown size={18} className={cn("text-zinc-400 transition-transform", showEmployeeDropdown && "rotate-180")} />
                        </button>
                        {showEmployeeDropdown && (
                            <div className="absolute top-14 left-0 right-0 bg-white rounded-2xl shadow-xl border border-zinc-100 z-50 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                <button
                                    onClick={() => { setSelectedEmployeeId(currentUserId); setShowEmployeeDropdown(false); }}
                                    className={cn(
                                        "w-full px-4 py-3 text-left text-sm font-bold flex items-center gap-2 hover:bg-zinc-50 transition-colors",
                                        selectedEmployeeId === currentUserId ? "text-blue-600 bg-blue-50" : "text-zinc-700"
                                    )}
                                >
                                    Mi Historial
                                    {selectedEmployeeId === currentUserId && <Check size={16} className="ml-auto" />}
                                </button>
                                <div className="h-px bg-zinc-100" />
                                {employees.filter(e => e.id !== currentUserId).map(emp => (
                                    <button
                                        key={emp.id}
                                        onClick={() => { setSelectedEmployeeId(emp.id); setShowEmployeeDropdown(false); }}
                                        className={cn(
                                            "w-full px-4 py-3 text-left text-sm font-bold flex items-center gap-2 hover:bg-zinc-50 transition-colors",
                                            selectedEmployeeId === emp.id ? "text-blue-600 bg-blue-50" : "text-zinc-700"
                                        )}
                                    >
                                        {emp.first_name} {emp.last_name}
                                        {selectedEmployeeId === emp.id && <Check size={16} className="ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="py-10 text-center text-white/50"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Cargando registros...</div>
                ) : weeksData.length === 0 ? (
                    <div className="py-10 text-center text-white/50 bg-white/5 rounded-2xl border border-dashed border-white/10 max-w-xl mx-auto"><Calendar size={40} fill="currentColor" className="mx-auto mb-2 opacity-50" /><p>No hay registros este mes</p></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
                        {weeksData.map((week, idx) => {
                            const currentMonthLabel = getMonthLabel(week.startDate);
                            const prevWeekLabel = idx > 0 ? getMonthLabel(weeksData[idx - 1].startDate) : null;
                            const showMonthHeader = idx === 0 || currentMonthLabel !== prevWeekLabel;

                            return (
                                <React.Fragment key={idx}>
                                    {showMonthHeader && (
                                        <div className="col-span-1 md:col-span-2 lg:col-span-3 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-left-4">
                                            <span className="text-[10px] font-black text-white uppercase tracking-[0.15em] drop-shadow-md whitespace-nowrap opacity-70">{currentMonthLabel}</span>
                                            <div className="h-px bg-white/30 flex-1 opacity-70"></div>
                                            {idx === 0 && (
                                                <div className="flex items-center gap-1.5 ml-1 shrink-0">
                                                    <button
                                                        onClick={() => setShowFilter(true)}
                                                        className={cn(
                                                            "h-8 w-8 flex items-center justify-center rounded-lg transition-all active:scale-95 duration-150 shadow-lg",
                                                            isFilterActive ? 'bg-orange-500 text-white shadow-orange-200' : 'bg-white text-zinc-500 shadow-sm border border-zinc-100'
                                                        )}
                                                        title="Filtrar"
                                                    >
                                                        <Filter size={14} fill="currentColor" />
                                                    </button>
                                                    {isFilterActive && (
                                                        <button
                                                            onClick={clearFilter}
                                                            className="h-8 w-8 flex items-center justify-center bg-white/20 text-white rounded-lg transition-all active:scale-95 duration-150 backdrop-blur-sm"
                                                            title="Quitar Filtro"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className={cn(
                                        "bg-white rounded-[2rem] p-4 md:p-6 shadow-xl border border-zinc-100",
                                        "transition-all duration-300 animate-in slide-in-from-bottom-4 relative mb-4",
                                        week.isCurrentWeek && "ring-2 ring-blue-400/40"
                                    )} style={{ animationDelay: `${idx * 50}ms` }}>
                                        <div className="flex justify-between items-end mb-2 px-1">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">
                                                        {getMonthLabel(week.startDate)} - SEM {week.weekNumber}
                                                    </span>
                                                    {week.isCurrentWeek && (
                                                        <span className="text-[8px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider -mt-1 animate-pulse">
                                                            En Curso
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Botón editar para manager */}
                                            {isManager && (
                                                <button
                                                    onClick={() => openEdit(idx)}
                                                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 hover:bg-blue-100 hover:text-blue-600 transition-all active:scale-90"
                                                    title="Editar registros"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                            )}
                                        </div>
                                        {week.summary.isPaid && (
                                            <div className="absolute -bottom-7 -right-4 w-20 h-20 rotate-[-12deg] opacity-95 pointer-events-none z-30 drop-shadow-xl">
                                                <img src="/sello/pagado.png" alt="PAGADO" className="w-full h-full object-contain" />
                                            </div>
                                        )}

                                        <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                                            <div className="grid grid-cols-7 border-b border-gray-100">
                                                {week.days.map((day, i) => (
                                                    <div key={i} className="flex flex-col border-r border-gray-100 last:border-[#5B8FB9] min-h-[108px] bg-white relative">
                                                        <div className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md relative z-10">
                                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                                        </div>
                                                        <div className="flex-1 p-1 flex flex-col items-center relative z-0">
                                                            <span className={`absolute top-1 right-1 text-[9px] font-bold ${day.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.dayNumber}</span>
                                                            <div className="flex-1 flex flex-col justify-center gap-0.5 w-full pb-1 mt-4">
                                                                <div className="h-3 flex items-center justify-center gap-1">
                                                                    {day.hasLog ? (
                                                                        <>
                                                                            <div className="w-1 h-1 rounded-full bg-green-500 shrink-0"></div>
                                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                                <div className="h-3 flex items-center justify-center gap-1">
                                                                    {day.hasLog && day.clockOut ? (
                                                                        <>
                                                                            <div className="w-1 h-1 rounded-full bg-red-500 shrink-0"></div>
                                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                        </>
                                                                    ) : (day.hasLog && !day.clockOut && day.isToday ? <div className="w-1 h-1 rounded-full bg-orange-400 animate-pulse"></div> : null)}
                                                                </div>
                                                            </div>
                                                            <div className="w-full space-y-0 pt-0.5 min-h-[26px]">
                                                                {day.hasLog && day.totalHours > 0 ? (
                                                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                        <span className="ml-0.5">H</span>
                                                                        <span className="font-bold text-gray-800 pr-1">{formatNumber(day.totalHours)}</span>
                                                                    </div>
                                                                ) : <div className="h-3" />}
                                                                {day.extraHours > 0.1 ? (
                                                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                        <span className="ml-0.5">Ex</span>
                                                                        <span className="font-bold text-gray-800 pr-1">{formatNumber(day.extraHours)}</span>
                                                                    </div>
                                                                ) : <div className="h-3" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="p-2 md:p-3 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                                            <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                                <div className="h-4 flex items-center">
                                                    <span className="font-black text-gray-800 text-[11px] md:text-xs leading-none">{formatValue(week.summary.totalHours)}</span>
                                                </div>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Horas</span>
                                            </div>

                                            <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                                <div className="h-4 flex items-center">
                                                    <span className={`font-black text-[11px] md:text-xs leading-none ${week.summary.weeklyBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                        {formatBalance(week.summary.weeklyBalance)}
                                                    </span>
                                                </div>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Balance</span>
                                            </div>

                                            <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                                <div className="h-4 flex items-center">
                                                    <span className={`font-black text-[11px] md:text-xs leading-none ${week.summary.startBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                        {formatBalance(week.summary.startBalance)}
                                                    </span>
                                                </div>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                            </div>

                                            <div className="flex flex-col items-center flex-1 shrink-0">
                                                <div className="h-4 flex items-center">
                                                    <span className="font-black text-[11px] md:text-xs leading-none text-green-600">
                                                        {formatMoney(week.summary.estimatedValue)}
                                                    </span>
                                                </div>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Importe</span>
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL: Filtro de Fecha */}
            {showFilter && (
                <div
                    className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowFilter(false)}
                >
                    <div
                        className="bg-white w-full max-w-xs rounded-[2rem] p-6 shadow-2xl transform transition-all scale-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-zinc-800">Filtrar Fecha</h3>
                            <button
                                onClick={() => setShowFilter(false)}
                                className="h-10 w-10 flex items-center justify-center bg-zinc-100 rounded-full hover:bg-zinc-200 text-zinc-500 transition-all active:scale-95"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-3 px-1">Año</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {[2024, 2025, 2026, 2027].map(year => (
                                        <button
                                            key={year}
                                            onClick={() => setFilterYear(year)}
                                            className={cn(
                                                "h-12 px-5 rounded-xl text-sm font-bold border transition-all active:scale-95 whitespace-nowrap",
                                                filterYear === year ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-white text-zinc-600 border-zinc-200 hover:border-blue-400'
                                            )}
                                        >
                                            {year}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase mb-3 px-1">Mes</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setFilterMonth(i)}
                                            className={cn(
                                                "h-12 rounded-xl text-xs font-bold border transition-all active:scale-95 capitalize",
                                                filterMonth === i ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-zinc-50 text-zinc-600 border-zinc-100 hover:bg-white hover:border-blue-200'
                                            )}
                                        >
                                            {new Date(0, i).toLocaleDateString('es-ES', { month: 'short' })}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={applyFilter}
                                className="w-full h-14 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                <Check size={20} fill="currentColor" /> Aplicar Filtro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Editar Registros de Semana (Manager) */}
            {editingWeekIdx !== null && (
                <div
                    className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { setEditingWeekIdx(null); setEditEntries([]); }}
                >
                    <div
                        className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-[#5B8FB9] px-6 py-4 flex justify-between items-center text-white">
                            <div className="flex flex-col">
                                <h3 className="text-base font-black uppercase tracking-wider leading-none">Editar Registros</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                                    Semana {weeksData[editingWeekIdx]?.weekNumber}
                                </p>
                            </div>
                            <button
                                onClick={() => { setEditingWeekIdx(null); setEditEntries([]); }}
                                className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                            >
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>

                        {/* Entries */}
                        <div className="max-h-[50vh] overflow-y-auto p-4 space-y-3">
                            {editEntries.filter(e => !e.toDelete).length === 0 && (
                                <div className="py-6 text-center text-zinc-400 text-sm font-medium italic">
                                    No hay registros esta semana
                                </div>
                            )}
                            {editEntries.map((entry, idx) => {
                                if (entry.toDelete) return null;
                                return (
                                    <div key={idx} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="date"
                                                value={entry.date}
                                                onChange={(e) => updateEntry(idx, 'date', e.target.value)}
                                                className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
                                            />
                                            <button
                                                onClick={() => removeEntry(idx)}
                                                className="w-10 h-10 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all active:scale-90 shrink-0"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
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
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
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
                                {savingEdit ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <><Save size={18} /> Guardar</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}