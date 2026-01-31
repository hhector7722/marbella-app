'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    Search,
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    CloudSun,
    Receipt,
    CreditCard,
    User,
    Filter,
    Banknote,
    TrendingUp,
    DollarSign
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// Configuración de Coste MO Estimado
const AVG_HOURLY_COST = 15.00;

interface ClosingSummary {
    grossSales: number;     // Facturación (Estimada con IVA)
    netSales: number;       // Venta Neta
    avgTicket: number;      // Ticket Medio
    laborCost: number;      // Coste MO
    laborPercentage: number;// % MO
    dominantWeather: string;// Clima predominante
    totalTickets: number;   // Auxiliar para cálculos
}

export default function HistoryPage() {
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
    const [closings, setClosings] = useState<any[]>([]);
    const [selectedClosing, setSelectedClosing] = useState<any>(null);
    const [summary, setSummary] = useState<ClosingSummary>({
        grossSales: 0,
        netSales: 0,
        avgTicket: 0,
        laborCost: 0,
        laborPercentage: 0,
        dominantWeather: '-',
        totalTickets: 0
    });

    useEffect(() => {
        fetchHistory();
    }, [startDate, endDate]);

    async function fetchHistory() {
        setLoading(true);
        try {
            // Ajustar fechas
            const startISO = new Date(startDate).toISOString();
            const endObj = new Date(endDate);
            endObj.setHours(23, 59, 59, 999);
            const endISO = endObj.toISOString();

            // 1. Obtener Cierres (Ventas + Clima)
            const { data: closingsData, error: closingsError } = await supabase
                .from('cash_closings')
                .select('*')
                .gte('closed_at', startISO)
                .lte('closed_at', endISO)
                .order('closed_at', { ascending: false });

            if (closingsError) throw closingsError;

            // 2. Obtener Fichajes (Para Coste MO) en el mismo periodo
            const { data: logsData, error: logsError } = await supabase
                .from('time_logs')
                .select('total_hours')
                .gte('clock_in', startISO)
                .lte('clock_in', endISO)
                .not('clock_out', 'is', null);

            if (logsError) console.error("Error fetching logs:", logsError);

            const dataList = closingsData || [];
            setClosings(dataList);

            // --- CÁLCULOS KPI DINÁMICOS ---

            // A. Ventas
            const sumNetSales = dataList.reduce((acc, curr) => acc + (curr.net_sales || 0), 0);
            const sumGrossSales = sumNetSales * 1.10; // Estimación IVA 10%
            const sumTickets = dataList.reduce((acc, curr) => acc + (curr.tickets_count || 0), 0);

            // B. Coste MO
            const totalHours = logsData?.reduce((acc, curr) => acc + (curr.total_hours || 0), 0) || 0;
            const totalLaborCost = totalHours * AVG_HOURLY_COST;
            const laborPercent = sumNetSales > 0 ? (totalLaborCost / sumNetSales) * 100 : 0;

            // C. Clima Dominante (Moda)
            const weatherCounts: Record<string, number> = {};
            dataList.forEach(c => {
                if (c.weather) weatherCounts[c.weather] = (weatherCounts[c.weather] || 0) + 1;
            });
            const dominantWeather = Object.entries(weatherCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

            setSummary({
                grossSales: sumGrossSales,
                netSales: sumNetSales,
                avgTicket: sumTickets > 0 ? sumNetSales / sumTickets : 0,
                laborCost: totalLaborCost,
                laborPercentage: laborPercent,
                dominantWeather: dominantWeather,
                totalTickets: sumTickets
            });

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    // Helper para formatear moneda
    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

            {/* --- COLUMNA IZQUIERDA: LISTADO Y FILTROS --- */}
            <div className={`w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col h-auto md:h-screen ${selectedClosing ? 'hidden md:flex' : 'flex'}`}>

                {/* Header Fijo */}
                <div className="p-6 border-b border-gray-100 bg-white z-10">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-gray-800 mb-4 text-sm font-bold transition-colors w-fit">
                        <ArrowLeft size={16} /> Volver al Dashboard
                    </button>
                    <h1 className="text-2xl font-black text-gray-800 mb-1">Histórico</h1>
                    <p className="text-xs text-gray-400 mb-4">Registro de cierres de caja</p>

                    {/* FILTROS DE FECHA */}
                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 mb-4 space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                            <Filter size={10} /> Periodo
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
                            />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* KPI CARDS (Resumen del Periodo) - NUEVO DISEÑO */}
                    {!loading && closings.length > 0 && (
                        <div className="space-y-2 mb-4">
                            {/* Fila 1: Facturación y Venta Neta */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Facturación</span>
                                    <span className="text-lg font-black text-gray-800">{formatCurrency(summary.grossSales)}</span>
                                </div>
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                    <span className="text-[10px] font-bold text-blue-400 uppercase block mb-0.5">Venta Neta</span>
                                    <span className="text-lg font-black text-blue-700">{formatCurrency(summary.netSales)}</span>
                                </div>
                            </div>

                            {/* Fila 2: Ticket Medio y Coste MO */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Ticket Medio</span>
                                    <span className="text-lg font-black text-gray-800">{formatCurrency(summary.avgTicket)}</span>
                                </div>
                                <div className="bg-red-50 p-3 rounded-xl border border-red-100 relative overflow-hidden">
                                    <span className="text-[10px] font-bold text-red-400 uppercase block mb-0.5">Coste MO</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg font-black text-red-700">{formatCurrency(summary.laborCost)}</span>
                                        <span className="text-xs font-bold text-red-400">({summary.laborPercentage.toFixed(1)}%)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Fila 3: Clima */}
                            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-indigo-400 uppercase">Clima Dominante</span>
                                <div className="flex items-center gap-2">
                                    <CloudSun size={18} className="text-indigo-500" />
                                    <span className="text-sm font-black text-indigo-800 capitalize">{summary.dominantWeather}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Buscador Texto */}
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-300" size={14} />
                        <input
                            type="text"
                            placeholder="Filtrar por nota..."
                            className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </div>
                </div>

                {/* Lista Scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-gray-50/50">
                    {loading && <div className="text-center py-10 text-gray-400 text-xs animate-pulse">Cargando datos...</div>}

                    {!loading && closings.length === 0 && (
                        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 mx-4">
                            <p className="text-gray-400 font-bold text-sm">Sin registros</p>
                            <p className="text-[10px] text-gray-300 mt-1">Prueba otro rango de fechas</p>
                        </div>
                    )}

                    {closings.map(close => (
                        <div
                            key={close.id}
                            onClick={() => setSelectedClosing(close)}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${selectedClosing?.id === close.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' : 'bg-white border-gray-100 hover:border-blue-100'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="bg-gray-100 p-1.5 rounded-lg text-gray-500">
                                        <Calendar size={14} />
                                    </div>
                                    <div>
                                        <span className="block text-xs font-black text-gray-700">
                                            {new Date(close.closed_at).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </span>
                                        <span className="text-[10px] text-gray-400 block">
                                            {new Date(close.closed_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${close.difference === 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                    {close.difference === 0 ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                                    {close.difference === 0 ? 'OK' : `${close.difference > 0 ? '+' : ''}${close.difference.toFixed(2)}€`}
                                </div>
                            </div>

                            <div className="flex justify-between items-end mt-2">
                                <div>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Venta Neta</span>
                                    <span className="text-lg font-black text-[#36606F]">{close.net_sales.toFixed(2)}€</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-gray-300 font-bold mb-1">Ver detalle</span>
                                    <ChevronRight size={16} className="text-gray-300" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- COLUMNA DERECHA: DETALLE (Se mantiene igual) --- */}
            <div className={`flex-1 bg-gray-50 p-4 md:p-8 h-screen overflow-y-auto ${selectedClosing ? 'block' : 'hidden md:block'}`}>
                {selectedClosing ? (
                    <div className="max-w-2xl mx-auto space-y-6">

                        <button onClick={() => setSelectedClosing(null)} className="md:hidden flex items-center gap-2 text-gray-500 font-bold mb-4">
                            <ArrowLeft size={16} /> Volver a la lista
                        </button>

                        <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden">

                            <div className="bg-[#36606F] p-8 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                                <div className="relative z-10 flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 opacity-80 mb-1">
                                            <Calendar size={14} />
                                            <span className="text-xs font-bold uppercase">Cierre Z</span>
                                        </div>
                                        <h2 className="text-3xl font-black capitalize">
                                            {new Date(selectedClosing.closed_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </h2>
                                        <div className="flex items-center gap-4 mt-2 text-sm text-blue-100">
                                            <span className="flex items-center gap-1"><CloudSun size={14} /> {selectedClosing.weather || 'N/A'}</span>
                                            <span className="flex items-center gap-1"><Receipt size={14} /> {selectedClosing.tickets_count || 0} Tickets</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs opacity-70 font-bold uppercase">Total Contado</div>
                                        <div className="text-4xl font-black">{selectedClosing.cash_counted.toFixed(2)}€</div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8">

                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">Composición de Ventas</h3>
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className="p-4 bg-gray-50 rounded-2xl">
                                        <span className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-1">
                                            Efectivo (Calc)
                                        </span>
                                        <span className="text-xl font-black text-gray-800">
                                            {(selectedClosing.net_sales - selectedClosing.sales_card - selectedClosing.sales_pending).toFixed(2)}€
                                        </span>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl">
                                        <span className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-1">
                                            <CreditCard size={14} className="text-blue-500" /> Tarjeta
                                        </span>
                                        <span className="text-xl font-black text-gray-800">{selectedClosing.sales_card.toFixed(2)}€</span>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl">
                                        <span className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-1">
                                            <User size={14} className="text-orange-500" /> Pendiente
                                        </span>
                                        <span className="text-xl font-black text-gray-800">{selectedClosing.sales_pending.toFixed(2)}€</span>
                                    </div>
                                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                        <span className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
                                            Venta Neta Total
                                        </span>
                                        <span className="text-xl font-black text-blue-700">{selectedClosing.net_sales.toFixed(2)}€</span>
                                    </div>
                                </div>

                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">Cuadre de Efectivo</h3>
                                <div className="space-y-3 mb-8">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Esperado por sistema</span>
                                        <span className="font-bold text-gray-800">{selectedClosing.cash_expected.toFixed(2)}€</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Contado físico</span>
                                        <span className="font-bold text-gray-800">{selectedClosing.cash_counted.toFixed(2)}€</span>
                                    </div>
                                    <div className={`flex justify-between text-sm p-3 rounded-xl font-bold ${selectedClosing.difference === 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                        <span>Diferencia</span>
                                        <span>{selectedClosing.difference > 0 ? '+' : ''}{selectedClosing.difference.toFixed(2)}€</span>
                                    </div>
                                </div>

                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">Destino del Dinero</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="text-center p-3 border border-gray-100 rounded-xl">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase">Retirado (Sobre)</span>
                                        <span className="block text-lg font-black text-gray-800">{selectedClosing.cash_withdrawn?.toFixed(2) || '0.00'}€</span>
                                    </div>
                                    <div className="text-center p-3 border border-gray-100 rounded-xl">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase">Dejado (Fondo)</span>
                                        <span className="block text-lg font-black text-gray-800">{selectedClosing.cash_left?.toFixed(2) || '0.00'}€</span>
                                    </div>
                                </div>

                                {selectedClosing.notes && (
                                    <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-sm text-yellow-800 italic">
                                        "{selectedClosing.notes}"
                                    </div>
                                )}

                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-300">
                        <Receipt size={64} className="mb-4 opacity-50" />
                        <p className="font-bold text-lg">Selecciona un cierre</p>
                        <p className="text-sm">Toca un elemento de la lista para ver el detalle</p>
                    </div>
                )}
            </div>
        </div>
    );
}