'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar, Search, Receipt,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, X, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw, Save,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart, ArrowLeft, ArrowRightLeft,
    PlusCircle, ArrowDown, ArrowUp, Plus as PlusIcon, Minus as MinusIcon, Check,
    Coins, Landmark
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import Link from 'next/link';
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
import { RotateCcw } from 'lucide-react';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { getDashboardData } from '@/app/actions/get-dashboard-data';

import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { BoxInventoryView } from '@/components/BoxInventoryView';

import { memo } from 'react';

// ARCHITECT_ULTRAFLUIDITY: Memoized Sub-components for granular re-renders
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
            <div className="w-8 h-8 rounded-full bg-purple-100 text-[#5E35B1] flex items-center justify-center text-xs font-black capitalize">
                {staff.name.charAt(0)}
            </div>
            <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-700 capitalize group-hover:text-purple-700 transition-colors leading-none">
                    {staff.name}
                </span>
                <span className="text-[10px] font-medium text-gray-400">
                    {staff.preferStock ? 'A Bolsa' : 'A Nómina'}
                </span>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-xs font-black text-gray-800">{staff.amount.toFixed(0)}€</span>

            <div className="flex items-center bg-gray-100/50 rounded-full h-8 px-1 gap-1">
                {/* Toggle Prefer Stock (Bank vs Pay) */}
                <button
                    onClick={(e) => onTogglePreferStock(e, weekId, staff.id, staff.preferStock)}
                    title={staff.preferStock ? "Cambiar a Pago en Nómina" : "Cambiar a Bolsa de Horas"}
                    className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90",
                        staff.preferStock
                            ? "bg-purple-100 text-purple-600 shadow-sm"
                            : "bg-emerald-100 text-emerald-600 shadow-sm"
                    )}
                >
                    {staff.preferStock ? <Landmark className="w-3.5 h-3.5" /> : <Coins className="w-3.5 h-3.5" />}
                </button>

                <div className="w-px h-4 bg-gray-300 mx-0.5" />

                {/* Toggle Paid Status */}
                <button
                    onClick={(e) => onTogglePaid(e, weekId, staff.id, !isPaid)}
                    className={cn(
                        "flex items-center justify-center transition-all active:scale-90 p-0.5",
                        isPaid ? "text-emerald-500" : "text-gray-300 hover:text-gray-400"
                    )}
                >
                    {isPaid ? <CheckCircle2 className="w-5 h-5 shadow-sm rounded-full bg-white" /> : <Circle className="w-5 h-5" />}
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
                    <span className="text-lg font-black text-gray-900">{week.total.toFixed(0)}€</span>
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

const StaffGridItem = memo(({ emp, onClick }: { emp: any, onClick: () => void }) => (
    <button
        onClick={onClick}
        className="bg-transparent p-2 rounded-2xl border-0 hover:bg-blue-50/50 transition-all active:scale-95 flex flex-col items-center gap-1.5 group"
    >
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-sm font-black text-[#5B8FB9] shadow-inner group-hover:bg-[#5B8FB9] group-hover:text-white transition-colors capitalize shrink-0">
            {emp.first_name.substring(0, 1)}
        </div>
        <span className="font-black text-[10px] text-gray-700 text-center capitalize leading-tight w-full">
            {emp.first_name.split(' ')[0]}
        </span>
    </button>
));
StaffGridItem.displayName = 'StaffGridItem';

// Local components moved to shared src/components/

type CashModalMode = 'none' | 'menu' | 'in' | 'out' | 'audit' | 'swap' | 'inventory';

const AdminDashboardView = ({ initialData }: { initialData?: any }) => {
    const supabase = createClient();
    const router = useRouter();
    // Initialize with initialData if available
    const [loading, setLoading] = useState(!initialData);
    const [dailyStats, setDailyStats] = useState<any>(initialData?.dailyStats || null);
    const [liveTickets, setLiveTickets] = useState(initialData?.liveTickets || { total: 0, count: 0 });
    const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
    const [boxes, setBoxes] = useState<any[]>(initialData?.boxes || []);
    const [boxMovements, setBoxMovements] = useState<any[]>(initialData?.boxMovements || []);
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
    const [newWorkerData, setNewWorkerData] = useState({ first_name: '', last_name: '', email: '', role: 'staff', contracted_hours_weekly: 40, overtime_cost_per_hour: 0, prefer_stock_hours: false });

    // [MODAL HISTORIAL] State for worker history modal
    const [selectedHistory, setSelectedHistory] = useState<{ workerId: string, weekId: string } | null>(null);
    // [SECURITY] State for user email
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

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
                p_joining_date: format(new Date(), 'yyyy-MM-dd'), // [AUTO] Se usará la fecha del primer fichaje real
                p_prefer_stock_hours: newWorkerData.prefer_stock_hours,
            });
            if (error) throw error;
            toast.success(`${newWorkerData.first_name} añadido correctamente`);
            setIsNewWorkerModalOpen(false);
            setNewWorkerData({ first_name: '', last_name: '', email: '', role: 'staff', contracted_hours_weekly: 40, overtime_cost_per_hour: 0, prefer_stock_hours: false });
            fetchData();
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error al crear trabajador');
        } finally {
            setNewWorkerSaving(false);
        }
    };

    useEffect(() => {
        // If no initial data, fetch on mount
        if (!initialData) {
            fetchData();
        }

        // Subscription for real-time tickets
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

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const toggleWeek = (weekId: string) => setOvertimeData(prev => prev.map(w => w.weekId === weekId ? { ...w, expanded: !w.expanded } : w));

    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
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

    const togglePreferStock = async (e: React.MouseEvent, weekId: string, staffId: string, currentStatus: boolean) => {
        e.stopPropagation();
        try {
            toast.loading("Actualizando balances...", { id: 'prefer-stock-toggle' });
            const result = await togglePreferStockStatus(staffId, weekId, currentStatus);
            if (!result.success) throw new Error(result.error);

            toast.success(result.newStatus ? "Enviado a Bolsa de Horas" : "Cambiado a Pago en Nómina", { id: 'prefer-stock-toggle' });
            fetchData(); // Necesitamos recargar para ver el cambio de amount y el badge
        } catch (error: any) {
            console.error(error);
            toast.error("Error al cambiar modo: " + error.message, { id: 'prefer-stock-toggle' });
        }
    };

    const isWeekFullyPaid = (week: any) => {
        if (!week.staff || week.staff.length === 0) return false;
        return week.staff.every((s: any) => paidStatus[`${week.weekId}-${s.id}`]);
    };

    // Updated fetchData to use Server Action
    async function fetchData() {
        try {
            setLoading(true);
            const data = await getDashboardData();
            if (data) {
                setDailyStats(data.dailyStats);
                setLiveTickets(data.liveTickets);
                setBoxes(data.boxes);
                setBoxMovements(data.boxMovements);
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

            if (customDate) {
                payload.created_at = customDate;
            }

            await supabase.from('treasury_log').insert(payload);
            setCashModalMode('none'); setSelectedBox(null); fetchData();
        } catch (error) { console.error(error); alert("Error"); }
    };

    const handleRecalculate = async () => {
        if (!confirm("¿Seguro que quieres recalcular todos los balances? Esto afectará al histórico de todos los trabajadores.")) return;
        setIsRecalculating(true);
        try {
            const res = await recalculateAllBalances();
            if (res.success) {
                toast.success(res.message);
                fetchData();
            }
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsRecalculating(false);
        }
    }

    const openTreasuryModal = async (box: any, mode: CashModalMode) => {
        setSelectedBox(box);
        if (mode === 'out' || mode === 'audit' || mode === 'inventory') {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
            const initial: Record<number, number> = {};
            data?.forEach(d => initial[Number(d.denomination)] = d.quantity);
            setBoxInventoryMap(initial);
            setBoxInventory(data || []);
        }
        setCashModalMode(mode);
    };

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-4">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    const laborPercent = dailyStats?.porcentajeManoObra || 0;
    const isMobileExpanded = isMovementsExpanded || overtimeData.some(w => w.expanded);

    return (
        <div className="pt-0 md:pt-1 animate-in fade-in duration-500">
            <div className="px-3 md:p-6 w-full max-w-6xl mx-auto space-y-4 md:space-y-6 md:mt-0">
                {/* DESKTOP: 2-column grid | MOBILE: stacking vertical */}
                <div className="hidden md:grid md:grid-cols-2 gap-8 items-start">
                    {/* Desktop Col 1: Ventas + Horas Extras */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                            <div className="bg-[#36606F] px-6 py-2.5 flex justify-between items-center text-white shrink-0 relative">
                                <div className="flex items-center gap-3"><div><h3 className="text-sm font-black uppercase tracking-wider">Ventas</h3></div></div>
                                <div className="absolute left-1/2 -translate-x-1/2"><LiveClock /></div>
                                <div className="flex items-center gap-3"><Link href="/dashboard/history" className="text-[10px] font-black pointer-events-auto hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link></div>
                            </div>
                            <div className="p-6 grid grid-cols-3 gap-y-10 gap-x-4 flex-1 items-center">
                                <div className="flex flex-col items-center justify-center text-center"><PremiumCountUp value={liveTickets.total} suffix="€" decimals={2} className="text-2xl font-black text-black leading-none" /><span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ventas</span></div>
                                <div className="flex flex-col items-center justify-center text-center"><PremiumCountUp value={liveTickets.total > 0 ? liveTickets.total / 1.10 : 0} suffix="€" decimals={2} className="text-2xl font-black text-emerald-600 leading-none" /><span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Venta Neta</span></div>
                                <div className="flex flex-col items-center justify-center text-center"><PremiumCountUp value={liveTickets.count > 0 ? liveTickets.total / liveTickets.count : 0} suffix="€" decimals={2} className="text-2xl font-black text-blue-600 leading-none" /><span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ticket Medio</span></div>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden self-start">
                            <div className="bg-purple-600 px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                                <h2 className="text-sm font-black uppercase tracking-wider">Horas Extras</h2>
                                <div className="flex items-center gap-4">
                                    {currentUserEmail === 'hhector7722@gmail.com' && (
                                        <button
                                            onClick={handleRecalculate}
                                            disabled={isRecalculating}
                                            className="text-[10px] font-black hover:text-white/80 transition-colors uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {isRecalculating ? <LoadingSpinner size="sm" /> : <RotateCcw size={12} />}
                                            Recalcular
                                        </button>
                                    )}
                                    <Link href="/dashboard/overtime" className="text-[10px] font-black hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link>
                                </div>
                            </div>
                            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                                {overtimeData.length === 0 ? (
                                    <div className="py-6 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest italic">No hay registros</div>
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
                    </div>
                    {/* Desktop Col 2: Cajas + Iconos */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-4 shadow-xl border border-gray-100 flex flex-col">
                            {boxes.filter(b => b.type === 'operational').map(box => (
                                <div key={box.id} className="flex flex-col h-full">
                                    <div className="flex flex-row gap-2 mb-4">
                                        <button
                                            onClick={() => router.push('/dashboard/movements')}
                                            className="grow-[1.5] basis-0 px-6 py-4 rounded-2xl bg-emerald-600 shadow-lg hover:bg-emerald-700 transition-all cursor-pointer flex flex-row items-center justify-between text-white active:scale-95"
                                        >
                                            <div className="flex flex-col items-start leading-none gap-1">
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Caja Inicial</span>
                                                <span className="text-3xl font-black">{box.current_balance.toFixed(2)}€</span>
                                            </div>
                                        </button>

                                        <div className="flex-[2] basis-0 grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => openTreasuryModal(box, 'in')}
                                                className="bg-transparent hover:bg-emerald-50/50 p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 group"
                                            >
                                                <div className="w-8 h-8 flex items-center justify-center bg-emerald-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                    <Plus size={16} strokeWidth={4} className="text-white" />
                                                </div>
                                                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest leading-none">Entrada</span>
                                            </button>
                                            <button
                                                onClick={() => openTreasuryModal(box, 'out')}
                                                className="bg-transparent hover:bg-rose-50/50 p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 group"
                                            >
                                                <div className="w-8 h-8 flex items-center justify-center bg-rose-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                    <Minus size={16} strokeWidth={4} className="text-white" />
                                                </div>
                                                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest leading-none">Salida</span>
                                            </button>
                                            <button
                                                onClick={() => openTreasuryModal(box, 'audit')}
                                                className="bg-transparent hover:bg-orange-50/50 p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 group"
                                            >
                                                <div className="w-8 h-8 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                    <RefreshCw size={14} strokeWidth={4} className="text-white" />
                                                </div>
                                                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest leading-none">Arqueo</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <div className="flex items-center px-2 mb-1">
                                            {Math.abs(box.difference || 0) < 0.01 ? (
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-0.5"><Check className="w-3.5 h-3.5" /> 0.00€</span>
                                            ) : (
                                                <span className={cn(
                                                    "text-[10px] font-black uppercase tracking-widest",
                                                    (box.difference || 0) < 0 ? "text-rose-500" : "text-emerald-500"
                                                )}>
                                                    {(box.difference || 0) > 0 ? '+' : ''}
                                                    {(box.difference || 0).toFixed(2)}€
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center px-2 mb-3">
                                            <button onClick={() => setIsMovementsExpanded(!isMovementsExpanded)} className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Movimientos<ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isMovementsExpanded && "rotate-180")} /></button>
                                            <Link href="/dashboard/movements" className="text-[10px] font-black text-[#5B8FB9] bg-gray-50 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-all flex items-center gap-1 uppercase">Ver más <ArrowRight className="w-2.5 h-2.5" /></Link>
                                        </div>
                                        <div className={cn("overflow-hidden transition-all duration-300", isMovementsExpanded ? "flex-1 opacity-100" : "h-0 opacity-0")}>
                                            <div className="space-y-2 py-1 max-h-[140px] overflow-y-auto no-scrollbar">
                                                {boxMovements.length === 0 && <p className="text-[9px] text-gray-300 italic px-1 text-center py-4">Sin historial reciente</p>}
                                                {boxMovements.map(mov => (
                                                    <div key={mov.id} className="flex justify-between items-center text-[11px] bg-gray-50 p-3 rounded-2xl border border-gray-100/50">
                                                        <div className="flex items-center gap-2 overflow-hidden">{mov.type === 'OUT' ? <ArrowUpRight className="w-3 h-3 text-rose-400 shrink-0" /> : <ArrowDownLeft className="w-3 h-3 text-emerald-500 shrink-0" />}<span className="truncate max-w-[140px] text-gray-600 font-medium">{mov.notes || 'Sin nota'}</span></div>
                                                        <span className={cn("font-black", mov.type === 'OUT' ? 'text-rose-500' : 'text-emerald-600')}>{mov.type === 'OUT' ? '-' : '+'}{mov.amount.toFixed(2)}€</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                            <div className="bg-[#36606F] px-6 py-2.5 flex items-center text-white shrink-0">
                                <h3 className="text-sm font-black uppercase tracking-wider">Cajas Cambio</h3>
                            </div>
                            <div className="p-4 space-y-4">
                                {boxes.filter(b => b.type === 'change').slice(0, 2).map((box, idx) => {
                                    const diff = box.current_balance - 300;
                                    const isOk = Math.abs(diff) < 0.01;

                                    return (
                                        <div key={box.id} className="flex flex-row gap-2 items-center">
                                            {/* Caja Display */}
                                            <div className="grow-[1.5] basis-0 px-2 py-1 flex flex-row items-center justify-between">
                                                <div className="flex flex-col items-start leading-none gap-0.5">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Cambio {idx + 1}</span>
                                                    <span className="text-2xl font-black text-zinc-800">{box.current_balance.toFixed(2)}€</span>
                                                    {isOk ? (
                                                        <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5" strokeWidth={4} />
                                                    ) : (
                                                        <span className={cn("text-sm font-black mt-0.5", diff < 0 ? "text-rose-500" : "text-emerald-600")}>
                                                            {diff > 0 ? '+' : ''}{diff.toFixed(2)}€
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Botones de Acción */}
                                            <div className="flex-[1] basis-0 grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => { setSelectedBox(box); setCashModalMode('swap'); }}
                                                    className="bg-transparent hover:bg-blue-50/50 p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 group"
                                                >
                                                    <div className="w-8 h-8 flex items-center justify-center bg-blue-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                        <ArrowRightLeft size={14} strokeWidth={4} className="text-white" />
                                                    </div>
                                                    <span className="text-[9px] font-black text-zinc-900 uppercase tracking-widest leading-none">Cambiar</span>
                                                </button>
                                                <button
                                                    onClick={() => openTreasuryModal(box, 'audit')}
                                                    className="bg-transparent hover:bg-orange-50/50 p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 group"
                                                >
                                                    <div className="w-8 h-8 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                        <RefreshCw size={14} strokeWidth={4} className="text-white" />
                                                    </div>
                                                    <span className="text-[9px] font-black text-zinc-900 uppercase tracking-widest leading-none">Arqueo</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { title: 'Asistencia', img: '/icons/calendar.png', color: 'bg-emerald-500', link: '/registros' },
                                { title: 'Mano de Obra', img: '/icons/overtime.png', color: 'bg-blue-500', link: '/dashboard/labor' },
                                { title: 'Plantilla', img: '/icons/admin.png', color: 'bg-purple-500', link: '/staff' },
                                { title: 'Producto', img: '/icons/suppliers.png', color: 'bg-orange-500', link: '/ingredients' },
                            ].map((card, i) => (
                                <button key={i} onClick={() => { if (card.title === 'Plantilla') setIsStaffModalOpen(true); else if (card.title === 'Producto') setIsProductModalOpen(true); else if (card.link) router.push(card.link); }} className="bg-white rounded-2xl p-3 shadow-xl border border-gray-100 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group hover:bg-gray-50/50 aspect-square"><div className="w-16 h-16 flex items-center justify-center transition-transform group-hover:scale-110"><Image src={card.img} alt={card.title} width={64} height={64} priority={true} className="w-full h-full object-contain" /></div><span className="text-[8px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-1">{card.title}</span></button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ============ MOBILE LAYOUT ============ */}
                <div className="md:hidden flex flex-col gap-4">
                    {/* 1. VENTAS */}
                    <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                        <div className="bg-[#36606F] px-6 py-2 flex justify-between items-center text-white shrink-0 relative">
                            <div className="flex items-center gap-3"><div><h3 className="text-sm font-black uppercase tracking-wider">Ventas</h3></div></div>
                            <div className="absolute left-1/2 -translate-x-1/2"><LiveClock /></div>
                            <div className="flex items-center gap-3"><Link href="/dashboard/history" className="text-[10px] font-black pointer-events-auto hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link></div>
                        </div>
                        <div className="p-2.5 grid grid-cols-3 gap-y-2 gap-x-2 flex-1 items-center">
                            <div className="flex flex-col items-center justify-center text-center"><PremiumCountUp value={liveTickets.total} suffix="€" decimals={2} className="text-lg font-black text-black leading-none" /><span className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Ventas</span></div>
                            <div className="flex flex-col items-center justify-center text-center"><PremiumCountUp value={liveTickets.total > 0 ? liveTickets.total / 1.10 : 0} suffix="€" decimals={2} className="text-lg font-black text-emerald-600 leading-none" /><span className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Venta Neta</span></div>
                            <div className="flex flex-col items-center justify-center text-center"><PremiumCountUp value={liveTickets.count > 0 ? liveTickets.total / liveTickets.count : 0} suffix="€" decimals={2} className="text-lg font-black text-blue-600 leading-none" /><span className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Ticket Medio</span></div>
                        </div>
                    </div>

                    {/* 2. CAJA INICIAL + MOVIMIENTOS */}
                    <div className={cn("bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col transition-all duration-300", isMovementsExpanded ? "p-3" : "p-3 pb-1.5")}>
                        {boxes.filter(b => b.type === 'operational').map(box => (
                            <div key={box.id} className="flex flex-col h-full">
                                <div className="flex flex-row gap-1.5 mb-2">
                                    <button
                                        onClick={() => router.push('/dashboard/movements')}
                                        className="flex-[1.2] basis-0 px-3 py-2 rounded-2xl bg-emerald-600 shadow-lg hover:bg-emerald-700 transition-all cursor-pointer flex flex-row items-center justify-between text-white active:scale-95"
                                    >
                                        <div className="flex flex-col items-start leading-none gap-1">
                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-80">Caja Inicial</span>
                                            <span className="text-lg font-black">{box.current_balance.toFixed(2)}€</span>
                                        </div>
                                    </button>

                                    <div className="flex-[2] basis-0 grid grid-cols-3 gap-1.5">
                                        <button
                                            onClick={() => openTreasuryModal(box, 'in')}
                                            className="bg-transparent p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[48px]"
                                        >
                                            <div className="w-7 h-7 flex items-center justify-center bg-emerald-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                <Plus size={14} strokeWidth={4} className="text-white" />
                                            </div>
                                            <span className="text-[8px] font-medium text-zinc-500 uppercase tracking-widest leading-none">Entrada</span>
                                        </button>
                                        <button
                                            onClick={() => openTreasuryModal(box, 'out')}
                                            className="bg-transparent p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[48px]"
                                        >
                                            <div className="w-7 h-7 flex items-center justify-center bg-rose-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                <Minus size={14} strokeWidth={4} className="text-white" />
                                            </div>
                                            <span className="text-[8px] font-medium text-zinc-500 uppercase tracking-widest leading-none">Salida</span>
                                        </button>
                                        <button
                                            onClick={() => openTreasuryModal(box, 'audit')}
                                            className="bg-transparent p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[48px]"
                                        >
                                            <div className="w-7 h-7 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                <RefreshCw size={12} strokeWidth={4} className="text-white" />
                                            </div>
                                            <span className="text-[8px] font-medium text-zinc-500 uppercase tracking-widest leading-none">Arqueo</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center px-1 mb-1">
                                        {Math.abs(box.difference || 0) < 0.01 ? (
                                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> 0.00€</span>
                                        ) : (
                                            <span className={cn(
                                                "text-[8px] font-black uppercase tracking-widest",
                                                (box.difference || 0) < 0 ? "text-rose-500" : "text-emerald-500"
                                            )}>
                                                {(box.difference || 0) > 0 ? '+' : ''}
                                                {(box.difference || 0).toFixed(2)}€
                                            </span>
                                        )}
                                    </div>
                                    <div className={cn("flex justify-between items-center px-1", isMovementsExpanded ? "mb-2" : "mb-0")}>
                                        <button onClick={() => setIsMovementsExpanded(!isMovementsExpanded)} className="flex items-center gap-1 text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Movimientos<ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isMovementsExpanded && "rotate-180")} /></button>
                                        <Link href="/dashboard/movements" className="text-[8px] font-black text-[#5B8FB9] bg-gray-50 px-2 py-1 rounded-full hover:bg-gray-100 transition-all flex items-center gap-1 uppercase">Ver más <ArrowRight className="w-2 h-2" /></Link>
                                    </div>
                                    <div className={cn("overflow-hidden transition-all duration-300", isMovementsExpanded ? "flex-1 opacity-100" : "h-0 opacity-0")}>
                                        <div className="space-y-1.5 py-1 max-h-[100px] overflow-y-auto no-scrollbar">
                                            {boxMovements.length === 0 && <p className="text-[8px] text-gray-300 italic px-1 text-center py-2">Sin historial reciente</p>}
                                            {boxMovements.map(mov => (
                                                <div key={mov.id} className="flex justify-between items-center text-[9px] bg-gray-50 p-2 rounded-xl border border-gray-100/50">
                                                    <div className="flex items-center gap-1.5 overflow-hidden">{mov.type === 'OUT' ? <ArrowUpRight className="w-2.5 h-2.5 text-rose-400 shrink-0" /> : <ArrowDownLeft className="w-2.5 h-2.5 text-emerald-500 shrink-0" />}<span className="truncate max-w-[100px] text-gray-600 font-medium">{mov.notes || 'Sin nota'}</span></div>
                                                    <span className={cn("font-black", mov.type === 'OUT' ? 'text-rose-500' : 'text-emerald-600')}>{mov.type === 'OUT' ? '-' : '+'}{mov.amount.toFixed(2)}€</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 3. HORAS EXTRAS */}
                    <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden mb-1">
                        <div className="bg-purple-600 px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                            <h2 className="text-sm font-black uppercase tracking-wider">Horas Extras</h2>
                            <Link href="/dashboard/overtime" className="text-[10px] font-black hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link>
                        </div>
                        <div className="p-3 space-y-2.5 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                            {overtimeData.length === 0 ? (
                                <div className="py-6 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest italic">No hay registros</div>
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

                    {/* 4. FILA INFERIOR: Cajas de Cambio (izq) + Iconos (dcha) */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Columna izquierda: Cajas de cambio */}
                        <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                            <div className="bg-[#36606F] px-4 py-2 flex items-center text-white shrink-0">
                                <h3 className="text-[10px] font-black uppercase tracking-wider">Cajas Cambio</h3>
                            </div>
                            <div className="p-2 py-1 space-y-1.5 flex-1 flex flex-col justify-center">
                                {boxes.filter(b => b.type === 'change').slice(0, 2).map((box, idx) => {
                                    const diff = box.current_balance - 300;
                                    const isOk = Math.abs(diff) < 0.01;
                                    return (
                                        <div key={box.id} className="flex flex-row gap-1 items-center">
                                            {/* Caja Display */}
                                            <div className="flex-[1.2] basis-0 px-1 flex flex-col">
                                                <span className="text-[7px] font-black uppercase tracking-wider text-zinc-400">Cambio {idx + 1}</span>
                                                <span className="text-sm font-black text-zinc-800">{box.current_balance.toFixed(2)}€</span>
                                                {isOk ? (
                                                    <Check size={10} strokeWidth={4} className="text-emerald-500 mt-0.5" />
                                                ) : (
                                                    <span className={cn("text-[9px] font-black mt-0.5", diff < 0 ? "text-rose-500" : "text-emerald-600")}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}€
                                                    </span>
                                                )}
                                            </div>
                                            {/* Botones */}
                                            <div className="flex-[1.3] basis-0 flex justify-between items-center gap-1">
                                                <button
                                                    onClick={() => { setSelectedBox(box); setCashModalMode('swap'); }}
                                                    className="bg-transparent p-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[48px] -ml-1.5"
                                                >
                                                    <div className="w-6 h-6 flex items-center justify-center bg-blue-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                        <ArrowRightLeft size={10} strokeWidth={3} className="text-white" />
                                                    </div>
                                                    <span className="text-[6px] font-black text-zinc-900 uppercase tracking-wider leading-none">Cambiar</span>
                                                </button>
                                                <button
                                                    onClick={() => openTreasuryModal(box, 'audit')}
                                                    className="bg-transparent p-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[48px]"
                                                >
                                                    <div className="w-6 h-6 flex items-center justify-center bg-orange-500 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                        <RefreshCw size={10} strokeWidth={3} className="text-white" />
                                                    </div>
                                                    <span className="text-[6px] font-black text-zinc-900 uppercase tracking-wider leading-none">Arqueo</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Columna derecha: 2x2 Iconos */}
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { title: 'Asistencia', img: '/icons/calendar.png', color: 'bg-emerald-500', link: '/registros' },
                                { title: 'Mano de Obra', img: '/icons/overtime.png', color: 'bg-blue-500', link: '/dashboard/labor' },
                                { title: 'Plantilla', img: '/icons/admin.png', color: 'bg-purple-500', link: '/staff' },
                                { title: 'Producto', img: '/icons/suppliers.png', color: 'bg-orange-500', link: '/ingredients' },
                            ].map((card, i) => (
                                <button key={i} onClick={() => { if (card.title === 'Plantilla') setIsStaffModalOpen(true); else if (card.title === 'Producto') setIsProductModalOpen(true); else if (card.link) router.push(card.link); }} className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group aspect-square">
                                    <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110"><Image src={card.img} alt={card.title} width={40} height={40} priority={true} className="w-full h-full object-contain" /></div>
                                    <span className="text-[7px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5">{card.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
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
                                {cashModalMode === 'inventory' && <BoxInventoryView boxName={selectedBox?.name || 'Caja'} inventory={boxInventory} onBack={() => setCashModalMode('none')} />}
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
            {
                isStaffModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsStaffModalOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#36606F] px-8 py-4 flex justify-between items-center text-white shrink-0">
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
                                        <StaffGridItem
                                            key={emp.id}
                                            emp={emp}
                                            onClick={() => router.push(`/profile?id=${emp.id}`)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* MODAL: Crear Nuevo Trabajador */}
            {
                isNewWorkerModalOpen && (
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

                                <button
                                    onClick={() => setNewWorkerData({ ...newWorkerData, prefer_stock_hours: !newWorkerData.prefer_stock_hours })}
                                    className={cn(
                                        "w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all active:scale-[0.98]",
                                        newWorkerData.prefer_stock_hours
                                            ? "bg-purple-50 border-purple-200 text-purple-700"
                                            : "bg-white border-zinc-100 text-zinc-400"
                                    )}
                                >
                                    <div className="flex flex-col items-start gap-0.5 text-left">
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Preferencia de Pago</span>
                                        <span className={cn("text-sm font-black transition-colors", newWorkerData.prefer_stock_hours ? "text-purple-700" : "text-zinc-700")}>
                                            {newWorkerData.prefer_stock_hours ? 'Bolsa de Horas' : 'Pago Mensual'}
                                        </span>
                                    </div>
                                    <div className={cn(
                                        "w-10 h-6 rounded-full relative transition-all duration-300",
                                        newWorkerData.prefer_stock_hours ? "bg-purple-500" : "bg-zinc-200"
                                    )}>
                                        <div className={cn(
                                            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300",
                                            newWorkerData.prefer_stock_hours ? "left-5" : "left-1"
                                        )} />
                                    </div>
                                </button>
                            </div>

                            <div className="p-4 border-t border-zinc-100 flex gap-3">
                                <button onClick={() => setIsNewWorkerModalOpen(false)} className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-bold rounded-xl active:scale-95 transition-all text-sm">Cancelar</button>
                                <button
                                    onClick={handleCreateWorker}
                                    disabled={newWorkerSaving || !newWorkerData.first_name.trim()}
                                    className="flex-1 h-12 bg-[#5B8FB9] text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-200 text-sm disabled:opacity-50"
                                >
                                    {newWorkerSaving ? <LoadingSpinner size="sm" className="text-white" /> : <><Save size={18} /> Guardar</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {
                isProductModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setIsProductModalOpen(false)}>
                        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#36606F] px-8 py-4 flex justify-between items-center text-white shrink-0"><div><h3 className="text-lg font-black uppercase tracking-wider leading-none">Producto</h3><p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Gestión de Artículos</p></div><button onClick={() => setIsProductModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button></div>
                            <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                                {[
                                    { title: 'Recetas', img: '/icons/recipes.png', link: '/recipes', hover: 'hover:bg-red-50/30' },
                                    { title: 'Ingredientes', img: '/icons/ingrediente.png', link: '/ingredients', hover: 'hover:bg-orange-50/30' },
                                    { title: 'Pedidos', img: '/icons/shipment.png', link: '/orders/new', hover: 'hover:bg-emerald-50/30' },
                                    { title: 'Inventario', img: '/icons/inventory.png', hover: 'hover:bg-purple-50/30' },
                                    { title: 'Stock', img: '/icons/productes.png', hover: 'hover:bg-blue-50/30' },
                                    { title: 'Proveedores', img: '/icons/suplier.png', link: '/suppliers', hover: 'hover:bg-zinc-100/30' },
                                ].map((item, i) => (
                                    <button key={i} onClick={() => {
                                        if (item.title === 'Pedidos') {
                                            setIsProductModalOpen(false);
                                            setTimeout(() => setIsSupplierModalOpen(true), 150);
                                        } else if (item.link) {
                                            router.push(item.link);
                                        } else {
                                            toast.info(`${item.title} próximamente`);
                                        }
                                    }} className={cn("bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95", item.hover)}><div className="w-12 h-12 transition-transform group-hover:scale-110"><Image src={item.img} alt={item.title} width={48} height={48} className="w-full h-full object-contain" /></div><span className="font-black text-sm text-gray-700">{item.title}</span></button>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }
            <CashClosingModal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                onSuccess={fetchData}
                initialTotalSales={liveTickets.total}
                initialTicketsCount={liveTickets.count}
            />

            {/* MODAL HISTORIAL TRABAJADOR */}
            <WorkerWeeklyHistoryModal
                isOpen={!!selectedHistory}
                onClose={() => setSelectedHistory(null)}
                workerId={selectedHistory?.workerId || ''}
                weekStart={selectedHistory?.weekId || ''}
            />

            <SupplierSelectionModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
            />
        </div >
    );
}

export default AdminDashboardView;

