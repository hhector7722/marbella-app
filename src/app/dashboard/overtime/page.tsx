'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    Filter,
    ChevronDown,
    AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// --- INTERFACES ACTUALIZADAS ---
interface StaffWeeklyStats {
    id: string;
    name: string;
    role: string;
    // Horas
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    // Dinero
    totalCost: number;
    regularCost: number;
    overtimeCost: number;
}

interface WeeklyStats {
    weekId: string;
    label: string;
    startDate: Date;
    totalAmount: number;
    totalHours: number;
    expanded: boolean;
    staff: StaffWeeklyStats[];
}

export default function OvertimePage() {
    const supabase = createClient();
    const router = useRouter();

    // Filtros de Fecha
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 60);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<WeeklyStats[]>([]);
    const [summary, setSummary] = useState({ totalCost: 0, totalHours: 0, totalOvertimeCost: 0 });

    useEffect(() => {
        fetchOvertimeData();
    }, [startDate, endDate]);

    async function fetchOvertimeData() {
        setLoading(true);
        try {
            const startISO = new Date(startDate).toISOString();
            const endObj = new Date(endDate);
            endObj.setHours(23, 59, 59, 999);
            const endISO = endObj.toISOString();

            // 1. Obtener Fichajes
            const { data: logs } = await supabase
                .from('time_logs')
                .select('user_id, total_hours, clock_in')
                .not('total_hours', 'is', null)
                .gte('clock_in', startISO)
                .lte('clock_in', endISO);

            // 2. Obtener Perfiles (Con las nuevas columnas de costes)
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, role, regular_cost_per_hour, overtime_cost_per_hour, contracted_hours_weekly');

            if (!logs || !profiles) {
                setLoading(false);
                return;
            }

            const profileMap = new Map(profiles.map(p => [p.id, p]));

            // Estructura temporal para sumar horas por semana y usuario
            // { "Semana-X": { "User-Y": 45.5 horas } }
            const tempWeekUserHours: Record<string, Record<string, number>> = {};
            const tempWeekMeta: Record<string, Date> = {}; // Para guardar la fecha de inicio real

            logs.forEach(log => {
                const date = new Date(log.clock_in);

                // Calcular Lunes de esa semana
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(date);
                monday.setDate(diff);
                monday.setHours(0, 0, 0, 0);

                const weekId = monday.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

                if (!tempWeekUserHours[weekId]) {
                    tempWeekUserHours[weekId] = {};
                    tempWeekMeta[weekId] = monday;
                }
                if (!tempWeekUserHours[weekId][log.user_id]) tempWeekUserHours[weekId][log.user_id] = 0;

                tempWeekUserHours[weekId][log.user_id] += (log.total_hours || 0);
            });

            // 3. Procesar Costes (Aplicando lógica de horas extra)
            const weeksResult: WeeklyStats[] = [];

            Object.keys(tempWeekUserHours).forEach(weekId => {
                const usersInWeek = tempWeekUserHours[weekId];
                const mondayDate = tempWeekMeta[weekId];
                const fullLabel = `Semana del ${mondayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;

                let weekTotalCost = 0;
                let weekTotalHours = 0;
                const staffList: StaffWeeklyStats[] = [];

                Object.keys(usersInWeek).forEach(userId => {
                    const hoursWorked = usersInWeek[userId];
                    const profile = profileMap.get(userId);

                    if (profile) {
                        // Valores por defecto si faltan datos
                        const limit = profile.contracted_hours_weekly || 40;
                        const regPrice = profile.regular_cost_per_hour || 0;
                        const overPrice = profile.overtime_cost_per_hour || regPrice; // Si no hay precio extra, usa el normal

                        let regHours = 0;
                        let overHours = 0;

                        // Lógica de cálculo
                        if (hoursWorked > limit) {
                            regHours = limit;
                            overHours = hoursWorked - limit;
                        } else {
                            regHours = hoursWorked;
                            overHours = 0;
                        }

                        const regCost = regHours * regPrice;
                        const overCost = overHours * overPrice;
                        const totalCost = regCost + overCost;

                        staffList.push({
                            id: userId,
                            name: `${profile.first_name} ${profile.last_name || ''}`,
                            role: profile.role || 'Staff',
                            totalHours: hoursWorked,
                            regularHours: regHours,
                            overtimeHours: overHours,
                            totalCost: totalCost,
                            regularCost: regCost,
                            overtimeCost: overCost
                        });

                        weekTotalCost += totalCost;
                        weekTotalHours += hoursWorked;
                    }
                });

                // Ordenar empleados por coste (los más caros primero)
                staffList.sort((a, b) => b.totalCost - a.totalCost);

                weeksResult.push({
                    weekId,
                    label: fullLabel,
                    startDate: mondayDate,
                    totalAmount: weekTotalCost,
                    totalHours: weekTotalHours,
                    expanded: false,
                    staff: staffList
                });
            });

            // Ordenar semanas (más recientes primero)
            weeksResult.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

            // Expandir la primera semana
            if (weeksResult.length > 0) weeksResult[0].expanded = true;

            setWeeksData(weeksResult);

            // Calcular resumen total
            let sumCost = 0;
            let sumHours = 0;
            let sumOverCost = 0;
            weeksResult.forEach(w => {
                sumCost += w.totalAmount;
                sumHours += w.totalHours;
                w.staff.forEach(s => sumOverCost += s.overtimeCost);
            });

            setSummary({
                totalCost: sumCost,
                totalHours: sumHours,
                totalOvertimeCost: sumOverCost
            });

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const toggleWeek = (weekId: string) => {
        setWeeksData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

            {/* PANEL IZQUIERDO: FILTROS Y RESUMEN */}
            <div className="w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col p-6 z-10 h-auto md:h-screen sticky top-header-safe">
                <div className="mb-6">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-gray-800 mb-6 text-sm font-bold transition-colors w-fit">
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <h1 className="text-2xl font-black text-gray-800 mb-1">Horas Extras</h1>
                    <p className="text-xs text-gray-400">Control de horas base y excesos</p>
                </div>

                {/* Filtros */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-8 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-1">
                        <Filter size={12} /> Periodo
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 block mb-1">Desde</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 block mb-1">Hasta</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500" />
                        </div>
                    </div>
                </div>

                {/* KPIs */}
                <div className="space-y-4">
                    <div className="bg-[#36606F] text-white p-6 rounded-[2rem] shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                        <div className="relative z-10">
                            <span className="text-xs font-bold opacity-80 uppercase block mb-1">Total a Pagar (Periodo)</span>
                            <span className="text-4xl font-black">{summary.totalCost.toFixed(0)}€</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                            <span className="text-[10px] font-bold text-orange-400 uppercase block">Sobrecoste Extras</span>
                            <span className="text-xl font-black text-orange-600">{summary.totalOvertimeCost.toFixed(0)}€</span>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                            <span className="text-[10px] font-bold text-blue-400 uppercase block">Total Horas</span>
                            <span className="text-xl font-black text-blue-800">{summary.totalHours.toFixed(1)}h</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* PANEL DERECHO: LISTA SEMANAL */}
            <div className="flex-1 bg-gray-50 p-4 md:p-8 overflow-y-auto h-screen">
                <div className="max-w-3xl mx-auto space-y-4">

                    {loading && <div className="text-center py-10 text-gray-400 text-sm animate-pulse">Calculando nóminas...</div>}

                    {!loading && weeksData.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                            <p className="text-gray-400 font-bold">Sin datos.</p>
                            <p className="text-xs text-gray-300 mt-1">No hay fichajes en este rango de fechas.</p>
                        </div>
                    )}

                    {weeksData.map(week => (
                        <div key={week.weekId} className={`bg-white rounded-2xl border transition-all duration-300 ${week.expanded ? 'border-blue-300 shadow-md' : 'border-gray-100 hover:border-blue-200'}`}>

                            {/* Cabecera Semana */}
                            <div
                                onClick={() => toggleWeek(week.weekId)}
                                className="p-5 flex justify-between items-center cursor-pointer select-none"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-xl transition-colors ${week.expanded ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">{week.label}</h3>
                                        <p className="text-xs text-gray-400">{week.totalHours.toFixed(1)} horas registradas</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <span className="text-xl font-black text-gray-800 block leading-none">{week.totalAmount.toFixed(0)}€</span>
                                    </div>
                                    <ChevronDown size={20} className={`text-gray-300 transition-transform duration-300 ${week.expanded ? 'rotate-180' : ''}`} />
                                </div>
                            </div>

                            {/* Desglose Empleados */}
                            {week.expanded && (
                                <div className="px-5 pb-5 pt-0 animate-in slide-in-from-top-2 duration-200">
                                    <div className="border-t border-gray-100 pt-2">
                                        {/* CABECERA TABLA */}
                                        <div className="grid grid-cols-12 text-[10px] font-bold text-gray-300 uppercase px-3 py-2">
                                            <div className="col-span-4">Empleado</div>
                                            <div className="col-span-5 text-right pr-4">Desglose Horas</div>
                                            <div className="col-span-3 text-right">Coste Total</div>
                                        </div>

                                        {/* LISTA STAFF */}
                                        {week.staff.map((staff, idx) => (
                                            <div key={idx} className="grid grid-cols-12 items-center p-3 rounded-xl hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">

                                                {/* NOMBRE */}
                                                <div className="col-span-4 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[#36606F] text-white flex items-center justify-center text-xs font-bold">
                                                        {staff.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <span className="text-sm font-bold text-gray-700 block truncate">{staff.name}</span>
                                                        <span className="text-[10px] text-gray-400 uppercase">{staff.role}</span>
                                                    </div>
                                                </div>

                                                {/* DESGLOSE HORAS */}
                                                <div className="col-span-5 flex flex-col items-end pr-4">
                                                    <div className="text-sm font-bold text-gray-600">
                                                        {staff.totalHours.toFixed(1)}h
                                                    </div>
                                                    {staff.overtimeHours > 0 && (
                                                        <div className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded mt-1">
                                                            Incluye {staff.overtimeHours.toFixed(1)}h Extras
                                                        </div>
                                                    )}
                                                </div>

                                                {/* COSTE */}
                                                <div className="col-span-3 text-right">
                                                    <div className="text-sm font-black text-gray-800">{staff.totalCost.toFixed(0)}€</div>
                                                    {staff.overtimeCost > 0 && (
                                                        <span className="text-[9px] text-red-400 font-bold block">
                                                            (Extras: {staff.overtimeCost.toFixed(0)}€)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}