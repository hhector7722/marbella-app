'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar, Search, Receipt,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, X, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw, Save,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart, ArrowLeft, ArrowRightLeft,
    PlusCircle, ArrowDown, ArrowUp, Plus as PlusIcon, Minus as MinusIcon
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import Link from 'next/link';
import { getISOWeek, format, addDays, startOfWeek, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { togglePaidStatus } from '@/app/actions/overtime';

const CURRENCY_IMAGES: Record<number, string> = {
    100: '/currency/100e-Photoroom.png',
    50: '/currency/50e-Photoroom.png',
    20: '/currency/20-Photoroom.png',
    10: '/currency/10e-Photoroom.png',
    5: '/currency/5eur-Photoroom.png',
    2: '/currency/2eur-Photoroom.png',
    1: '/currency/1eur-Photoroom.png',
    0.50: '/currency/50ct-Photoroom.png',
    0.20: '/currency/20ct-Photoroom.png',
    0.10: '/currency/10ct-Photoroom.png',
    0.05: '/currency/5ct-Photoroom.png',
    0.02: '/currency/2ct-Photoroom.png',
    0.01: '/currency/1ct-Photoroom.png',
};

const CashDenominationForm = ({ type, boxName, onSubmit, onCancel, initialCounts = {}, availableStock = {} }: { type: 'in' | 'out' | 'audit', boxName: string, onSubmit: (total: number, breakdown: any, notes: string) => void, onCancel: () => void, initialCounts?: any, availableStock?: Record<number, number> }) => {
    const DENOMINATIONS = [100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];
    const [counts, setCounts] = useState<Record<number, number>>(initialCounts);
    const [notes, setNotes] = useState('');
    const calculateTotal = () => DENOMINATIONS.reduce((acc, val) => acc + (val * (counts[val] || 0)), 0);
    const handleCountChange = (val: number, qty: string) => setCounts(prev => ({ ...prev, [val]: parseInt(qty) || 0 }));
    const total = calculateTotal();
    const isAudit = type === 'audit';
    const bgClass = isAudit ? 'bg-orange-400' : (type === 'in' ? 'bg-emerald-400' : 'bg-rose-400');

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="bg-[#5B8FB9] px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                <div>
                    <h3 className="text-lg font-black uppercase tracking-wider">{isAudit ? 'Arqueo' : (type === 'in' ? 'Entrada' : 'Salida')}</h3>
                    <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">{boxName}</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <span className="block text-[8px] uppercase tracking-widest opacity-50 font-black">Total Acumulado</span>
                        <span className="text-xl font-black">{total.toFixed(2)}€</span>
                    </div>
                </div>
                <button onClick={onCancel} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {!isAudit && (
                    <div className="px-2">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5 ml-1">Concepto / Motivo</label>
                        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Cambio banco, Pago proveedor..." className="w-full p-2.5 rounded-xl border-2 border-transparent focus:border-[#5B8FB9]/20 bg-white shadow-sm outline-none transition-all font-bold placeholder:text-gray-300 text-xs" />
                    </div>
                )}
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                    {DENOMINATIONS.map(denom => (
                        <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                            <div className={cn("w-full flex items-center justify-center transition-transform group-hover:scale-110", denom >= 5 ? "h-14" : "h-10")}>
                                <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={140} height={140} className="h-full w-auto object-contain drop-shadow-lg" />
                            </div>
                            <div className="text-center w-full">
                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
                                <input type="number" min="0" value={counts[denom] || ''} onChange={(e) => handleCountChange(denom, e.target.value)} placeholder="0" className={cn("w-full bg-white border-2 rounded-xl p-1.5 text-center font-black outline-none text-xs focus:ring-4 transition-all shadow-sm", type === 'out' && (counts[denom] || 0) > (availableStock[denom] || 0) ? "border-rose-400 text-rose-600 focus:ring-rose-100" : "border-transparent focus:border-[#5B8FB9]/20 text-[#5B8FB9] focus:ring-[#5B8FB9]/5")} />
                                {type === 'out' && (availableStock[denom] || 0) > 0 && <span className="text-[7px] font-bold text-gray-400 uppercase">Disp: {availableStock[denom]}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-3 bg-white border-t flex gap-2 shrink-0">
                <button onClick={onCancel} className="flex-1 py-3 text-gray-500 font-black uppercase tracking-widest text-[9px] hover:bg-gray-100 rounded-xl transition-all active:scale-95">Cancelar</button>
                <button onClick={() => onSubmit(total, counts, notes)} disabled={type === 'out' && Object.entries(counts).some(([denom, qty]) => qty > (availableStock[Number(denom)] || 0))} className={cn("flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95", type === 'out' && Object.entries(counts).some(([denom, qty]) => qty > (availableStock[Number(denom)] || 0)) ? "bg-gray-300 opacity-50 cursor-not-allowed shadow-none" : bgClass + " hover:brightness-110 shadow-emerald-200")}><Save size={18} strokeWidth={3} />{isAudit ? 'Ajustar Arqueo' : 'Confirmar Operación'}</button>
            </div>
        </div>
    );
};

const SwapDenominationForm = ({ boxName, onSubmit, onCancel, availableStock = {} }: { boxName: string, onSubmit: (total: number, inBreakdown: any, outBreakdown: any) => void, onCancel: () => void, availableStock?: Record<number, number> }) => {
    const BILLS = [100, 50, 20, 10, 5];
    const COINS = [2, 1, 0.50, 0.20, 0.10];
    const ALL_DENOMS = [...BILLS, ...COINS];

    const [inCounts, setInCounts] = useState<Record<number, number>>({});
    const [outCounts, setOutCounts] = useState<Record<number, number>>({});

    const totalIn = ALL_DENOMS.reduce((acc, val) => acc + (val * (inCounts[val] || 0)), 0);
    const totalOut = ALL_DENOMS.reduce((acc, val) => acc + (val * (outCounts[val] || 0)), 0);
    const hasStockIssue = Object.entries(outCounts).some(([d, q]) => q > (availableStock[Number(d)] || 0));
    const diff = totalIn - totalOut;

    const handleAdjust = (denom: number, side: 'in' | 'out', delta: number) => {
        if (side === 'in') {
            setInCounts(prev => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
        } else {
            setOutCounts(prev => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
        }
    };

    const renderDenomRow = (denom: number) => (
        <div key={denom} className="flex items-center gap-1 md:gap-4 mb-2 group justify-center">
            {/* ENTRA SECTION (MINI) */}
            <div className="flex items-center gap-1 bg-gray-50/50 p-0.5 rounded-lg border border-gray-100 shadow-sm">
                <button
                    onClick={() => handleAdjust(denom, 'in', -1)}
                    className="w-5 h-5 flex items-center justify-center bg-rose-500 text-white rounded-md active:scale-90 transition-transform shadow-sm"
                >
                    <MinusIcon size={10} strokeWidth={4} />
                </button>
                <input
                    type="number" min="0"
                    value={inCounts[denom] || ''}
                    onChange={(e) => setInCounts(p => ({ ...p, [denom]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-8 text-center text-xs font-black bg-transparent outline-none text-emerald-600"
                />
                <button
                    onClick={() => handleAdjust(denom, 'in', 1)}
                    className="w-5 h-5 flex items-center justify-center bg-emerald-500 text-white rounded-md active:scale-90 transition-transform shadow-sm"
                >
                    <PlusIcon size={10} strokeWidth={4} />
                </button>
            </div>

            {/* CURRENCY IMAGE (LARGE) */}
            <div className="flex flex-col items-center justify-center w-20 shrink-0">
                <div className="relative h-10 md:h-12 flex items-center justify-center">
                    <Image
                        src={CURRENCY_IMAGES[denom]}
                        alt={`${denom}€`}
                        width={80}
                        height={60}
                        className="h-full w-auto object-contain drop-shadow-sm scale-110"
                    />
                </div>
                <span className="text-[8px] font-black text-gray-400 mt-[-2px] uppercase">{denom >= 5 ? `${denom}€` : denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
            </div>

            {/* SALE SECTION (MINI) */}
            <div className="flex items-center gap-1 bg-gray-50/50 p-0.5 rounded-lg border border-gray-100 shadow-sm">
                <button
                    onClick={() => handleAdjust(denom, 'out', -1)}
                    className="w-5 h-5 flex items-center justify-center bg-rose-500 text-white rounded-md active:scale-90 transition-transform shadow-sm"
                >
                    <MinusIcon size={10} strokeWidth={4} />
                </button>
                <input
                    type="number" min="0"
                    value={outCounts[denom] || ''}
                    onChange={(e) => setOutCounts(p => ({ ...p, [denom]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-8 text-center text-xs font-black bg-transparent outline-none text-rose-600"
                />
                <button
                    onClick={() => handleAdjust(denom, 'out', 1)}
                    className="w-5 h-5 flex items-center justify-center bg-emerald-500 text-white rounded-md active:scale-90 transition-transform shadow-sm"
                >
                    <PlusIcon size={10} strokeWidth={4} />
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white">
            {/* STICKY HEADER WITH FUSED TOTALS & ACTION */}
            <div className="bg-[#36606F] shrink-0 shadow-md z-10">
                <div className="px-6 py-2 flex items-center justify-between border-b border-white/5">
                    <div className="flex flex-col">
                        <h2 className="text-base font-black text-white uppercase tracking-wider leading-tight">Cambio Efectivo</h2>
                        <p className="text-white/60 text-[8px] font-bold uppercase tracking-widest leading-none">{boxName}</p>
                    </div>
                    <button onClick={onCancel} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white">
                        <X size={18} />
                    </button>
                </div>

                {/* FUSED TOTALS & CONFIRM BAR */}
                <div className="bg-white/5 backdrop-blur-sm px-4 py-2 flex items-center justify-between gap-2">
                    <div className="flex flex-col items-start min-w-[60px]">
                        <span className="text-[7px] font-black text-white/40 uppercase">Entra</span>
                        <span className="text-sm font-black text-emerald-400 leading-none">{totalIn.toFixed(2)}€</span>
                    </div>

                    <div className="flex-1 flex items-center justify-center gap-2">
                        <div className={`px-2 py-1 rounded-lg font-black text-[9px] transition-all ${Math.abs(diff) < 0.01 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                            DIF: {diff.toFixed(2)}€
                        </div>

                        <button
                            onClick={() => onSubmit((totalIn - totalOut), inCounts, outCounts)}
                            disabled={Math.abs(diff) > 0.01 || (totalIn === 0 && totalOut === 0) || hasStockIssue}
                            className={`
                                h-8 px-4 rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-[0.95]
                                ${(Math.abs(diff) < 0.01 && (totalIn > 0 || totalOut > 0) && !hasStockIssue)
                                    ? 'bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer'
                                    : 'bg-white/10 text-white/20 cursor-not-allowed shadow-none'}
                            `}
                        >
                            {hasStockIssue ? 'STOCK!' : 'OK'}
                        </button>
                    </div>

                    <div className="flex flex-col items-end min-w-[60px]">
                        <span className="text-[7px] font-black text-white/40 uppercase">Sale</span>
                        <span className="text-sm font-black text-rose-400 leading-none">{totalOut.toFixed(2)}€</span>
                    </div>
                </div>
            </div>

            {/* SCROLLABLE CONTENT (MAXIMIZED) */}
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-white">
                <div className="max-w-md mx-auto py-1">
                    {ALL_DENOMS.map(renderDenomRow)}
                    {/* SPACER TO ENSURE LAST ITEM IS FULLY VISIBLE */}
                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
};




const BoxInventoryView = ({ boxName, inventory, onBack }: { boxName: string, inventory: any[], onBack: () => void }) => {
    const total = inventory.reduce((sum, item) => sum + (item.denomination * item.quantity), 0);
    return (
        <div className="flex flex-col h-full bg-white">
            <div className="bg-[#5B8FB9] px-8 py-4 flex justify-between items-center text-white shrink-0">
                <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Inventario de Efectivo</span><h3 className="text-lg font-black uppercase tracking-wider mt-1">{boxName}</h3></div>
                <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><ArrowLeft size={20} strokeWidth={3} /></button>
            </div>
            <div className="p-6 bg-gray-50 border-b flex justify-between items-center shrink-0"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total en Caja</span><span className="text-3xl font-black text-[#5B8FB9]">{total.toFixed(2)}€</span></div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                    {inventory.sort((a, b) => b.denomination - a.denomination).map((item, idx) => (
                        <div key={idx} className="bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2"><div className="h-8 w-8 flex items-center justify-center"><Image src={CURRENCY_IMAGES[item.denomination]} alt={`${item.denomination}€`} width={40} height={40} className="object-contain" /></div><span className="font-black text-gray-700 text-xs">{item.denomination < 1 ? (item.denomination * 100).toFixed(0) + 'c' : item.denomination + '€'}</span></div>
                            <div className="text-right"><span className="text-xl font-black text-[#5B8FB9] leading-none">x{item.quantity}</span><p className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter">{(item.denomination * item.quantity).toFixed(2)}€</p></div>
                        </div>
                    ))}
                    {inventory.length === 0 && <div className="col-span-2 py-20 text-center"><p className="text-gray-300 font-bold uppercase tracking-widest text-xs">Caja vacía</p></div>}
                </div>
            </div>
        </div>
    );
};

export default function AdminDashboardView() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [dailyStats, setDailyStats] = useState<any>(null);
    const [boxes, setBoxes] = useState<any[]>([]);
    const [boxMovements, setBoxMovements] = useState<any[]>([]);
    const [overtimeData, setOvertimeData] = useState<any[]>([]);
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'menu' | 'in' | 'out' | 'audit' | 'swap' | 'inventory'>('none');
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>({});
    const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [isNewWorkerModalOpen, setIsNewWorkerModalOpen] = useState(false);
    const [newWorkerSaving, setNewWorkerSaving] = useState(false);
    const [newWorkerData, setNewWorkerData] = useState({ first_name: '', last_name: '', email: '', role: 'staff', contracted_hours_weekly: 40, overtime_cost_per_hour: 0 });

    const handleCreateWorker = async () => {
        if (!newWorkerData.first_name.trim()) { toast.error('El nombre es obligatorio'); return; }
        setNewWorkerSaving(true);
        try {
            const { data, error } = await supabase.rpc('create_worker_profile', {
                p_first_name: newWorkerData.first_name.trim(),
                p_last_name: newWorkerData.last_name.trim() || null,
                p_email: newWorkerData.email.trim() || null,
                p_role: newWorkerData.role,
                p_contracted_hours_weekly: newWorkerData.contracted_hours_weekly,
                p_overtime_cost_per_hour: newWorkerData.overtime_cost_per_hour,
            });
            if (error) throw error;
            toast.success(`${newWorkerData.first_name} añadido correctamente`);
            setIsNewWorkerModalOpen(false);
            setNewWorkerData({ first_name: '', last_name: '', email: '', role: 'staff', contracted_hours_weekly: 40, overtime_cost_per_hour: 0 });
            fetchData();
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error al crear trabajador');
        } finally {
            setNewWorkerSaving(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const toggleWeek = (weekId: string) => setOvertimeData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));
    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        const newStatus = !paidStatus[key];
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        try {
            const weekData = overtimeData.find(w => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s: any) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, { totalHours: staffData?.hours || 0, overtimeHours: staffData?.hours || 0 });
            if (!result.success) throw new Error("Error updating paid status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar pago");
            setPaidStatus(prev => ({ ...prev, [key]: !newStatus }));
        }
    };

    const isWeekFullyPaid = (week: any) => {
        if (!week.staff || week.staff.length === 0) return false;
        return week.staff.every((s: any) => paidStatus[`${week.weekId}-${s.id}`]);
    };

    async function fetchData() {
        try {
            const { data: lastClose } = await supabase.from('cash_closings').select('*').order('closed_at', { ascending: false }).limit(1).single();
            if (lastClose) {
                const closeDate = new Date(lastClose.closed_at);
                const closeDateStart = new Date(closeDate); closeDateStart.setHours(0, 0, 0, 0);
                const closeDateEnd = new Date(closeDate); closeDateEnd.setHours(23, 59, 59, 999);
                const { data: dayLogs } = await supabase.from('time_logs').select('user_id, total_hours').gte('clock_in', closeDateStart.toISOString()).lte('clock_in', closeDateEnd.toISOString()).not('clock_out', 'is', null);
                const { data: allProfiles } = await supabase.from('profiles').select('id, role, regular_cost_per_hour, overtime_cost_per_hour, contracted_hours_weekly');
                let laborCost = 0;
                const profileMap = new Map(allProfiles?.map(p => [p.id, p]) || []);
                const countedManagers = new Set<string>();
                const userDayHours = new Map<string, number>();
                dayLogs?.forEach(log => {
                    const current = userDayHours.get(log.user_id) || 0;
                    userDayHours.set(log.user_id, current + (log.total_hours || 0));
                });
                userDayHours.forEach((hours, userId) => {
                    const profile = profileMap.get(userId);
                    if (profile) {
                        const dailyContracted = (profile.contracted_hours_weekly || 40) / 5;
                        const regPrice = profile.regular_cost_per_hour || 0;
                        const overPrice = profile.overtime_cost_per_hour || regPrice;
                        if (profile.role === 'manager') { laborCost += dailyContracted * regPrice; laborCost += hours * overPrice; countedManagers.add(userId); }
                        else { if (hours > dailyContracted) { laborCost += dailyContracted * regPrice; laborCost += (hours - dailyContracted) * overPrice; } else { laborCost += hours * regPrice; } }
                    }
                });
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
                    laborCostBg: laborPercent > 35 ? 'bg-rose-500' : (laborPercent > 30 ? 'bg-orange-400' : 'bg-emerald-500'),
                    laborCostColor: laborPercent > 35 ? 'text-rose-600' : (laborPercent > 30 ? 'text-orange-500' : 'text-emerald-600')
                });
            }
            const { data: allBoxes } = await supabase.from('cash_boxes').select('*').order('name');
            if (allBoxes) {
                const sorted = allBoxes.sort((a, b) => a.type === 'operational' ? -1 : 1);
                setBoxes(sorted);
                const opBox = sorted.find(b => b.type === 'operational');
                if (opBox) {
                    const { data: moves } = await supabase.from('treasury_log').select('*').eq('box_id', opBox.id).order('created_at', { ascending: false }).limit(3);
                    setBoxMovements(moves || []);
                }
            }
            const d = new Date(); d.setDate(d.getDate() - 60);
            const { data: logs } = await supabase.from('time_logs').select('user_id, total_hours, clock_in').gte('clock_in', d.toISOString());
            const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, role, overtime_cost_per_hour, contracted_hours_weekly, is_fixed_salary, hours_balance, prefer_stock_hours');
            const { data: snapshots } = await supabase.from('weekly_snapshots').select('user_id, week_start, is_paid, final_balance, balance_hours, pending_balance').gte('week_start', format(d, 'yyyy-MM-dd'));
            if (profiles) setAllEmployees(profiles);
            if (logs && profiles) {
                const profileMap = new Map(profiles.map(p => [p.id, p]));
                const weekUserHoursMap = new Map<string, Map<string, number>>();
                logs.forEach(log => {
                    const date = new Date(log.clock_in);
                    const monday = startOfWeek(date, { weekStartsOn: 1 }); monday.setHours(0, 0, 0, 0);
                    const weekLabelId = format(monday, 'yyyy-MM-dd');
                    if (!weekUserHoursMap.has(weekLabelId)) weekUserHoursMap.set(weekLabelId, new Map());
                    const userMap = weekUserHoursMap.get(weekLabelId)!;
                    userMap.set(log.user_id, (userMap.get(log.user_id) || 0) + (log.total_hours || 0));
                });
                const sortedWeekIds = Array.from(weekUserHoursMap.keys()).sort().filter(id => id < format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
                const userFinalBalances = new Map<string, Map<string, number>>();
                const weeksMap = new Map<string, any>();
                const initialPaidStatus: Record<string, boolean> = {};
                sortedWeekIds.forEach(weekLabelId => {
                    const userMap = weekUserHoursMap.get(weekLabelId)!;
                    const monday = parseISO(weekLabelId);
                    const prevWeekId = format(addDays(monday, -7), 'yyyy-MM-dd');
                    if (!weeksMap.has(weekLabelId)) weeksMap.set(weekLabelId, { weekId: weekLabelId, total: 0, expanded: false, staff: [] });
                    const weekEntry = weeksMap.get(weekLabelId);
                    if (!userFinalBalances.has(weekLabelId)) userFinalBalances.set(weekLabelId, new Map());
                    userMap.forEach((totalHours, userId) => {
                        const userProfile = profileMap.get(userId);
                        if (userProfile) {
                            const contractedHours = userProfile.contracted_hours_weekly || 40;
                            const isManager = userProfile.role === 'manager';
                            const isFixedSalary = userProfile.is_fixed_salary || false;
                            const preferStock = userProfile.prefer_stock_hours || false;
                            const weeklyBalance = (isManager || isFixedSalary) ? totalHours : (totalHours - contractedHours);
                            let pendingBalance = 0;
                            const prevSnapshot = snapshots?.find(s => s.user_id === userId && s.week_start === prevWeekId);
                            if (prevSnapshot?.final_balance !== null && prevSnapshot?.final_balance !== undefined) pendingBalance = (!preferStock && prevSnapshot.final_balance > 0) ? 0 : prevSnapshot.final_balance;
                            else {
                                const prevBalance = userFinalBalances.get(prevWeekId)?.get(userId) ?? (userProfile.hours_balance || 0);
                                pendingBalance = (!preferStock && prevBalance > 0) ? 0 : prevBalance;
                            }
                            const finalBalance = pendingBalance + weeklyBalance;
                            userFinalBalances.get(weekLabelId)!.set(userId, finalBalance);
                            const cost = (finalBalance > 0 && !preferStock) ? finalBalance * (userProfile.overtime_cost_per_hour || 0) : 0;
                            const isPaid = snapshots?.find(s => s.user_id === userId && s.week_start === weekLabelId)?.is_paid || false;
                            weekEntry.staff.push({ id: userId, name: userProfile.first_name, amount: cost, hours: finalBalance });
                            initialPaidStatus[`${weekLabelId}-${userId}`] = isPaid;
                            weekEntry.total += cost;
                        }
                    });
                });
                setPaidStatus(initialPaidStatus);
                setOvertimeData(Array.from(weeksMap.values()).sort((a, b) => b.weekId.localeCompare(a.weekId)));
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    const handleCashTransaction = async (total: number, breakdown: any, notesOrOutBreakdown: any) => {
        try {
            if (!selectedBox) return;
            if (cashModalMode === 'audit') await supabase.from('treasury_log').insert({ box_id: selectedBox.id, type: 'ADJUSTMENT', amount: total, breakdown: breakdown, notes: 'Arqueo de caja' });
            else if (cashModalMode === 'swap') await supabase.from('treasury_log').insert({ box_id: selectedBox.id, type: 'SWAP', amount: total, breakdown: { in: breakdown, out: notesOrOutBreakdown }, notes: `Cambio: Entra ${total.toFixed(2)}€` });
            else await supabase.from('treasury_log').insert({ box_id: selectedBox.id, type: cashModalMode === 'in' ? 'IN' : 'OUT', amount: total, breakdown: breakdown, notes: notesOrOutBreakdown as string });
            setCashModalMode('none'); setSelectedBox(null); fetchData();
        } catch (error) { console.error(error); alert("Error"); }
    };

    if (loading) return <div className="p-8 text-white flex items-center gap-2 rounded-3xl bg-white/10 backdrop-blur-md"><div className="w-4 h-4 bg-white animate-pulse rounded-full"></div> Cargando...</div>;

    const laborPercent = dailyStats?.porcentajeManoObra || 0;

    return (
        <div className="pb-24 animate-in fade-in duration-500">
            <div className="p-4 md:p-6 w-full max-w-6xl mx-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    <div className="bg-white rounded-[2.5rem] p-4 md:p-6 shadow-xl border border-gray-100 flex flex-col md:min-h-[380px]">
                        <div className="flex justify-between items-center mb-4 md:mb-8">
                            <div className="flex items-center gap-2 md:gap-3">
                                <div className="bg-blue-600 text-white p-2 md:p-2.5 rounded-xl md:rounded-2xl shadow-md"><CloudSun className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" /></div>
                                <div><h3 className="text-[10px] md:text-sm font-black text-gray-800 uppercase tracking-wider">Último Cierre</h3><p className="text-[8px] md:text-[10px] text-gray-400 font-bold capitalize">{dailyStats?.fullDate}</p></div>
                            </div>
                            <div className="flex items-center gap-2 md:gap-4">
                                <button onClick={() => setIsClosingModalOpen(true)} className="p-2 md:p-3 bg-blue-50 text-blue-600 rounded-xl md:rounded-2xl hover:bg-blue-100 transition-all active:scale-90"><Plus className="w-4 h-4 md:w-5 md:h-5" strokeWidth={3} /></button>
                                <Link href="/dashboard/history" className="text-[8px] md:text-[10px] font-black text-blue-600/40 uppercase tracking-widest hover:text-blue-600 transition-colors">Ver más</Link>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-4 md:gap-y-10 gap-x-2 md:gap-x-4 flex-1">
                            {[
                                { val: dailyStats?.facturat > 0 ? `${dailyStats.facturat.toFixed(0)}€` : ' ', label: 'Facturación' },
                                { val: dailyStats?.vNeta > 0 ? `${dailyStats.vNeta.toFixed(0)}€` : ' ', label: 'Venta Neta', color: 'text-emerald-600' },
                                { val: dailyStats?.ticketMedio > 0 ? `${dailyStats.ticketMedio.toFixed(2)}€` : ' ', label: 'Ticket Medio', color: 'text-blue-600' },
                            ].map((item, i) => (
                                <div key={i} className="flex flex-col items-center justify-center text-center">
                                    <span className={cn("text-lg md:text-2xl font-black text-black leading-none", item.color)}>{item.val}</span>
                                    <span className="text-[7px] md:text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{item.label}</span>
                                </div>
                            ))}
                            <div className="flex flex-col items-center justify-center text-center relative">
                                <span className={cn("text-lg md:text-2xl font-black leading-none", dailyStats?.laborCostColor)}>{dailyStats?.costeManoObra > 0 ? `${dailyStats.costeManoObra.toFixed(0)}€` : ' '}</span>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-[7px] md:text-[9px] font-bold text-zinc-400 uppercase tracking-widest">M.Obra</span>
                                    <div className="w-5 h-5 md:w-6 md:h-6 relative shrink-0">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="50%" cy="50%" r="40%" stroke="#f4f4f5" strokeWidth="12%" fill="transparent" />
                                            <circle cx="50%" cy="50%" r="40%" stroke="currentColor" strokeWidth="12%" fill="transparent" strokeDasharray={2 * Math.PI * 12} strokeDashoffset={(2 * Math.PI * 12) - (laborPercent / 100) * (2 * Math.PI * 12)} strokeLinecap="round" className={dailyStats?.laborCostColor} />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center"><span className={cn("text-[5px] md:text-[6px] font-black", dailyStats?.laborCostColor)}>{laborPercent.toFixed(0)}%</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4 md:space-y-6 flex flex-col md:min-h-[380px]">
                        <div className="bg-white rounded-[2.5rem] p-4 shadow-xl border border-gray-100 flex-1 flex flex-col">
                            {boxes.filter(b => b.type === 'operational').map(box => (
                                <div key={box.id} className="flex flex-col h-full">
                                    <button onClick={() => { setSelectedBox(box); setCashModalMode('menu'); }} className="w-full px-6 py-3 md:py-4 rounded-2xl md:rounded-[1.8rem] bg-emerald-500 shadow-lg hover:bg-emerald-600 transition-all cursor-pointer flex flex-row items-center justify-between text-white mb-3 md:mb-4 active:scale-95">
                                        <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em]">Caja Inicial</span>
                                        <span className="text-xl md:text-3xl font-black">{box.current_balance.toFixed(2)}€</span>
                                    </button>
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <div className="flex justify-between items-center px-1 md:px-2 mb-2 md:mb-3">
                                            <button onClick={() => setIsMovementsExpanded(!isMovementsExpanded)} className="flex items-center gap-1 text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Movimientos<ChevronDown className={cn("w-3 h-3 md:w-3.5 md:h-3.5 transition-transform duration-200", isMovementsExpanded && "rotate-180")} /></button>
                                            <Link href="/dashboard/movements" className="text-[8px] md:text-[10px] font-black text-[#5B8FB9] bg-gray-50 px-2 md:px-3 py-1 md:py-1.5 rounded-full hover:bg-gray-100 transition-all flex items-center gap-1 uppercase">Ver más <ArrowRight className="w-2 h-2 md:w-2.5 md:h-2.5" /></Link>
                                        </div>
                                        <div className={cn("overflow-hidden transition-all duration-300", isMovementsExpanded ? "flex-1 opacity-100" : "h-0 opacity-0")}>
                                            <div className="space-y-1.5 md:space-y-2 py-1 max-h-[100px] md:max-h-[140px] overflow-y-auto no-scrollbar">
                                                {boxMovements.length === 0 && <p className="text-[8px] md:text-[9px] text-gray-300 italic px-1 text-center py-2 md:py-4">Sin historial reciente</p>}
                                                {boxMovements.map(mov => (
                                                    <div key={mov.id} className="flex justify-between items-center text-[9px] md:text-[11px] bg-gray-50 p-2 md:p-3 rounded-xl md:rounded-2xl border border-gray-100/50">
                                                        <div className="flex items-center gap-1.5 md:gap-2 overflow-hidden">{mov.type === 'OUT' ? <ArrowUpRight className="w-2.5 h-2.5 md:w-3 md:h-3 text-rose-400 shrink-0" /> : <ArrowDownLeft className="w-2.5 h-2.5 md:w-3 md:h-3 text-emerald-500 shrink-0" />}<span className="truncate max-w-[100px] md:max-w-[140px] text-gray-600 font-medium">{mov.notes || 'Sin nota'}</span></div>
                                                        <span className={cn("font-black", mov.type === 'OUT' ? 'text-rose-500' : 'text-emerald-600')}>{mov.type === 'OUT' ? '-' : '+'}{mov.amount.toFixed(2)}€</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4 md:gap-6 h-12 md:h-16">
                            {boxes.filter(b => b.type === 'change').slice(0, 2).map((box, idx) => (
                                <button key={box.id} onClick={() => { setSelectedBox(box); setCashModalMode('menu'); }} className="bg-white rounded-2xl md:rounded-[1.5rem] p-1.5 md:p-3 shadow-lg border border-gray-100 hover:shadow-xl transition-all active:scale-95 flex flex-col justify-center items-center text-center group"><span className="text-[7px] md:text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5 md:mb-1">Cambio {idx + 1}</span><span className="text-xs md:text-lg font-black text-[#5B8FB9] group-hover:scale-105 transition-transform">{box.current_balance > 0 ? `${box.current_balance.toFixed(2)}€` : '0.00'}</span></button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 md:gap-3">
                        {[
                            { title: 'Asistencia', img: '/icons/calendar.png', color: 'bg-emerald-500', link: '/registros' },
                            { title: 'Mano de Obra', img: '/icons/overtime.png', color: 'bg-blue-500', link: '/dashboard/labor' },
                            { title: 'Plantilla', img: '/icons/admin.png', color: 'bg-purple-500', link: '/staff' },
                            { title: 'Producto', img: '/icons/suppliers.png', color: 'bg-orange-500', link: '/ingredients' },
                        ].map((card, i) => (
                            <button key={i} onClick={() => { if (card.title === 'Plantilla') setIsStaffModalOpen(true); else if (card.title === 'Producto') setIsProductModalOpen(true); else if (card.link) router.push(card.link); }} className="bg-white rounded-2xl md:rounded-[2rem] p-2 md:p-3 shadow-xl border border-gray-100 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group hover:bg-gray-50/50 aspect-square"><div className="w-10 h-10 md:w-16 md:h-16 flex items-center justify-center transition-transform group-hover:scale-110"><Image src={card.img} alt={card.title} width={64} height={64} priority={true} className="w-full h-full object-contain" /></div><span className="text-[7px] md:text-[8px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 md:px-1">{card.title}</span></button>
                        ))}
                    </div>
                    <div className="bg-white rounded-[2.5rem] p-4 md:p-6 shadow-xl border border-gray-100 flex flex-col gap-4 md:gap-6">
                        <div className="flex justify-between items-center px-1"><h2 className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest">Horas Extras</h2><Link href="/dashboard/overtime" className="text-[8px] md:text-[10px] font-black text-purple-600 uppercase hover:underline transition-all">Ver más</Link></div>
                        <div className="space-y-3 md:space-y-4 max-h-[250px] md:max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                            {overtimeData.slice(0, 3).map((week) => {
                                const isFullyPaid = isWeekFullyPaid(week);
                                return (
                                    <div key={week.weekId} className="bg-[#5E35B1] rounded-2xl md:rounded-[2rem] shadow-sm border border-white/10 overflow-hidden">
                                        <button onClick={() => toggleWeek(week.weekId)} className="w-full p-2 md:p-3 flex items-center justify-between text-left group hover:bg-white/5 transition-colors"><div className="flex items-center gap-2 md:gap-3"><div className={cn("w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-110 shrink-0", isFullyPaid ? "bg-emerald-500" : "bg-orange-400")}>{isFullyPaid ? <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" /> : <AlertCircle className="w-3 h-3 md:w-4 md:h-4" />}</div><div className="flex items-center gap-1.5 md:gap-2"><h4 className="text-xs md:text-sm font-black text-white">Sem {getISOWeek(new Date(week.weekId))}</h4><span className="text-purple-300 font-light mx-0.5">•</span><p className="text-[8px] md:text-[10px] font-bold text-purple-200 uppercase pt-0.5">{format(new Date(week.weekId), "d MMM", { locale: es })} - {format(addDays(new Date(week.weekId), 6), "d MMM", { locale: es })}</p></div></div><div className="text-right flex items-center gap-2 md:gap-3"><span className="text-sm md:text-lg font-black text-white">{week.total.toFixed(0)}€</span></div></button>
                                        {week.expanded && (
                                            <div className="px-2.5 md:px-4 pb-2.5 md:pb-4 pt-1 space-y-1.5 md:space-y-2 animate-in slide-in-from-top-2 duration-300">
                                                {week.staff.map((s: any) => (
                                                    <div key={s.id} className="flex items-center justify-between p-2 md:p-3 bg-white/60 rounded-xl md:rounded-2xl border border-purple-100/30">
                                                        <div className="flex items-center gap-2 md:gap-3"><div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-purple-100 text-[#5E35B1] flex items-center justify-center text-[10px] md:text-xs font-black capitalize">{s.name.charAt(0)}</div><span className="text-[10px] md:text-xs font-bold text-gray-700 capitalize">{s.name}</span></div>
                                                        <div className="flex items-center gap-2 md:gap-3"><span className="text-[10px] md:text-xs font-black text-gray-800">{s.amount.toFixed(0)}€</span><button onClick={(e) => togglePaid(e, week.weekId, s.id)} className={cn("w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all active:scale-90", paidStatus[`${week.weekId}-${s.id}`] ? "bg-emerald-500 text-white shadow-md" : "bg-white border md:border-2 border-gray-200 text-transparent")}><CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" /></button></div>
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
            </div >
            {cashModalMode !== 'none' && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setCashModalMode('none')}>
                    <div className={cn("bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]", cashModalMode === 'swap' ? "max-w-4xl" : "max-w-2xl")} onClick={(e) => e.stopPropagation()}>
                        {cashModalMode === 'menu' && (
                            <>
                                <div className="bg-[#5B8FB9] px-8 py-4 flex justify-between items-center text-white shrink-0"><div><h3 className="text-lg font-black uppercase tracking-wider leading-none">{selectedBox?.type === 'operational' ? 'Caja Inicial' : (selectedBox?.type === 'change' ? `Caja ${selectedBox.name}` : 'Gestión de Caja')}</h3></div><button onClick={() => setCashModalMode('none')} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button></div>
                                <div className="p-4 grid grid-cols-2 gap-4">
                                    {selectedBox?.type === 'change' ? (
                                        <>
                                            <button onClick={async () => { const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', selectedBox.id).gt('quantity', 0); const initial: any = {}; data?.forEach(d => initial[d.denomination] = d.quantity); setBoxInventoryMap(initial); setBoxInventory(data || []); setCashModalMode('swap'); }} className="col-span-2 bg-transparent border-0 hover:bg-orange-50/50 p-8 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-16 h-16"><Image src="/icons/reverse.png" alt="Cambiar" width={64} height={64} className="w-full h-full object-contain" /></div><span className="font-black text-xl text-zinc-900">Cambiar</span></button>
                                            <button onClick={async () => { const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', selectedBox.id).gt('quantity', 0); const initial: any = {}; data?.forEach(d => initial[d.denomination] = d.quantity); setBoxInventoryMap(initial); setBoxInventory(data || []); setCashModalMode('audit'); }} className="bg-transparent border-0 hover:bg-blue-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-12 h-12"><Image src="/icons/change.png" alt="Arqueo" width={48} height={48} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Arqueo</span></button>
                                            <button onClick={async () => { const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', selectedBox.id).gt('quantity', 0); setBoxInventory(data || []); setCashModalMode('inventory'); }} className="bg-transparent border-0 hover:bg-gray-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-12 h-12"><Image src="/icons/wallet.png" alt="Ver Desglose" width={48} height={48} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Ver Desglose</span></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => setCashModalMode('in')} className="bg-transparent border-0 hover:bg-emerald-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-10 h-10 mb-1"><Image src="/icons/in.png" alt="Entrada" width={40} height={40} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Entrada</span></button>
                                            <button onClick={async () => { const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', selectedBox.id).gt('quantity', 0); const initial: any = {}; data?.forEach(d => initial[d.denomination] = d.quantity); setBoxInventoryMap(initial); setBoxInventory(data || []); setCashModalMode('out'); }} className="bg-transparent border-0 hover:bg-rose-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-10 h-10 mb-1"><Image src="/icons/out.png" alt="Salida" width={40} height={40} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Salida</span></button>
                                            <button onClick={async () => { const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', selectedBox.id).gt('quantity', 0); const initial: any = {}; data?.forEach(d => initial[d.denomination] = d.quantity); setBoxInventoryMap(initial); setBoxInventory(data || []); setCashModalMode('audit'); }} className="bg-transparent border-0 hover:bg-orange-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-10 h-10 mb-1"><Image src="/icons/change.png" alt="Arqueo" width={40} height={40} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Arqueo</span></button>
                                            <button onClick={() => router.push('/dashboard/movements')} className="bg-transparent border-0 hover:bg-blue-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-10 h-10 mb-1"><Image src="/icons/admin.png" alt="Movimientos" width={40} height={40} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Movimientos</span></button>
                                            <button onClick={async () => { const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', selectedBox.id).gt('quantity', 0); setBoxInventory(data || []); setCashModalMode('inventory'); }} className="col-span-2 bg-transparent border-0 hover:bg-emerald-50/50 p-6 rounded-2xl flex flex-col items-center gap-2 transition-all group active:scale-95"><div className="w-10 h-10 mb-1"><Image src="/icons/wallet.png" alt="Ver Desglose" width={40} height={40} className="w-full h-full object-contain" /></div><span className="font-black text-zinc-900">Ver Desglose</span></button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                        {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit') && <CashDenominationForm type={cashModalMode as 'in' | 'out' | 'audit'} boxName={selectedBox?.name || 'Caja'} initialCounts={cashModalMode === 'audit' ? boxInventoryMap : {}} availableStock={boxInventoryMap} onCancel={() => setCashModalMode('menu')} onSubmit={handleCashTransaction} />}
                        {cashModalMode === 'swap' && <SwapDenominationForm boxName={selectedBox?.name || 'Caja'} availableStock={boxInventoryMap} onCancel={() => setCashModalMode('menu')} onSubmit={handleCashTransaction} />}
                        {cashModalMode === 'inventory' && <BoxInventoryView boxName={selectedBox?.name || 'Caja'} inventory={boxInventory} onBack={() => setCashModalMode('menu')} />}
                    </div>
                </div>
            )}
            {isStaffModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsStaffModalOpen(false)}>
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#5B8FB9] px-8 py-4 flex justify-between items-center text-white shrink-0">
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-wider leading-none">Plantilla</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Seleccionar Empleado ({allEmployees.length})</p>
                            </div>
                            <button onClick={() => setIsStaffModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button>
                        </div>
                        <div className="p-4 bg-gray-50/30 flex-1 overflow-y-auto">
                            {/* Botón Crear Nuevo */}
                            <button
                                onClick={() => { setIsStaffModalOpen(false); setIsNewWorkerModalOpen(true); }}
                                className="w-full mb-3 py-3 border-2 border-dashed border-gray-300 text-gray-400 font-bold rounded-2xl hover:border-[#5B8FB9] hover:text-[#5B8FB9] hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2 text-sm active:scale-95"
                            >
                                <Plus size={18} /> Nuevo Trabajador
                            </button>
                            <div className="grid grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto no-scrollbar pb-2">
                                {allEmployees.map((emp) => (
                                    <button
                                        key={emp.id}
                                        onClick={() => router.push(`/profile?id=${emp.id}`)}
                                        className="bg-transparent p-2 rounded-2xl border-0 hover:bg-blue-50/50 transition-all active:scale-95 flex flex-col items-center gap-1.5 group"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-black text-[#5B8FB9] shadow-inner group-hover:bg-[#5B8FB9] group-hover:text-white transition-colors capitalize shrink-0">
                                            {emp.first_name.substring(0, 1)}
                                        </div>
                                        <span className="font-black text-[10px] text-gray-700 text-center capitalize leading-tight w-full">
                                            {emp.first_name.split(' ')[0]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL: Crear Nuevo Trabajador */}
            {isNewWorkerModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setIsNewWorkerModalOpen(false)}>
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#5B8FB9] px-6 py-4 flex justify-between items-center text-white">
                            <div>
                                <h3 className="text-base font-black uppercase tracking-wider leading-none">Nuevo Trabajador</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Datos del empleado</p>
                            </div>
                            <button onClick={() => setIsNewWorkerModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all active:scale-90"><X size={20} strokeWidth={3} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Nombre *</label>
                                <input
                                    type="text"
                                    value={newWorkerData.first_name}
                                    onChange={e => setNewWorkerData({ ...newWorkerData, first_name: e.target.value })}
                                    placeholder="Nombre del trabajador"
                                    className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all placeholder:text-zinc-300"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Apellidos</label>
                                <input
                                    type="text"
                                    value={newWorkerData.last_name}
                                    onChange={e => setNewWorkerData({ ...newWorkerData, last_name: e.target.value })}
                                    placeholder="Opcional"
                                    className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all placeholder:text-zinc-300"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Email</label>
                                <input
                                    type="email"
                                    value={newWorkerData.email}
                                    onChange={e => setNewWorkerData({ ...newWorkerData, email: e.target.value })}
                                    placeholder="ejemplo@correo.com"
                                    className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all placeholder:text-zinc-300"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Rol</label>
                                <select
                                    value={newWorkerData.role}
                                    onChange={e => setNewWorkerData({ ...newWorkerData, role: e.target.value })}
                                    className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                                >
                                    <option value="staff">Staff</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Horas/Sem</label>
                                    <input
                                        type="number"
                                        value={newWorkerData.contracted_hours_weekly}
                                        onChange={e => setNewWorkerData({ ...newWorkerData, contracted_hours_weekly: Number(e.target.value) })}
                                        className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">€/h Extra</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newWorkerData.overtime_cost_per_hour}
                                        onChange={e => setNewWorkerData({ ...newWorkerData, overtime_cost_per_hour: Number(e.target.value) })}
                                        className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-zinc-100 flex gap-3">
                            <button onClick={() => setIsNewWorkerModalOpen(false)} className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-bold rounded-xl active:scale-95 transition-all text-sm">Cancelar</button>
                            <button
                                onClick={handleCreateWorker}
                                disabled={newWorkerSaving || !newWorkerData.first_name.trim()}
                                className="flex-1 h-12 bg-[#5B8FB9] text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-200 text-sm disabled:opacity-50"
                            >
                                {newWorkerSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save size={18} /> Guardar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isProductModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setIsProductModalOpen(false)}>
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#5B8FB9] px-8 py-4 flex justify-between items-center text-white shrink-0"><div><h3 className="text-lg font-black uppercase tracking-wider leading-none">Producto</h3><p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Gestión de Artículos</p></div><button onClick={() => setIsProductModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button></div>
                        <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                            {[
                                { title: 'Recetas', img: '/icons/recipes.png', link: '/recipes', hover: 'hover:bg-red-50/30' },
                                { title: 'Ingredientes', img: '/icons/ingrediente.png', link: '/ingredients', hover: 'hover:bg-orange-50/30' },
                                { title: 'Pedidos', img: '/icons/shipment.png', hover: 'hover:bg-emerald-50/30' },
                                { title: 'Inventario', img: '/icons/inventory.png', hover: 'hover:bg-purple-50/30' },
                                { title: 'Stock', img: '/icons/productes.png', hover: 'hover:bg-blue-50/30' },
                                { title: 'Proveedores', img: '/icons/suplier.png', hover: 'hover:bg-zinc-100/30' },
                            ].map((item, i) => (
                                <button key={i} onClick={() => item.link ? router.push(item.link) : toast.info(`${item.title} próximamente`)} className={cn("bg-transparent border-0 p-4 rounded-3xl flex flex-col items-center gap-3 group transition-all active:scale-95", item.hover)}><div className="w-12 h-12 transition-transform group-hover:scale-110"><Image src={item.img} alt={item.title} width={48} height={48} className="w-full h-full object-contain" /></div><span className="font-black text-sm text-gray-700">{item.title}</span></button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <CashClosingModal isOpen={isClosingModalOpen} onClose={() => setIsClosingModalOpen(false)} onSuccess={fetchData} />
        </div>
    );
}
