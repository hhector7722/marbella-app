'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Filter,
    X,
    Check
} from 'lucide-react';
import Link from 'next/link';

// --- TIPOS ---
interface DailyLog {
    date: Date;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string;
    clockOut: string;
    totalHours: number;
    extraHours: number;
    isToday: boolean;
}

interface WeeklyData {
    weekNumber: number;
    startDate: Date;
    endDate: Date;
    days: DailyLog[];
    summary: {
        totalHours: number;
        weeklyBalance: number; // Diferencia de horas
        estimatedValue: number; // Valor monetario
    };
}

export default function HistoryPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weeksData, setWeeksData] = useState<WeeklyData[]>([]);
    const [userName, setUserName] = useState('');

    // Estado Filtro
    const [showFilter, setShowFilter] = useState(false);
    const [isFilterActive, setIsFilterActive] = useState(false);
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth());

    useEffect(() => {
        fetchHistory();
    }, [currentDate]);

    // --- HELPERS VISUALES (SIN SIGNOS) ---

    const formatValue = (val: number, unit: string) => {
        return val > 0 ? `${val.toFixed(0)}${unit}` : '\u00A0';
    };

    // Sin signos + ni -, solo valor absoluto
    const formatBalance = (val: number) => {
        if (Math.abs(val) < 0.1) return '0h';
        return `${Math.abs(val).toFixed(0)}h`;
    };

    const formatMoney = (val: number) => {
        return val > 0 ? `${val.toFixed(0)}€` : '\u00A0';
    };

    async function fetchHistory() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, contracted_hours_weekly, overtime_cost_per_hour, is_fixed_salary')
                .eq('id', user.id)
                .single();

            if (profile) setUserName(profile.first_name);

            const contractHours = profile?.contracted_hours_weekly || 40;
            const overtimeRate = profile?.overtime_cost_per_hour || 0;
            const isFixedSalary = profile?.is_fixed_salary || false;

            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

            const startView = new Date(startOfMonth);
            const dayOfWeek = startView.getDay();
            const diffToMonday = startView.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startView.setDate(diffToMonday);
            startView.setHours(0, 0, 0, 0);

            const { data: logs } = await supabase
                .from('time_logs')
                .select('*')
                .eq('user_id', user.id)
                .gte('clock_in', startView.toISOString())
                .lte('clock_in', endOfMonth.toISOString())
                .order('clock_in', { ascending: true });

            const weeks: WeeklyData[] = [];
            let currentWeekStart = new Date(startView);

            while (currentWeekStart <= endOfMonth) {
                const weekDays: DailyLog[] = [];
                let weekTotalHours = 0;

                for (let i = 0; i < 7; i++) {
                    const dayIter = new Date(currentWeekStart);
                    dayIter.setDate(currentWeekStart.getDate() + i);

                    const log = logs?.find(l => {
                        const lDate = new Date(l.clock_in);
                        return lDate.getDate() === dayIter.getDate() && lDate.getMonth() === dayIter.getMonth();
                    });

                    let hours = 0, clockIn = '', clockOut = '';
                    if (log) {
                        const inD = new Date(log.clock_in);
                        clockIn = inD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        if (log.clock_out) {
                            const outD = new Date(log.clock_out);
                            clockOut = outD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                        }
                        hours = log.total_hours || 0;
                        weekTotalHours += hours;
                    }
                    const dailyExtras = hours > 8 ? hours - 8 : 0;
                    weekDays.push({
                        date: dayIter,
                        dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i],
                        dayNumber: dayIter.getDate(),
                        hasLog: !!log, clockIn, clockOut, totalHours: hours, extraHours: dailyExtras, isToday: false
                    });
                }

                // CÁLCULO DE BALANCE SEMANAL (Diferencial)
                let weeklyBalance = 0;

                if (isFixedSalary) {
                    weeklyBalance = weekTotalHours;
                } else {
                    weeklyBalance = weekTotalHours - contractHours;
                }

                const estimatedValue = weeklyBalance > 0 ? weeklyBalance * overtimeRate : 0;

                weeks.push({
                    weekNumber: getWeekNumber(currentWeekStart),
                    startDate: new Date(currentWeekStart),
                    endDate: new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() + 6),
                    days: weekDays,
                    summary: {
                        totalHours: weekTotalHours,
                        weeklyBalance: weeklyBalance,
                        estimatedValue: estimatedValue
                    }
                });
                currentWeekStart.setDate(currentWeekStart.getDate() + 7);
            }
            setWeeksData(weeks.reverse());
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    }

    function getWeekNumber(d: Date) {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentDate(newDate);
    };

    const applyFilter = () => {
        const newDate = new Date(filterYear, filterMonth, 1);
        setCurrentDate(newDate);
        setIsFilterActive(true);
        setShowFilter(false);
    };

    const clearFilter = () => {
        setCurrentDate(new Date());
        setIsFilterActive(false);
    };

    const getMonthLabel = (date: Date) => {
        return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    };

    return (
        <div className="pb-10 min-h-screen">

            {/* HEADER FIJO */}
            <div className="bg-[#5B8FB9] text-white p-4 sticky top-0 z-40 border-b border-white/10 backdrop-blur-md shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/staff/dashboard" className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <h1 className="font-bold text-lg leading-none">Historial</h1>
                            <p className="text-xs text-blue-100 opacity-80">{userName}</p>
                        </div>
                    </div>
                    {/* Selector de Mes */}
                    <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1">
                        <button onClick={() => changeMonth(-1)} className="p-1 hover:text-blue-200"><ChevronLeft size={20} /></button>
                        <span className="text-sm font-bold min-w-[80px] text-center capitalize">
                            {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).split(' de ')}
                        </span>
                        <button onClick={() => changeMonth(1)} className="p-1 hover:text-blue-200"><ChevronRight size={20} /></button>
                    </div>
                </div>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

                {/* Filtro y Acciones */}
                <div className="flex items-center gap-2 px-2">
                    <button
                        onClick={() => setShowFilter(true)}
                        className={`px-4 py-1.5 border rounded-full text-xs font-bold shadow-sm flex items-center gap-2 transition-colors ${isFilterActive
                            ? 'bg-blue-600 text-white border-blue-500' // Estilo activo
                            : 'bg-white/10 text-white border-white/20 hover:bg-white/20' // Estilo normal
                            }`}
                    >
                        <Filter size={12} /> {isFilterActive ? 'Filtro Activo' : 'Filtrar Fecha'}
                    </button>

                    {/* BOTÓN QUITAR FILTRO (Solo si activo) */}
                    {isFilterActive && (
                        <button
                            onClick={clearFilter}
                            className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1 hover:bg-red-500/40 transition-colors animate-in fade-in zoom-in duration-200"
                        >
                            <X size={12} /> Quitar Filtro
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="py-10 text-center text-white/50">
                        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        Cargando registros...
                    </div>
                ) : weeksData.length === 0 ? (
                    <div className="py-10 text-center text-white/50 bg-white/5 rounded-2xl border border-dashed border-white/10 max-w-xl mx-auto">
                        <Calendar size={40} className="mx-auto mb-2 opacity-50" />
                        <p>No hay registros este mes</p>
                    </div>
                ) : (
                    // GRID SYSTEM
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {weeksData.map((week, idx) => {
                            const currentMonthLabel = getMonthLabel(week.startDate);
                            const prevWeekLabel = idx > 0 ? getMonthLabel(weeksData[idx - 1].startDate) : null;
                            const showMonthHeader = idx === 0 || currentMonthLabel !== prevWeekLabel;

                            return (
                                <React.Fragment key={idx}>
                                    {/* CABECERA DE MES */}
                                    {showMonthHeader && (
                                        <div className="col-span-1 md:col-span-2 lg:col-span-3 py-4 flex items-center gap-4 opacity-70 animate-in fade-in slide-in-from-left-4">
                                            <div className="h-px bg-white/30 flex-1"></div>
                                            <span className="text-xs font-black text-white uppercase tracking-[0.2em] drop-shadow-md">
                                                {currentMonthLabel}
                                            </span>
                                            <div className="h-px bg-white/30 flex-1"></div>
                                        </div>
                                    )}

                                    {/* TARJETA SEMANA */}
                                    <div className="bg-white rounded-[2rem] p-5 shadow-xl hover:shadow-2xl transition-shadow duration-300 animate-in slide-in-from-bottom-4" style={{ animationDelay: `${idx * 50}ms` }}>

                                        <div className="flex justify-between items-end mb-3 px-1">
                                            <div>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SEMANA {week.weekNumber}</span>
                                                <h3 className="text-sm font-black text-gray-700">
                                                    {week.startDate.getDate()} {week.startDate.toLocaleDateString('es-ES', { month: 'short' })} - {week.endDate.getDate()} {week.endDate.toLocaleDateString('es-ES', { month: 'short' })}
                                                </h3>
                                            </div>
                                            {week.summary.estimatedValue > 0 && (
                                                <div className="px-2 py-1 rounded text-[10px] font-black uppercase border bg-green-50 text-green-600 border-green-200">
                                                    AHORRO
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                                            <div className="grid grid-cols-7 border-b border-gray-100">
                                                {week.days.map((day, i) => (
                                                    <div key={i} className={`flex flex-col border-r border-gray-100 last:border-r-0 min-h-[100px] bg-white relative ${day.date.getMonth() !== currentDate.getMonth() ? 'bg-gray-50/50' : ''}`}>
                                                        <div className="h-6 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md relative z-10">
                                                            <span className="text-[8px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">
                                                                {day.dayName.slice(0, 1)}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 p-1 flex flex-col items-center relative z-0">
                                                            <span className="absolute top-1 right-1 text-[8px] font-bold text-gray-400">
                                                                {day.dayNumber}
                                                            </span>
                                                            <div className="flex-1 flex flex-col justify-center gap-1 w-full pt-3">
                                                                {day.hasLog ? (
                                                                    <>
                                                                        <div className="flex items-center justify-center gap-1">
                                                                            <div className="w-1 h-1 rounded-full bg-green-500 shrink-0 shadow-sm"></div>
                                                                            <span className="text-[8px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                                        </div>
                                                                        {day.clockOut && (
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                <div className="w-1 h-1 rounded-full bg-red-500 shrink-0 shadow-sm"></div>
                                                                                <span className="text-[8px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <span className="text-gray-200 text-[10px] text-center">-</span>
                                                                )}
                                                            </div>
                                                            <div className="w-full mt-auto pt-1 border-t border-gray-50">
                                                                {day.hasLog && (
                                                                    <div className="text-center">
                                                                        <span className="text-[9px] font-black text-gray-800 block">{day.totalHours.toFixed(0)}h</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 grid grid-cols-3 gap-2 text-xs">
                                            <div className="flex flex-col items-center border-r border-gray-200">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase">TOTAL</span>
                                                <span className="font-black text-gray-800 text-sm">{formatValue(week.summary.totalHours, 'h')}</span>
                                            </div>
                                            <div className="flex flex-col items-center border-r border-gray-200">
                                                {/* BALANCE SEMANAL */}
                                                <span className="text-[9px] font-bold text-gray-400 uppercase">BALANCE</span>
                                                <span className={`font-black text-sm ${week.summary.weeklyBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {formatBalance(week.summary.weeklyBalance)}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                {/* ETIQUETA A COBRAR */}
                                                <span className="text-[9px] font-bold text-gray-400 uppercase">A COBRAR</span>
                                                <span className="font-black text-sm text-green-600">{formatMoney(week.summary.estimatedValue)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL FILTRO */}
            {showFilter && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-xs rounded-[2rem] p-6 shadow-2xl transform transition-all scale-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-gray-800">Filtrar Fecha</h3>
                            <button onClick={() => setShowFilter(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Año</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {[2024, 2025, 2026, 2027].map(year => (
                                        <button
                                            key={year}
                                            onClick={() => setFilterYear(year)}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors whitespace-nowrap ${filterYear === year
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                                                }`}
                                        >
                                            {year}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Mes</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setFilterMonth(i)}
                                            className={`py-2 rounded-lg text-xs font-bold border transition-colors capitalize ${filterMonth === i
                                                ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-white hover:border-blue-200'
                                                }`}
                                        >
                                            {new Date(0, i).toLocaleDateString('es-ES', { month: 'short' })}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={applyFilter} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mt-4">
                                <Check size={18} /> Aplicar Filtro
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}