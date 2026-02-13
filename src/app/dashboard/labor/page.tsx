'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    X,
    TrendingUp,
    Clock,
    Euro,
    ArrowLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DailyLaborStats {
    date: string;
    rawDate: Date;
    totalHours: number;
    laborCost: number;
    netSales: number;
    percentage: number;
    staffCount: number;
}

export default function LaborHistoryPage() {
    const supabase = createClient();
    const router = useRouter();

    // Estados de Filtro
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(null);
    const [rangeEnd, setRangeEnd] = useState<string | null>(null);

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Datos
    const [history, setHistory] = useState<DailyLaborStats[]>([]);
    const [summary, setSummary] = useState({
        avgPercentage: 0,
        totalCost: 0,
        totalHours: 0
    });

    useEffect(() => {
        // Al montar, buscar la fecha más reciente con datos
        const findRecentDate = async () => {
            const { data } = await supabase.from('cash_closings').select('closed_at').order('closed_at', { ascending: false }).limit(1).single();
            if (data) {
                const recent = new Date(data.closed_at).toISOString().split('T')[0];
                setSelectedDate(recent);
            }
        };
        findRecentDate();
    }, []);

    useEffect(() => {
        fetchData();
    }, [selectedDate, rangeStart, rangeEnd, filterMode]);

    async function fetchData() {
        setLoading(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                const d = new Date(selectedDate);
                d.setHours(0, 0, 0, 0);
                startISO = d.toISOString();
                d.setHours(23, 59, 59, 999);
                endISO = d.toISOString();
            } else {
                if (!rangeStart || !rangeEnd) {
                    setHistory([]);
                    setSummary({ avgPercentage: 0, totalCost: 0, totalHours: 0 });
                    setLoading(false);
                    return;
                }
                const s = new Date(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = new Date(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startISO = s.toISOString();
                endISO = e.toISOString();
            }

            // 1. Obtener Cierres (Ventas)
            const { data: salesData } = await supabase
                .from('cash_closings')
                .select('closed_at, net_sales')
                .gte('closed_at', startISO)
                .lte('closed_at', endISO)
                .order('closed_at', { ascending: false });

            // 2. Obtener Fichajes (Horas)
            const { data: logsData } = await supabase
                .from('time_logs')
                .select('user_id, clock_in, clock_out, total_hours')
                .not('clock_out', 'is', null)
                .gte('clock_in', startISO)
                .lte('clock_in', endISO);

            // 3. Obtener Profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, role, regular_cost_per_hour, overtime_cost_per_hour, contracted_hours_weekly');

            const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

            // 4. Procesar por día
            const statsMap = new Map<string, DailyLaborStats>();

            salesData?.forEach(sale => {
                const d = new Date(sale.closed_at);
                const dateKey = d.toLocaleDateString('es-ES');
                statsMap.set(dateKey, {
                    date: dateKey,
                    rawDate: d,
                    totalHours: 0,
                    laborCost: 0,
                    netSales: sale.net_sales,
                    percentage: 0,
                    staffCount: 0
                });
            });

            const dailyUserHours = new Map<string, Map<string, number>>();
            logsData?.forEach(log => {
                const d = new Date(log.clock_in);
                const dateKey = d.toLocaleDateString('es-ES');
                if (!statsMap.has(dateKey)) {
                    statsMap.set(dateKey, { date: dateKey, rawDate: d, totalHours: 0, laborCost: 0, netSales: 0, percentage: 0, staffCount: 0 });
                }
                if (!dailyUserHours.has(dateKey)) dailyUserHours.set(dateKey, new Map());
                const userHours = dailyUserHours.get(dateKey)!;
                userHours.set(log.user_id, (userHours.get(log.user_id) || 0) + (log.total_hours || 0));
            });

            statsMap.forEach((stat, dateKey) => {
                const userHours = dailyUserHours.get(dateKey) || new Map();
                let dailyCost = 0;
                let totalHours = 0;
                const countedUsers = new Set<string>();

                userHours.forEach((hours, userId) => {
                    const profile = profileMap.get(userId);
                    if (profile) {
                        const dailyContracted = (profile.contracted_hours_weekly || 40) / 5;
                        const regPrice = profile.regular_cost_per_hour || 0;
                        const overPrice = profile.overtime_cost_per_hour || regPrice;
                        if (profile.role === 'manager') {
                            dailyCost += dailyContracted * regPrice + hours * overPrice;
                            totalHours += dailyContracted + hours;
                        } else {
                            if (hours > dailyContracted) {
                                dailyCost += dailyContracted * regPrice + (hours - dailyContracted) * overPrice;
                            } else {
                                dailyCost += hours * regPrice;
                            }
                            totalHours += hours;
                        }
                        countedUsers.add(userId);
                    }
                });

                profiles?.forEach(profile => {
                    if (profile.role === 'manager' && !countedUsers.has(profile.id)) {
                        const dailyContracted = (profile.contracted_hours_weekly || 40) / 5;
                        dailyCost += dailyContracted * (profile.regular_cost_per_hour || 0);
                        totalHours += dailyContracted;
                        countedUsers.add(profile.id);
                    }
                });

                stat.laborCost = dailyCost;
                stat.totalHours = totalHours;
                stat.staffCount = countedUsers.size;
                if (stat.netSales > 0) stat.percentage = (stat.laborCost / stat.netSales) * 100;
            });

            const processed = Array.from(statsMap.values()).sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

            let sumCost = 0, sumHours = 0, sumPercent = 0, countWithSales = 0;
            processed.forEach(s => {
                sumCost += s.laborCost;
                sumHours += s.totalHours;
                if (s.netSales > 0) { sumPercent += s.percentage; countWithSales++; }
            });

            setHistory(processed);
            setSummary({
                totalCost: sumCost,
                totalHours: sumHours,
                avgPercentage: countWithSales > 0 ? sumPercent / countWithSales : 0
            });

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    // Funciones Calendario
    const generateCalendarDays = () => {
        const year = calendarBaseDate.getFullYear();
        const month = calendarBaseDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (number | null)[] = [];
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
        return days;
    };

    const handleDateSelect = (day: number) => {
        const dateStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (showCalendar === 'single') {
            setSelectedDate(dateStr);
            setFilterMode('single');
            setShowCalendar(null);
        } else if (showCalendar === 'range') {
            if (!rangeStart || (rangeStart && rangeEnd)) {
                setRangeStart(dateStr);
                setRangeEnd(null);
            } else {
                if (new Date(dateStr) < new Date(rangeStart)) {
                    setRangeStart(dateStr);
                } else {
                    setRangeEnd(dateStr);
                    setFilterMode('range');
                    setShowCalendar(null);
                }
            }
        }
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[80vh]">

                    {/* CABECERA ESTRECHA MARBELLA DETAIL */}
                    <div className="bg-[#36606F] px-8 py-5 flex items-center justify-between">
                        <h1 className="text-xl font-black text-white uppercase tracking-wider">
                            Coste Laboral
                        </h1>
                        <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors p-2">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col">
                        {/* FILTROS EN UNA FILA COMPACTA */}
                        <div className="mb-6 space-y-4">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase">Día:</span>
                                    <button
                                        onClick={() => setShowCalendar('single')}
                                        className={`h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5 ${filterMode === 'single' ? 'bg-[#5B8FB9] border-[#5B8FB9] text-white shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'}`}
                                    >
                                        <Calendar size={12} />
                                        {new Date(selectedDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </button>
                                </div>

                                <div className="h-4 w-px bg-gray-200 shrink-0 mx-1"></div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase">Rango:</span>
                                    <button
                                        onClick={() => setShowCalendar('range')}
                                        className={`h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5 ${filterMode === 'range' ? 'bg-[#5B8FB9] border-[#5B8FB9] text-white shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'}`}
                                    >
                                        <Calendar size={12} />
                                        {rangeStart && rangeEnd
                                            ? `${new Date(rangeStart).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - ${new Date(rangeEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`
                                            : 'Selec...'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* KPI SUMMARY CLEAN (Sin tarjetas, solo texto y color) */}
                        <div className="grid grid-cols-3 gap-2 mb-8 py-6 border-y border-gray-50">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Eficiencia</span>
                                <span className="text-xl font-black text-emerald-500">{summary.avgPercentage.toFixed(1)}%</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Coste Total</span>
                                <span className="text-xl font-black text-rose-500">{summary.totalCost.toFixed(0)}€</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Horas Totales</span>
                                <span className="text-xl font-black text-blue-500">{summary.totalHours.toFixed(0)}h</span>
                            </div>
                        </div>

                        {/* LISTADO DE DÍAS */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {loading ? (
                                    <div className="text-center py-20 text-gray-300 font-bold animate-pulse uppercase tracking-widest text-xs">Cargando datos...</div>
                                ) : history.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-100">
                                        <p className="text-gray-400 font-bold text-sm">No hay datos en este periodo</p>
                                    </div>
                                ) : (
                                    history.map((day, idx) => {
                                        let color = 'bg-gray-100 text-gray-600';
                                        if (day.percentage > 0) {
                                            if (day.percentage < 25) color = 'bg-emerald-100 text-emerald-700';
                                            else if (day.percentage < 35) color = 'bg-amber-100 text-amber-700';
                                            else color = 'bg-rose-100 text-rose-700';
                                        }
                                        if (day.netSales === 0 && day.laborCost > 0) color = 'bg-rose-100 text-rose-700';

                                        return (
                                            <div key={idx} className="bg-gray-50/50 hover:bg-white p-4 rounded-2xl border border-gray-100 grid grid-cols-12 items-center transition-all hover:shadow-md group">
                                                <div className="col-span-4 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-gray-400 group-hover:text-[#5B8FB9] transition-colors">
                                                        <Calendar size={14} />
                                                    </div>
                                                    <div className="flex flex-col leading-tight">
                                                        <span className="text-xs font-black text-gray-800 uppercase">{day.date.split('/')[0]}/{day.date.split('/')[1]}</span>
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase">{day.rawDate.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 text-right">
                                                    <span className="text-[10px] font-bold text-gray-600 block">{day.totalHours.toFixed(1)}h</span>
                                                </div>
                                                <div className="col-span-3 text-right">
                                                    <span className="text-[10px] font-black text-rose-500 block">{day.laborCost.toFixed(0)}€</span>
                                                    <span className="text-[8px] font-bold text-gray-400 block tracking-tighter uppercase">Coste</span>
                                                </div>
                                                <div className="col-span-3 flex justify-end">
                                                    <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black min-w-[65px] text-center shadow-sm ${color}`}>
                                                        {day.netSales > 0 ? `${day.percentage.toFixed(1)}%` : '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODAL CALENDARIO */}
                {showCalendar && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowCalendar(null)}>
                        <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                                <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest">{showCalendar === 'single' ? 'Fecha Única' : 'Rango de Fechas'}</h3>
                                <button onClick={() => setShowCalendar(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={18} className="text-gray-400" /></button>
                            </div>

                            <div className="p-4">
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <button onClick={() => setCalendarBaseDate(new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronLeft size={20} className="text-gray-600" /></button>
                                    <span className="font-black text-gray-800 text-sm uppercase tracking-tighter">{calendarBaseDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                                    <button onClick={() => setCalendarBaseDate(new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronRight size={20} className="text-gray-600" /></button>
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                        <div key={d} className="text-center text-[9px] font-black text-gray-300 py-2">{d}</div>
                                    ))}
                                    {generateCalendarDays().map((day, i) => {
                                        if (!day) return <div key={i} />;
                                        const dStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                                        const isSelected = showCalendar === 'single'
                                            ? selectedDate === dStr
                                            : (rangeStart === dStr || rangeEnd === dStr);

                                        const isInRange = showCalendar === 'range' && rangeStart && rangeEnd && new Date(dStr) > new Date(rangeStart) && new Date(dStr) < new Date(rangeEnd);

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleDateSelect(day)}
                                                className={`aspect-square flex items-center justify-center rounded-xl text-xs font-black transition-all
                                                ${isSelected ? 'bg-[#5B8FB9] text-white shadow-md' : isInRange ? 'bg-blue-50 text-[#5B8FB9]' : 'hover:bg-gray-100 text-gray-700'}
                                            `}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {showCalendar === 'range' && rangeStart && !rangeEnd && (
                                <div className="px-6 pb-6 text-center">
                                    <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-[9px] font-black rounded-full uppercase tracking-widest animate-pulse">
                                        Selecciona fecha final
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}