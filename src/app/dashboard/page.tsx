'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, X, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw, Save,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart
} from 'lucide-react';
import Link from 'next/link';
import { getISOWeek, format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// --- COMPONENTE INTERNO: FORMULARIO DE CAJA ---
const CashDenominationForm = ({ type, boxName, onSubmit, onCancel }: { type: 'in' | 'out' | 'audit', boxName: string, onSubmit: (total: number, breakdown: any, notes: string) => void, onCancel: () => void }) => {
    const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];
    const [counts, setCounts] = useState<Record<number, number>>({});
    const [notes, setNotes] = useState('');

    const calculateTotal = () => {
        return DENOMINATIONS.reduce((acc, val) => acc + (val * (counts[val] || 0)), 0);
    };

    const handleCountChange = (val: number, qty: string) => {
        const num = parseInt(qty) || 0;
        setCounts(prev => ({ ...prev, [val]: num }));
    };

    const total = calculateTotal();
    const isAudit = type === 'audit';
    const colorClass = isAudit ? 'text-orange-500' : (type === 'in' ? 'text-emerald-500' : 'text-rose-500');
    const bgClass = isAudit ? 'bg-orange-400' : (type === 'in' ? 'bg-emerald-400' : 'bg-rose-400');

    return (
        <div className="flex flex-col h-full">
            <div className={`p-4 text-white flex justify-between items-center ${bgClass}`}>
                <div>
                    <h3 className="text-lg font-bold">{isAudit ? 'Arqueo' : (type === 'in' ? 'Entrada' : 'Salida')} - {boxName}</h3>
                    <p className="text-white/80 text-xs">Introduce el desglose</p>
                </div>
                <div className="text-right">
                    <span className="block text-[10px] uppercase opacity-80">Total</span>
                    <span className="text-2xl font-black">{total.toFixed(2)}€</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {!isAudit && (
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Concepto / Motivo</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ej. Cambio banco, Pago proveedor..."
                            className="w-full p-3 rounded-xl border border-gray-300 focus:border-blue-500 outline-none"
                        />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    {DENOMINATIONS.map(denom => (
                        <div key={denom} className="bg-white p-2 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
                            <span className="font-bold text-gray-700 text-sm w-12 text-right">
                                {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}cts`}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">x</span>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    className={`w-16 p-1 text-center font-bold rounded-lg bg-gray-50 border focus:bg-white focus:ring-2 outline-none ${colorClass}`}
                                    onChange={(e) => handleCountChange(denom, e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 bg-white border-t flex gap-3">
                <button onClick={onCancel} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                <button
                    onClick={() => onSubmit(total, counts, notes)}
                    className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 ${bgClass}`}
                >
                    <Save size={18} />
                    {isAudit ? 'Ajustar' : 'Confirmar'}
                </button>
            </div>
        </div>
    );
};

export default function DashboardPage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Estados de Datos
    const [dailyStats, setDailyStats] = useState<any>(null);
    const [boxes, setBoxes] = useState<any[]>([]);
    const [boxMovements, setBoxMovements] = useState<any[]>([]);
    const [overtimeData, setOvertimeData] = useState<any[]>([]);

    // Estados de UI
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);

    // Estado para gestión de caja
    const [cashModalMode, setCashModalMode] = useState<'none' | 'menu' | 'in' | 'out' | 'audit'>('none');
    const [selectedBox, setSelectedBox] = useState<any>(null);

    // Estado para pagos
    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>({});
    const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const toggleWeek = (weekId: string) => {
        setOvertimeData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));
    };

    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        const newStatus = !paidStatus[key];

        // Optimistic update
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));

        try {
            // Calcular week_end (6 días después de week_start)
            const weekStart = new Date(weekId);
            const weekEnd = addDays(weekStart, 6);
            const weekEndStr = weekEnd.toISOString().split('T')[0];

            // Buscar si existe el registro
            const { data: existing, error: selectError } = await supabase
                .from('weekly_snapshots')
                .select('id')
                .eq('user_id', staffId)
                .eq('week_start', weekId)
                .maybeSingle();

            if (selectError) throw selectError;

            if (existing) {
                // Actualizar registro existente
                const { error: updateError } = await supabase
                    .from('weekly_snapshots')
                    .update({ is_paid: newStatus })
                    .eq('user_id', staffId)
                    .eq('week_start', weekId);

                if (updateError) throw updateError;
            } else {
                // Obtener datos del staff para esta semana
                const weekData = overtimeData.find(w => w.weekId === weekId);
                const staffData = weekData?.staff?.find((s: any) => s.id === staffId);

                // Crear nuevo registro con todos los campos requeridos
                const { error: insertError } = await supabase
                    .from('weekly_snapshots')
                    .insert({
                        user_id: staffId,
                        week_start: weekId,
                        week_end: weekEndStr,
                        is_paid: newStatus,
                        total_hours: staffData?.hours || 0,
                        balance_hours: staffData?.hours || 0,
                        contracted_hours_snapshot: 0,
                        overtime_price_snapshot: 0,
                        pending_balance: 0,
                        final_balance: staffData?.hours || 0,
                        total_cost: staffData?.amount || 0
                    });

                if (insertError) throw insertError;
            }
        } catch (error) {
            console.error("Error updating paid status:", error);
            // Revertir en caso de error
            setPaidStatus(prev => ({ ...prev, [key]: !newStatus }));
        }
    };

    const isWeekFullyPaid = (week: any) => {
        if (!week.staff || week.staff.length === 0) return false;
        return week.staff.every((s: any) => paidStatus[`${week.weekId}-${s.id}`]);
    };

    async function fetchData() {
        try {
            // 1. RESUMEN DIARIO
            const { data: lastClose } = await supabase.from('cash_closings').select('*').order('closed_at', { ascending: false }).limit(1).single();

            if (lastClose) {
                // Obtener fecha del cierre
                const closeDate = new Date(lastClose.closed_at);
                const closeDateStart = new Date(closeDate);
                closeDateStart.setHours(0, 0, 0, 0);
                const closeDateEnd = new Date(closeDate);
                closeDateEnd.setHours(23, 59, 59, 999);

                // Obtener fichajes y profiles para ese día
                const { data: dayLogs } = await supabase
                    .from('time_logs')
                    .select('user_id, total_hours')
                    .gte('clock_in', closeDateStart.toISOString())
                    .lte('clock_in', closeDateEnd.toISOString())
                    .not('clock_out', 'is', null);

                const { data: allProfiles } = await supabase
                    .from('profiles')
                    .select('id, role, regular_cost_per_hour, overtime_cost_per_hour, contracted_hours_weekly');

                // Calcular coste real de mano de obra
                let laborCost = 0;
                const profileMap = new Map(allProfiles?.map(p => [p.id, p]) || []);
                const countedManagers = new Set<string>();

                // Sumar horas por empleado
                const userDayHours = new Map<string, number>();
                dayLogs?.forEach(log => {
                    const current = userDayHours.get(log.user_id) || 0;
                    userDayHours.set(log.user_id, current + (log.total_hours || 0));
                });

                // Calcular coste por empleado que fichó
                userDayHours.forEach((hours, userId) => {
                    const profile = profileMap.get(userId);
                    if (profile) {
                        const dailyContracted = (profile.contracted_hours_weekly || 40) / 5;
                        const regPrice = profile.regular_cost_per_hour || 0;
                        const overPrice = profile.overtime_cost_per_hour || regPrice;
                        const isManager = profile.role === 'manager';

                        if (isManager) {
                            // Managers: base + extras
                            laborCost += dailyContracted * regPrice;
                            laborCost += hours * overPrice;
                            countedManagers.add(userId);
                        } else {
                            // Staff: regulares + extras
                            if (hours > dailyContracted) {
                                laborCost += dailyContracted * regPrice;
                                laborCost += (hours - dailyContracted) * overPrice;
                            } else {
                                laborCost += hours * regPrice;
                            }
                        }
                    }
                });

                // Añadir managers que no ficharon
                allProfiles?.forEach(profile => {
                    if (profile.role === 'manager' && !countedManagers.has(profile.id)) {
                        const dailyContracted = (profile.contracted_hours_weekly || 40) / 5;
                        const regPrice = profile.regular_cost_per_hour || 0;
                        laborCost += dailyContracted * regPrice;
                    }
                });

                const laborPercent = lastClose.net_sales > 0 ? (laborCost / lastClose.net_sales) * 100 : 0;

                setDailyStats({
                    date: new Date(lastClose.closed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                    fullDate: new Date(lastClose.closed_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
                    weather: lastClose.weather || 'General',
                    facturat: lastClose.net_sales * 1.10,
                    vNeta: lastClose.net_sales,
                    ticketMedio: lastClose.tickets_count > 0 ? lastClose.net_sales / lastClose.tickets_count : 0,
                    costeManoObra: laborCost,
                    porcentajeManoObra: laborPercent,
                    laborCostBg: laborPercent > 35 ? 'bg-rose-500' : (laborPercent > 30 ? 'bg-orange-400' : 'bg-emerald-500')
                });
            }

            // 2. CAJAS
            const { data: allBoxes } = await supabase.from('cash_boxes').select('*').order('name');
            if (allBoxes) {
                const sorted = allBoxes.sort((a, b) => a.type === 'operational' ? -1 : 1);
                setBoxes(sorted);
                const opBox = sorted.find(b => b.type === 'operational');
                if (opBox) {
                    const { data: moves } = await supabase.from('treasury_movements').select('*').or(`source_box_id.eq.${opBox.id},destination_box_id.eq.${opBox.id}`).order('created_at', { ascending: false }).limit(3);
                    setBoxMovements(moves || []);
                }
            }

            // 3. HORAS EXTRAS
            const d = new Date(); d.setDate(d.getDate() - 60);
            const { data: logs } = await supabase.from('time_logs').select('user_id, total_hours, clock_in').gte('clock_in', d.toISOString());
            const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, role, overtime_cost_per_hour, contracted_hours_weekly, is_fixed_salary, hours_balance, prefer_stock_hours');
            const { data: snapshots } = await supabase.from('weekly_snapshots').select('user_id, week_start, is_paid, final_balance, balance_hours, pending_balance').gte('week_start', d.toISOString().split('T')[0]);

            if (profiles) setAllEmployees(profiles);

            if (logs && profiles) {
                const profileMap = new Map(profiles.map(p => [p.id, p]));

                // Primero: agrupar TODAS las horas por semana y usuario
                const weekUserHoursMap = new Map<string, Map<string, number>>();

                logs.forEach(log => {
                    const date = new Date(log.clock_in);
                    const day = date.getDay();
                    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                    const monday = new Date(date.setDate(diff));
                    monday.setHours(0, 0, 0, 0);
                    const weekLabelId = monday.toISOString().split('T')[0];

                    if (!weekUserHoursMap.has(weekLabelId)) {
                        weekUserHoursMap.set(weekLabelId, new Map());
                    }
                    const userMap = weekUserHoursMap.get(weekLabelId)!;
                    userMap.set(log.user_id, (userMap.get(log.user_id) || 0) + (log.total_hours || 0));
                });

                // Ordenar semanas cronológicamente para calcular arrastre correcto
                const sortedWeekIds = Array.from(weekUserHoursMap.keys()).sort();

                // Mapa para arrastre: userId -> finalBalance de semana anterior
                const userFinalBalances = new Map<string, Map<string, number>>();

                // Construir estructura de semanas con lógica de arrastre
                const weeksMap = new Map<string, any>();
                const initialPaidStatus: Record<string, boolean> = {};

                sortedWeekIds.forEach(weekLabelId => {
                    const userMap = weekUserHoursMap.get(weekLabelId)!;
                    const monday = new Date(weekLabelId);
                    const weekNum = getISOWeek(monday);
                    const sunday = addDays(monday, 6);
                    const startStr = format(monday, "d MMM", { locale: es });
                    const endStr = format(sunday, "d MMM", { locale: es });
                    const titleLabel = `Sem ${weekNum}`;
                    const rangeLabel = `${startStr} a ${endStr}`;

                    const prevMonday = addDays(monday, -7);
                    const prevWeekId = prevMonday.toISOString().split('T')[0];

                    if (!weeksMap.has(weekLabelId)) {
                        weeksMap.set(weekLabelId, {
                            weekId: weekLabelId, title: titleLabel, dateRange: rangeLabel, total: 0, expanded: false, staff: []
                        });
                    }

                    const weekEntry = weeksMap.get(weekLabelId);
                    if (!userFinalBalances.has(weekLabelId)) userFinalBalances.set(weekLabelId, new Map());

                    userMap.forEach((totalHours, userId) => {
                        const userProfile = profileMap.get(userId);
                        if (userProfile) {
                            const contractedHours = userProfile.contracted_hours_weekly || 40;
                            const isManager = userProfile.role === 'manager';
                            const isFixedSalary = userProfile.is_fixed_salary || false;
                            const preferStock = userProfile.prefer_stock_hours || false;
                            const overtimeRate = userProfile.overtime_cost_per_hour || 0;

                            // Balance semanal: managers y empleados con salario fijo cuentan todas las horas como extras
                            const weeklyBalance = (isManager || isFixedSalary) ? totalHours : (totalHours - contractedHours);

                            // Obtener pending_balance (arrastre de semana anterior)
                            let pendingBalance = 0;
                            const prevSnapshot = snapshots?.find(s => s.user_id === userId && s.week_start === prevWeekId);

                            if (prevSnapshot?.final_balance !== null && prevSnapshot?.final_balance !== undefined) {
                                // Si el empleado NO prefiere acumular y el balance previo era positivo,
                                // se liquidó y el arrastre queda en 0
                                if (!preferStock && prevSnapshot.final_balance > 0) {
                                    pendingBalance = 0; // Se liquidó la semana anterior
                                } else {
                                    pendingBalance = prevSnapshot.final_balance;
                                }
                            } else {
                                const prevBalances = userFinalBalances.get(prevWeekId);
                                const prevBalance = prevBalances?.get(userId) ?? (userProfile.hours_balance || 0);

                                // Misma lógica: si no prefiere acumular y era positivo, se liquidó
                                if (!preferStock && prevBalance > 0) {
                                    pendingBalance = 0;
                                } else {
                                    pendingBalance = prevBalance;
                                }
                            }

                            const finalBalance = pendingBalance + weeklyBalance;

                            // Guardar el balance real para arrastre interno
                            userFinalBalances.get(weekLabelId)!.set(userId, finalBalance);

                            // Costo: solo si balance > 0 Y no prefiere acumular
                            // Si prefiere acumular, no genera costo (se guarda)
                            let cost = 0;
                            if (finalBalance > 0 && !preferStock) {
                                cost = finalBalance * overtimeRate;
                            }

                            const existingSnapshot = snapshots?.find(s => s.user_id === userId && s.week_start === weekLabelId);
                            const isPaid = existingSnapshot?.is_paid || false;

                            weekEntry.staff.push({
                                id: userId,
                                name: userProfile.first_name,
                                amount: cost,
                                hours: finalBalance,
                                weeklyBalance: weeklyBalance,
                                totalHours: totalHours,
                                pendingBalance: pendingBalance,
                                preferStock: preferStock
                            });
                            initialPaidStatus[`${weekLabelId}-${userId}`] = isPaid;
                            weekEntry.total += cost;
                        }
                    });
                });

                setPaidStatus(initialPaidStatus);
                const sortedWeeks = Array.from(weeksMap.values()).sort((a, b) => b.weekId.localeCompare(a.weekId));
                setOvertimeData(sortedWeeks);
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    const handleCashTransaction = async (total: number, breakdown: any, notes: string) => {
        try {
            if (!selectedBox) return;

            if (cashModalMode === 'audit') {
                await supabase.from('cash_boxes').update({ current_balance: total }).eq('id', selectedBox.id);
            } else {
                const type = cashModalMode === 'in' ? 'income' : 'expense';
                await supabase.from('treasury_movements').insert({
                    amount: total, type: type, notes: notes,
                    source_box_id: type === 'expense' ? selectedBox.id : null,
                    destination_box_id: type === 'income' ? selectedBox.id : null,
                });
                const newBalance = type === 'income' ? selectedBox.current_balance + total : selectedBox.current_balance - total;
                await supabase.from('cash_boxes').update({ current_balance: newBalance }).eq('id', selectedBox.id);
            }
            setCashModalMode('none');
            setSelectedBox(null);
            fetchData();
        } catch (error) { console.error(error); alert("Error"); }
    };

    if (loading) return <div className="p-8 text-white">Cargando...</div>;

    const laborPercent = dailyStats?.porcentajeManoObra || 0;
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (laborPercent / 100) * circumference;
    const percentStrokeColor = '#ffffff';

    return (
        <div className="pb-24">
            <div className="p-4 md:p-6 w-full max-w-6xl mx-auto space-y-6">

                {/* FILA 1: ÚLTIMO CIERRE (IZQ) vs TESORERÍA (DER) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    {/* ÚLTIMO CIERRE */}
                    <div className="bg-white rounded-[2rem] p-6 shadow-xl relative overflow-hidden border border-gray-100 flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-50 p-2 rounded-xl text-blue-600"><CloudSun size={18} /></div>
                                <div><h3 className="text-sm font-bold text-gray-800">Último Cierre</h3><p className="text-[10px] text-gray-400 capitalize">{dailyStats?.fullDate}</p></div>
                            </div>
                            <Link href="/dashboard/history" className="text-xs font-bold text-[#36606F]">Ver más</Link>
                        </div>

                        <div className="grid grid-cols-2 gap-3 flex-1">
                            {/* Facturación */}
                            <div className="flex flex-col justify-center p-3 bg-white rounded-xl border-2 border-zinc-900 shadow-sm min-h-[70px]">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase leading-none mb-1">Facturación</span>
                                <span className="text-xl font-black text-black leading-tight">{dailyStats?.facturat.toFixed(0)}€</span>
                            </div>

                            {/* Venta Neta (Relleno Verde) */}
                            <div className="flex flex-col justify-center p-3 bg-emerald-500 rounded-xl shadow-sm min-h-[70px] text-white">
                                <span className="text-[10px] font-bold text-emerald-100 uppercase leading-none mb-1">Venta Neta</span>
                                <span className="text-xl font-black leading-tight">{dailyStats?.vNeta.toFixed(0)}€</span>
                            </div>

                            {/* Ticket Medio (Relleno Azul) */}
                            <div className="flex flex-col justify-center p-3 bg-blue-500 rounded-xl shadow-sm min-h-[70px] text-white">
                                <span className="text-[10px] font-bold text-blue-100 uppercase leading-none mb-1">Ticket Medio</span>
                                <span className="text-xl font-black leading-tight">{dailyStats?.ticketMedio.toFixed(2)}€</span>
                            </div>

                            {/* Coste M.Obra con indicador (Dinámico) */}
                            <div className={cn("flex flex-col justify-center p-3 rounded-xl shadow-sm min-h-[70px] text-white relative overflow-hidden", dailyStats?.laborCostBg)}>
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold text-white/80 uppercase leading-none mb-1">Coste M.Obra</span>
                                    <div className="w-8 h-8 relative shrink-0">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="50%" cy="50%" r={radius} stroke="white" strokeWidth="2" fill="transparent" opacity="0.3" />
                                            <circle cx="50%" cy="50%" r={radius} stroke="white" strokeWidth="2" fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-[7px] font-black text-white">{laborPercent.toFixed(0)}%</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xl font-black leading-tight">{dailyStats?.costeManoObra.toFixed(0)}€</span>
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: CAJA INICIAL + CAMBIO */}
                    <div className="flex flex-col gap-6">
                        {/* CAJA INICIAL */}
                        <div className="bg-white rounded-[2rem] p-4 shadow-xl flex flex-col border border-gray-100">
                            {boxes.filter(b => b.type === 'operational').map(box => (
                                <div key={box.id} className="space-y-3">
                                    <button
                                        onClick={() => { setSelectedBox(box); setCashModalMode('menu'); }}
                                        className="w-full p-4 rounded-2xl bg-emerald-500 border border-emerald-400 shadow-md hover:bg-emerald-600 transition-all cursor-pointer flex flex-col items-center justify-center text-white"
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">Caja Inicial</span>
                                        <span className="text-3xl font-black">{box.current_balance.toFixed(2)}€</span>
                                    </button>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center px-1">
                                            <button
                                                onClick={() => setIsMovementsExpanded(!isMovementsExpanded)}
                                                className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                                            >
                                                Movimientos
                                                <ChevronDown size={12} className={cn("transition-transform duration-200", isMovementsExpanded && "rotate-180")} />
                                            </button>
                                            <Link href="/dashboard/treasury" className="text-[10px] font-bold text-[#36606F] bg-gray-50 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">Ver más</Link>
                                        </div>

                                        {isMovementsExpanded && (
                                            <div className="space-y-1 animate-in slide-in-from-top-1 duration-200 py-1">
                                                {boxMovements.length === 0 && <p className="text-[9px] text-gray-300 italic px-1">Sin historial</p>}
                                                {boxMovements.map(mov => (
                                                    <div key={mov.id} className="flex justify-between items-center text-[10px] bg-gray-50 p-2 rounded-xl border border-gray-100">
                                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                                            {mov.type === 'expense' ? <ArrowUpRight size={10} className="text-rose-400 shrink-0" /> : <ArrowDownLeft size={10} className="text-emerald-500 shrink-0" />}
                                                            <span className="truncate max-w-[120px] text-gray-600">{mov.notes || 'Sin nota'}</span>
                                                        </div>
                                                        <span className={cn("font-bold", mov.type === 'expense' ? 'text-rose-500' : 'text-emerald-600')}>
                                                            {mov.type === 'expense' ? '-' : '+'}{mov.amount.toFixed(2)}€
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* CAJAS DE CAMBIO */}
                        <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col flex-1 border-2 border-orange-400">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                    <Wallet className="text-orange-400" size={20} /> Cajas de Cambio
                                </h3>
                                <Link href="/dashboard/treasury" className="text-xs font-bold text-[#36606F] hover:bg-gray-50 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">Ver más <ArrowRight size={12} /></Link>
                            </div>
                            <div className="space-y-3 flex-1 overflow-y-auto max-h-[120px] custom-scrollbar pr-1">
                                {boxes.filter(b => b.type !== 'operational').length === 0 && (
                                    <div className="flex-1 flex items-center justify-center text-gray-300 text-xs italic">
                                        No hay otras cajas configuradas
                                    </div>
                                )}
                                {boxes.filter(b => b.type !== 'operational').map(box => (
                                    <button
                                        key={box.id}
                                        onClick={() => { setSelectedBox(box); setCashModalMode('menu'); }}
                                        className="w-full flex justify-between items-center p-4 rounded-xl bg-orange-50 border-2 border-orange-100 shadow-sm hover:bg-orange-100 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                            <span className="text-sm font-bold text-orange-900">{box.name}</span>
                                        </div>
                                        <span className="text-xl font-black text-orange-900">{box.current_balance.toFixed(2)}€</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* FILA 2: ACCESOS DIRECTOS (IZQ) vs HORAS EXTRAS (DER) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    {/* BOTONES DE NAVEGACIÓN (2x2) */}
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <Link href="/dashboard/history" className="bg-[#5B8FB9] p-4 rounded-2xl shadow-md border border-white hover:brightness-110 transition-all group flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white text-[#5B8FB9] flex items-center justify-center shrink-0"><History size={20} /></div>
                            <div><span className="block text-sm font-bold text-white leading-tight">Cierres</span><span className="text-[10px] text-blue-100">Histórico</span></div>
                        </Link>
                        <Link href="/dashboard/labor" className="bg-[#5B8FB9] p-4 rounded-2xl shadow-md border border-white hover:brightness-110 transition-all group flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white text-[#5B8FB9] flex items-center justify-center shrink-0"><TrendingUp size={20} /></div>
                            <div><span className="block text-sm font-bold text-white leading-tight">Coste M.O.</span><span className="text-[10px] text-blue-100">Análisis</span></div>
                        </Link>
                        <button onClick={() => setIsStaffModalOpen(true)} className="bg-[#5B8FB9] p-4 rounded-2xl shadow-md border border-white hover:brightness-110 transition-all group flex items-center gap-3 w-full text-left">
                            <div className="w-10 h-10 rounded-full bg-white text-[#5B8FB9] flex items-center justify-center shrink-0"><Users size={20} /></div>
                            <div><span className="block text-sm font-bold text-white leading-tight">Plantilla</span><span className="text-[10px] text-blue-100">Datos Staff</span></div>
                        </button>
                        <button onClick={() => setIsProductModalOpen(true)} className="bg-[#5B8FB9] p-4 rounded-2xl shadow-md border border-white hover:brightness-110 transition-all group flex items-center gap-3 w-full text-left">
                            <div className="w-10 h-10 rounded-full bg-white text-[#5B8FB9] flex items-center justify-center shrink-0"><Package size={20} /></div>
                            <div><span className="block text-sm font-bold text-white leading-tight">Producto</span><span className="text-[10px] text-blue-100">Gestión Stock</span></div>
                        </button>
                    </div>

                    {/* HORAS EXTRAS */}
                    <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col h-full border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2"><Clock className="text-orange-500" size={20} /> Horas Extras</h3>
                            <Link href="/dashboard/overtime" className="text-xs font-bold text-[#36606F] hover:bg-gray-50 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">Ver más <ArrowRight size={12} /></Link>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 max-h-[200px]">
                            {overtimeData.length === 0 && <div className="text-center py-10 text-gray-300 text-xs italic">Sin horas registradas esta semana</div>}
                            {overtimeData.map(week => {
                                const isPaid = isWeekFullyPaid(week);
                                return (
                                    <div key={week.weekId} className="rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
                                        <div onClick={() => toggleWeek(week.weekId)} className="p-3 grid grid-cols-[1fr_auto_1fr] items-center cursor-pointer select-none bg-violet-400 text-white border-violet-400 border-2">
                                            <div className="flex flex-col justify-self-start"><span className="text-sm font-bold text-white">{week.title} <span className="font-normal opacity-80 text-xs ml-1">- {week.dateRange}</span></span></div>
                                            <div className="justify-self-center"><ChevronDown size={20} className={`transition-transform duration-200 text-white ${week.expanded ? 'rotate-180' : ''}`} /></div>
                                            <div className="flex items-center gap-3 justify-self-end">
                                                <span className="bg-white/20 text-white px-2 py-1 rounded-lg text-xs font-black min-w-[50px] text-center">{week.total.toFixed(0)}€</span>
                                                {isPaid ? <CheckCircle size={20} className="text-white" fill="#22c55e" /> : <AlertCircle size={20} className="text-white" fill="#fb923c" />}
                                            </div>
                                        </div>
                                        {week.expanded && (
                                            <div className="bg-white p-2 space-y-1 border border-violet-100 border-t-0 rounded-b-2xl">
                                                {week.staff.map((staff: any, idx: number) => {
                                                    const rowKey = `${week.weekId}-${staff.id}`;
                                                    const isRowPaid = paidStatus[rowKey] || false;
                                                    return (
                                                        <div key={idx} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition-colors border-b last:border-0 border-gray-50">
                                                            <div className="flex items-center gap-2 pl-2"><span className={`text-sm font-bold ${isRowPaid ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{staff.name}</span></div>
                                                            <div className="flex items-center gap-4"><span className={`font-bold text-sm ${isRowPaid ? 'text-gray-400' : 'text-gray-900'}`}>{staff.amount.toFixed(0)}€</span><button onClick={(e) => togglePaid(e, week.weekId, staff.id)} className="transition-transform active:scale-90">{isRowPaid ? <CheckCircle2 size={20} className="text-green-500 fill-green-100" /> : <Circle size={20} className="text-gray-300 hover:text-gray-400" />}</button></div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL GESTIÓN DE CAJA */}
            {
                cashModalMode !== 'none' && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            {cashModalMode === 'menu' && (
                                <>
                                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                                        <h3 className="font-bold text-lg text-gray-800">
                                            Gestión {selectedBox?.type === 'operational' ? 'Caja Inicial' : selectedBox?.name}
                                        </h3>
                                        <button onClick={() => setCashModalMode('none')} className="text-gray-400 hover:text-red-500"><X size={24} /></button>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-4">
                                        <button onClick={() => setCashModalMode('in')} className="bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-500 hover:bg-emerald-100 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all group"><div className="bg-emerald-500 text-white p-3 rounded-full group-hover:scale-110 transition-transform"><Plus size={24} /></div><span className="font-bold text-emerald-800">Entrada</span></button>
                                        <button onClick={() => setCashModalMode('out')} className="bg-rose-50 border-2 border-rose-100 hover:border-rose-500 hover:bg-rose-100 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all group"><div className="bg-rose-500 text-white p-3 rounded-full group-hover:scale-110 transition-transform"><Minus size={24} /></div><span className="font-bold text-rose-800">Salida</span></button>
                                        <button onClick={() => setCashModalMode('audit')} className="bg-orange-50 border-2 border-orange-100 hover:border-orange-500 hover:bg-orange-100 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all group"><div className="bg-orange-500 text-white p-3 rounded-full group-hover:scale-110 transition-transform"><RefreshCw size={24} /></div><span className="font-bold text-orange-800">Arqueo</span></button>
                                        <button onClick={() => router.push('/dashboard/movements')} className="bg-blue-50 border-2 border-blue-100 hover:border-blue-500 hover:bg-blue-100 p-4 rounded-2xl flex flex-col items-center gap-2 transition-all group"><div className="bg-blue-500 text-white p-3 rounded-full group-hover:scale-110 transition-transform"><History size={24} /></div><span className="font-bold text-blue-800">Movimientos</span></button>
                                    </div>
                                </>
                            )}
                            {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit') && <CashDenominationForm type={cashModalMode as 'in' | 'out' | 'audit'} boxName={selectedBox?.name || 'Caja'} onCancel={() => setCashModalMode('menu')} onSubmit={handleCashTransaction} />}
                        </div>
                    </div>
                )
            }

            {/* MODAL PLANTILLA */}
            {
                isStaffModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h3 className="font-bold text-lg text-gray-800">Menú Plantilla</h3><button onClick={() => setIsStaffModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button></div>
                            <div className="flex flex-col">
                                <button onClick={() => router.push('/registros')} className="p-5 text-left hover:bg-blue-50 border-b border-gray-100 flex items-center gap-4 group transition-colors"><div className="bg-blue-100 p-2 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><FileText size={20} /></div><span className="font-bold text-gray-700 text-lg">Registros</span></button>
                                <div className="max-h-72 overflow-y-auto bg-gray-50/50">
                                    <p className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider sticky top-0 bg-gray-50/95 backdrop-blur">Empleados ({allEmployees.length})</p>
                                    {allEmployees.map((emp) => (<button key={emp.id} onClick={() => console.log(`Abrir perfil de ${emp.first_name}`)} className="w-full p-4 text-left hover:bg-white border-b border-gray-100 flex items-center gap-3 text-gray-700 transition-colors"><div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">{emp.first_name.substring(0, 1)}</div><span className="font-semibold">{emp.first_name} {emp.last_name}</span></button>))}
                                    {allEmployees.length === 0 && <div className="p-4 text-center text-sm text-gray-400 italic">No hay empleados cargados</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* MODAL PRODUCTO (NUEVO) */}
            {
                isProductModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-lg text-gray-800">Gestión Producto</h3>
                                <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-4">
                                <button onClick={() => router.push('/ingredients')} className="bg-orange-50 border-2 border-orange-100 hover:border-orange-400 p-3 rounded-2xl flex flex-col items-center gap-2 group transition-all">
                                    <div className="bg-orange-100 text-orange-600 p-3 rounded-full group-hover:bg-orange-500 group-hover:text-white transition-colors"><Utensils size={24} /></div>
                                    <span className="font-bold text-orange-900 text-sm">Ingredientes</span>
                                </button>
                                <button onClick={() => router.push('/recipes')} className="bg-red-50 border-2 border-red-100 hover:border-red-400 p-3 rounded-2xl flex flex-col items-center gap-2 group transition-all">
                                    <div className="bg-red-100 text-red-600 p-3 rounded-full group-hover:bg-red-500 group-hover:text-white transition-colors"><ChefHat size={24} /></div>
                                    <span className="font-bold text-red-900 text-sm">Recetas</span>
                                </button>
                                <button onClick={() => console.log('Proveedores')} className="bg-blue-50 border-2 border-blue-100 hover:border-blue-400 p-3 rounded-2xl flex flex-col items-center gap-2 group transition-all">
                                    <div className="bg-blue-100 text-blue-600 p-3 rounded-full group-hover:bg-blue-500 group-hover:text-white transition-colors"><Truck size={24} /></div>
                                    <span className="font-bold text-blue-900 text-sm">Proveedores</span>
                                </button>
                                <button onClick={() => console.log('Pedidos')} className="bg-green-50 border-2 border-green-100 hover:border-green-400 p-3 rounded-2xl flex flex-col items-center gap-2 group transition-all">
                                    <div className="bg-green-100 text-green-600 p-3 rounded-full group-hover:bg-green-500 group-hover:text-white transition-colors"><ShoppingCart size={24} /></div>
                                    <span className="font-bold text-green-900 text-sm">Pedidos</span>
                                </button>
                                <button onClick={() => console.log('Inventario')} className="col-span-2 bg-purple-50 border-2 border-purple-100 hover:border-purple-400 p-3 rounded-2xl flex flex-row items-center justify-center gap-3 group transition-all">
                                    <div className="bg-purple-100 text-purple-600 p-2 rounded-full group-hover:bg-purple-500 group-hover:text-white transition-colors"><ClipboardList size={24} /></div>
                                    <span className="font-bold text-purple-900 text-sm">Inventario</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}