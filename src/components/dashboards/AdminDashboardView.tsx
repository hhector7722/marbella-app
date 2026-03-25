'use client';

import React, { useEffect, useState, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar, Search, Receipt,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, X, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw, Save,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart, ArrowLeft, ArrowRightLeft,
    PlusCircle, ArrowDown, ArrowUp, Plus as PlusIcon, Minus as MinusIcon, Check,
    Coins, Landmark, AlertTriangle, ChevronLeft, ChevronRight, Image as ImageIcon
} from 'lucide-react';

import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal, type BoxOption } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { AdminProductModal } from '@/components/modals/AdminProductModal';
import Link from 'next/link';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { CashBoxEditModal } from '@/components/modals/CashBoxEditModal';
import { getISOWeek, format, addDays, subDays, startOfWeek, parseISO, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn, calculateRoundedHours, getHourFromTicketTime } from '@/lib/utils';
import { BUSINESS_HOURS } from '@/lib/constants';
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
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';

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

    const formatCentsToEur = (cents: number, opts?: { showPlus?: boolean }) => {
        const showPlus = opts?.showPlus ?? false;
        const neg = cents < 0;
        const abs = Math.abs(cents);
        const euros = Math.trunc(abs / 100);
        const c = abs % 100;
        const prefix = neg ? '-' : (showPlus && cents > 0 ? '+' : '');
        return `${prefix}${euros}.${String(c).padStart(2, '0')}€`;
    };
    const [loading, setLoading] = useState(!initialData);
    const [dailyStats, setDailyStats] = useState<any>(initialData?.dailyStats || null);
    const [liveTickets, setLiveTickets] = useState(initialData?.liveTickets || { total: 0, count: 0 });
    const [salesChartData, setSalesChartData] = useState<{ hora: number; total: number }[]>(initialData?.salesChartData || Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
    const [isSalesExpanded, setIsSalesExpanded] = useState(false);
    const [salesTickets, setSalesTickets] = useState<any[]>([]);
    const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
    const [ticketLines, setTicketLines] = useState<any[]>([]);
    const [loadingTicketLines, setLoadingTicketLines] = useState(false);
    const [loadingSalesTickets, setLoadingSalesTickets] = useState(false);
    const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
    const [boxes, setBoxes] = useState<any[]>(initialData?.boxes || []);
    const [boxMovements, setBoxMovements] = useState<any[]>(initialData?.boxMovements || []);
    const [theoreticalBalance, setTheoreticalBalance] = useState<number>(initialData?.theoreticalBalance || 0);
    const [actualBalance, setActualBalance] = useState<number>(initialData?.actualBalance || 0);
    const [differenceCents, setDifferenceCents] = useState<number>(initialData?.differenceCents ?? Math.round((initialData?.difference ?? 0) * 100));
    const isDifferenceZero = differenceCents === 0;
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
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});
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
    // Ventas: fecha seleccionada y modal
    const [salesViewDate, setSalesViewDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const salesViewDateRef = useRef(salesViewDate);
    const [isSalesDateModalOpen, setIsSalesDateModalOpen] = useState(false);
    const [salesCalendarBaseDate, setSalesCalendarBaseDate] = useState(() => new Date());
    // Tooltip gráfica: al pulsar se muestra hora y total; círculo en el punto; arrastrable.
    const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    // Filtro tabla ventas por rango de horas (7-23)
    const [filterHourRange, setFilterHourRange] = useState<{ start: number; end: number } | null>(null);
    const [editingBox, setEditingBox] = useState<any>(null);

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

    /** Extrae la hora (0-23) del ticket; alineado con get_hourly_sales y getHourFromTicketTime. */
    const getTicketHour = (ticket: { hora_cierre?: string; fecha?: string }): number =>
        getHourFromTicketTime(ticket.hora_cierre, ticket.fecha);

    const fetchHourlySales = async (targetDate?: string) => {
        const dateStr = targetDate ?? format(new Date(), 'yyyy-MM-dd');
        try {
            const { data, error } = await supabase.rpc('get_hourly_sales', {
                p_start_date: dateStr,
                p_end_date: dateStr
            });
            if (!error && data && data.length > 0) {
                const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                data.forEach((r: { hora: number; total: number }) => {
                    const h = Number(r.hora);
                    if (h >= 0 && h < 24) hourly[h] = { hora: h, total: Number(r.total) || 0 };
                });
                setSalesChartData(hourly);
                return;
            }
            const { data: tickets } = await supabase
                .from('tickets_marbella')
                .select('hora_cierre, total_documento')
                .gte('fecha', dateStr)
                .lte('fecha', dateStr);
            const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
            (tickets || []).forEach((t: { hora_cierre?: string; total_documento?: number }) => {
                const hour = getHourFromTicketTime(t.hora_cierre);
                hourly[hour].total += Number(t.total_documento) || 0;
            });
            setSalesChartData(hourly);
        } catch {
            setSalesChartData(Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 })));
        }
    };

    // Cargar ventas para la fecha seleccionada (hoy u otra) — solo día en directo, sin línea de otras fechas
    const fetchSalesForDate = async (dateStr: string) => {
        await fetchHourlySales(dateStr);
        try {
            const { data: salesStats } = await supabase.rpc('get_daily_sales_stats', { target_date: dateStr });
            setLiveTickets({
                total: salesStats?.total_ventas ?? 0,
                count: salesStats?.recuento_tickets ?? 0
            });
        } catch {
            setLiveTickets({ total: 0, count: 0 });
        }
    };

    useEffect(() => {
        if (!initialData) fetchData();
        let lastDateStr = format(new Date(), 'yyyy-MM-dd');
        const dayCheckInterval = setInterval(() => {
            const nowStr = format(new Date(), 'yyyy-MM-dd');
            if (nowStr !== lastDateStr) {
                lastDateStr = nowStr;
                if (salesViewDate === nowStr) {
                    fetchHourlySales(nowStr);
                }
            }
        }, 60000);
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const channel = supabase
            .channel('realtime_tickets_dashboard')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'tickets_marbella',
                filter: `fecha=eq.${todayStr}`
            }, (payload: any) => {
                if (salesViewDateRef.current !== todayStr) return;
                const newTotal = Number(payload.new.total_documento) || 0;
                setLiveTickets((prev: { total: number; count: number }) => ({
                    total: prev.total + newTotal,
                    count: prev.count + (newTotal > 0 ? 1 : (newTotal < 0 ? -1 : 0))
                }));
                fetchHourlySales(todayStr);
            })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
            clearInterval(dayCheckInterval);
        };
    }, []);

    salesViewDateRef.current = salesViewDate;

    // Refetch ventas cuando cambia la fecha seleccionada
    useEffect(() => {
        fetchSalesForDate(salesViewDate);
    }, [salesViewDate]);

    // Cerrar punto seleccionado al tocar/clicar fuera de gráfica y de la tarjeta
    useEffect(() => {
        if (selectedChartHour === null) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const chartEl = chartContainerRef.current;
            const tooltipEl = tooltipRef.current;
            const target = e.target as Node;
            if (chartEl?.contains(target) || tooltipEl?.contains(target)) return;
            setSelectedChartHour(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [selectedChartHour]);

    // Lista de tickets: solo el modal de rango aplica filtro; pulsar gráfica no filtra tabla ni KPIs
    const displayTickets = filterHourRange === null
        ? salesTickets
        : salesTickets.filter((t) => {
            const h = getTicketHour(t);
            const lo = Math.min(filterHourRange.start, filterHourRange.end);
            const hi = Math.max(filterHourRange.start, filterHourRange.end);
            return h >= lo && h <= hi;
        });

    // Resumen para KPIs: solo filtro por rango (modal); sin filtro = liveTickets (RPC)
    const displaySummary = filterHourRange === null
        ? liveTickets
        : {
            total: displayTickets.reduce((s, t) => s + (Number(t.total_documento) || 0), 0),
            count: displayTickets.length
        };

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
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                if (salesViewDateRef.current === todayStr) {
                    setLiveTickets(data.liveTickets);
                    setSalesChartData(data.salesChartData || []);
                }
                setBoxes(data.boxes);
                setBoxMovements(data.boxMovements);
                setTheoreticalBalance(data.theoreticalBalance || 0);
                setActualBalance(data.actualBalance || 0);
                setDifferenceCents(data.differenceCents ?? Math.round((data.difference ?? 0) * 100));
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

    const buildPaymentSources = (): (BoxOption & PaymentSourceOption)[] => {
        const list: any[] = [];
        const op = boxes.find((b: any) => b.type === 'operational');
        const changeBoxes = boxes.filter((b: any) => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (op) list.push({ id: op.id, name: 'Caja inicial', shortLabel: 'Inicial', hasInventory: true, image_url: op.image_url });
        changeBoxes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Caja cambio ${i + 1}`, shortLabel: `Cambio ${i + 1}`, hasInventory: true, image_url: b.image_url }));
        list.push({ id: 'tpv1', name: 'TPV 1', shortLabel: 'TPV 1', hasInventory: false });
        list.push({ id: 'tpv2', name: 'TPV 2', shortLabel: 'TPV 2', hasInventory: false });
        return list;
    };

    const openPurchaseMultiSourceModal = async () => {
        const op = boxes.find((b: any) => b.type === 'operational');
        const changeBoxes = boxes.filter((b: any) => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        const boxesToLoad = [op, ...changeBoxes].filter(Boolean);
        const inv: Record<string, Record<number, number>> = {};
        for (const box of boxesToLoad) {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
            const map: Record<number, number> = {};
            data?.forEach((d: any) => { map[Number(d.denomination)] = d.quantity; });
            inv[box.id] = map;
        }
        setPurchaseInventoriesByBoxId(inv);
        setShowPurchaseMultiSourceModal(true);
    };

    const handlePurchaseMultiSourceSubmit = async (payload: PurchaseMultiSourcePayload) => {
        try {
            const baseNotes = payload.notes || 'Compra';
            const tpvParts = payload.sources
                .filter(s => s.sourceId === 'tpv1' || s.sourceId === 'tpv2')
                .filter(s => s.amount > 0.005)
                .map(s => `${s.sourceId === 'tpv1' ? 'TPV 1' : 'TPV 2'}: ${s.amount.toFixed(2)}€`);
            const notesWithTpv = tpvParts.length > 0 ? `${baseNotes} | ${tpvParts.join(', ')}` : baseNotes;
            const customDate = payload.customDate;

            for (const entry of payload.sources) {
                if (entry.sourceId === 'tpv1' || entry.sourceId === 'tpv2') continue;
                if (entry.amount < 0.005) continue;
                const breakdownForDb: Record<string, number> = {};
                Object.entries(entry.breakdown).forEach(([k, v]) => { if (v !== 0) breakdownForDb[String(k)] = v; });
                const row: any = {
                    box_id: entry.sourceId,
                    type: 'OUT',
                    amount: entry.amount,
                    breakdown: breakdownForDb,
                    notes: notesWithTpv
                };
                if (customDate) row.created_at = customDate;
                await supabase.from('treasury_log').insert(row);
            }

            if (payload.changeAmount >= 0.01 && payload.changeDestinationBoxId) {
                const changeBreakdownForDb: Record<string, number> = {};
                Object.entries(payload.changeBreakdown).forEach(([k, v]) => { if (v !== 0) changeBreakdownForDb[String(k)] = v; });
                const inRow: any = {
                    box_id: payload.changeDestinationBoxId,
                    type: 'IN',
                    amount: payload.changeAmount,
                    breakdown: changeBreakdownForDb,
                    notes: 'Cambio (compra)'
                };
                if (customDate) inRow.created_at = customDate;
                await supabase.from('treasury_log').insert(inRow);
            }

            setShowPurchaseMultiSourceModal(false);
            setPurchaseInventoriesByBoxId({});
            fetchData();
            toast.success('Compra registrada');
        } catch (error) {
            console.error(error);
            toast.error('Error al registrar la compra');
        }
    };

    const handleRecalculate = async () => {
        if (!confirm("¿Seguro que quieres recalcular todos los balances?")) return;
        setIsRecalculating(true);
        try {
            const res = await recalculateAllBalances();
            if (res.success) { toast.success(res.message); fetchData(); }
        } catch (e: any) { toast.error(e.message); } finally { setIsRecalculating(false); }
    }

    useEffect(() => {
        if (!isSalesExpanded && filterHourRange === null) return;
        let cancelled = false;
        setLoadingSalesTickets(true);
        supabase
            .from('tickets_marbella')
            .select('numero_documento, fecha, hora_cierre, total_documento')
            .gte('fecha', salesViewDate)
            .lte('fecha', salesViewDate)
            .order('fecha', { ascending: false })
            .order('hora_cierre', { ascending: false })
            .limit(100)
            .then(({ data, error }) => {
                if (!cancelled) {
                    if (error) {
                        console.warn('Error fetching sales tickets:', error);
                        setSalesTickets([]);
                    } else {
                        setSalesTickets(data || []);
                    }
                    setLoadingSalesTickets(false);
                }
            });
        return () => { cancelled = true; };
    }, [isSalesExpanded, salesViewDate, filterHourRange]);

    const toggleTicket = async (numero_documento: string) => {
        if (expandedTicket === numero_documento) {
            setExpandedTicket(null);
            return;
        }
        setExpandedTicket(numero_documento);
        setLoadingTicketLines(true);
        setTicketLines([]);
        try {
            const { data, error } = await supabase.rpc('get_ticket_lines', { p_numero_documento: numero_documento });
            if (error) throw error;
            const groupedLines = (data || []).reduce((acc: any, line: any) => {
                const key = `${line.articulo_nombre}-${line.precio_unidad}`;
                const qty = Number(line.cantidad ?? line.unidades ?? 0);
                const total = Number(line.importe_total ?? 0);
                if (!acc[key]) {
                    acc[key] = { ...line, unidades: qty, importe_total: total };
                } else {
                    acc[key].unidades += qty;
                    acc[key].importe_total += total;
                }
                return acc;
            }, {});
            setTicketLines(Object.values(groupedLines));
        } catch (err) {
            console.error('Error fetching ticket lines:', err);
            toast.error('Error al cargar detalles del ticket');
        } finally {
            setLoadingTicketLines(false);
        }
    };

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

    // ====== BLOQUES REUTILIZABLES (para móvil / escritorio) ======

    const ventasSection = (
        <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                    <div className="bg-[#36606F] px-2 py-1 flex items-center justify-between gap-2 text-white shrink-0">
                        <Link
                            href="/dashboard/ventas"
                            className={cn(
                                "py-1 px-2.5 md:py-1.5 md:px-3 flex items-center justify-center rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest",
                                "bg-[#407080] text-white hover:bg-[#467888] active:scale-[0.98] transition-all cursor-pointer border-0 shadow-none"
                            )}
                        >
                            Ventas
                        </Link>
                        <div className="flex-1 flex items-center justify-center min-w-0">
                            <div className="inline-flex items-center gap-1 md:gap-1.5 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const [y, m, d] = salesViewDate.split('-').map(Number);
                                        const current = new Date(y, (m || 1) - 1, d || 1);
                                        const prev = subDays(current, 1);
                                        setSalesViewDate(format(prev, 'yyyy-MM-dd'));
                                    }}
                                    className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer touch-manipulation"
                                    aria-label="Día anterior"
                                >
                                    <ChevronLeft className="w-5 h-5 md:w-5 md:h-5 text-white" />
                                </button>
                                <button
                                    onClick={() => {
                                        const [y, m, d] = salesViewDate.split('-').map(Number);
                                        setSalesCalendarBaseDate(new Date(y, (m || 1) - 1, d || 1));
                                        setIsSalesDateModalOpen(true);
                                    }}
                                    className="shrink-0 min-h-[48px] flex flex-col items-center justify-center py-1 px-2 rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer"
                                >
                                    {isToday(new Date(salesViewDate)) ? (
                                        <LiveClock />
                                    ) : (
                                        <>
                                            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/90 whitespace-nowrap">
                                                {(() => {
                                                    const [y, m, d] = salesViewDate.split('-').map(Number);
                                                    return format(new Date(y, (m || 1) - 1, d || 1), "eee d MMM", { locale: es }).replace('.', '');
                                                })()}
                                            </span>
                                            <span className="text-[8px] font-medium text-white/60">histórico</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const [y, m, d] = salesViewDate.split('-').map(Number);
                                        const current = new Date(y, (m || 1) - 1, d || 1);
                                        const next = addDays(current, 1);
                                        if (format(next, 'yyyy-MM-dd') <= format(new Date(), 'yyyy-MM-dd')) setSalesViewDate(format(next, 'yyyy-MM-dd'));
                                    }}
                                    className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                                    aria-label="Día siguiente"
                                    disabled={(() => {
                                        const [y, m, d] = salesViewDate.split('-').map(Number);
                                        const next = addDays(new Date(y, (m || 1) - 1, d || 1), 1);
                                        return format(next, 'yyyy-MM-dd') > format(new Date(), 'yyyy-MM-dd');
                                    })()}
                                >
                                    <ChevronRight className="w-5 h-5 md:w-5 md:h-5 text-white" />
                                </button>
                            </div>
                        </div>
                        <Link
                            href="/dashboard/history"
                            className={cn(
                                "py-1 px-2.5 md:py-1.5 md:px-3 flex items-center justify-center rounded-lg text-[9px] md:text-[10px] font-bold uppercase tracking-widest",
                                "bg-[#407080] text-white hover:bg-[#467888] active:scale-[0.98] transition-all cursor-pointer border-0 shadow-none"
                            )}
                        >
                            Cierres
                        </Link>
                    </div>
                    <div className={cn("p-3 md:p-2.5 grid grid-cols-3 gap-2 md:gap-4 items-center shrink-0 transition-all duration-300", isSalesExpanded ? "pb-1" : "pb-0")}>
                        <button
                            onClick={() => setIsSalesExpanded(!isSalesExpanded)}
                            className="flex flex-col items-center justify-center text-center min-h-[48px] w-full rounded-xl hover:bg-zinc-50/50 active:scale-[0.98] transition-all cursor-pointer group"
                        >
                            <PremiumCountUp
                                value={displaySummary.total}
                                suffix="€"
                                decimals={2}
                                className="text-lg md:text-3xl font-black text-black leading-none"
                            />
                            <span className="flex items-center justify-center gap-1 mt-1">
                                <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ventas</span>
                                <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-transform duration-200 shrink-0", isSalesExpanded && "rotate-180")} />
                            </span>
                        </button>
                        <div className="flex flex-col items-center justify-center text-center">
                            <PremiumCountUp
                                value={displaySummary.total > 0 ? displaySummary.total / 1.10 : 0}
                                suffix="€"
                                decimals={2}
                                className="text-lg md:text-3xl font-black text-emerald-600 leading-none"
                            />
                            <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Venta Neta</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center">
                            <PremiumCountUp
                                value={displaySummary.count > 0 ? displaySummary.total / displaySummary.count : 0}
                                suffix="€"
                                decimals={2}
                                className="text-lg md:text-3xl font-black text-blue-600 leading-none"
                            />
                            <span className="text-[7px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ticket Medio</span>
                        </div>
                    </div>
                    {/* Gráfica 7–23h: pulsar muestra círculo petróleo (circular) y tarjeta encima con hora y facturación hasta esa hora */}
                    {(() => {
                        const chartData = salesChartData;
                        const rangeData = chartData.slice(BUSINESS_HOURS.start, BUSINESS_HOURS.end + 1);
                        const maxMain = Math.max(...rangeData.map(d => d.total), 0);
                        const scaleMax = Math.max(maxMain, 1);
                        const hasData = maxMain > 0;
                        if (!hasData) return null;
                        const numPoints = rangeData.length;
                        // No permitir seleccionar una hora que aún no ha ocurrido (solo si es el día actual)
                        const maxSelectableHour = isToday(new Date(salesViewDate))
                            ? new Date().getHours()
                            : BUSINESS_HOURS.end;
                        const toPath = (data: { hora: number; total: number }[]) => {
                            const pts = data.map((d, i) => {
                                const x = (i / (numPoints - 1 || 1)) * 120;
                                const y = 22 - (d.total / scaleMax) * 18;
                                return `${x},${y}`;
                            });
                            return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
                        };
                        const getHourFromClientX = (clientX: number): number => {
                            const el = chartContainerRef.current;
                            if (!el) return BUSINESS_HOURS.start;
                            const rect = el.getBoundingClientRect();
                            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                            const rawHour = BUSINESS_HOURS.start + Math.round(ratio * (numPoints - 1));
                            return Math.min(maxSelectableHour, Math.max(BUSINESS_HOURS.start, rawHour));
                        };
                        const handleChartTap = (clientX: number) => {
                            const hour = getHourFromClientX(clientX);
                            if (hour <= maxSelectableHour) setSelectedChartHour(hour);
                        };
                        // Facturación acumulada desde las 7:00 hasta la hora seleccionada (inclusive)
                        const totalHastaHora = selectedChartHour === null ? 0 : Array.from(
                            { length: selectedChartHour - BUSINESS_HOURS.start + 1 },
                            (_, i) => chartData[BUSINESS_HOURS.start + i]?.total ?? 0
                        ).reduce((a, b) => a + Number(b), 0);
                        return (
                            <div className="w-full pb-1 pt-0 -mt-1 shrink-0">
                                <div
                                    ref={chartContainerRef}
                                    className="w-full relative"
                                    onClick={(e) => handleChartTap(e.clientX)}
                                    onTouchEnd={(e) => {
                                        if (e.changedTouches.length) {
                                            e.preventDefault();
                                            handleChartTap(e.changedTouches[0].clientX);
                                        }
                                    }}
                                >
                                    <svg viewBox="0 0 120 24" className="w-full h-8 md:h-10 block select-none" preserveAspectRatio="none">
                                        <path
                                            d={toPath(rangeData)}
                                            fill="none"
                                            stroke="#36606F"
                                            strokeWidth="2"
                                            strokeLinecap="butt"
                                            strokeLinejoin="miter"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    </svg>
                                </div>
                                <div className="flex justify-between px-3 text-[9px] font-mono text-[#36606F] leading-none select-none pointer-events-none mt-0.5">
                                    <span>7h</span>
                                    <span>23h</span>
                                </div>
                                {selectedChartHour !== null && (() => {
                                    const idx = selectedChartHour - BUSINESS_HOURS.start;
                                    const xPct = (idx / (numPoints - 1 || 1)) * 100;
                                    const yView = 22 - ((chartData[selectedChartHour]?.total ?? 0) / scaleMax) * 18;
                                    const yPct = (yView / 24) * 100;
                                    const rect = chartContainerRef.current?.getBoundingClientRect();
                                    const pointLeft = rect ? rect.left + (xPct / 100) * rect.width : 0;
                                    const pointTop = rect ? rect.top + (yPct / 100) * rect.height : 0;
                                    const tooltipEl = (
                                        <div className="fixed z-[100] pointer-events-none" style={{ left: pointLeft, top: pointTop, transform: 'translate(-50%, -100%)', marginTop: '-4px' }}>
                                            <div ref={tooltipRef} className="rounded-lg bg-white border border-zinc-200 shadow-lg px-2.5 py-1.5 text-center min-w-[4rem]">
                                                <div className="text-[10px] md:text-xs font-mono font-bold text-zinc-800 leading-tight">{String(selectedChartHour).padStart(2, '0')}:00</div>
                                                <div className="text-[10px] md:text-xs font-black tabular-nums text-emerald-600 leading-tight">{totalHastaHora.toFixed(2)}€</div>
                                            </div>
                                            <div className="absolute left-1/2 top-full w-3 h-3 rounded-full bg-[#36606F] border-2 border-white shadow-sm -translate-x-1/2 -translate-y-1/2" />
                                        </div>
                                    );
                                    return typeof document !== 'undefined' ? createPortal(tooltipEl, document.body) : null;
                                })()}
                            </div>
                        );
                    })()}
                    <div className={cn("overflow-hidden transition-all duration-300 shrink-0", isSalesExpanded ? "opacity-100" : "h-0 opacity-0")}>
                        <div className={cn("pt-1 pb-1 px-1 space-y-1 transition-all duration-300", expandedTicket ? "overflow-y-auto no-scrollbar max-h-none" : "overflow-y-auto no-scrollbar max-h-[200px] md:max-h-[280px]")}>
                            {loadingSalesTickets ? (
                                <div className="flex justify-center py-8">
                                    <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                </div>
                            ) : salesTickets.length === 0 ? (
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-300 italic px-2 py-6 text-center">
                                    {isToday(new Date(salesViewDate)) ? 'Sin tickets hoy' : 'Sin tickets este día'}
                                </p>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-zinc-100 overflow-hidden max-md:[&_table_th]:border-r-0 max-md:[&_table_td]:border-r-0 relative">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#36606F] text-white text-[8px] md:text-[9px] font-black uppercase tracking-wider">
                                            <tr>
                                                <th className="py-2 px-2 md:px-3">Hora</th>
                                                <th className="py-2 px-2 md:px-3">Doc</th>
                                                <th className="py-2 px-2 md:px-3 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-[10px] md:text-xs font-bold text-zinc-600">
                                            {displayTickets.length === 0 && filterHourRange !== null ? (
                                                <tr>
                                                    <td colSpan={3} className="py-4 text-center text-[9px] font-bold text-zinc-400">
                                                        Ningún ticket entre {String(filterHourRange.start).padStart(2, '0')}:00 y {String(filterHourRange.end).padStart(2, '0')}:00
                                                    </td>
                                                </tr>
                                            ) : displayTickets.map((ticket, idx) => {
                                                const cleanDoc = ticket.numero_documento?.replace(/0+/, '') || '';
                                                const rawTime = ticket.hora_cierre;
                                                let hora = '---';
                                                if (rawTime && typeof rawTime === 'string') {
                                                    const t = rawTime.includes('T') ? rawTime.split('T')[1] : rawTime;
                                                    if (t && t !== '00:00:00' && t.length >= 5) hora = t.substring(0, 5);
                                                } else if (ticket.fecha?.includes?.('T')) {
                                                    const f = ticket.fecha.split('T')[1];
                                                    if (f && f !== '00:00:00') hora = f.substring(0, 5);
                                                }
                                                return (
                                                    <React.Fragment key={ticket.numero_documento || idx}>
                                                        <tr
                                                            onClick={() => toggleTicket(ticket.numero_documento)}
                                                            className={cn(
                                                                "cursor-pointer hover:bg-zinc-50 transition-colors active:bg-zinc-100",
                                                                expandedTicket === ticket.numero_documento && "bg-zinc-50"
                                                            )}
                                                        >
                                                            <td className="py-2 px-2 md:px-3 font-mono text-zinc-500">{hora}</td>
                                                            <td className="py-2 px-2 md:px-3 font-mono text-zinc-700">{cleanDoc}</td>
                                                            <td className={cn("py-2 px-2 md:px-3 text-right font-black tabular-nums", (ticket.total_documento || 0) > 0 ? "text-emerald-500" : "text-zinc-600")}>
                                                                {(ticket.total_documento || 0) !== 0 ? `${Number(ticket.total_documento).toFixed(2)}€` : ' '}
                                                            </td>
                                                        </tr>
                                                        {expandedTicket === ticket.numero_documento && (
                                                            <tr className="bg-zinc-50/50">
                                                                <td colSpan={3} className="px-2 py-2 md:px-3 md:py-3">
                                                                    <div className="bg-[#fcfcfc] rounded-xl p-2 md:p-3 animate-in slide-in-from-top-2 duration-200">
                                                                        {loadingTicketLines ? (
                                                                            <div className="flex justify-center py-4">
                                                                                <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                                                            </div>
                                                                        ) : ticketLines.length === 0 ? (
                                                                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-300 text-center py-2">Sin detalles</p>
                                                                        ) : (
                                                                            <table className="w-full text-left border-collapse table-fixed">
                                                                                <thead>
                                                                                    <tr className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                                                                                        <th className="py-1.5 px-1 text-center w-8">Cant</th>
                                                                                        <th className="py-1.5 px-1 md:px-2 w-[45%]">Producto</th>
                                                                                        <th className="py-1.5 px-1 text-right">Precio</th>
                                                                                        <th className="py-1.5 px-1 text-right">Total</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="text-[9px] md:text-[10px] font-bold text-zinc-500">
                                                                                    {ticketLines.map((line, lIdx) => (
                                                                                        <tr key={lIdx} className="border-b border-zinc-100/50 last:border-0">
                                                                                            <td className="py-1.5 px-1 text-center tabular-nums text-zinc-400">{line.unidades !== 0 ? line.unidades : ' '}</td>
                                                                                            <td className="py-1.5 px-1 md:px-2 text-zinc-700 min-w-0 truncate">{line.articulo_nombre}</td>
                                                                                            <td className="py-1.5 px-1 text-right tabular-nums">{line.precio_unidad !== 0 ? line.precio_unidad.toFixed(2) : ' '}</td>
                                                                                            <td className="py-1.5 px-1 text-right font-black tabular-nums text-emerald-600/70">{line.importe_total !== 0 ? line.importe_total.toFixed(2) : ' '}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
    );

    const cajaInicialSection = (
        <div className={cn("bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col transition-all duration-300", isMovementsExpanded ? "p-3" : "p-2 pb-0.5")}>
            {boxes.filter(b => b.type === 'operational').map(box => (
                        <div key={box.id} className="flex flex-col h-full">
                            <div className="flex flex-row gap-1.5 md:gap-2 items-center">
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => router.push('/dashboard/movements')} className="shrink-0 w-fit min-w-0 px-3 py-2 md:py-2 rounded-xl bg-emerald-600 shadow-lg hover:bg-emerald-700 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-white active:scale-95">
                                        <span className="text-sm md:text-base font-black leading-none">
                                            {Math.abs(actualBalance) > 0.005 ? `${actualBalance.toFixed(2)}€` : " "}
                                        </span>
                                        <span className="text-[7px] md:text-[9px] font-black uppercase tracking-wider opacity-80">Caja Inicial</span>
                                    </button>
                                </div>
                                <div className="flex items-center justify-center min-w-0 flex-1">
                                    {isDifferenceZero ? (
                                        <span className="text-emerald-500 flex items-center">
                                            <Check className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={3} />
                                        </span>
                                    ) : (
                                        <span className={cn("text-[8px] md:text-[9px] font-black uppercase tracking-wider flex items-center gap-1", differenceCents < 0 ? "text-rose-500" : "text-emerald-500")}>
                                            <AlertTriangle className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" strokeWidth={3} />
                                            {formatCentsToEur(differenceCents, { showPlus: true })}
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
                                    <button onClick={() => openPurchaseMultiSourceModal()} className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group">
                                        <div className="w-6 h-6 flex items-center justify-center bg-[#5B8FB9] rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <ShoppingCart size={12} className="text-white" strokeWidth={2.5} />
                                        </div>
                                        <span className="text-[6px] md:text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Compra</span>
                                    </button>
                                    <button onClick={() => openTreasuryModal(box, 'audit')} className="bg-zinc-50/50 p-1.5 rounded-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group">
                                        <div className="w-6 h-6 flex items-center justify-center bg-orange-400 rounded-full shadow-sm group-hover:scale-110 transition-transform">
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
                                    <Link href="/dashboard/movements" className="text-[7px] md:text-[8px] font-black text-[#5B8FB9] bg-zinc-50 px-2 py-1 rounded-full hover:bg-gray-100 transition-all flex items-center gap-0.5 uppercase">
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
    );

    const horasExtrasSection = (
        <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
                    <div className="bg-purple-600 px-4 py-1.5 md:py-1 flex justify-between items-center text-white shrink-0 relative">
                        <h2 className="text-[10px] md:text-sm font-black uppercase tracking-wider">
                            <span className="md:hidden">H. EXTRAS</span>
                            <span className="hidden md:inline">Horas Extras</span>
                        </h2>
                        {/* Mes + flechas en cabecera, centrados (móvil y escritorio) */}
                        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                            <button type="button" onClick={() => setOvertimeViewMonth(prev => subMonths(prev, 1))} className="p-1 rounded-lg hover:bg-purple-500 text-white/90 hover:text-white transition-colors shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center" aria-label="Mes anterior">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-[10px] md:text-xs font-black uppercase tracking-wider text-white min-w-[70px] md:min-w-[80px] text-center">
                                {format(overtimeViewMonth, 'MMMM yyyy', { locale: es })}
                            </span>
                            <button type="button" onClick={() => setOvertimeViewMonth(prev => addMonths(prev, 1))} className="p-1 rounded-lg hover:bg-purple-500 text-white/90 hover:text-white transition-colors shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center" aria-label="Mes siguiente">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <Link href="/dashboard/overtime" className="text-[8px] md:text-[10px] font-black hover:text-white/80 transition-colors uppercase tracking-widest">Ver más</Link>
                    </div>
                    <div className="p-2 md:p-2">
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
    );

    const cajasCambioColumn = (
        <div className="flex flex-col gap-3 md:gap-3 min-h-0 h-full">
            <div className="flex flex-col gap-3 md:gap-3 flex-1 min-h-0 w-full max-w-full md:max-w-none h-full self-stretch">
                {(() => {
                    // Orden explícito por nombre: Cambio 1 → idx 0, Cambio 2 → idx 1
                    const changeBoxes = boxes
                        .filter(b => b.type === 'change')
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .slice(0, 2);
                    const formatEur = (v: number) =>
                        v > 0.005 ? (Math.abs(v - Math.round(v)) < 0.005 ? `${Math.round(v)}€` : `${v.toFixed(2)}€`) : " ";
                    return (
                        <>
                            {["Caja cambio 1", "Caja cambio 2"].map((title, idx) => {
                                const box = changeBoxes[idx];
                                if (!box) return null;
                                const diff = box.current_balance - 300;
                                const isOk = Math.abs(diff) < 0.01;
                                return (
                                    <div key={box.id} className="bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
                                        <div className="bg-[#36606F] pl-4 pr-2 md:pl-4 md:pr-3 py-1 md:py-1 flex items-center justify-between text-white shrink-0">
                                            <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-wider truncate">{title}</h3>
                                        </div>
                                        <div className="flex-1 flex items-center justify-center min-h-0 p-1.5 md:p-1.5 min-w-0">
                                            <div className="grid w-full min-w-0 grid-cols-3 items-center gap-x-1.5 sm:gap-x-2 md:gap-x-3 px-1 sm:px-1.5 md:px-2">
                                                <div className="min-w-0 flex flex-col items-start justify-center text-left">
                                                    <span className="max-w-full text-xs sm:text-sm md:text-base font-black tabular-nums leading-tight text-zinc-800 break-words">
                                                        {formatEur(box.current_balance)}
                                                    </span>
                                                    {!isOk && Math.abs(diff) > 0.005 && (
                                                        <span className={cn("text-[7px] md:text-[8px] font-black mt-0.5 tabular-nums leading-tight", diff < 0 ? "text-rose-500" : "text-emerald-600")}>
                                                            {diff > 0 ? `+${formatEur(diff)}` : `-${formatEur(Math.abs(diff))}`}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex min-h-[48px] min-w-0 items-center justify-center">
                                                    <button
                                                        onClick={() => { setCashModalMode('swap'); }}
                                                        className="bg-zinc-50/50 p-1.5 md:p-1 rounded-lg flex max-w-full flex-col items-center justify-center gap-1 md:gap-1.5 transition-all active:scale-95 group min-h-[48px] min-w-[48px] shrink-0"
                                                    >
                                                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm group-hover:scale-110 transition-transform md:h-5 md:w-5">
                                                            <ArrowRightLeft size={9} strokeWidth={2.5} />
                                                        </div>
                                                        <span className="max-w-[3.25rem] text-center text-[5px] font-black uppercase leading-none tracking-widest text-zinc-500 sm:max-w-none sm:text-[6px]">Cambiar</span>
                                                    </button>
                                                </div>
                                                <div className="flex min-h-[48px] min-w-0 items-center justify-center">
                                                    <button
                                                        onClick={() => openTreasuryModal(box, 'audit')}
                                                        className="bg-zinc-50/50 p-1.5 md:p-1 rounded-lg flex max-w-full flex-col items-center justify-center gap-1 md:gap-1.5 transition-all active:scale-95 group min-h-[48px] min-w-[48px] shrink-0"
                                                    >
                                                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm group-hover:scale-110 transition-transform md:h-5 md:w-5">
                                                            <RefreshCw size={9} strokeWidth={2.5} />
                                                        </div>
                                                        <span className="max-w-[3.25rem] text-center text-[5px] font-black uppercase leading-none tracking-widest text-zinc-500 sm:max-w-none sm:text-[6px]">Arqueo</span>
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
        </div>
    );

    const quickActionsColumn = (
        <div className="grid grid-cols-2 gap-3 md:gap-3 min-h-0 self-start md:self-stretch h-full">
            {[
                { title: 'Asistencia', img: '/icons/calendar.png', link: '/staff/history' },
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
                    className={cn(
                        "bg-white rounded-2xl p-2 md:p-1.5 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1.5 md:gap-1 active:scale-95 transition-all group w-full h-full min-h-0",
                        "aspect-square md:aspect-auto"
                    )}
                >
                    <div className="w-10 h-10 md:w-10 md:h-10 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0 aspect-square rounded-xl md:rounded-xl">
                        <Image src={card.img} alt={card.title} width={48} height={48} priority={true} className="w-full h-full object-contain" />
                    </div>
                    <span className="text-[9px] md:text-[8px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 shrink-0">
                        {card.title}
                    </span>
                </button>
            ))}
        </div>
    );

    return (
        <div className="pt-3 md:pt-3 animate-in fade-in duration-500 pb-8">
            <div className="px-4 w-full max-w-sm md:max-w-6xl mx-auto space-y-4 md:space-y-4">

                {/* ===== LAYOUT MÓVIL: igual que antes ===== */}
                <div className="space-y-4 md:hidden">
                    {ventasSection}
                    {cajaInicialSection}
                    {horasExtrasSection}

                    <div className="grid grid-cols-2 gap-4 items-stretch">
                        {cajasCambioColumn}
                        {quickActionsColumn}
                    </div>
                </div>

                {/* ===== LAYOUT ESCRITORIO ===== */}
                <div className="hidden md:flex md:flex-col md:gap-4">
                    {/* Fila superior: Ventas + Caja Inicial centrados al ancho del centro */}
                    <div className="grid grid-cols-[0.9fr,1.6fr,0.9fr] gap-4 items-start">
                        <div />
                        <div className="flex flex-col gap-4">
                            {ventasSection}
                            {cajaInicialSection}
                        </div>
                        <div />
                    </div>

                    {/* Fila inferior: Cajas cambio | Horas Extras | Iconos con misma altura */}
                    <div className="grid grid-cols-[0.9fr,1.6fr,0.9fr] gap-4 items-stretch">
                        <div className="h-full flex flex-col min-h-0">
                            {cajasCambioColumn}
                        </div>
                        <div className="h-full flex flex-col min-h-0">
                            {horasExtrasSection}
                        </div>
                        <div className="h-full flex flex-col min-h-0">
                            {quickActionsColumn}
                        </div>
                    </div>
                </div>

            </div> {/* Close max-w-6xl */}

            {cashModalMode !== 'none' && (
                <>
                    {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit' || cashModalMode === 'inventory') && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200" onClick={() => setCashModalMode('none')}>
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
                            boxOptions={buildPaymentSources()}
                            isManager={true}
                            onClose={() => setCashModalMode('none')}
                            onSuccess={() => { fetchData(); setCashModalMode('none'); }}
                        />
                    )}
                </>
            )}

            {showPurchaseMultiSourceModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-in fade-in duration-200" onClick={() => setShowPurchaseMultiSourceModal(false)}>
                    <div className={cn("bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]", "max-w-2xl")} onClick={(e) => e.stopPropagation()}>
                        <PurchaseMultiSourceForm
                            paymentSources={buildPaymentSources()}
                            inventoriesByBoxId={purchaseInventoriesByBoxId}
                            onSubmit={handlePurchaseMultiSourceSubmit}
                            onCancel={() => { setShowPurchaseMultiSourceModal(false); setPurchaseInventoriesByBoxId({}); }}
                        />
                    </div>
                </div>
            )}

            <StaffSelectionModal
                isOpen={isStaffModalOpen}
                onClose={() => setIsStaffModalOpen(false)}
                employees={allEmployees}
                onSelect={(emp) => router.push(`/profile?id=${emp.id}`)}
                title="Plantilla"
                variant="profile-list"
                onOpenTips={() => {
                    setIsStaffModalOpen(false);
                    router.push('/dashboard/propinas');
                }}
            />

            {isNewWorkerModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200" onClick={() => setIsNewWorkerModalOpen(false)}>
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
            {/* Modal semana: trabajadores + importe + checkbox; clic en nombre abre WorkerWeeklyHistoryModal; flechas navegan semanas */}
            {weekDetailModal && (() => {
                const weekStaff = (weekDetailModal.week.staff ?? []).filter((s: any) => {
                    const cost = (s.totalCost ?? s.amount ?? 0);
                    return cost > 0.05 && s.preferStock !== true;
                });
                const weekTotal = weekStaff.reduce((sum: number, s: any) => sum + (s.totalCost ?? s.amount ?? 0), 0);
                const paidTotal = weekStaff
                    .filter((s: any) => paidStatus[`${weekDetailModal.week.weekId}-${s.id}`] ?? !!s.isPaid)
                    .reduce((sum: number, s: any) => sum + (s.totalCost ?? s.amount ?? 0), 0);
                const weekNum = getISOWeek(new Date(weekDetailModal.week.weekId));
                const periodStr = `${format(new Date(weekDetailModal.week.weekId), 'd MMM', { locale: es })} - ${format(addDays(new Date(weekDetailModal.week.weekId), 6), 'd MMM yyyy', { locale: es })}`;
                const allWeeks = Array.from(new Map([...(overtimeData || []), ...(overtimeWeeksData || [])].map((w: any) => [w.weekId, w])).values());
                const sortedWeeks = [...allWeeks].sort((a: any, b: any) => a.weekId.localeCompare(b.weekId));
                const currentIdx = sortedWeeks.findIndex((w: any) => w.weekId === weekDetailModal.week.weekId);
                const prevWeek = currentIdx > 0 ? sortedWeeks[currentIdx - 1] : null;
                const nextWeek = currentIdx >= 0 && currentIdx < sortedWeeks.length - 1 ? sortedWeeks[currentIdx + 1] : null;
                return (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setWeekDetailModal(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between gap-3 shrink-0 relative">
                            <div className="flex flex-col items-start gap-1 shrink-0">
                                <span className="text-base font-black text-white leading-none">
                                    {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                                </span>
                                {paidTotal > 0.05 && (
                                    <span
                                        className="bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-md shadow-md leading-none"
                                        title="Total pagado"
                                    >
                                        {paidTotal.toFixed(0)}€ pagado
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 flex items-center justify-center min-w-0">
                                <div className="inline-flex items-center gap-1.5 sm:gap-2">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); if (prevWeek) setWeekDetailModal({ week: prevWeek }); }}
                                        disabled={!prevWeek}
                                        className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors text-white shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                                        aria-label="Semana anterior"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <div className="flex flex-col gap-0.5 text-center min-w-0">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-white whitespace-nowrap">Semana {weekNum}</h3>
                                        <span className="text-[10px] text-white/80 font-bold uppercase tracking-wider whitespace-nowrap">{periodStr}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); if (nextWeek) setWeekDetailModal({ week: nextWeek }); }}
                                        disabled={!nextWeek}
                                        className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors text-white shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                                        aria-label="Semana siguiente"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <button type="button" onClick={() => setWeekDetailModal(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 space-y-2">
                            {weekStaff.map((s: any) => (
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
                            {weekStaff.length === 0 && (
                                <p className="text-center text-zinc-400 text-xs font-bold uppercase tracking-widest py-4">Sin importes esta semana</p>
                            )}
                        </div>
                    </div>
                </div>
                );
            })()}
            <WorkerWeeklyHistoryModal isOpen={!!selectedHistory} onClose={() => setSelectedHistory(null)} workerId={selectedHistory?.workerId || ''} weekStart={selectedHistory?.weekId || ''} />
            <SupplierSelectionModal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} />

            {/* Modal selección fecha y rango horario ventas */}
            {isSalesDateModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setIsSalesDateModalOpen(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">Seleccionar fecha</h3>
                            <button onClick={() => setIsSalesDateModalOpen(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                                <X size={18} className="text-zinc-400" />
                            </button>
                        </div>
                        <div className="px-4 pb-2 flex items-center gap-2">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider shrink-0">Seleccionar hora</span>
                            <select
                                value={filterHourRange?.start ?? ''}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '') setFilterHourRange(null);
                                    else setFilterHourRange((prev) => ({ start: Number(v), end: prev?.end ?? 23 }));
                                }}
                                className="rounded-xl border border-zinc-200 px-2 py-2 text-[10px] font-mono font-bold min-h-[40px] flex-1"
                            >
                                <option value="">Todo el día</option>
                                {Array.from({ length: 17 }, (_, i) => i + 7).map((h) => (
                                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                            </select>
                            <span className="text-zinc-300 shrink-0">–</span>
                            <select
                                value={filterHourRange?.end ?? ''}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '') setFilterHourRange(null);
                                    else setFilterHourRange((prev) => ({ start: prev?.start ?? 7, end: Number(v) }));
                                }}
                                className="rounded-xl border border-zinc-200 px-2 py-2 text-[10px] font-mono font-bold min-h-[40px] flex-1"
                            >
                                <option value="">Todo el día</option>
                                {Array.from({ length: 17 }, (_, i) => i + 7).map((h) => (
                                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                        <div className="p-6 pt-0">
                            <div className="flex items-center justify-between mb-6 px-2">
                                <button onClick={() => setSalesCalendarBaseDate(subMonths(salesCalendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                                    <ChevronLeft size={20} className="text-zinc-400" />
                                </button>
                                <span className="font-black text-zinc-900 text-xs uppercase tracking-tight">{format(salesCalendarBaseDate, 'MMMM yyyy', { locale: es })}</span>
                                <button onClick={() => setSalesCalendarBaseDate(addMonths(salesCalendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                                    <ChevronRight size={20} className="text-zinc-400" />
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">{d}</div>
                                ))}
                                {(() => {
                                    const year = salesCalendarBaseDate.getFullYear();
                                    const month = salesCalendarBaseDate.getMonth();
                                    const firstDay = new Date(year, month, 1);
                                    const lastDay = new Date(year, month + 1, 0);
                                    const days: (number | null)[] = [];
                                    const startDay = (firstDay.getDay() + 6) % 7;
                                    for (let i = 0; i < startDay; i++) days.push(null);
                                    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
                                    return days.map((day, i) => {
                                        if (!day) return <div key={i} />;
                                        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const isSelected = salesViewDate === dStr;
                                        const today = new Date();
                                        const isFuture = new Date(year, month, day) > new Date(today.getFullYear(), today.getMonth(), today.getDate());
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    if (!isFuture) {
                                                        setSalesViewDate(dStr);
                                                        setIsSalesDateModalOpen(false);
                                                    }
                                                }}
                                                disabled={isFuture}
                                                className={cn(
                                                    "aspect-square flex items-center justify-center rounded-2xl text-[11px] font-black transition-all min-h-[48px]",
                                                    isSelected ? "bg-[#36606F] text-white shadow-xl" : isFuture ? "text-zinc-300 cursor-not-allowed" : "hover:bg-zinc-50 text-zinc-600 active:scale-95"
                                                )}
                                            >
                                                {day}
                                            </button>
                                        );
                                    });
                                })()}
                            </div>
                            {!isToday(new Date(salesViewDate)) && (
                                <button
                                    onClick={() => {
                                        setSalesViewDate(format(new Date(), 'yyyy-MM-dd'));
                                        setIsSalesDateModalOpen(false);
                                    }}
                                    className="mt-6 w-full py-3 rounded-2xl bg-[#5B8FB9] text-white font-black text-xs uppercase tracking-widest hover:bg-[#4a7a9e] active:scale-[0.98] transition-all"
                                >
                                    Ver hoy
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editingBox && (
                <CashBoxEditModal
                    box={editingBox}
                    onClose={() => setEditingBox(null)}
                    onSuccess={() => { fetchData(); setEditingBox(null); }}
                />
            )}
        </div>
    );
}

export default AdminDashboardView;
