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
    Coins, Landmark, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';

import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { AdminProductModal } from '@/components/modals/AdminProductModal';
import Link from 'next/link';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { getISOWeek, format, addDays, startOfWeek, parseISO, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn, calculateRoundedHours } from '@/lib/utils';
import Image from 'next/image';
import { getOvertimeData, togglePaidStatus, togglePreferStockStatus } from '@/app/actions/overtime';
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
    // Horas extras: vista mensual + modal semana
    const [overtimeViewMonth, setOvertimeViewMonth] = useState(() => startOfMonth(new Date()));
    const [overtimeWeeksData, setOvertimeWeeksData] = useState<any[]>([]);
    const [overtimeLoading, setOvertimeLoading] = useState(false);
    const [weekDetailModal, setWeekDetailModal] = useState<{ week: any } | null>(null);

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

    // Fetch overtime por mes para la vista calendario + semanas
    useEffect(() => {
        const start = format(startOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
        let cancelled = false;
        setOvertimeLoading(true);
        getOvertimeData(start, end).then((result) => {
            if (!cancelled && result?.weeksResult) setOvertimeWeeksData(result.weeksResult);
        }).catch(() => {
            if (!cancelled) setOvertimeWeeksData([]);
        }).finally(() => {
            if (!cancelled) setOvertimeLoading(false);
        });
        return () => { cancelled = true; };
    }, [overtimeViewMonth]);

    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        setOvertimeWeeksData(prev => prev.map(w => w.weekId === weekId
            ? { ...w, staff: w.staff?.map((s: any) => s.id === staffId ? { ...s, isPaid: newStatus } : s) }
            : w));
        try {
            const weekData = overtimeData.find(w => w.weekId === weekId) || overtimeWeeksData.find(w => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s: any) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, {
                totalHours: staffData?.hours ?? staffData?.totalHours ?? 0,
                overtimeHours: staffData?.hours ?? staffData?.overtimeHours ?? 0
            });
            if (!result.success) throw new Error("Error updating paid status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            console.error(error);
            setPaidStatus(prev => ({ ...prev, [key]: !newStatus }));
            setOvertimeWeeksData(prev => prev.map(w => w.weekId === weekId
                ? { ...w, staff: w.staff?.map((s: any) => s.id === staffId ? { ...s, isPaid: !newStatus } : s) }
                : w));
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
        <div className="pt-3 md:pt-3 animate-in fade-in duration-500 pb-8">
            <div className="px-4 w-full max-w-sm md:max-w-xl mx-auto space-y-4 md:space-y-2">

                {/* 1. VENTAS */}
                <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                    <div className="bg-[#36606F] px-4 py-1.5 md:py-1 flex items-center justify-between text-white shrink-0">
                        <div className="flex items-center justify-center">
                            <LiveClock />
                        </div>
                        <Link
                            href="/dashboard/history"
                            className="text-[10px] md:text-sm font-black hover:text-white/80 transition-colors uppercase tracking-widest"
                        >
                            Ver más
                        </Link>
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
                <div className={cn("bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col transition-all duration-300", isMovementsExpanded ? "p-3" : "p-2 pb-0.5")}>
                    {boxes.filter(b => b.type === 'operational').map(box => (
                        <div key={box.id} className="flex flex-col h-full">
                            <div className="flex flex-row gap-1.5 md:gap-2 items-center">
                                <button onClick={() => router.push('/dashboard/movements')} className="shrink-0 px-3 py-2 md:py-2 rounded-xl bg-emerald-600 shadow-lg hover:bg-emerald-700 transition-all cursor-pointer flex flex-row items-center gap-2 text-white active:scale-95">
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-wider opacity-80">Caja Inicial</span>
                                    <span className="text-sm md:text-base font-black leading-none">
                                        {Math.abs(actualBalance) > 0.005 ? `${actualBalance.toFixed(2)}€` : " "}
                                    </span>
                                </button>
                                <div className="flex items-center justify-center min-w-0 flex-1">
                                    {Math.abs(difference || 0) < 0.01 ? (
                                        <span className="text-emerald-500 flex items-center">
                                            <Check className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={3} />
                                        </span>
                                    ) : (
                                        <span className={cn("text-[8px] md:text-[9px] font-black uppercase tracking-wider flex items-center gap-1", (difference || 0) < 0 ? "text-rose-500" : "text-emerald-500")}>
                                            <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" strokeWidth={3} />
                                            {Math.abs(difference || 0) > 0.005 ? `${(difference || 0) > 0 ? '+' : ''}${(difference || 0).toFixed(2)}€` : " "}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1 md:gap-1.5 shrink-0">
                                    <button onClick={() => openTreasuryModal(box, 'in')} className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group">
                                        <div className="w-6 h-6 flex items-center justify-center bg-emerald-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <Plus size={12} className="text-white" strokeWidth={2.5} />
                                        </div>
                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Entrada</span>
                                    </button>
                                    <button onClick={() => openTreasuryModal(box, 'out')} className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group">
                                        <div className="w-6 h-6 flex items-center justify-center bg-rose-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <Minus size={12} className="text-white" strokeWidth={2.5} />
                                        </div>
                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Salida</span>
                                    </button>
                                    <button onClick={() => openTreasuryModal(box, 'audit')} className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group">
                                        <div className="w-6 h-6 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <RefreshCw size={12} className="text-white" strokeWidth={2.5} />
                                        </div>
                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Arqueo</span>
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col flex-1 min-h-0">
                                <div className={cn("flex justify-between items-center px-1 py-0.5", isMovementsExpanded ? "mb-2" : "mb-0.5")}>
                                    <button onClick={() => setIsMovementsExpanded(!isMovementsExpanded)} className="flex items-center gap-1 text-[8px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">
                                        Movimientos
                                        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isMovementsExpanded && "rotate-180")} />
                                    </button>
                                    <Link href="/dashboard/movements" className="text-[8px] md:text-[9px] font-black text-[#5B8FB9] bg-zinc-50 px-2 py-1 rounded-full hover:bg-gray-100 transition-all flex items-center gap-0.5 uppercase">
                                        Ver más <ArrowRight className="w-2.5 h-2.5" />
                                    </Link>
                                </div>
                                <div className={cn("overflow-hidden transition-all duration-300", isMovementsExpanded ? "flex-1 opacity-100" : "h-0 opacity-0")}>
                                    <div className="space-y-1.5 py-1.5 max-h-[120px] md:max-h-[200px] overflow-y-auto no-scrollbar">
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

                {/* 3. HORAS EXTRAS — Vista mensual: calendario + semanas (1 fila derecha = 1 fila calendario) */}
                <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                    <div className="bg-purple-600 px-4 py-1.5 md:py-1 flex justify-between items-center text-white shrink-0">
                        <h2 className="text-[10px] md:text-sm font-black uppercase tracking-wider">Horas Extras</h2>
                        <Link href="/dashboard/overtime" className="text-[10px] md:text-sm font-black hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link>
                    </div>
                    <div className="p-2 md:p-2">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                            <button type="button" onClick={() => setOvertimeViewMonth(prev => subMonths(prev, 1))} className="p-1 rounded-lg hover:bg-purple-50 text-zinc-600 hover:text-purple-700 transition-colors shrink-0" aria-label="Mes anterior">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-800 min-w-[80px] text-center">
                                {format(overtimeViewMonth, 'MMMM yyyy', { locale: es })}
                            </span>
                            <button type="button" onClick={() => setOvertimeViewMonth(prev => addMonths(prev, 1))} className="p-1 rounded-lg hover:bg-purple-50 text-zinc-600 hover:text-purple-700 transition-colors shrink-0" aria-label="Mes siguiente">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex gap-2">
                            {(() => {
                                const start = startOfWeek(startOfMonth(overtimeViewMonth), { weekStartsOn: 1 });
                                const end = endOfWeek(endOfMonth(overtimeViewMonth), { weekStartsOn: 1 });
                                const days = eachDayOfInterval({ start, end });
                                const today = new Date();
                                const currentWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                                const rows: Date[][] = [];
                                for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
                                const rowWeekIds = rows.map(row => row[0] ? format(row[0], 'yyyy-MM-dd') : '');
                                return (
                                    <>
                                        <div className="shrink-0 flex flex-col gap-[2px]">
                                            {rows.map((rowDays, rowIndex) => (
                                                <div key={rowIndex} className="grid grid-cols-7 gap-[2px]">
                                                    {rowDays.map((day) => {
                                                        const inMonth = isSameMonth(day, overtimeViewMonth);
                                                        const isToday = isSameDay(day, today);
                                                        return (
                                                            <div
                                                                key={day.getTime()}
                                                                className={cn(
                                                                    'w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full text-[9px] md:text-[10px] font-bold',
                                                                    !inMonth && 'text-zinc-300',
                                                                    inMonth && !isToday && 'text-zinc-600',
                                                                    isToday && 'bg-blue-500 text-white'
                                                                )}
                                                            >
                                                                {format(day, 'd')}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                                            {rowWeekIds.map((weekId, rowIndex) => {
                                                if (overtimeLoading) {
                                                    return <div key={rowIndex} className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" aria-hidden />;
                                                }
                                                if (weekId === currentWeekStart) {
                                                    return <div key={weekId} className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" aria-hidden />;
                                                }
                                                const week = overtimeWeeksData.find((w: any) => w.weekId === weekId);
                                                if (!week) {
                                                    return <div key={weekId} className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" aria-hidden />;
                                                }
                                                const isFullyPaid = week.staff?.every((s: any) => {
                                                    const cost = (s.totalCost ?? s.amount ?? 0);
                                                    return cost < 0.05 || !!s.isPaid || s.preferStock === true;
                                                });
                                                const weekTotal = week.totalAmount ?? week.total ?? 0;
                                                return (
                                                    <button
                                                        key={week.weekId}
                                                        type="button"
                                                        onClick={() => setWeekDetailModal({ week })}
                                                        className={cn(
                                                            'w-full h-5 md:h-6 flex items-center justify-between gap-2 px-1.5 py-0 rounded-md shadow-sm hover:shadow transition-all text-left flex-shrink-0',
                                                            'bg-transparent border-0 hover:bg-purple-50/50'
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-1 shrink-0 w-20 md:w-24">
                                                            <div className="shrink-0 flex items-center justify-center w-6 md:w-7">
                                                                {isFullyPaid ? (
                                                                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                                                        <Check className="w-2 h-2 md:w-2.5 md:h-2.5 text-white" strokeWidth={4} />
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-rose-500 flex items-center justify-center shadow-sm">
                                                                        <span className="text-white font-black text-[7px] leading-none">!</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-[7px] md:text-[8px] font-black text-zinc-500 uppercase shrink-0">Semana {getISOWeek(new Date(week.weekId))}</span>
                                                        </div>
                                                        <span className="flex-1 text-[7px] md:text-[8px] font-bold text-zinc-500 uppercase truncate min-w-0 text-left pl-8 md:pl-10">
                                                            {format(new Date(week.weekId), 'd MMM', { locale: es })} - {format(addDays(new Date(week.weekId), 6), 'd MMM', { locale: es })}
                                                        </span>
                                                        <span className="text-[9px] md:text-[10px] font-black text-zinc-900 shrink-0 w-9 md:w-11 text-right">
                                                            {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* 4. CAJAS CAMBIO (dos contenedores) + ICONOS — misma altura que iconos, contenido centrado */}
                <div className="grid grid-cols-2 gap-4 items-stretch">
                    <div className="flex flex-col gap-4 min-h-0">
                        {(() => {
                            const changeBoxes = boxes.filter(b => b.type === 'change').slice(0, 2);
                            const formatEur = (v: number) => (v > 0.005 ? (Math.abs(v - Math.round(v)) < 0.005 ? `${Math.round(v)}€` : `${v.toFixed(2)}€`) : " ");
                            return (
                                <>
                                    {["Caja cambio 1", "Caja cambio 2"].map((title, idx) => {
                                        const box = changeBoxes[idx];
                                        if (!box) return null;
                                        const diff = box.current_balance - 300;
                                        const isOk = Math.abs(diff) < 0.01;
                                        return (
                                            <div key={box.id} className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden flex-1 min-h-0">
                                                <div className="bg-[#36606F] px-4 py-1.5 md:py-1 flex items-center text-white shrink-0">
                                                    <h3 className="text-[10px] md:text-sm font-black uppercase tracking-wider">{title}</h3>
                                                </div>
                                                <div className="flex-1 flex items-center justify-center min-h-0 p-2">
                                                    <div className="flex flex-row gap-2 items-center justify-center md:px-4 w-full">
                                                        <div className="px-1 flex flex-col items-start md:items-center min-w-0">
                                                            <span className="text-sm md:text-lg font-black text-zinc-800">
                                                                {formatEur(box.current_balance)}
                                                            </span>
                                                            {!isOk && Math.abs(diff) > 0.005 && (
                                                                <span className={cn("text-[8px] md:text-[9px] font-black mt-0.5", diff < 0 ? "text-rose-500" : "text-emerald-600")}>
                                                                    {diff > 0 ? `+${formatEur(diff)}` : `-${formatEur(Math.abs(diff))}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1 md:gap-1.5 shrink-0 ml-4 md:ml-5">
                                                            <button
                                                                onClick={() => { setSelectedBox(box); setCashModalMode('swap'); }}
                                                                className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group"
                                                            >
                                                                <div className="w-6 h-6 flex items-center justify-center bg-blue-500 rounded-full shadow-sm group-hover:scale-110 transition-transform text-white">
                                                                    <ArrowRightLeft size={12} strokeWidth={2.5} />
                                                                </div>
                                                                <span className="text-[6px] md:text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Cambiar</span>
                                                            </button>
                                                            <button
                                                                onClick={() => openTreasuryModal(box, 'audit')}
                                                                className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group"
                                                            >
                                                                <div className="w-6 h-6 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform text-white">
                                                                    <RefreshCw size={12} strokeWidth={2.5} />
                                                                </div>
                                                                <span className="text-[6px] md:text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Arqueo</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            );
                        })()}
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4 min-h-0">
                        {[
                            { title: 'Asistencia', img: '/icons/calendar.png', link: '/registros' },
                            { title: 'M obra', img: '/icons/overtime.png', link: '/dashboard/labor' },
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
                                className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all group aspect-square w-full h-full min-h-0"
                            >
                                <div className="w-12 h-12 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0">
                                    <Image src={card.img} alt={card.title} width={48} height={48} priority={true} className="w-full h-full object-contain" />
                                </div>
                                <span className="text-[9px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 shrink-0">
                                    {card.title}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

            </div> {/* Close max-w-2xl */}

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

            <AdminProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onOpenSupplierModal={() => { setIsProductModalOpen(false); setTimeout(() => setIsSupplierModalOpen(true), 150); }}
            />

            <CashClosingModal isOpen={isClosingModalOpen} onClose={() => setIsClosingModalOpen(false)} onSuccess={fetchData} initialTotalSales={liveTickets.total} initialTicketsCount={liveTickets.count} />
            {/* Modal semana: trabajadores + importe + checkbox; clic en nombre abre WorkerWeeklyHistoryModal */}
            {weekDetailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setWeekDetailModal(null)}>
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between text-white shrink-0">
                            <h3 className="text-sm font-black uppercase tracking-wider">
                                Sem {getISOWeek(new Date(weekDetailModal.week.weekId))} — {format(new Date(weekDetailModal.week.weekId), 'd MMM', { locale: es })} - {format(addDays(new Date(weekDetailModal.week.weekId), 6), 'd MMM', { locale: es })}
                            </h3>
                            <button type="button" onClick={() => setWeekDetailModal(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 space-y-2">
                            {(weekDetailModal.week.staff ?? []).filter((s: any) => {
                                const cost = (s.totalCost ?? s.amount ?? 0);
                                return cost > 0.05 && s.preferStock !== true;
                            }).map((s: any) => (
                                <StaffOvertimeRow
                                    key={s.id}
                                    staff={{ ...s, name: s.name?.split?.(' ')[0] ?? s.name, amount: s.totalCost ?? s.amount ?? 0 }}
                                    weekId={weekDetailModal.week.weekId}
                                    isPaid={paidStatus[`${weekDetailModal.week.weekId}-${s.id}`] ?? !!s.isPaid}
                                    onTogglePaid={togglePaid}
                                    onTogglePreferStock={togglePreferStock}
                                    onClick={() => setSelectedHistory({ workerId: s.id, weekId: weekDetailModal.week.weekId })}
                                />
                            ))}
                            {(!weekDetailModal.week.staff || weekDetailModal.week.staff.filter((s: any) => (s.totalCost ?? s.amount ?? 0) > 0.05).length === 0) && (
                                <p className="text-center text-zinc-400 text-xs font-bold uppercase tracking-widest py-4">Sin importes esta semana</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <WorkerWeeklyHistoryModal isOpen={!!selectedHistory} onClose={() => setSelectedHistory(null)} workerId={selectedHistory?.workerId || ''} weekStart={selectedHistory?.weekId || ''} />
            <SupplierSelectionModal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} />

        </div>
    );
}

export default AdminDashboardView;
