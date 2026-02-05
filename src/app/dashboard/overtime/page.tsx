'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    ArrowLeft,
    Calendar,
    Filter,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    CheckCircle,
    CheckCircle2,
    Circle,
    Search,
    X,
    Clock,
    Clock3,
    TrendingUp,
    Users,
    Download,
    Info,
    BadgeDollarSign,
    HandCoins
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, type WeeklyStats, type StaffWeeklyStats } from '@/app/actions/overtime';

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
    const [weeksData, setWeeksData] = useState<(WeeklyStats & { expanded: boolean })[]>([]);
    const [summary, setSummary] = useState({ totalCost: 0, totalHours: 0, totalOvertimeCost: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [isAllPaidInView, setIsAllPaidInView] = useState(false);

    const PRESETS = [
        { label: 'Últimos 30 días', getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
        { label: 'Este Mes', getValue: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
        {
            label: 'Mes Pasado', getValue: () => {
                const d = subDays(startOfMonth(new Date()), 1);
                return { start: startOfMonth(d), end: endOfMonth(d) };
            }
        },
        { label: 'Histórico', getValue: () => ({ start: subDays(new Date(), 365), end: new Date() }) },
    ];

    useEffect(() => {
        fetchOvertimeData();
    }, [startDate, endDate]);

    async function fetchOvertimeData() {
        setLoading(true);
        try {
            const { weeksResult, summary } = await getOvertimeData(startDate, endDate);

            const localWeeks = weeksResult.map((w, idx) => ({
                ...w,
                expanded: idx === 0 // Expand the first one
            }));

            setWeeksData(localWeeks);
            setSummary(summary);

        } catch (error) {
            console.error(error);
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    }

    const applyPreset = (preset: any) => {
        const { start, end } = preset.getValue();
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    };

    const filteredWeeksData = weeksData.map(week => ({
        ...week,
        staff: week.staff.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    })).filter(week => week.staff.length > 0);

    const toggleWeek = (weekId: string) => {
        setWeeksData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));
    };

    const togglePaid = async (e: React.MouseEvent, week: (WeeklyStats & { expanded: boolean }), staff: StaffWeeklyStats) => {
        e.stopPropagation();
        const mondayISO = week.startDate.toISOString().split('T')[0];
        const newStatus = !staff.isPaid;

        // Optimistic update
        setWeeksData(prev => prev.map(w => {
            if (w.weekId === week.weekId) {
                return {
                    ...w,
                    staff: w.staff.map(s => s.id === staff.id ? { ...s, isPaid: newStatus } : s)
                };
            }
            return w;
        }));

        try {
            // First check if a snapshot exists for this user/week
            const { data: existingSnapshot, error: selectError } = await supabase
                .from('weekly_snapshots')
                .select('id')
                .eq('user_id', staff.id)
                .eq('week_start', mondayISO)
                .maybeSingle();

            if (selectError) throw selectError;

            if (existingSnapshot) {
                // Update existing record
                const { error: updateError } = await supabase
                    .from('weekly_snapshots')
                    .update({ is_paid: newStatus })
                    .eq('user_id', staff.id)
                    .eq('week_start', mondayISO);

                if (updateError) throw updateError;
            } else {
                // Create new record with all required fields
                const { error: insertError } = await supabase
                    .from('weekly_snapshots')
                    .insert({
                        user_id: staff.id,
                        week_start: mondayISO,
                        is_paid: newStatus,
                        total_hours: staff.totalHours,
                        balance_hours: staff.overtimeHours,
                        pending_balance: 0,
                        final_balance: staff.overtimeHours
                    });

                if (insertError) throw insertError;
            }
        } catch (error) {
            console.error(error);
            // Revert on error
            setWeeksData(prev => prev.map(w => {
                if (w.weekId === week.weekId) {
                    return {
                        ...w,
                        staff: w.staff.map(s => s.id === staff.id ? { ...s, isPaid: !newStatus } : s)
                    };
                }
                return w;
            }));
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

            {/* PANEL IZQUIERDO: FILTROS Y RESUMEN */}
            <div className="w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col p-6 z-10 h-auto md:h-screen sticky top-header-safe">
                <div className="mb-6">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-gray-800 mb-6 text-sm font-bold transition-colors w-fit">
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <h1 className="text-2xl font-black text-gray-800 mb-1">Histórico Extras</h1>
                    <p className="text-xs text-gray-400">Control de nóminas por trabajador</p>
                </div>

                {/* Filtros */}
                <div className="bg-gray-50 p-5 rounded-[2rem] border border-gray-100 mb-6 space-y-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
                            <Search size={12} /> Buscar Staff
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Nombre del empleado..."
                                className="w-full bg-white border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold text-gray-700 outline-none focus:border-[#5B8FB9] transition-all"
                            />
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
                            <Filter size={12} /> Periodo
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 block mb-1">Desde</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 block mb-1">Hasta</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500" />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => applyPreset(p)}
                                    className="px-3 py-1 bg-white border border-gray-100 rounded-full text-[10px] font-bold text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95 shadow-sm"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* KPIs */}
                <div className="space-y-4">
                    <div className="bg-[#36606F] text-white p-7 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2 opacity-80">
                                <TrendingUp size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Compromiso Total</span>
                            </div>
                            <span className="text-4xl font-black">{summary.totalCost.toFixed(0)}€</span>
                            <p className="text-[10px] font-bold mt-2 opacity-50 uppercase">Para el periodo seleccionado</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-orange-50 rounded-[2rem] border border-orange-100 group">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle size={14} className="text-orange-400" />
                                <span className="text-[10px] font-bold text-orange-400 uppercase block tracking-wider">Excesos</span>
                            </div>
                            <span className="text-2xl font-black text-orange-600 group-hover:scale-105 transition-transform inline-block">{summary.totalOvertimeCost.toFixed(0)}€</span>
                        </div>
                        <div className="p-5 bg-blue-50 rounded-[2rem] border border-blue-100 group">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock3 size={14} className="text-[#5B8FB9]" />
                                <span className="text-[10px] font-bold text-[#5B8FB9] uppercase block tracking-wider">Producción</span>
                            </div>
                            <span className="text-2xl font-black text-[#5B8FB9] group-hover:scale-105 transition-transform inline-block">{summary.totalHours.toFixed(1)}h</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* PANEL DERECHO: LISTA SEMANAL */}
            <div className="flex-1 bg-gray-50 p-4 md:p-8 overflow-y-auto h-screen">
                <div className="max-w-3xl mx-auto space-y-4">

                    {loading && <div className="text-center py-10 text-gray-400 text-sm animate-pulse">Calculando nóminas...</div>}

                    {!loading && filteredWeeksData.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                            <p className="text-gray-400 font-bold">Sin resultados.</p>
                            <p className="text-xs text-gray-300 mt-1">No hay datos que coincidan con la búsqueda.</p>
                        </div>
                    )}

                    {filteredWeeksData.map(week => {
                        const allStaffPaid = week.staff.every(s => s.isPaid);
                        const paidCount = week.staff.filter(s => s.isPaid).length;
                        const totalCount = week.staff.length;

                        return (
                            <div key={week.weekId} className={`bg-white rounded-3xl border transition-all duration-300 overflow-hidden ${week.expanded ? 'ring-2 ring-[#5B8FB9]/20 shadow-xl' : 'border-gray-100 hover:shadow-md'}`}>

                                {/* Cabecera Semana */}
                                <div
                                    onClick={() => toggleWeek(week.weekId)}
                                    className="p-5 flex justify-between items-center cursor-pointer select-none relative"
                                >
                                    {/* Fondo sutil si está pagado */}
                                    {allStaffPaid && <div className="absolute inset-0 bg-green-50/30"></div>}

                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className={`p-3 rounded-2xl transition-colors ${allStaffPaid ? 'bg-green-100 text-green-600' : (week.expanded ? 'bg-blue-100 text-[#5B8FB9]' : 'bg-gray-100 text-gray-400')}`}>
                                            <Calendar size={22} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-bold text-gray-800">{week.label}</h3>
                                                {allStaffPaid ? (
                                                    <span className="px-2 py-0.5 bg-green-500 text-white text-[9px] font-black rounded-full shadow-sm">PAGADA</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-orange-400 text-white text-[9px] font-black rounded-full shadow-sm">
                                                        {paidCount}/{totalCount} PAGADOS
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400 font-semibold">{week.totalHours.toFixed(1)} horas registradas</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5 relative z-10">
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-gray-400 uppercase block mb-0.5">Semana</span>
                                            <span className="text-2xl font-black text-gray-800 block leading-none">{week.totalAmount.toFixed(0)}€</span>
                                        </div>
                                        <div className={`p-2 rounded-full transition-all ${week.expanded ? 'bg-gray-100 text-gray-800 rotate-180' : 'text-gray-300'}`}>
                                            <ChevronDown size={20} />
                                        </div>
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
                                                    <div className="col-span-3 text-right flex items-center justify-end gap-3">
                                                        <div className="text-right">
                                                            <div className={`text-sm font-black ${staff.isPaid ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                                                {staff.totalCost.toFixed(0)}€
                                                            </div>
                                                            {staff.overtimeCost > 0 && (
                                                                <span className="text-[9px] text-red-400 font-bold block">
                                                                    (Extras: {staff.overtimeCost.toFixed(0)}€)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button onClick={(e) => togglePaid(e, week, staff)} className="transition-transform active:scale-90">
                                                            {staff.isPaid ? (
                                                                <CheckCircle size={20} className="text-green-500 fill-green-50" />
                                                            ) : (
                                                                <Circle size={20} className="text-gray-300 hover:text-gray-400" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}