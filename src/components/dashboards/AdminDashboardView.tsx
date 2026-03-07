'use client';

import { useEffect, useState, memo } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar, Search, Receipt,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, X, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw, Save,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart, ArrowLeft, ArrowRightLeft,
    PlusCircle, ArrowDown, ArrowUp, Plus as PlusIcon, Minus as MinusIcon, Check,
    Coins, Landmark, AlertTriangle, RotateCcw
} from 'lucide-react';

import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import Link from 'next/link';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { getISOWeek, format, addDays, startOfWeek, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn, calculateRoundedHours } from '@/lib/utils';
import Image from 'next/image';
import { togglePaidStatus, togglePreferStockStatus } from '@/app/actions/overtime';
import PremiumCountUp from '@/components/ui/PremiumCountUp';
import LiveClock from '@/components/ui/LiveClock';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { recalculateAllBalances } from '@/app/actions/recalculate';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { getDashboardData } from '@/app/actions/get-dashboard-data';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { BoxInventoryView } from '@/components/BoxInventoryView';

// Sub-components
const StaffOvertimeRow = memo(({
    staff,
    weekId,
    isPaid,
    onTogglePaid,
    onTogglePreferStock,
    onClick
}: {
    staff: any,
    weekId: string,
    isPaid: boolean,
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean) => void,
    onTogglePreferStock: (e: React.MouseEvent, weekId: string, staffId: string, currentStatus: boolean) => void,
    onClick: () => void
}) => (
    <div onClick={onClick} className="flex items-center justify-between p-3 bg-white/60 rounded-2xl border border-purple-100/30 cursor-pointer hover:bg-white transition-colors group">
        <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-700 capitalize group-hover:text-purple-700 transition-colors leading-none">
                {staff.name}
            </span>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-xs font-black text-gray-800">
                {staff.amount > 0.05 ? `${staff.amount.toFixed(0)}€` : " "}
            </span>
            <div className="flex items-center bg-gray-100/50 rounded-full h-8 px-1 gap-1">
                <button
                    onClick={(e) => onTogglePaid(e, weekId, staff.id, !isPaid)}
                    className={cn(
                        "flex items-center justify-center transition-all active:scale-90 p-0.5",
                        isPaid ? "" : "text-gray-300 hover:text-gray-400"
                    )}
                >
                    {isPaid ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />
                        </div>
                    ) : (
                        <Circle className="w-5 h-5" />
                    )}
                </button>
            </div>
        </div>
    </div>
));
StaffOvertimeRow.displayName = 'StaffOvertimeRow';

const WeekOvertimeCard = memo(({
    week,
    paidStatus,
    onToggleWeek,
    onTogglePaid,
    onTogglePreferStock,
    onSelectHistory
}: {
    week: any,
    paidStatus: Record<string, boolean>,
    onToggleWeek: (weekId: string) => void,
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean) => void,
    onTogglePreferStock: (e: React.MouseEvent, weekId: string, staffId: string, currentStatus: boolean) => void,
    onSelectHistory: (workerId: string, weekId: string) => void
}) => {
    const isFullyPaid = week.staff?.every((s: any) => s.amount === 0 || paidStatus[`${week.weekId}-${s.id}`]);

    return (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden transition-all">
            <button onClick={() => onToggleWeek(week.weekId)} className="w-full p-3 flex items-center justify-between text-left group transition-colors hover:bg-gray-50/50">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center transition-transform group-hover:scale-110 shrink-0">
                        {isFullyPaid ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />
                            </div>
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shadow-sm">
                                <span className="text-white font-black text-xs leading-none">!</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-gray-900">Sem {getISOWeek(new Date(week.weekId))}</h4>
                        <span className="font-light mx-0.5 text-gray-300">•</span>
                        <p className="text-[10px] font-bold uppercase pt-0.5 text-gray-500">
                            {format(new Date(week.weekId), "d MMM", { locale: es })} - {format(addDays(new Date(week.weekId), 6), "d MMM", { locale: es })}
                        </p>
                    </div>
                </div>
                <div className="text-right flex items-center gap-3">
                    <span className="text-lg font-black text-gray-900">
                        {week.total > 0.05 ? `${week.total.toFixed(0)}€` : " "}
                    </span>
                </div>
            </button>
            {week.expanded && (
                <div className="px-4 pb-4 pt-1 space-y-2 animate-in slide-in-from-top-2 duration-300">
                    {week.staff.filter((s: any) => s.amount > 0).map((s: any) => (
                        <StaffOvertimeRow
                            key={s.id}
                            staff={s}
                            weekId={week.weekId}
                            isPaid={!!paidStatus[`${week.weekId}-${s.id}`]}
                            onTogglePaid={onTogglePaid}
                            onTogglePreferStock={onTogglePreferStock}
                            onClick={() => onSelectHistory(s.id, week.weekId)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
WeekOvertimeCard.displayName = 'WeekOvertimeCard';

type CashModalMode = 'none' | 'menu' | 'in' | 'out' | 'audit' | 'swap' | 'inventory';

const AdminDashboardView = ({ initialData }: { initialData?: any }) => {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(!initialData);
    const [dailyStats, setDailyStats] = useState<any>(initialData?.dailyStats || null);
    const [liveTickets, setLiveTickets] = useState(initialData?.liveTickets || { total: 0, count: 0 });
    const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
    const [boxes, setBoxes] = useState<any[]>(initialData?.boxes || []);
    const [boxMovements, setBoxMovements] = useState<any[]>(initialData?.boxMovements || []);
    const [theoreticalBalance, setTheoreticalBalance] = useState<number>(initialData?.theoreticalBalance || 0);
    const [actualBalance, setActualBalance] = useState<number>(initialData?.actualBalance || 0);
    const [difference, setDifference] = useState<number>(initialData?.difference || 0);
    const [overtimeData, setOvertimeData] = useState<any[]>(initialData?.overtimeData || []);
    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>(initialData?.paidStatus || {});
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [allEmployees, setAllEmployees] = useState<any[]>(initialData?.allEmployees || []);
    const [cashModalMode, setCashModalMode] = useState<CashModalMode>('none');
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [isNewWorkerModalOpen, setIsNewWorkerModalOpen] = useState(false);
    const [newWorkerSaving, setNewWorkerSaving] = useState(false);
    const [newWorkerData, setNewWorkerData] = useState({
        first_name: '', last_name: '', email: '', role: 'staff',
        contracted_hours_weekly: 40, overtime_cost_per_hour: 0, prefer_stock_hours: false
    });
    const [selectedHistory, setSelectedHistory] = useState<{ workerId: string, weekId: string } | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        setIsDesktop(window.innerWidth >= 768);
        const handleResize = () => setIsDesktop(window.innerWidth >= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) setCurrentUserEmail(user.email);
        };
        getUser();
    }, []);

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
                p_joining_date: format(new Date(), 'yyyy-MM-dd'),
                p_prefer_stock_hours: newWorkerData.prefer_stock_hours,
            });
            if (error) throw error;
            toast.success(`${newWorkerData.first_name} añadido correctamente`);
            setIsNewWorkerModalOpen(false);
            setNewWorkerData({
                first_name: '', last_name: '', email: '', role: 'staff',
                contracted_hours_weekly: 40, overtime_cost_per_hour: 0, prefer_stock_hours: false
            });
            fetchData();
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error al crear trabajador');
        } finally {
            setNewWorkerSaving(false);
        }
    };

    useEffect(() => {
        if (!initialData) fetchData();
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const channel = supabase
            .channel('realtime_tickets_dashboard')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'tickets_marbella',
                filter: `fecha=eq.${todayStr}`
            }, (payload: any) => {
                const newTotal = Number(payload.new.total_documento) || 0;
                setLiveTickets((prev: { total: number; count: number }) => ({
                    total: prev.total + newTotal,
                    count: prev.count + (newTotal > 0 ? 1 : (newTotal < 0 ? -1 : 0))
                }));
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const toggleWeek = (weekId: string) => setOvertimeData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));

    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        try {
            const weekData = overtimeData.find(w => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s: any) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, {
                totalHours: staffData?.hours || 0,
                overtimeHours: staffData?.hours || 0
            });
            if (!result.success) throw new Error("Error updating paid status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            console.error(error);
            setPaidStatus(prev => ({ ...prev, [key]: !newStatus }));
            toast.error("Error al actualizar pago");
        }
    };

    const togglePreferStock = async (e: React.MouseEvent, weekId: string, staffId: string, currentStatus: boolean) => {
        e.stopPropagation();
        try {
            toast.loading("Actualizando balances...", { id: 'prefer-stock-toggle' });
            const result = await togglePreferStockStatus(staffId, weekId, currentStatus);
            if (!result.success) throw new Error(result.error);
            toast.success(result.newStatus ? "Enviado a Bolsa de Horas" : "Cambiado a Pago en Nómina", { id: 'prefer-stock-toggle' });
            fetchData();
        } catch (error: any) {
            console.error(error);
            toast.error("Error al actualizar modo: " + error.message, { id: 'prefer-stock-toggle' });
        }
    };

    async function fetchData() {
        try {
            setLoading(true);
            const data = await getDashboardData();
            if (data) {
                setDailyStats(data.dailyStats);
                setLiveTickets(data.liveTickets);
                setBoxes(data.boxes);
                setBoxMovements(data.boxMovements);
                setTheoreticalBalance(data.theoreticalBalance || 0);
                setActualBalance(data.actualBalance || 0);
                setDifference(data.difference || 0);
                setOvertimeData(data.overtimeData);
                setPaidStatus(data.paidStatus);
                setAllEmployees(data.allEmployees);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar datos');
        } finally {
            setLoading(false);
        }
    }

    const handleCashTransaction = async (total: number, breakdown: any, notesOrOutBreakdown: any, customDate?: string) => {
        try {
            if (!selectedBox) return;
            const payload: any = {
                box_id: selectedBox.id,
                type: cashModalMode === 'audit' ? 'ADJUSTMENT' : (cashModalMode === 'in' ? 'IN' : 'OUT'),
                amount: total,
                breakdown: breakdown,
                notes: cashModalMode === 'audit' ? 'Arqueo de caja' : notesOrOutBreakdown as string
            };
            if (customDate) payload.created_at = customDate;
            await supabase.from('treasury_log').insert(payload);
            setCashModalMode('none');
            setSelectedBox(null);
            fetchData();
        } catch (error) { console.error(error); alert("Error"); }
    };

    const handleRecalculate = async () => {
        if (!confirm("¿Seguro que quieres recalcular todos los balances?")) return;
        setIsRecalculating(true);
        try {
            const res = await recalculateAllBalances();
            if (res.success) { toast.success(res.message); fetchData(); }
        } catch (e: any) { toast.error(e.message); } finally { setIsRecalculating(false); }
    }

    const openTreasuryModal = async (box: any, mode: CashModalMode) => {
        setSelectedBox(box);
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach(d => initial[Number(d.denomination)] = d.quantity);
        setBoxInventoryMap(initial);
        setBoxInventory(data || []);
        setCashModalMode(mode);
    };

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-4">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    return (
        <div className="pt-0 md:pt-2 animate-in fade-in duration-500 pb-8">
            <div className="px-4 w-full max-w-sm md:max-w-xl mx-auto space-y-4 md:space-y-2">

                {/* 1. VENTAS */}
                <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                    <div className="bg-[#36606F] px-4 py-1.5 md:py-1 flex justify-between items-center text-white shrink-0 relative">
                        <div className="flex items-center gap-3">
                            <h3 className="text-[10px] md:text-sm font-black uppercase tracking-wider">Ventas</h3>
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 md:scale-110">
                            <LiveClock />
                        </div>
                        <Link href="/dashboard/history" className="text-[10px] md:text-sm font-black hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link>
                    </div>
                    <div className="p-3 md:p-2.5 grid grid-cols-3 gap-2 md:gap-4 flex-1 items-center">
                        <div className="flex flex-col items-center justify-center text-center">
                            <PremiumCountUp
                                value={liveTickets.total}
                                suffix="€"
                                decimals={2}
                                className="text-lg md:text-3xl font-black text-black leading-none"
                            />
                            <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ventas</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center">
                            <PremiumCountUp
                                value={liveTickets.total > 0 ? liveTickets.total / 1.10 : 0}
                                suffix="€"
                                decimals={2}
                                className="text-lg md:text-3xl font-black text-emerald-600 leading-none"
                            />
                            <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Venta Neta</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center">
                            <PremiumCountUp
                                value={liveTickets.count > 0 ? liveTickets.total / liveTickets.count : 0}
                                suffix="€"
                                decimals={2}
                                className="text-lg md:text-3xl font-black text-blue-600 leading-none"
                            />
                            <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ticket Medio</span>
                        </div>
                    </div>
                </div>

                {/* 2. CAJA INICIAL */}
                <div className={cn("bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col transition-all duration-300", isMovementsExpanded ? "p-3" : "p-2 pb-1")}>
                    {boxes.filter(b => b.type === 'operational').map(box => (
                        <div key={box.id} className="flex flex-col h-full">
                            <div className="flex flex-row gap-2 md:gap-3 mb-3">
                                <button onClick={() => router.push('/dashboard/movements')} className="flex-[1.2] basis-0 px-4 py-3 md:py-2.5 rounded-2xl bg-emerald-600 shadow-lg hover:bg-emerald-700 transition-all cursor-pointer flex flex-row items-center justify-between text-white active:scale-95">
                                    <div className="flex flex-col items-start leading-none gap-1">
                                        <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Caja Inicial</span>
                                        <span className="text-lg md:text-lg font-black">
                                            {Math.abs(actualBalance) > 0.005 ? `${actualBalance.toFixed(2)}€` : " "}
                                        </span>
                                    </div>
                                </button>
                                <div className="flex-[2] basis-0 grid grid-cols-3 gap-2 md:gap-2">
                                    <button onClick={() => openTreasuryModal(box, 'in')} className="bg-zinc-50/50 p-2 md:p-1 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-1.5 transition-all active:scale-95 group">
                                        <div className="w-8 h-8 md:w-7.5 md:h-7.5 flex items-center justify-center bg-emerald-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <Plus size={16} className="text-white" strokeWidth={4} />
                                        </div>
                                        <span className="text-[8px] md:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Entrada</span>
                                    </button>
                                    <button onClick={() => openTreasuryModal(box, 'out')} className="bg-zinc-50/50 p-2 md:p-1 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-1.5 transition-all active:scale-95 group">
                                        <div className="w-8 h-8 md:w-7.5 md:h-7.5 flex items-center justify-center bg-rose-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <Minus size={16} className="text-white" strokeWidth={4} />
                                        </div>
                                        <span className="text-[8px] md:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Salida</span>
                                    </button>
                                    <button onClick={() => openTreasuryModal(box, 'audit')} className="bg-zinc-50/50 p-2 md:p-1 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-1.5 transition-all active:scale-95 group">
                                        <div className="w-8 h-8 md:w-7.5 md:h-7.5 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <RefreshCw size={16} className="text-white" strokeWidth={4} />
                                        </div>
                                        <span className="text-[8px] md:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Arqueo</span>
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col flex-1 min-h-0">
                                <div className="flex items-center px-1 mb-2">
                                    {Math.abs(difference || 0) < 0.01 ? (
                                        <span className="text-[9px] md:text-sm font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5 md:w-5 md:h-5" strokeWidth={3} />
                                            Caja Cuadrada
                                        </span>
                                    ) : (
                                        <span className={cn("text-[9px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2", (difference || 0) < 0 ? "text-rose-500" : "text-emerald-500")}>
                                            <AlertTriangle className="w-3.5 h-3.5 md:w-5 md:h-5" strokeWidth={3} />
                                            Diferencia: {Math.abs(difference || 0) > 0.005 ? `${(difference || 0) > 0 ? '+' : ''}${(difference || 0).toFixed(2)}€` : " "}
                                        </span>
                                    )}
                                </div>
                                <div className={cn("flex justify-between items-center px-1", isMovementsExpanded ? "mb-3" : "mb-1")}>
                                    <button onClick={() => setIsMovementsExpanded(!isMovementsExpanded)} className="flex items-center gap-1.5 text-[9px] md:text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">
                                        Movimientos
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isMovementsExpanded && "rotate-180")} />
                                    </button>
                                    <Link href="/dashboard/movements" className="text-[9px] md:text-xs font-black text-[#5B8FB9] bg-zinc-50 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all flex items-center gap-1 uppercase">
                                        Ver más <ArrowRight className="w-3 h-3" />
                                    </Link>
                                </div>
                                <div className={cn("overflow-hidden transition-all duration-300", isMovementsExpanded ? "flex-1 opacity-100" : "h-0 opacity-0")}>
                                    <div className="space-y-2 py-2 max-h-[150px] md:max-h-[250px] overflow-y-auto no-scrollbar">
                                        {boxMovements.length === 0 && (
                                            <p className="text-[10px] md:text-sm text-gray-300 italic px-1 text-center py-4">Sin historial reciente</p>
                                        )}
                                        {boxMovements.map(mov => (
                                            <div key={mov.id} className="flex justify-between items-center text-[10px] md:text-sm bg-zinc-50 p-3 md:p-4 rounded-xl shadow-sm border border-gray-50">
                                                <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                                                    {mov.type === 'OUT' ? (
                                                        <ArrowUpRight className="w-3.5 h-3.5 md:w-5 md:h-5 text-rose-400 shrink-0" />
                                                    ) : (
                                                        <ArrowDownLeft className="w-3.5 h-3.5 md:w-5 md:h-5 text-emerald-500 shrink-0" />
                                                    )}
                                                    <span className="truncate max-w-[150px] md:max-w-xs text-gray-600 font-medium">
                                                        {mov.notes || 'Sin nota'}
                                                    </span>
                                                </div>
                                                <span className={cn("font-black whitespace-nowrap", mov.type === 'OUT' ? 'text-rose-500' : 'text-emerald-600')}>
                                                    {mov.type === 'OUT' ? '-' : '+'}
                                                    {mov.amount > 0.005 ? `${mov.amount.toFixed(2)}€` : " "}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 3. HORAS EXTRAS */}
                <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                    <div className="bg-purple-600 px-4 py-1.5 md:py-1 flex justify-between items-center text-white shrink-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-[10px] md:text-sm font-black uppercase tracking-wider">Horas Extras</h2>
                            {currentUserEmail === 'hhector7722@gmail.com' && (
                                <button
                                    onClick={handleRecalculate}
                                    disabled={isRecalculating}
                                    className="ml-4 p-2 hover:bg-white/10 rounded-lg transition-all active:scale-95"
                                >
                                    {isRecalculating ? <LoadingSpinner size="sm" /> : <RotateCcw size={18} className="text-white" />}
                                </button>
                            )}
                        </div>
                        <Link href="/dashboard/overtime" className="text-[10px] md:text-sm font-black hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link>
                    </div>
                    <div className="p-3 md:p-2.5 space-y-2">
                        {overtimeData.length === 0 ? (
                            <div className="py-8 text-center text-gray-400 text-[10px] md:text-sm font-bold uppercase tracking-widest italic">No hay registros</div>
                        ) : (
                            overtimeData.slice(0, 2).map((week) => (
                                <WeekOvertimeCard
                                    key={week.weekId}
                                    week={week}
                                    paidStatus={paidStatus}
                                    onToggleWeek={toggleWeek}
                                    onTogglePaid={togglePaid}
                                    onTogglePreferStock={togglePreferStock}
                                    onSelectHistory={(workerId, weekId) => setSelectedHistory({ workerId, weekId })}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* 4. CAJAS CAMBIO + ICONOS */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                        <div className="bg-[#36606F] px-4 py-1.5 md:py-1 flex items-center text-white shrink-0">
                            <h3 className="text-[10px] md:text-sm font-black uppercase tracking-wider">Cajas Cambio</h3>
                        </div>
                        <div className="p-2 md:p-0 py-1.5 md:py-0 flex flex-col flex-1 divide-y divide-zinc-50 md:divide-zinc-50">
                            {boxes.filter(b => b.type === 'change').slice(0, 2).map((box, idx) => {
                                const diff = box.current_balance - 300;
                                const isOk = Math.abs(diff) < 0.01;
                                return (
                                    <div key={box.id} className="flex flex-row md:flex-row gap-2 md:gap-4 items-center flex-1 justify-center p-2 md:px-6">
                                        <div className="flex-[1.2] basis-0 md:basis-auto px-1 flex flex-col items-start md:items-center">
                                            <span className="text-[7px] md:text-[9px] font-black uppercase tracking-wider text-zinc-400">Cambio {idx + 1}</span>
                                            <span className="text-sm md:text-xl font-black text-zinc-800">
                                                {box.current_balance > 0.005 ? `${box.current_balance.toFixed(2)}€` : " "}
                                            </span>
                                            {!isOk && (
                                                <span className={cn("text-[9px] md:text-xs font-black mt-0.5", diff < 0 ? "text-rose-500" : "text-emerald-600")}>
                                                    {diff > 0.005 ? `+${diff.toFixed(2)}€` : (Math.abs(diff) > 0.005 ? `${diff.toFixed(2)}€` : " ")}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2 md:gap-3">
                                            <button
                                                onClick={() => { setSelectedBox(box); setCashModalMode('swap'); }}
                                                className="w-8 h-8 md:w-12 md:h-12 rounded-xl flex flex-col items-center justify-center transition-all md:bg-zinc-50/50 md:p-1 md:gap-0.5 active:scale-95 group"
                                            >
                                                <div className="w-8 h-8 md:w-8 md:h-8 flex items-center justify-center bg-blue-500 rounded-full shadow-sm group-hover:scale-110 transition-transform text-white">
                                                    <ArrowRightLeft size={16} strokeWidth={isDesktop ? 3 : 4} />
                                                </div>
                                                <span className="hidden md:block text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Cambiar</span>
                                            </button>
                                            <button
                                                onClick={() => openTreasuryModal(box, 'audit')}
                                                className="w-8 h-8 md:w-12 md:h-12 rounded-xl flex flex-col items-center justify-center transition-all md:bg-zinc-50/50 md:p-1 md:gap-0.5 active:scale-95 group"
                                            >
                                                <div className="w-8 h-8 md:w-8 md:h-8 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform text-white">
                                                    <RefreshCw size={16} strokeWidth={isDesktop ? 3 : 4} />
                                                </div>
                                                <span className="hidden md:block text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Arqueo</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                        {[
                            { title: 'Asistencia', img: '/icons/calendar.png', link: '/registros' },
                            { title: 'Mano de Obra', img: '/icons/overtime.png', link: '/dashboard/labor' },
                            { title: 'Plantilla', img: '/icons/admin.png', link: '/staff' },
                            { title: 'Producto', img: '/icons/suppliers.png', link: '/ingredients' },
                        ].map((card, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    if (card.title === 'Plantilla') setIsStaffModalOpen(true);
                                    else if (card.title === 'Producto') setIsProductModalOpen(true);
                                    else if (card.link) router.push(card.link);
                                }}
                                className="bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center gap-2 md:gap-4 active:scale-95 transition-all group aspect-square hover:shadow-xl hover:border-purple-100/50 border border-zinc-50"
                            >
                                <div className="w-10 h-10 md:w-16 md:h-16 flex items-center justify-center transition-transform group-hover:scale-110 p-1 md:p-0">
                                    <Image src={card.img} alt={card.title} width={64} height={64} priority={true} className="w-full h-full object-contain" />
                                </div>
                                <span className="text-[7px] md:text-[11px] font-black text-zinc-800 uppercase tracking-widest text-center leading-tight px-1 mt-0.5">
                                    {card.title}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

            </div> {/* Close max-w-2xl */}

            {/* MODALS SIBLING TO CONTENT */}
            {cashModalMode !== 'none' && (
                <>
                    {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit' || cashModalMode === 'inventory') && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setCashModalMode('none')}>
                            <div className={cn("bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]", "max-w-2xl")} onClick={(e) => e.stopPropagation()}>
                                {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit') && (
                                    <CashDenominationForm
                                        key={cashModalMode + (selectedBox?.id || '')}
                                        type={cashModalMode as 'in' | 'out' | 'audit'}
                                        boxName={selectedBox?.name || 'Caja'}
                                        initialCounts={cashModalMode === 'audit' ? boxInventoryMap : {}}
                                        availableStock={boxInventoryMap}
                                        onCancel={() => setCashModalMode('none')}
                                        onSubmit={handleCashTransaction}
                                    />
                                )}
                                {cashModalMode === 'inventory' && (
                                    <BoxInventoryView
                                        boxName={selectedBox?.name || 'Caja'}
                                        inventory={boxInventory}
                                        onBack={() => setCashModalMode('none')}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    {cashModalMode === 'swap' && (
                        <CashChangeModal
                            boxId={selectedBox?.id}
                            boxName={selectedBox?.name || 'Caja'}
                            onClose={() => setCashModalMode('none')}
                            onSuccess={() => { fetchData(); setCashModalMode('none'); }}
                        />
                    )}
                </>
            )}

            <StaffSelectionModal
                isOpen={isStaffModalOpen}
                onClose={() => setIsStaffModalOpen(false)}
                employees={allEmployees}
                onSelect={(emp) => router.push(`/profile?id=${emp.id}`)}
                title="Plantilla"
            />

            {isNewWorkerModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setIsNewWorkerModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white">
                            <div>
                                <h3 className="text-base font-black uppercase tracking-wider leading-none">Nuevo Trabajador</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Datos del empleado</p>
                            </div>
                            <button onClick={() => setIsNewWorkerModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all active:scale-90"><X size={20} strokeWidth={3} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Nombre *</label>
                                <input type="text" value={newWorkerData.first_name} onChange={e => setNewWorkerData({ ...newWorkerData, first_name: e.target.value })} placeholder="Nombre del trabajador" className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all placeholder:text-zinc-300" autoFocus />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Apellidos</label>
                                <input type="text" value={newWorkerData.last_name} onChange={e => setNewWorkerData({ ...newWorkerData, last_name: e.target.value })} placeholder="Opcional" className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all placeholder:text-zinc-300" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Email</label>
                                <input type="email" value={newWorkerData.email} onChange={e => setNewWorkerData({ ...newWorkerData, email: e.target.value })} placeholder="ejemplo@correo.com" className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all placeholder:text-zinc-300" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Rol</label>
                                <select value={newWorkerData.role} onChange={e => setNewWorkerData({ ...newWorkerData, role: e.target.value })} className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all">
                                    <option value="staff">Staff</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Horas/Sem</label>
                                    <input type="number" value={newWorkerData.contracted_hours_weekly || ''} onChange={e => setNewWorkerData({ ...newWorkerData, contracted_hours_weekly: Number(e.target.value) })} className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">€/h Extra</label>
                                    <input type="number" step="0.01" value={newWorkerData.overtime_cost_per_hour || ''} onChange={e => setNewWorkerData({ ...newWorkerData, overtime_cost_per_hour: Number(e.target.value) })} className="w-full h-12 px-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all" />
                                </div>
                            </div>
                            <button onClick={() => setNewWorkerData({ ...newWorkerData, prefer_stock_hours: !newWorkerData.prefer_stock_hours })} className={cn("w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all active:scale-[0.98]", newWorkerData.prefer_stock_hours ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-zinc-100 text-zinc-400")}>
                                <div className="flex flex-col items-start gap-0.5 text-left">
                                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">Preferencia de Pago</span>
                                    <span className={cn("text-sm font-black transition-colors", newWorkerData.prefer_stock_hours ? "text-purple-700" : "text-zinc-700")}>
                                        {newWorkerData.prefer_stock_hours ? 'Bolsa de Horas' : 'Pago Mensual'}
                                    </span>
                                </div>
                                <div className={cn("w-10 h-6 rounded-full relative transition-all duration-300", newWorkerData.prefer_stock_hours ? "bg-purple-500" : "bg-zinc-200")}>
                                    <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300", newWorkerData.prefer_stock_hours ? "left-5" : "left-1")} />
                                </div>
                            </button>
                        </div>
                        <div className="p-4 border-t border-zinc-100 flex gap-3">
                            <button onClick={() => setIsNewWorkerModalOpen(false)} className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-bold rounded-xl active:scale-95 transition-all text-sm">Cancelar</button>
                            <button onClick={handleCreateWorker} disabled={newWorkerSaving || !newWorkerData.first_name.trim()} className="flex-1 h-12 bg-[#5B8FB9] text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-200 text-sm disabled:opacity-50">
                                {newWorkerSaving ? <LoadingSpinner size="sm" className="text-white" /> : <><Save size={18} /> Guardar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isProductModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setIsProductModalOpen(false)}>
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-8 py-4 flex justify-between items-center text-white shrink-0">
                            <div><h3 className="text-lg font-black uppercase tracking-wider leading-none">Producto</h3><p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Gestión de Artículos</p></div>
                            <button onClick={() => setIsProductModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                            {[
                                { title: 'Recetas', img: '/icons/recipes.png', link: '/recipes', hover: 'hover:bg-red-50/30' },
                                { title: 'Ingredientes', img: '/icons/ingrediente.png', link: '/ingredients', hover: 'hover:bg-orange-50/30' },
                                { title: 'Pedidos', img: '/icons/shipment.png', link: '/orders/new', hover: 'hover:bg-emerald-50/30' },
                                { title: 'Inventario', img: '/icons/inventory.png', hover: 'hover:bg-purple-50/30' },
                                { title: 'Stock', img: '/icons/productes.png', hover: 'hover:bg-blue-50/30' },
                                { title: 'Proveedores', img: '/icons/suplier.png', link: '/suppliers', hover: 'hover:bg-zinc-100/30' },
                            ].map((item, i) => (
                                <button key={i} onClick={() => { if (item.title === 'Pedidos') { setIsProductModalOpen(false); setTimeout(() => setIsSupplierModalOpen(true), 150); } else if (item.link) { router.push(item.link); } else { toast.info(`${item.title} próximamente`); } }} className={cn("bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95", item.hover)}><div className="w-12 h-12 transition-transform group-hover:scale-110"><Image src={item.img} alt={item.title} width={48} height={48} className="w-full h-full object-contain" /></div><span className="font-black text-sm text-gray-700">{item.title}</span></button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <CashClosingModal isOpen={isClosingModalOpen} onClose={() => setIsClosingModalOpen(false)} onSuccess={fetchData} initialTotalSales={liveTickets.total} initialTicketsCount={liveTickets.count} />
            <WorkerWeeklyHistoryModal isOpen={!!selectedHistory} onClose={() => setSelectedHistory(null)} workerId={selectedHistory?.workerId || ''} weekStart={selectedHistory?.weekId || ''} />
            <SupplierSelectionModal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} />

        </div>
    );
}

export default AdminDashboardView;
