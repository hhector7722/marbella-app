'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar, Search, Receipt,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, X, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw, Save,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { getISOWeek, format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
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

    return (
        <div className="pb-24">
            <div className="p-4 md:p-6 w-full max-w-6xl mx-auto space-y-6">

                {/* LAYOUT PRINCIPAL: 2 COLUMNAS VERTICALES EN ESCRITORIO */}
                <div className="flex flex-col md:flex-row gap-6 items-start">

                    {/* COLUMNA IZQUIERDA: CIERRE + NAV CARDS */}
                    <div className="flex-1 flex flex-col gap-6">
                        {/* ÚLTIMO CIERRE */}
                        <div id="closure-container" className="bg-white rounded-[2rem] p-5 shadow-xl relative overflow-hidden border border-gray-100 flex flex-col">
                            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-50 p-2 rounded-xl text-blue-600"><CloudSun size={18} /></div>
                                    <div><h3 className="text-sm font-bold text-gray-800">Último Cierre</h3><p className="text-[10px] text-gray-400 capitalize">{dailyStats?.fullDate}</p></div>
                                </div>
                                <Link href="/dashboard/history" className="text-xs font-bold text-[#36606F]">Ver más</Link>
                            </div>

                            <div className="grid grid-cols-2 gap-3 flex-1">
                                {/* Facturación */}
                                <div className="flex flex-col justify-center p-3 bg-white rounded-xl border-2 border-zinc-900 shadow-sm min-h-[50px]">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase leading-none mb-1">Facturación</span>
                                    <span className="text-lg font-black text-black leading-tight">{dailyStats?.facturat.toFixed(0)}€</span>
                                </div>

                                {/* Venta Neta (Relleno Verde) */}
                                <div className="flex flex-col justify-center p-3 bg-emerald-500 rounded-xl shadow-sm min-h-[50px] text-white">
                                    <span className="text-[9px] font-bold text-emerald-100 uppercase leading-none mb-1">Venta Neta</span>
                                    <span className="text-lg font-black leading-tight">{dailyStats?.vNeta.toFixed(0)}€</span>
                                </div>

                                {/* Ticket Medio (Relleno Azul) */}
                                <div className="flex flex-col justify-center p-3 bg-blue-500 rounded-xl shadow-sm min-h-[50px] text-white">
                                    <span className="text-[9px] font-bold text-blue-100 uppercase leading-none mb-1">Ticket Medio</span>
                                    <span className="text-lg font-black leading-tight">{dailyStats?.ticketMedio.toFixed(2)}€</span>
                                </div>

                                {/* Coste M.Obra con indicador (Dinámico) */}
                                <div className={cn("flex flex-col justify-center p-3 rounded-xl shadow-sm min-h-[50px] text-white relative overflow-hidden", dailyStats?.laborCostBg)}>
                                    <div className="flex justify-between items-start">
                                        <span className="text-[9px] font-bold text-white/80 uppercase leading-none mb-1">Coste M.Obra</span>
                                        <div className="w-7 h-7 relative shrink-0">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle cx="50%" cy="50%" r={11} stroke="white" strokeWidth="2" fill="transparent" opacity="0.3" />
                                                <circle cx="50%" cy="50%" r={11} stroke="white" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 11} strokeDashoffset={(2 * Math.PI * 11) - (laborPercent / 100) * (2 * Math.PI * 11)} strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[6px] font-black text-white">{laborPercent.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-lg font-black leading-tight">{dailyStats?.costeManoObra.toFixed(0)}€</span>
                                </div>
                            </div>
                        </div>

                        {/* NAV CARDS (IZQUIERDA ABAJO) */}
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { title: 'Asistencia', icon: <ClipboardList size={18} />, color: 'bg-emerald-50 text-emerald-600', link: '/registros' },
                                { title: 'Coste Mano Obra', icon: <Clock size={18} />, color: 'bg-blue-50 text-blue-600', link: '/dashboard/labor' },
                                { title: 'Plantilla', icon: <Users size={18} />, color: 'bg-purple-50 text-purple-600', link: '/staff' },
                                { title: 'Producto', icon: <Search size={18} />, color: 'bg-orange-50 text-orange-600', link: '/ingredients' },
                            ].map((card, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (card.title === 'Plantilla') setIsStaffModalOpen(true);
                                        else if (card.title === 'Producto') setIsProductModalOpen(true);
                                    }}
                                    className="bg-white rounded-3xl p-5 shadow-lg border border-gray-50 flex flex-col items-center justify-center gap-3 hover:translate-y-[-4px] transition-all hover:shadow-xl active:scale-95 group w-full"
                                >
                                    {card.link && card.title !== 'Plantilla' && card.title !== 'Producto' ? (
                                        <Link href={card.link} className="flex flex-col items-center justify-center gap-3">
                                            <div className={`p-3 rounded-2xl ${card.color} group-hover:scale-110 transition-transform`}>{card.icon}</div>
                                            <span className="text-xs font-black text-gray-800 uppercase tracking-wider">{card.title}</span>
                                        </Link>
                                    ) : (
                                        <>
                                            <div className={`p-3 rounded-2xl ${card.color} group-hover:scale-110 transition-transform`}>{card.icon}</div>
                                            <span className="text-xs font-black text-gray-800 uppercase tracking-wider">{card.title}</span>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: TESORERÍA + HORAS EXTRAS */}
                    <div className="flex-1 flex flex-col gap-6 w-full">
                        {/* SECCIÓN TESORERÍA */}
                        <div id="treasury-container" className="flex flex-col gap-4">
                            {/* CAJA INICIAL */}
                            <div className="bg-white rounded-[2.5rem] p-1 shadow-xl relative overflow-hidden border border-gray-100 flex flex-col">
                                <div className="p-4 flex flex-col flex-1">
                                    {boxes.filter(b => b.type === 'operational').map(box => (
                                        <div key={box.id} className="flex flex-col flex-1">
                                            {/* CABECERA BOX: SIEMPRE VISIBLE */}
                                            <button
                                                onClick={() => { setSelectedBox(box); setCashModalMode('menu'); }}
                                                className="w-full px-5 py-4 rounded-[1.8rem] bg-emerald-500 shadow-lg hover:bg-emerald-600 transition-all cursor-pointer flex flex-row items-center justify-between text-white mb-6"
                                            >
                                                <span className="text-[11px] font-black uppercase tracking-widest">Caja Inicial</span>
                                                <span className="text-3xl font-black">{box.current_balance.toFixed(2)}€</span>
                                            </button>

                                            {/* MOVIMIENTOS: EXPANDIBLES */}
                                            <div className="flex flex-col flex-1 min-h-0">
                                                <div className="flex justify-between items-center px-2 mb-3">
                                                    <button
                                                        onClick={() => setIsMovementsExpanded(!isMovementsExpanded)}
                                                        className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                                                    >
                                                        Movimientos
                                                        <ChevronDown size={14} className={cn("transition-transform duration-200", isMovementsExpanded && "rotate-180")} />
                                                    </button>
                                                    <Link href="/dashboard/movements" className="text-[10px] font-black text-[#36606F] bg-gray-50 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all flex items-center gap-1 uppercase">
                                                        Ver más <ArrowRight size={10} />
                                                    </Link>
                                                </div>

                                                <div className={cn(
                                                    "overflow-hidden transition-all duration-300",
                                                    isMovementsExpanded ? "flex-1 opacity-100" : "h-0 opacity-0"
                                                )}>
                                                    <div className="space-y-2 py-1 max-h-[250px] overflow-y-auto no-scrollbar">
                                                        {boxMovements.length === 0 && <p className="text-[9px] text-gray-300 italic px-1 text-center py-4">Sin historial reciente</p>}
                                                        {boxMovements.map(mov => (
                                                            <div key={mov.id} className="flex justify-between items-center text-[11px] bg-gray-50 p-3 rounded-2xl border border-gray-100/50">
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    {mov.type === 'expense' ? <ArrowUpRight size={12} className="text-rose-400 shrink-0" /> : <ArrowDownLeft size={12} className="text-emerald-500 shrink-0" />}
                                                                    <span className="truncate max-w-[140px] text-gray-600 font-medium">{mov.notes || 'Sin nota'}</span>
                                                                </div>
                                                                <span className={cn("font-black", mov.type === 'expense' ? 'text-rose-500' : 'text-emerald-600')}>
                                                                    {mov.type === 'expense' ? '-' : '+'}{mov.amount.toFixed(2)}€
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* CAJAS DE CAMBIO */}
                            <div className="grid grid-cols-2 gap-4 h-24">
                                {boxes.filter(b => b.type === 'change').slice(0, 2).map((box, idx) => (
                                    <button
                                        key={box.id}
                                        onClick={() => { setSelectedBox(box); setCashModalMode('menu'); }}
                                        className="bg-white rounded-[2rem] p-4 shadow-lg border border-gray-100 hover:shadow-xl transition-all active:scale-95 flex flex-col justify-center items-center text-center group"
                                    >
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Cambio {idx + 1}</span>
                                        <span className="text-lg font-black text-[#36606F] group-hover:scale-105 transition-transform">{box.current_balance.toFixed(2)}€</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* HORAS EXTRAS (COMPACTO) */}
                        <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-gray-100 flex flex-col gap-6">
                            <div className="flex justify-between items-center px-1">
                                <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Horas Extras</h2>
                                <Link href="/dashboard/overtime" className="text-[10px] font-black text-purple-600 uppercase hover:underline transition-all">Ver más</Link>
                            </div>

                            <div className="space-y-3">
                                {overtimeData.slice(0, 3).map((week) => {
                                    const isFullyPaid = isWeekFullyPaid(week);

                                    return (
                                        <div key={week.weekId} className="bg-[#5E35B1] rounded-[2rem] shadow-sm border border-white/10 overflow-hidden">
                                            {/* CABECERA SEMANA */}
                                            <button
                                                onClick={() => toggleWeek(week.weekId)}
                                                className="w-full p-4 flex items-center justify-between text-left group hover:bg-white/5 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-110 shrink-0",
                                                        isFullyPaid ? "bg-emerald-500" : "bg-orange-400"
                                                    )}>
                                                        {isFullyPaid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-black text-white">Sem {getISOWeek(new Date(week.weekId))}</h4>
                                                        <span className="text-purple-300 font-light mx-0.5">•</span>
                                                        <p className="text-[10px] font-bold text-purple-200 uppercase pt-0.5">
                                                            {format(new Date(week.weekId), "d MMM", { locale: es })} - {format(addDays(new Date(week.weekId), 6), "d MMM", { locale: es })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex items-center gap-3">
                                                    <span className="text-lg font-black text-white">{week.total.toFixed(0)}€</span>
                                                </div>
                                            </button>

                                            {/* LISTA TRABAJADORES (EXPANDIBLE) */}
                                            {week.expanded && (
                                                <div className="px-4 pb-4 pt-1 space-y-2 animate-in slide-in-from-top-2 duration-300">
                                                    {week.staff.map((s: any) => (
                                                        <div key={s.id} className="flex items-center justify-between p-3 bg-white/60 rounded-2xl border border-purple-100/30">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-purple-100 text-[#5E35B1] flex items-center justify-center text-xs font-black capitalize">
                                                                    {s.name.charAt(0)}
                                                                </div>
                                                                <span className="text-xs font-bold text-gray-700 capitalize">{s.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xs font-black text-gray-800">{s.amount.toFixed(0)}€</span>
                                                                <button
                                                                    onClick={(e) => togglePaid(e, week.weekId, s.id)}
                                                                    className={cn(
                                                                        "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90",
                                                                        paidStatus[`${week.weekId}-${s.id}`]
                                                                            ? "bg-emerald-500 text-white shadow-md"
                                                                            : "bg-white border-2 border-gray-200 text-transparent"
                                                                    )}
                                                                >
                                                                    <CheckCircle2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
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
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsStaffModalOpen(false)}>
                        <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                                <h3 className="font-black text-xl text-gray-800 uppercase tracking-tight">Plantilla</h3>
                                <button onClick={() => setIsStaffModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-2 rounded-full shadow-sm">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-4 bg-gray-50/30">
                                <p className="px-2 pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Seleccionar Empleado ({allEmployees.length})
                                </p>

                                <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pb-2">
                                    {allEmployees.map((emp) => (
                                        <button
                                            key={emp.id}
                                            onClick={() => router.push(`/profile?id=${emp.id}`)}
                                            className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#5B8FB9]/30 transition-all active:scale-95 flex flex-row items-center gap-4 group h-20"
                                        >
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-lg font-black text-[#5B8FB9] shadow-inner group-hover:bg-[#5B8FB9] group-hover:text-white transition-colors capitalize shrink-0">
                                                {emp.first_name.substring(0, 1)}
                                            </div>
                                            <span className="font-black text-sm text-gray-700 text-left capitalize truncate flex-1">
                                                {emp.first_name}
                                            </span>
                                        </button>
                                    ))}

                                    {allEmployees.length === 0 && (
                                        <div className="col-span-2 p-8 text-center text-sm text-gray-400 font-bold italic bg-white rounded-3xl border border-dashed border-gray-200">
                                            No hay empleados cargados
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* MODAL PRODUCTO (REFINADO) */}
            {
                isProductModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setIsProductModalOpen(false)}>
                        <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                                <h3 className="font-black text-xl text-gray-800 uppercase tracking-tight">Producto</h3>
                                <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-2 rounded-full shadow-sm">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30">
                                <button onClick={() => router.push('/recipes')} className="bg-white border border-gray-100 p-4 rounded-3xl flex flex-col items-center gap-3 group shadow-sm hover:shadow-md transition-all active:scale-95">
                                    <div className="bg-red-50 text-red-500 p-3 rounded-2xl group-hover:bg-red-500 group-hover:text-white transition-all">
                                        <ChefHat size={24} />
                                    </div>
                                    <span className="font-black text-sm text-gray-700">Recetas</span>
                                </button>

                                <button onClick={() => router.push('/ingredients')} className="bg-white border border-gray-100 p-4 rounded-3xl flex flex-col items-center gap-3 group shadow-sm hover:shadow-md transition-all active:scale-95">
                                    <div className="bg-orange-50 text-orange-500 p-3 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-all">
                                        <Utensils size={24} />
                                    </div>
                                    <span className="font-black text-sm text-gray-700">Ingredientes</span>
                                </button>

                                <button onClick={() => toast.info('Pedidos próximamente')} className="bg-white border border-gray-100 p-4 rounded-3xl flex flex-col items-center gap-3 group shadow-sm hover:shadow-md transition-all active:scale-95">
                                    <div className="bg-green-50 text-green-500 p-3 rounded-2xl group-hover:bg-green-500 group-hover:text-white transition-all">
                                        <ShoppingCart size={24} />
                                    </div>
                                    <span className="font-black text-sm text-gray-700">Pedidos</span>
                                </button>

                                <button onClick={() => toast.info('Inventario próximamente')} className="bg-white border border-gray-100 p-4 rounded-3xl flex flex-col items-center gap-3 group shadow-sm hover:shadow-md transition-all active:scale-95">
                                    <div className="bg-purple-50 text-purple-500 p-3 rounded-2xl group-hover:bg-purple-500 group-hover:text-white transition-all">
                                        <ClipboardList size={24} />
                                    </div>
                                    <span className="font-black text-sm text-gray-700">Inventario</span>
                                </button>

                                <button onClick={() => toast.info('Stock próximamente')} className="bg-white border border-gray-100 p-4 rounded-3xl flex flex-col items-center gap-3 group shadow-sm hover:shadow-md transition-all active:scale-95">
                                    <div className="bg-blue-50 text-blue-500 p-3 rounded-2xl group-hover:bg-blue-500 group-hover:text-white transition-all">
                                        <Package size={24} />
                                    </div>
                                    <span className="font-black text-sm text-gray-700">Stock</span>
                                </button>

                                <button onClick={() => toast.info('Proveedores próximamente')} className="bg-white border border-gray-100 p-4 rounded-3xl flex flex-col items-center gap-3 group shadow-sm hover:shadow-md transition-all active:scale-95">
                                    <div className="bg-zinc-50 text-zinc-500 p-3 rounded-2xl group-hover:bg-zinc-900 group-hover:text-white transition-all">
                                        <Truck size={24} />
                                    </div>
                                    <span className="font-black text-sm text-gray-700">Proveedores</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}