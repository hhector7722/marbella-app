'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft, Calendar, ChevronLeft, ChevronRight, Filter, X, Check
} from 'lucide-react';
import Link from 'next/link';
import { isSameWeek } from 'date-fns';
import { cn, formatDisplayValue } from '@/lib/utils';

// --- TIPOS ---
interface DailyLog {
    date: Date; dayName: string; dayNumber: number; hasLog: boolean; clockIn: string; clockOut: string; totalHours: number; extraHours: number; isToday: boolean;
}

interface WeeklyData {
    weekNumber: number; startDate: Date; endDate: Date; days: DailyLog[];
    summary: {
        totalHours: number;
        weeklyBalance: number;
        estimatedValue: number;
        startBalance: number;
        finalBalance: number;
        isPaid: boolean;
    };
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

const formatBalance = (val: number) => formatNumber(val); // formatBalance used formatNumber already

const formatMoney = (val: number) => val > 0 ? `${val.toFixed(0)}€` : ' ';

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

    // Filtros
    const [showFilter, setShowFilter] = useState(false);
    const [isFilterActive, setIsFilterActive] = useState(false);
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth());

    useEffect(() => { fetchHistory(); }, [currentDate]);

    // Visibilidad Pendiente
    const shouldShowPending = (val: number) => {
        const roundedVal = Math.round(val * 2) / 2;
        if (roundedVal < 0) return true;
        if (roundedVal > 0 && preferStock) return true;
        return false;
    };

    async function fetchHistory() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase.from('profiles')
                .select('first_name, role, contracted_hours_weekly, overtime_cost_per_hour, is_fixed_salary, prefer_stock_hours')
                .eq('id', user.id).single();

            if (profile) {
                setUserName(profile.first_name);
                setPreferStock(profile.prefer_stock_hours);
            }

            const contractHours = profile?.contracted_hours_weekly || 40;
            const overtimeRate = profile?.overtime_cost_per_hour || 0;
            const isFixedSalary = profile?.is_fixed_salary || false;
            const isManager = profile?.role === 'manager';

            // RANGO DE FECHAS
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

            const today = new Date(); today.setHours(23, 59, 59, 999);
            const effectiveEndDate = endOfMonth > today ? today : endOfMonth;

            const startView = new Date(startOfMonth);
            const dayOfWeek = startView.getDay();
            const diffToMonday = startView.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startView.setDate(diffToMonday); startView.setHours(0, 0, 0, 0);

            // 1. FETCH LOGS
            const { data: logs } = await supabase.from('time_logs')
                .select('*')
                .eq('user_id', user.id)
                .gte('clock_in', startView.toISOString())
                .lte('clock_in', endOfMonth.toISOString())
                .order('clock_in', { ascending: true });

            // 2. FETCH SNAPSHOTS
            const searchSnapshotStart = new Date(startView);
            searchSnapshotStart.setDate(searchSnapshotStart.getDate() - 7);

            const { data: snapshots } = await supabase.from('weekly_snapshots')
                .select('week_start, total_hours, balance_hours, pending_balance, final_balance, is_paid')
                .eq('user_id', user.id)
                .gte('week_start', searchSnapshotStart.toISOString().split('T')[0])
                .order('week_start', { ascending: true });

            // 3. GENERAR SEMANAS
            const weeks: WeeklyData[] = [];
            let currentWeekStart = new Date(startView);

            while (currentWeekStart <= effectiveEndDate) {

                if (isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 })) {
                    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                    continue;
                }

                const weekDays: DailyLog[] = [];
                let weekTotalHours = 0;
                let hasFutureDays = true;

                for (let i = 0; i < 7; i++) {
                    const d = new Date(currentWeekStart); d.setDate(currentWeekStart.getDate() + i);
                    if (d <= today) hasFutureDays = false;

                    const log = logs?.find(l => {
                        const ld = new Date(l.clock_in);
                        return ld.getDate() === d.getDate() && ld.getMonth() === d.getMonth();
                    });

                    let h = 0, cin = '', cout = '';
                    if (log) {
                        const inD = new Date(log.clock_in); cin = inD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        if (log.clock_out) { const outD = new Date(log.clock_out); cout = outD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
                        h = log.total_hours ? roundHoursValue(log.total_hours) : 0;
                        weekTotalHours += h;
                    }

                    const dailyExtras = Math.max(0, h - 8);

                    weekDays.push({
                        date: d, dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i], dayNumber: d.getDate(),
                        hasLog: !!log, clockIn: cin, clockOut: cout, totalHours: h, extraHours: dailyExtras, isToday: false
                    });
                }

                if (hasFutureDays) break;

                // --- LÓGICA DE RESUMEN ---
                const weekStartISO = currentWeekStart.toISOString().split('T')[0];
                const snapshot = snapshots?.find(s => s.week_start === weekStartISO);
                const userPreferStock = profile?.prefer_stock_hours || false;

                let summaryStartBalance = 0;
                let summaryWeeklyBalance = 0;
                let summaryTotalHours = 0;
                let summaryFinalBalance = 0;

                if (snapshot) {
                    summaryStartBalance = snapshot.pending_balance;
                    summaryWeeklyBalance = snapshot.balance_hours;
                    summaryTotalHours = snapshot.total_hours;
                    summaryFinalBalance = snapshot.final_balance ?? (snapshot.pending_balance + snapshot.balance_hours);
                } else {
                    summaryTotalHours = weekTotalHours;

                    // Managers y empleados con salario fijo: todas las horas son extras
                    if (isManager || isFixedSalary) {
                        summaryWeeklyBalance = weekTotalHours;
                    } else {
                        summaryWeeklyBalance = weekTotalHours - contractHours;
                    }

                    const prevWeekDate = new Date(currentWeekStart);
                    prevWeekDate.setDate(prevWeekDate.getDate() - 7);
                    const prevWeekISO = prevWeekDate.toISOString().split('T')[0];
                    const prevSnapshot = snapshots?.find(s => s.week_start === prevWeekISO);

                    if (prevSnapshot) {
                        // Si no prefiere acumular y balance previo > 0, se liquidó y arranca en 0
                        if (!userPreferStock && prevSnapshot.final_balance > 0) {
                            summaryStartBalance = 0;
                        } else {
                            summaryStartBalance = prevSnapshot.final_balance;
                        }
                    } else {
                        summaryStartBalance = 0;
                    }

                    summaryFinalBalance = summaryStartBalance + summaryWeeklyBalance;
                }

                // Solo cobra si balance > 0 Y no prefiere acumular
                let estimatedValue = 0;
                if (summaryFinalBalance > 0 && !userPreferStock) {
                    estimatedValue = summaryFinalBalance * overtimeRate;
                }

                weeks.push({
                    weekNumber: getWeekNumber(currentWeekStart),
                    startDate: new Date(currentWeekStart),
                    endDate: new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() + 6),
                    days: weekDays,
                    summary: {
                        totalHours: summaryTotalHours > 0 ? summaryTotalHours : weekTotalHours,
                        weeklyBalance: summaryWeeklyBalance,
                        estimatedValue: estimatedValue,
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

    return (
        <div className="pb-10">

            <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-3">
                {loading ? (
                    <div className="py-10 text-center text-white/50"><div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>Cargando registros...</div>
                ) : weeksData.length === 0 ? (
                    <div className="py-10 text-center text-white/50 bg-white/5 rounded-2xl border border-dashed border-white/10 max-w-xl mx-auto"><Calendar size={40} fill="currentColor" className="mx-auto mb-2 opacity-50" /><p>No hay registros cerrados este mes</p></div>
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
                                        "transition-all duration-300 animate-in slide-in-from-bottom-4 relative mb-4"
                                    )} style={{ animationDelay: `${idx * 50}ms` }}>
                                        <div className="flex justify-between items-end mb-2 px-1">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">
                                                    {getMonthLabel(week.startDate)} - SEM {week.weekNumber}
                                                </span>
                                            </div>
                                        </div>
                                        {week.summary.isPaid && (
                                            <div className="absolute -bottom-7 -right-4 w-20 h-20 rotate-[-12deg] opacity-95 pointer-events-none z-30 drop-shadow-xl">
                                                <img src="/sello/pagado.png" alt="PAGADO" className="w-full h-full object-contain" />
                                            </div>
                                        )}

                                        <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                                            <div className="grid grid-cols-7 border-b border-gray-100">
                                                {week.days.map((day, i) => (
                                                    <div key={i} className="flex flex-col border-r border-gray-100 last:border-r-0 min-h-[108px] bg-white relative">
                                                        <div className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md relative z-10">
                                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                                        </div>
                                                        <div className="flex-1 p-1 flex flex-col items-center relative z-0">
                                                            <span className={`absolute top-1 right-1 text-[9px] font-bold text-gray-400`}>{day.dayNumber}</span>
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
                                                                    ) : null}
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
                                                <span className="font-black text-gray-800 text-[11px] md:text-xs leading-none">{formatValue(week.summary.totalHours)}</span>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Horas</span>
                                            </div>

                                            <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                                <span className={`font-black text-[11px] md:text-xs leading-none ${week.summary.weeklyBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {formatBalance(week.summary.weeklyBalance)}
                                                </span>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Balance</span>
                                            </div>

                                            <div className="flex flex-col items-center flex-1 border-r border-gray-100 shrink-0">
                                                <span className={`font-black text-[11px] md:text-xs leading-none ${week.summary.startBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {formatBalance(week.summary.startBalance)}
                                                </span>
                                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                            </div>

                                            <div className="flex flex-col items-center flex-1 shrink-0">
                                                <span className="font-black text-[11px] md:text-xs leading-none text-green-600">
                                                    {formatMoney(week.summary.estimatedValue)}
                                                </span>
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
        </div>
    );
}