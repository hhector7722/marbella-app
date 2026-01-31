'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    History,
    Users,
    TrendingUp,
    ChevronDown,
    Wallet,
    CloudSun,
    Calendar,
    ArrowRightLeft,
    AlertCircle,
    CheckCircle2,
    LayoutDashboard,
    ArrowRight,
    ArrowUpRight,
    ArrowDownLeft,
    Clock,
    UserCircle // <--- ICONO AÑADIDO
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);

    // Estados
    const [dailyStats, setDailyStats] = useState<any>(null);
    const [boxes, setBoxes] = useState<any[]>([]);
    const [boxMovements, setBoxMovements] = useState<any[]>([]);

    // Estado para Horas Extras
    const [overtimeData, setOvertimeData] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const toggleWeek = (weekId: string) => {
        setOvertimeData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));
    };

    async function fetchData() {
        try {
            // 1. RESUMEN DIARIO
            const { data: lastClose } = await supabase
                .from('cash_closings')
                .select('*')
                .order('closed_at', { ascending: false })
                .limit(1)
                .single();

            if (lastClose) {
                const mockLaborCost = 0;
                setDailyStats({
                    date: new Date(lastClose.closed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                    fullDate: new Date(lastClose.closed_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
                    weather: lastClose.weather || 'General',
                    facturat: lastClose.net_sales * 1.10,
                    vNeta: lastClose.net_sales,
                    ticketMedio: lastClose.tickets_count > 0 ? lastClose.net_sales / lastClose.tickets_count : 0,
                    costeManoObra: mockLaborCost,
                    porcentajeManoObra: lastClose.net_sales > 0 ? (mockLaborCost / lastClose.net_sales) * 100 : 0
                });
            }

            // 2. CAJAS
            const { data: allBoxes } = await supabase.from('cash_boxes').select('*').order('name');
            if (allBoxes) {
                const sorted = allBoxes.sort((a, b) => a.type === 'operational' ? -1 : 1);
                setBoxes(sorted);

                const opBox = sorted.find(b => b.type === 'operational');
                if (opBox) {
                    const { data: moves } = await supabase
                        .from('treasury_movements')
                        .select('*')
                        .or(`source_box_id.eq.${opBox.id},destination_box_id.eq.${opBox.id}`)
                        .order('created_at', { ascending: false })
                        .limit(3);
                    setBoxMovements(moves || []);
                }
            }

            // 3. HORAS EXTRAS
            const d = new Date();
            d.setDate(d.getDate() - 15);
            const startISO = d.toISOString();

            const { data: logs } = await supabase
                .from('time_logs')
                .select('user_id, total_hours, clock_in')
                .not('total_hours', 'is', null)
                .gte('clock_in', startISO);

            const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, role, hourly_cost');

            if (logs && profiles) {
                const profileMap = new Map(profiles.map(p => [p.id, p]));
                const weeksMap = new Map<string, any>();

                logs.forEach(log => {
                    const date = new Date(log.clock_in);
                    const day = date.getDay();
                    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                    const monday = new Date(date.setDate(diff));
                    monday.setHours(0, 0, 0, 0);

                    const weekLabelId = monday.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                    const rangeLabel = `${monday.toLocaleDateString('es-ES', { day: 'numeric' })} - ${new Date(monday.getTime() + 6 * 86400000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;

                    if (!weeksMap.has(weekLabelId)) {
                        weeksMap.set(weekLabelId, {
                            weekId: weekLabelId,
                            title: `Semana ${weekLabelId}`,
                            dateRange: rangeLabel,
                            total: 0,
                            expanded: false,
                            staff: []
                        });
                    }

                    const weekEntry = weeksMap.get(weekLabelId);
                    const userProfile = profileMap.get(log.user_id);
                    if (userProfile) {
                        const cost = (log.total_hours || 0) * (userProfile.hourly_cost || 0);
                        const existingStaff = weekEntry.staff.find((s: any) => s.id === log.user_id);

                        if (existingStaff) {
                            existingStaff.amount += cost;
                            existingStaff.hours += log.total_hours;
                        } else {
                            weekEntry.staff.push({
                                id: log.user_id,
                                name: userProfile.first_name,
                                amount: cost,
                                hours: log.total_hours,
                                paid: true
                            });
                        }
                        weekEntry.total += cost;
                    }
                });

                const sortedWeeks = Array.from(weeksMap.values()).sort((a, b) => b.weekId.localeCompare(a.weekId));
                if (sortedWeeks.length > 0) sortedWeeks[0].expanded = true;
                setOvertimeData(sortedWeeks);
            }

        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    }

    if (loading) return <div className="p-8 text-white flex items-center gap-2"><div className="w-4 h-4 bg-white animate-pulse rounded-full"></div> Cargando Panel...</div>;

    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const percent = dailyStats?.porcentajeManoObra || 0;
    const offset = circumference - (percent / 100) * circumference;
    const percentColor = percent > 35 ? '#ef4444' : (percent > 25 ? '#f59e0b' : '#10b981');

    return (
        <div className="p-4 md:p-6 w-full max-w-6xl mx-auto space-y-6 pb-24">

            {/* Header */}
            <div className="flex justify-between items-end px-2">
                <div>
                    <h1 className="text-2xl font-bold text-white">Hola, Héctor</h1>
                    <p className="text-blue-100 text-xs opacity-80">Resumen ejecutivo del negocio</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-xs font-medium text-white flex items-center gap-2">
                    <Calendar size={12} />
                    {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
            </div>

            {/* --- BLOQUE 1: ÚLTIMO CIERRE --- */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600">
                            <CloudSun size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-800">Último Cierre</h3>
                            <p className="text-xs text-gray-400 capitalize">{dailyStats?.fullDate || 'Sin datos'} • {dailyStats?.weather || '-'}</p>
                        </div>
                    </div>
                    <Link href="/dashboard/history" className="text-xs font-bold text-[#36606F] hover:bg-gray-50 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                        Ver más <ArrowRight size={12} />
                    </Link>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Facturación</span>
                        <span className="text-xl font-black text-gray-800">{dailyStats?.facturat.toFixed(0) || 0}€</span>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-blue-400 uppercase block mb-1">Venta Neta</span>
                        <span className="text-xl font-black text-blue-700">{dailyStats?.vNeta.toFixed(0) || 0}€</span>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Ticket Medio</span>
                        <span className="text-xl font-black text-gray-800">{dailyStats?.ticketMedio.toFixed(2) || 0}€</span>
                    </div>

                    <div className="p-3 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between gap-2 relative overflow-hidden">
                        <div className="text-left z-10">
                            <span className="text-[10px] font-bold text-red-400 uppercase block mb-1">Coste MO</span>
                            <span className="text-xl font-black text-red-600">{dailyStats?.costeManoObra.toFixed(0) || 0}€</span>
                        </div>
                        <div className="relative w-12 h-12 flex-shrink-0 z-10">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="50%" cy="50%" r={radius} stroke="white" strokeWidth="4" fill="transparent" opacity="0.5" />
                                <circle
                                    cx="50%" cy="50%" r={radius}
                                    stroke={percentColor} strokeWidth="4" fill="transparent"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[9px] font-black text-red-700">{dailyStats?.porcentajeManoObra.toFixed(0) || 0}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* --- BLOQUE 2: GRID DOBLE --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 2.1 Situación Cajas */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col h-full">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <Wallet className="text-[#36606F]" size={20} /> Situación Cajas
                        </h3>
                        <Link href="/dashboard/treasury" className="text-xs font-bold text-[#36606F] hover:bg-gray-50 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                            Ver más <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div className="space-y-4">
                        {boxes.map(box => {
                            const diff = box.type === 'change' ? box.current_balance - box.target_balance : 0;
                            const isBalanced = diff === 0;

                            return (
                                <div key={box.id}>
                                    <Link
                                        href={`/dashboard/treasury?openBox=${box.id}`}
                                        className="flex justify-between items-center p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-8 rounded-full ${box.type === 'operational' ? 'bg-blue-500' : 'bg-orange-400'}`}></div>
                                            <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700 transition-colors">
                                                {box.type === 'operational' ? 'Caja Inicial' : box.name}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-lg font-black text-gray-800 group-hover:text-blue-700 transition-colors block">
                                                {box.current_balance.toFixed(2)}€
                                            </span>
                                            {box.type === 'change' && (
                                                <div className="flex justify-end mt-1">
                                                    {isBalanced ? (
                                                        <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                                                            <CheckCircle2 size={10} /> OK
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                                                            <AlertCircle size={10} /> {diff > 0 ? '+' : ''}{diff.toFixed(2)}€
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </Link>
                                    {box.type === 'operational' && (
                                        <div className="pl-4 border-l-2 border-gray-100 ml-5 py-3 mb-2">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Últimos movimientos</p>
                                            <div className="space-y-2">
                                                {boxMovements.map(mov => (
                                                    <div key={mov.id} className="flex justify-between items-center text-xs">
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            {mov.type === 'expense'
                                                                ? <ArrowUpRight size={10} className="text-red-400 shrink-0" />
                                                                : <ArrowDownLeft size={10} className="text-green-500 shrink-0" />
                                                            }
                                                            <span className="text-gray-500 truncate max-w-[120px]">{mov.notes}</span>
                                                        </div>
                                                        <span className={`font-bold ${mov.type === 'expense' ? 'text-red-500' : 'text-green-600'}`}>
                                                            {mov.type === 'expense' ? '-' : '+'}{mov.amount.toFixed(2)}€
                                                        </span>
                                                    </div>
                                                ))}
                                                {boxMovements.length === 0 && <span className="text-xs text-gray-300 italic">Sin movimientos</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2.2 Horas Extras */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col h-full">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <Clock className="text-orange-500" size={20} /> Horas Extras
                        </h3>
                        <Link href="/dashboard/overtime" className="text-xs font-bold text-[#36606F] hover:bg-gray-50 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                            Ver más <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                        {overtimeData.length === 0 && (
                            <div className="text-center py-10 text-gray-300 text-xs italic">Sin horas registradas esta semana</div>
                        )}

                        {overtimeData.map(week => (
                            <div key={week.weekId} className={`border rounded-2xl overflow-hidden transition-all duration-300 ${week.expanded ? 'border-blue-200 shadow-sm' : 'border-gray-100'}`}>
                                <div
                                    onClick={() => toggleWeek(week.weekId)}
                                    className={`p-4 flex justify-between items-center cursor-pointer select-none transition-colors ${week.expanded ? 'bg-blue-50/30' : 'bg-white'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`transition-transform duration-200 ${week.expanded ? 'rotate-180 text-blue-600' : 'text-gray-400'}`}>
                                            <ChevronDown size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-sm font-bold ${week.expanded ? 'text-blue-800' : 'text-gray-700'}`}>{week.title}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{week.dateRange}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg text-xs font-black min-w-[50px] text-center">
                                            {week.total.toFixed(0)}€
                                        </span>
                                    </div>
                                </div>

                                {week.expanded && (
                                    <div className="bg-white p-2 space-y-1 border-t border-gray-100">
                                        {week.staff.map((staff: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center p-2 rounded-xl hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[#36606F] text-white flex items-center justify-center text-xs font-bold">
                                                        {staff.name.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-700">{staff.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-bold text-gray-800 text-sm">{staff.amount.toFixed(0)}€</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- BLOQUE 3: ACCESOS DIRECTOS (Footer) --- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link href="/dashboard/history" className="bg-white p-4 rounded-2xl shadow-md border-b-4 border-blue-100 hover:border-blue-400 hover:translate-y-[-2px] transition-all group flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <History size={20} />
                    </div>
                    <div>
                        <span className="block text-sm font-bold text-gray-700">Cierres</span>
                        <span className="text-[10px] text-gray-400">Histórico</span>
                    </div>
                </Link>

                <Link href="/dashboard/labor" className="bg-white p-4 rounded-2xl shadow-md border-b-4 border-red-100 hover:border-red-400 hover:translate-y-[-2px] transition-all group flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <span className="block text-sm font-bold text-gray-700">Coste M.O.</span>
                        <span className="text-[10px] text-gray-400">Análisis</span>
                    </div>
                </Link>

                <Link href="/dashboard/team" className="bg-white p-4 rounded-2xl shadow-md border-b-4 border-green-100 hover:border-green-400 hover:translate-y-[-2px] transition-all group flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                        <Users size={20} />
                    </div>
                    <div>
                        <span className="block text-sm font-bold text-gray-700">Plantilla</span>
                        <span className="text-[10px] text-gray-400">Datos Staff</span>
                    </div>
                </Link>

                {/* --- AQUI ESTÁ EL CAMBIO: ACCESO DIRECTO MODO STAFF --- */}
                <Link href="/staff/dashboard" className="bg-white p-4 rounded-2xl shadow-md border-b-4 border-indigo-100 hover:border-indigo-400 hover:translate-y-[-2px] transition-all group flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <UserCircle size={20} />
                    </div>
                    <div>
                        <span className="block text-sm font-bold text-gray-700">Modo Staff</span>
                        <span className="text-[10px] text-gray-400">Fichar/Turnos</span>
                    </div>
                </Link>
            </div>

        </div>
    );
}