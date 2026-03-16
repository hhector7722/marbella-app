'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Calendar, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { calculateRoundedHours } from '@/lib/utils';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { format } from 'date-fns';

interface DailyLaborStats {
    date: string;
    rawDate: Date;
    totalHours: number;
    laborCost: number;
    netSales: number;
    percentage: number;
    staffCount: number;
}

// [ARCHITECT_ULTRAFLUIDITY] Memoized Row for High-Performance Scrolling
const LaborDayRow = React.memo(({ day, idx }: { day: DailyLaborStats, idx: number }) => {
    let color = 'bg-gray-100 text-gray-600';
    if (day.percentage > 0) {
        if (day.percentage < 25) color = 'bg-emerald-100 text-emerald-700';
        else if (day.percentage < 35) color = 'bg-amber-100 text-amber-700';
        else color = 'bg-rose-100 text-rose-700';
    }
    if (day.netSales === 0 && day.laborCost > 0) color = 'bg-rose-100 text-rose-700';

    return (
        <div
            className="bg-gray-50/50 hover:bg-white p-4 rounded-2xl border border-gray-100 grid grid-cols-12 items-center transition-all hover:shadow-md group animate-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${idx * 40}ms` }}
        >
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
});
LaborDayRow.displayName = 'LaborDayRow';

export default function LaborHistoryPage() {
    const supabase = createClient();
    const router = useRouter();

    // Estados de Filtro
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(null);
    const [rangeEnd, setRangeEnd] = useState<string | null>(null);

    // Estados de UI
    const [loading, setLoading] = useState(true);
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);

    // Datos
    const [history, setHistory] = useState<DailyLaborStats[]>([]);
    const [displayLimit, setDisplayLimit] = useState(10);
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
        setDisplayLimit(10); // Reset scroll on filter change
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
                        // Apply SSOT rounding to the hours before any financial calculation
                        const roundedHours = calculateRoundedHours(hours);

                        const dailyContracted = (profile.contracted_hours_weekly ?? 0) / 5;
                        const regPrice = profile.regular_cost_per_hour || 0;
                        const overPrice = profile.overtime_cost_per_hour || regPrice;

                        if (profile.role === 'manager') {
                            dailyCost += dailyContracted * regPrice + roundedHours * overPrice;
                            totalHours += dailyContracted + roundedHours;
                        } else {
                            if (roundedHours > dailyContracted) {
                                dailyCost += dailyContracted * regPrice + (roundedHours - dailyContracted) * overPrice;
                            } else {
                                dailyCost += roundedHours * regPrice;
                            }
                            totalHours += roundedHours;
                        }
                        countedUsers.add(userId);
                    }
                });

                profiles?.forEach(profile => {
                    if (profile.role === 'manager' && !countedUsers.has(profile.id)) {
                        const dailyContracted = (profile.contracted_hours_weekly ?? 0) / 5;
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

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* CABECERA ESTRECHA MARBELLA DETAIL */}
                    <div className="bg-[#36606F] px-6 md:px-8 py-5 flex items-center justify-between gap-2">
                        <h1 className="text-xl font-black text-white uppercase tracking-wider shrink-0">
                            Coste Laboral
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            <TimeFilterButton
                                onClick={() => setIsTimeFilterOpen(true)}
                                hasActiveFilter={filterMode === 'range' && !!(rangeStart && rangeEnd)}
                                onClear={() => {
                                    setFilterMode('single');
                                    setRangeStart(null);
                                    setRangeEnd(null);
                                }}
                            />
                            <button onClick={() => router.back()} className="p-2 text-white/60 hover:text-white transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center" aria-label="Volver">
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col">
                        {/* Indicador de filtro activo (solo lectura, abre modal al pulsar) */}
                        <div className="mb-6">
                            <button
                                type="button"
                                onClick={() => setIsTimeFilterOpen(true)}
                                className="text-[10px] font-black text-gray-500 hover:text-[#5B8FB9] uppercase tracking-widest transition-colors"
                            >
                                {filterMode === 'single'
                                    ? new Date(selectedDate).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
                                    : rangeStart && rangeEnd
                                        ? `${new Date(rangeStart).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} – ${new Date(rangeEnd).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`
                                        : 'Elegir periodo'}
                            </button>
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
                                    <>
                                        {history.slice(0, displayLimit).map((day, idx) => (
                                            <LaborDayRow key={day.date} day={day} idx={idx} />
                                        ))}

                                        {history.length > displayLimit && (
                                            <div
                                                className="py-10 flex justify-center"
                                                ref={(el) => {
                                                    if (!el) return;
                                                    const observer = new IntersectionObserver((entries) => {
                                                        if (entries[0].isIntersecting) {
                                                            setDisplayLimit(prev => prev + 10);
                                                        }
                                                    });
                                                    observer.observe(el);
                                                }}
                                            >
                                                <div className="text-[10px] font-black text-white/30 uppercase tracking-widest animate-pulse">
                                                    Cargando más días...
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <TimeFilterModal
                    isOpen={isTimeFilterOpen}
                    onClose={() => setIsTimeFilterOpen(false)}
                    allowedKinds={['date', 'range', 'week', 'month', 'year']}
                    initialValue={
                        filterMode === 'single'
                            ? ({ kind: 'date', date: selectedDate } satisfies TimeFilterValue)
                            : rangeStart && rangeEnd
                                ? ({ kind: 'range', startDate: rangeStart, endDate: rangeEnd } satisfies TimeFilterValue)
                                : ({ kind: 'date', date: selectedDate } satisfies TimeFilterValue)
                    }
                    onApply={(v) => {
                        if (v.kind === 'date') {
                            setSelectedDate(v.date);
                            setFilterMode('single');
                            return;
                        }
                        if (v.kind === 'range' || v.kind === 'week') {
                            setRangeStart(v.startDate);
                            setRangeEnd(v.endDate);
                            setFilterMode('range');
                            return;
                        }
                        if (v.kind === 'month') {
                            const s = new Date(v.year, v.month - 1, 1);
                            const e = new Date(v.year, v.month, 0);
                            setRangeStart(format(s, 'yyyy-MM-dd'));
                            setRangeEnd(format(e, 'yyyy-MM-dd'));
                            setFilterMode('range');
                            return;
                        }
                        if (v.kind === 'year') {
                            const s = new Date(v.year, 0, 1);
                            const e = new Date(v.year, 11, 31);
                            setRangeStart(format(s, 'yyyy-MM-dd'));
                            setRangeEnd(format(e, 'yyyy-MM-dd'));
                            setFilterMode('range');
                        }
                    }}
                />
            </div>
        </div>
    );
}