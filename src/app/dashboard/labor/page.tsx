'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    Filter
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// CONFIGURACIÓN (Coste estimado hasta módulo RRHH)
const AVG_HOURLY_COST = 15.00;

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

    // Filtros de Fecha (Por defecto: Últimos 30 días)
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<DailyLaborStats[]>([]);
    const [summary, setSummary] = useState({
        avgPercentage: 0,
        totalCost: 0,
        totalHours: 0
    });

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    async function fetchData() {
        setLoading(true);
        try {
            const startISO = new Date(startDate).toISOString();
            const endObj = new Date(endDate);
            endObj.setHours(23, 59, 59, 999);
            const endISO = endObj.toISOString();

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
                .select('clock_in, clock_out, total_hours')
                .not('clock_out', 'is', null)
                .gte('clock_in', startISO)
                .lte('clock_in', endISO)
                .order('clock_in', { ascending: false });

            // 3. Cruzar Datos
            const statsMap = new Map<string, DailyLaborStats>();

            // A. Inicializar con fechas de ventas
            salesData?.forEach(sale => {
                const d = new Date(sale.closed_at);
                const dateKey = d.toLocaleDateString('es-ES');
                if (!statsMap.has(dateKey)) {
                    statsMap.set(dateKey, {
                        date: dateKey,
                        rawDate: d,
                        totalHours: 0,
                        laborCost: 0,
                        netSales: sale.net_sales,
                        percentage: 0,
                        staffCount: 0
                    });
                }
            });

            // B. Sumar horas
            logsData?.forEach(log => {
                const d = new Date(log.clock_in);
                const dateKey = d.toLocaleDateString('es-ES');

                if (!statsMap.has(dateKey)) {
                    statsMap.set(dateKey, {
                        date: dateKey,
                        rawDate: d,
                        totalHours: 0,
                        laborCost: 0,
                        netSales: 0,
                        percentage: 0,
                        staffCount: 0
                    });
                }

                const dayStat = statsMap.get(dateKey)!;
                dayStat.totalHours += (log.total_hours || 0);
                dayStat.staffCount += 1;
            });

            // C. Calcular Totales
            const processedHistory: DailyLaborStats[] = [];
            let sumCost = 0;
            let sumHours = 0;
            let sumPercent = 0;
            let countWithSales = 0;

            statsMap.forEach(stat => {
                stat.laborCost = stat.totalHours * AVG_HOURLY_COST;
                if (stat.netSales > 0) {
                    stat.percentage = (stat.laborCost / stat.netSales) * 100;
                    sumPercent += stat.percentage;
                    countWithSales++;
                }

                processedHistory.push(stat);
                sumCost += stat.laborCost;
                sumHours += stat.totalHours;
            });

            // Ordenar por fecha descendente
            processedHistory.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

            setHistory(processedHistory);
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
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

            {/* PANEL IZQUIERDO: RESUMEN Y FILTROS */}
            <div className="w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col p-6 z-10 h-auto md:h-screen sticky top-0">
                <div className="mb-6">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-gray-800 mb-6 text-sm font-bold transition-colors w-fit">
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <h1 className="text-2xl font-black text-gray-800 mb-1">Costes Mano Obra</h1>
                    <p className="text-xs text-gray-400">Análisis de eficiencia operativa</p>
                </div>

                {/* FILTROS DE FECHA */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-8 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-1">
                        <Filter size={12} /> Periodo de Análisis
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 block mb-1">Desde</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 block mb-1">Hasta</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                </div>

                {/* KPI CARDS */}
                <div className="space-y-4">
                    <div className="bg-[#36606F] text-white p-6 rounded-[2rem] shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                        <div className="relative z-10">
                            <span className="text-xs font-bold opacity-80 uppercase block mb-1">Eficiencia Media (Periodo)</span>
                            <span className="text-4xl font-black">{summary.avgPercentage.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                            <span className="text-[10px] font-bold text-gray-400 uppercase block">Gasto Total</span>
                            <span className="text-xl font-black text-gray-800">{summary.totalCost.toFixed(0)}€</span>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                            <span className="text-[10px] font-bold text-gray-400 uppercase block">Horas Totales</span>
                            <span className="text-xl font-black text-gray-800">{summary.totalHours.toFixed(0)}h</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* PANEL DERECHO: LISTA */}
            <div className="flex-1 bg-gray-50 p-4 md:p-8 overflow-y-auto h-screen">
                <div className="max-w-4xl mx-auto space-y-4">

                    <div className="grid grid-cols-12 px-4 text-xs font-bold text-gray-400 uppercase pb-2">
                        <div className="col-span-3">Fecha</div>
                        <div className="col-span-2 text-right">Horas</div>
                        <div className="col-span-2 text-right">Coste</div>
                        <div className="col-span-2 text-right">Venta</div>
                        <div className="col-span-3 text-right">% Real</div>
                    </div>

                    {loading && <div className="text-center py-10 text-gray-400 text-sm animate-pulse">Calculando datos...</div>}

                    {!loading && history.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                            <p className="text-gray-400 font-bold">No hay datos en este periodo.</p>
                            <p className="text-xs text-gray-300 mt-1">Prueba a ampliar el rango de fechas.</p>
                        </div>
                    )}

                    {history.map((day, index) => {
                        let statusColor = 'bg-gray-100 text-gray-600';
                        if (day.percentage > 0) {
                            if (day.percentage < 25) statusColor = 'bg-green-100 text-green-700';
                            else if (day.percentage < 35) statusColor = 'bg-yellow-100 text-yellow-700';
                            else statusColor = 'bg-red-100 text-red-700';
                        }
                        // Caso especial: Coste pero 0 ventas
                        if (day.netSales === 0 && day.laborCost > 0) statusColor = 'bg-red-100 text-red-700';

                        return (
                            <div key={index} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-12 items-center hover:shadow-md transition-shadow">
                                <div className="col-span-3 flex items-center gap-2">
                                    <div className="p-2 bg-gray-50 rounded-lg text-gray-400">
                                        <Calendar size={16} />
                                    </div>
                                    <span className="font-bold text-gray-700 text-sm">{day.date.slice(0, 5)}</span>
                                </div>
                                <div className="col-span-2 text-right text-sm font-medium text-gray-600">{day.totalHours.toFixed(1)}h</div>
                                <div className="col-span-2 text-right text-sm font-bold text-red-500">{day.laborCost.toFixed(0)}€</div>
                                <div className="col-span-2 text-right text-sm font-medium text-blue-600">{day.netSales.toFixed(0)}€</div>
                                <div className="col-span-3 flex justify-end">
                                    <div className={`px-3 py-1 rounded-lg text-xs font-black ${statusColor} min-w-[60px] text-center`}>
                                        {day.netSales > 0 ? `${day.percentage.toFixed(1)}%` : (day.laborCost > 0 ? '∞' : '-')}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}