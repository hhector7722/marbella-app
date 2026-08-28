'use client';

import React, { useEffect, useState, memo } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    History, Users, TrendingUp, ChevronDown, Wallet, CloudSun, Calendar, Search, Receipt,
    ArrowRight, ArrowUpRight, ArrowDownLeft, Clock, UserCircle, FileText,
    CheckCircle, AlertCircle, Circle, CheckCircle2, Plus, Minus, RefreshCw,
    Package, Utensils, ChefHat, Truck, ClipboardList, ShoppingCart, ArrowLeft, ArrowRightLeft,
    PlusCircle, ArrowDown, ArrowUp, Plus as PlusIcon, Minus as MinusIcon, Check,
    Coins, Landmark, AlertTriangle, ChevronLeft, ChevronRight, Image as ImageIcon
} from 'lucide-react';

import { CashChangeModal, type BoxOption } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { AdminProductModal } from '@/components/modals/AdminProductModal';
import Link from 'next/link';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { updateProfile } from '@/app/actions/profile';
import { Modal } from '@/components/ui/modal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { getISOWeek, format, addDays, subDays, startOfWeek, parseISO, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn, calculateRoundedHours } from '@/lib/utils';
import { getOvertimeData, togglePaidStatus, togglePreferStockStatus } from '@/app/actions/overtime';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import { Surface } from '@/components/ui/Surface';
import { EmptyState } from '@/components/ui/EmptyState';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { getDashboardData } from '@/app/actions/get-dashboard-data';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { CashDenominationForm, CASH_COUNT_FORM_ID } from '@/components/CashDenominationForm';
import { BoxInventoryView } from '@/components/BoxInventoryView';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { CashCountDateButton, formatCashCountDateInput } from '@/components/cash/CashCountDateButton';
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { namedEntitySummary } from '@/lib/usage/modal-apply';
import { WorkerListSummary, WorkerPersonRow } from '@/components/staff/WorkerPersonRow';

// Sub-components
const StaffOvertimeRow = memo(({
    staff,
    weekId,
    isPaid,
    onTogglePaid,
    onClick
}: {
    staff: any,
    weekId: string,
    isPaid: boolean,
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean) => void,
    onClick: () => void
}) => (
    <WorkerPersonRow
        name={staff.name}
        value={staff.amount > 0.05 ? `${staff.amount.toFixed(0)}€` : ' '}
        onClick={onClick}
        trailing={
            <button
                type="button"
                onClick={(e) => onTogglePaid(e, weekId, staff.id, !isPaid)}
                className={cn(
                    'flex h-8 w-8 items-center justify-center',
                    isPaid ? '' : 'text-zinc-300 hover:text-zinc-400',
                )}
                aria-label={isPaid ? 'Marcar no pagado' : 'Marcar pagado'}
            >
                {isPaid ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} />
                    </span>
                ) : (
                    <Circle className="h-5 w-5" />
                )}
            </button>
        }
    />
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
    const [treasuryLoading, setTreasuryLoading] = useState(!initialData);
    const [dailyStats, setDailyStats] = useState<any>(initialData?.dailyStats || null);
    const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
    const [boxes, setBoxes] = useState<any[]>(initialData?.boxes || []);
    const [boxMovements, setBoxMovements] = useState<any[]>(initialData?.boxMovements || []);
    const [theoreticalBalance, setTheoreticalBalance] = useState<number>(initialData?.theoreticalBalance || 0);
    const [actualBalance, setActualBalance] = useState<number>(initialData?.actualBalance || 0);
    const [differenceCents, setDifferenceCents] = useState<number>(initialData?.differenceCents ?? Math.round((initialData?.difference ?? 0) * 100));
    const isDifferenceZero = differenceCents === 0;
    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>(initialData?.paidStatus || {});
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [allEmployees, setAllEmployees] = useState<any[]>(initialData?.allEmployees || []);
    const [allEmployeesIncludingInactive, setAllEmployeesIncludingInactive] = useState<any[] | null>(null);
    const [showAllEmployeesInPlantilla, setShowAllEmployeesInPlantilla] = useState(false);
    const [cashModalMode, setCashModalMode] = useState<CashModalMode>('none');
    const [cashCountTotal, setCashCountTotal] = useState(0);
    const [cashOpDate, setCashOpDate] = useState(formatCashCountDateInput);
    const [purchaseDate, setPurchaseDate] = useState(formatCashCountDateInput);
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});
    const [selectedHistory, setSelectedHistory] = useState<{ workerId: string, weekId: string } | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const [isDesktop, setIsDesktop] = useState(false);
    // Horas extras: carga independiente (no bloquea shell del dashboard)
    const [overtimeViewMonth, setOvertimeViewMonth] = useState(() => startOfMonth(new Date()));
    const [overtimeWeeksData, setOvertimeWeeksData] = useState<any[]>([]);
    const [overtimeLoading, setOvertimeLoading] = useState(true);
    const [overtimeRefreshKey, setOvertimeRefreshKey] = useState(0);
    const [weekDetailModal, setWeekDetailModal] = useState<{ week: any } | null>(null);

    useModalUsageTracking({
        open: cashModalMode !== 'none' && cashModalMode !== 'swap',
        usageId: `admin-treasury-${cashModalMode}`,
        usageLabel:
            cashModalMode === 'in' ? 'Entrada de caja'
            : cashModalMode === 'out' ? 'Salida de caja'
            : cashModalMode === 'audit' ? 'Arqueo de caja'
            : cashModalMode === 'inventory' ? 'Inventario de caja'
            : cashModalMode === 'menu' ? 'Menú tesorería'
            : 'Tesorería',
    });

    const trackAdminTreasury = useTrackModalApply('admin-treasury-menu', 'Menú tesorería');
    const trackAdminPurchaseMulti = useTrackModalApply('admin-purchase-multi-source', 'Compra multiorigen');
    const trackAdminOvertimeWeek = useTrackModalApply('admin-overtime-week-detail', 'Detalle semana horas extras');
    const trackAdminOvertimeWorker = useTrackModalApply('admin-overtime-worker-history', 'Historial trabajador horas extras');

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

    const ensureAllEmployeesIncludingInactive = async () => {
        if (allEmployeesIncludingInactive) return allEmployeesIncludingInactive;
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) {
            console.error(error);
            toast.error('Error al cargar plantilla completa');
            return null;
        }
        const cleaned = (data || []).filter((p: any) => {
            const name = (p.first_name || '').trim().toLowerCase();
            return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
        });
        setAllEmployeesIncludingInactive(cleaned);
        return cleaned;
    };

    const patchPlantillaVisibility = (employeeId: string, visible: boolean) => {
        const patch = (list: any[]) =>
            list.map((emp) =>
                emp.id === employeeId ? { ...emp, visible_in_plantilla: visible } : emp
            );

        setAllEmployeesIncludingInactive((prev) => (prev ? patch(prev) : prev));
        setAllEmployees((prev) => {
            if (visible) {
                if (prev.some((emp) => emp.id === employeeId)) return patch(prev);
                const match = allEmployeesIncludingInactive?.find((emp) => emp.id === employeeId);
                return match ? [...prev, { ...match, visible_in_plantilla: true }] : prev;
            }
            return prev.filter((emp) => emp.id !== employeeId);
        });
    };

    const handleTogglePlantillaVisibility = async (employeeId: string, visible: boolean) => {
        const previousVisible = allEmployeesIncludingInactive?.find((emp) => emp.id === employeeId)?.visible_in_plantilla !== false;
        patchPlantillaVisibility(employeeId, visible);

        const result = await updateProfile(employeeId, { visible_in_plantilla: visible });
        if (!result.success) {
            patchPlantillaVisibility(employeeId, previousVisible);
            toast.error(result.error || 'No se pudo actualizar la visibilidad');
            return;
        }

        toast.success(visible ? 'Trabajador visible en plantilla' : 'Trabajador oculto en plantilla');
    };

    /** Hora 0–23 según TPV (hora_cierre); alineado con get_hourly_sales. */
    useEffect(() => {
        if (!initialData) fetchData();
    }, []);

    // Fetch overtime por mes — paralelo al shell (tesorería/ventas)
    useEffect(() => {
        const start = format(startOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
        let cancelled = false;
        setOvertimeLoading(true);
        getOvertimeData(start, end).then((result) => {
            if (cancelled) return;
            const weeks = result?.weeksResult ?? [];
            setOvertimeWeeksData(weeks);
            const nextPaid: Record<string, boolean> = {};
            weeks.forEach((week: any) => {
                week.staff?.forEach((s: any) => {
                    nextPaid[`${week.weekId}-${s.id}`] = !!s.isPaid;
                });
            });
            setPaidStatus(nextPaid);
        }).catch(() => {
            if (!cancelled) {
                setOvertimeWeeksData([]);
                toast.error('No se pudieron cargar las horas extras');
            }
        }).finally(() => {
            if (!cancelled) setOvertimeLoading(false);
        });
        return () => { cancelled = true; };
    }, [overtimeViewMonth, overtimeRefreshKey]);

    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        setOvertimeWeeksData(prev => prev.map(w => w.weekId === weekId
            ? { ...w, staff: w.staff?.map((s: any) => s.id === staffId ? { ...s, isPaid: newStatus } : s) }
            : w));
        try {
            const weekData = overtimeWeeksData.find(w => w.weekId === weekId);
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
            setOvertimeRefreshKey((k) => k + 1);
            fetchData();
        } catch (error: any) {
            console.error(error);
            toast.error("Error al actualizar modo: " + error.message, { id: 'prefer-stock-toggle' });
        }
    };

    async function fetchData() {
        try {
            setTreasuryLoading(true);
            const data = await getDashboardData();
            if (data) {
                setDailyStats(data.dailyStats);
                setBoxes(data.boxes);
                setBoxMovements(data.boxMovements);
                setTheoreticalBalance(data.theoreticalBalance || 0);
                setActualBalance(data.actualBalance || 0);
                setDifferenceCents(data.differenceCents ?? Math.round((data.difference ?? 0) * 100));
                setAllEmployees(data.allEmployees);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar datos');
        } finally {
            setTreasuryLoading(false);
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
        const tpvBoxes = boxes.filter((b: any) => b.type === 'tpv').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (op) list.push({ id: op.id, name: 'Caja inicial', shortLabel: 'Inicial', hasInventory: true, image_url: op.image_url });
        changeBoxes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Caja cambio ${i + 1}`, shortLabel: `Cambio ${i + 1}`, hasInventory: true, image_url: b.image_url }));
        if (tpvBoxes.length > 0) {
            tpvBoxes.forEach((b: any) => list.push({ id: b.id, name: b.name, shortLabel: b.name, hasInventory: false, image_url: b.image_url }));
        } else {
            list.push({ id: 'tpv1', name: 'TPV 1', shortLabel: 'TPV 1', hasInventory: false });
            list.push({ id: 'tpv2', name: 'TPV 2', shortLabel: 'TPV 2', hasInventory: false });
        }
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
            trackAdminPurchaseMulti(notesWithTpv || 'Compra registrada');
            toast.success('Compra registrada');
        } catch (error) {
            console.error(error);
            toast.error('Error al registrar la compra');
        }
    };

    const openTreasuryModal = async (box: any, mode: CashModalMode) => {
        setSelectedBox(box);
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach(d => initial[Number(d.denomination)] = d.quantity);
        setBoxInventoryMap(initial);
        setBoxInventory(data || []);
        const modeLabels: Record<CashModalMode, string> = {
            none: 'Ninguno', menu: 'Menú', in: 'Entrada', out: 'Salida', audit: 'Arqueo', swap: 'Cambio', inventory: 'Inventario',
        };
        if (mode !== 'none') trackAdminTreasury(`${modeLabels[mode]} · ${namedEntitySummary(box?.name ?? box?.id ?? '')}`);
        setCashModalMode(mode);
    };

    // Shell inmediato: tesorería/ventas/OT cargan por sección con spinner propio.

    // ====== BLOQUES REUTILIZABLES (para móvil / escritorio) ======

    const ventasSection = (
        <DashboardVentasSection />
    );
    const cajaInicialSection = (
        <Surface variant="page" instance="dashboard-caja-inicial" className={cn("flex flex-col overflow-hidden", isMovementsExpanded ? "p-3" : "p-2 pb-0.5")}>
            {treasuryLoading ? (
                <div className="flex items-center justify-center min-h-[88px] py-4" role="status" aria-label="Cargando caja">
                    <LoadingSpinner size="md" className="text-emerald-600" />
                </div>
            ) : (
                boxes.filter(b => b.type === 'operational').map(box => (
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
                                            <EmptyState
                                                instance="dashboard-caja-movimientos-empty"
                                                variant="none"
                                                title="Sin historial reciente"
                                            />
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
                ))
            )}
        </Surface>
    );

    const horasExtrasSection = (
        <Surface variant="page" instance="dashboard-horas-extras" className="flex flex-col overflow-hidden">
                    <div data-element="header" className="flex items-center justify-between gap-2 shrink-0">
                        <span data-element="title">
                            <span className="md:hidden">H. extras</span>
                            <span className="hidden md:inline">Horas extras</span>
                        </span>
                        <div className="flex-1 flex items-center justify-center min-w-0">
                            <div className="inline-flex items-center gap-1 md:gap-1.5 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setOvertimeViewMonth(prev => subMonths(prev, 1))}
                                    className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer touch-manipulation"
                                    aria-label="Mes anterior"
                                >
                                    <ChevronLeft className="w-5 h-5 text-white" />
                                </button>
                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/90 whitespace-nowrap min-w-[70px] md:min-w-[80px] text-center">
                                    {format(overtimeViewMonth, 'MMMM yyyy', { locale: es })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setOvertimeViewMonth(prev => addMonths(prev, 1))}
                                    className="shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer touch-manipulation"
                                    aria-label="Mes siguiente"
                                >
                                    <ChevronRight className="w-5 h-5 text-white" />
                                </button>
                            </div>
                        </div>
                        <Link
                            href="/dashboard/overtime"
                            className="shrink-0 text-[7px] font-black uppercase tracking-widest text-white/70 hover:text-white"
                        >
                            Ver más
                        </Link>
                    </div>
                    <div className="p-2 md:p-2 relative min-h-[120px]">
                        {overtimeLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Cargando horas extras">
                                <LoadingSpinner size="md" className="text-purple-600" />
                            </div>
                        ) : (
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
                                                                    'w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-[9px] md:text-[10px] font-bold',
                                                                    !inMonth && 'text-zinc-300',
                                                                    inMonth && !isToday && 'text-zinc-600',
                                                                    isToday && 'bg-ds-marca text-white'
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
                                            {rowWeekIds.map((weekId) => {
                                                if (weekId === currentWeekStart) {
                                                    return <div key={weekId} className="h-6 md:h-7 flex-shrink-0" aria-hidden />;
                                                }
                                                const week = overtimeWeeksData.find((w: any) => w.weekId === weekId);
                                                if (!week) {
                                                    return <div key={weekId} className="h-6 md:h-7 flex-shrink-0" aria-hidden />;
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
                                                        onClick={() => {
                                                            trackAdminOvertimeWeek(`Semana ${getISOWeek(new Date(week.weekId))}`, { weekId: week.weekId });
                                                            setWeekDetailModal({ week });
                                                        }}
                                                        className={cn(
                                                            'w-full min-w-0 h-6 md:h-7 flex items-center gap-2 px-1.5 py-0 rounded-md shadow-sm hover:shadow transition-all text-left flex-shrink-0',
                                                            'bg-transparent border-0 hover:bg-purple-50/50'
                                                        )}
                                                    >
                                                        <div className="flex min-w-0 flex-1 items-center gap-1">
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
                                                            <span className="min-w-0 truncate text-[7px] md:text-[8px] font-bold text-zinc-500 uppercase">
                                                                {format(new Date(week.weekId), 'd MMM', { locale: es })} - {format(addDays(new Date(week.weekId), 6), 'd MMM', { locale: es })}
                                                            </span>
                                                        </div>
                                                        <span className="ml-auto shrink-0 text-right tabular-nums whitespace-nowrap text-[9px] md:text-[10px] font-black text-zinc-900">
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
                        )}
                    </div>
        </Surface>
    );

    // Cajas cambio + accesos rápidos: rejilla unificada para que cada fila tenga la misma altura
    // que los botones cuadrados (aspect-square); las tarjetas de cambio ocupan 2 columnas y se estiran.
    const dashboardChangeBoxes = boxes
        .filter(b => b.type === 'change')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .slice(0, 2);

    const formatChangeBoxEur = (v: number) =>
        v > 0.005 ? (Math.abs(v - Math.round(v)) < 0.005 ? `${Math.round(v)}€` : `${v.toFixed(2)}€`) : " ";

    const renderDashboardChangeCard = (title: string, idx: number) => {
        if (treasuryLoading) {
            return (
                <Surface
                    key={`change-loading-${idx}`}
                    variant="block"
                    instance={`dashboard-caja-cambio-loading-${idx}`}
                    className="flex flex-col overflow-hidden h-full min-h-[72px] w-full min-w-0"
                >
                    <div data-element="header" className="flex items-center justify-between shrink-0">
                        <h3 data-element="title">{title}</h3>
                    </div>
                    <div className="flex-1 flex items-center justify-center min-h-[48px]" role="status" aria-label={`Cargando ${title}`}>
                        <LoadingSpinner size="sm" className="text-ds-marca" />
                    </div>
                </Surface>
            );
        }
        const box = dashboardChangeBoxes[idx];
        if (!box) return null;
        return (
            <Surface
                key={box.id}
                variant="block"
                instance={`dashboard-caja-cambio-${box.id}`}
                className="flex flex-col overflow-hidden h-full min-h-0 w-full min-w-0"
            >
                <div data-element="header" className="flex items-center justify-between shrink-0">
                    <h3 data-element="title">{title}</h3>
                </div>
                <div className="flex-1 flex items-center justify-center min-h-0 p-0.5 md:p-0.5 min-w-0">
                    <div className="grid w-full min-w-0 grid-cols-3 items-center gap-x-1 sm:gap-x-1 md:gap-x-1.5 px-0.5 sm:px-1 md:px-1.5">
                        <div className="min-w-0 flex flex-col items-start justify-center text-left">
                            <span className="max-w-full text-xs sm:text-sm md:text-base font-black tabular-nums leading-tight text-zinc-800 break-words">
                                {formatChangeBoxEur(box.current_balance)}
                            </span>
                        </div>
                        <div className="flex min-h-[40px] min-w-0 items-center justify-center shrink-0">
                            <button
                                type="button"
                                onClick={() => { setCashModalMode('swap'); }}
                                className="bg-zinc-50/50 p-1 rounded-lg flex max-w-full flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[40px] min-w-[40px] shrink-0"
                            >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm group-hover:scale-110 transition-transform md:h-5 md:w-5">
                                    <ArrowRightLeft size={9} strokeWidth={2.5} />
                                </div>
                                <span className="max-w-[3.25rem] text-center text-[5px] font-black uppercase leading-none tracking-widest text-zinc-500 sm:max-w-none sm:text-[6px]">Cambiar</span>
                            </button>
                        </div>
                        <div className="flex min-h-[40px] min-w-0 items-center justify-center shrink-0">
                            <button
                                type="button"
                                onClick={() => openTreasuryModal(box, 'audit')}
                                className="bg-zinc-50/50 p-1 rounded-lg flex max-w-full flex-col items-center justify-center gap-1 transition-all active:scale-95 group min-h-[40px] min-w-[40px] shrink-0"
                            >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm group-hover:scale-110 transition-transform md:h-5 md:w-5">
                                    <RefreshCw size={9} strokeWidth={2.5} />
                                </div>
                                <span className="max-w-[3.25rem] text-center text-[5px] font-black uppercase leading-none tracking-widest text-zinc-500 sm:max-w-none sm:text-[6px]">Arqueo</span>
                            </button>
                        </div>
                    </div>
                </div>
            </Surface>
        );
    };

    const quickActionCards = [
        { title: 'Asistencia', img: '/icons/calendar.png', link: '/staff/history', instance: 'admin-asistencia' },
        { title: 'M obra', img: '/icons/overtime.png', link: '/dashboard/labor', instance: 'admin-m-obra' },
        { title: 'Plantilla', img: '/icons/admin.png', link: '/staff/dashboard', instance: 'admin-plantilla' },
        { title: 'Stock', img: '/icons/suppliers.png', link: '/ingredients', instance: 'admin-stock' },
    ] as const;

    const renderQuickActionSquare = (card: (typeof quickActionCards)[number]) => (
        <DashboardShortcut
            instance={card.instance}
            label={card.title}
            img={card.img}
            onClick={() => {
                if (card.title === 'Plantilla') setIsStaffModalOpen(true);
                else if (card.title === 'Stock') setIsProductModalOpen(true);
                else if (card.link) router.push(card.link);
            }}
        />
    );

    const dashboardCambiosYAccesosMobile = (
        <div className="grid grid-cols-4 gap-3 items-stretch md:hidden">
            <div className="col-span-2 row-start-1 min-h-0 min-w-0 flex">{renderDashboardChangeCard('Caja cambio 1', 0)}</div>
            <div className="col-span-1 row-start-1 min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[0])}</div>
            <div className="col-span-1 row-start-1 min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[1])}</div>
            <div className="col-span-2 row-start-2 min-h-0 min-w-0 flex">{renderDashboardChangeCard('Caja cambio 2', 1)}</div>
            <div className="col-span-1 row-start-2 min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[2])}</div>
            <div className="col-span-1 row-start-2 min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[3])}</div>
        </div>
    );

    const dashboardCambiosYAccesosDesktop = (
        <div className="hidden md:grid md:grid-cols-[0.56fr,1.6fr,0.56fr] md:gap-x-4 md:items-stretch">
            {/* Conjunto 1: Cajas de cambio */}
            <div className="flex flex-col gap-4">
                <div className="flex-1 min-h-0">{renderDashboardChangeCard('Caja cambio 1', 0)}</div>
                <div className="flex-1 min-h-0">{renderDashboardChangeCard('Caja cambio 2', 1)}</div>
            </div>

            {/* Centro: Horas Extras */}
            <div className="min-h-0 min-w-0 flex flex-col">
                {horasExtrasSection}
            </div>

            {/* Conjunto 2: Accesos rápidos */}
            <div className="grid grid-cols-2 grid-rows-2 gap-4">
                <div className="flex min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[0])}</div>
                <div className="flex min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[1])}</div>
                <div className="flex min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[2])}</div>
                <div className="flex min-h-0 min-w-0">{renderQuickActionSquare(quickActionCards[3])}</div>
            </div>
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

                    {dashboardCambiosYAccesosMobile}
                </div>

                {/* ===== LAYOUT ESCRITORIO ===== */}
                <div className="hidden md:flex md:flex-col md:gap-4">
                    {/* Fila superior: Ventas + Caja Inicial centrados al ancho del centro */}
                    <div className="grid grid-cols-[minmax(0,0.56fr)_minmax(0,1.6fr)_minmax(0,0.28fr)_minmax(0,0.28fr)] gap-4 items-start">
                        <div />
                        <div className="flex flex-col gap-4">
                            {ventasSection}
                            {cajaInicialSection}
                        </div>
                        <div />
                        <div />
                    </div>

                    {/* Fila inferior: rejilla unificada — altura filas = tarjetas cuadradas */}
                    {dashboardCambiosYAccesosDesktop}
                </div>

            </div> {/* Close max-w-6xl */}

            {cashModalMode !== 'none' && (
                <>
                    {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit' || cashModalMode === 'inventory') && (
                        <Modal
                            open
                            onClose={() => setCashModalMode('none')}
                            variant="amplify"
                            layer="base"
                            instance="cash-box-operation"
                            usageId={`admin-cash-${cashModalMode}`}
                            usageLabel={
                                cashModalMode === 'in' ? 'Entrada de caja'
                                : cashModalMode === 'out' ? 'Salida de caja'
                                : cashModalMode === 'audit' ? 'Arqueo de caja'
                                : 'Inventario de caja'
                            }
                            headerTone="petroleum"
                            title={
                                cashModalMode === 'in' ? 'Entrada de caja'
                                : cashModalMode === 'out' ? 'Salida de caja'
                                : cashModalMode === 'audit' ? 'Arqueo de caja'
                                : 'Inventario de efectivo'
                            }
                            subtitle={
                                cashModalMode === 'inventory'
                                    ? (selectedBox?.name || 'Caja')
                                    : (selectedBox?.name || undefined)
                            }
                            headerTrailing={
                                cashModalMode !== 'inventory' ? (
                                    <CashCountDateButton value={cashOpDate} onChange={setCashOpDate} />
                                ) : null
                            }
                            ariaLabel={
                                cashModalMode === 'in' ? 'Entrada de caja'
                                : cashModalMode === 'out' ? 'Salida de caja'
                                : cashModalMode === 'audit' ? 'Arqueo de caja'
                                : 'Inventario de caja'
                            }
                            footer={
                                cashModalMode !== 'inventory' ? (
                                    <CashCountFooter
                                        total={cashCountTotal}
                                        instancePrefix={`admin-${cashModalMode}`}
                                        onCancel={() => setCashModalMode('none')}
                                        saveType="submit"
                                        saveForm={CASH_COUNT_FORM_ID}
                                    />
                                ) : undefined
                            }
                        >
                                {(cashModalMode === 'in' || cashModalMode === 'out' || cashModalMode === 'audit') && (
                                    <CashDenominationForm
                                        key={cashModalMode + (selectedBox?.id || '')}
                                        variant="embedded"
                                        type={cashModalMode as 'in' | 'out' | 'audit'}
                                        boxName={selectedBox?.name || 'Caja'}
                                        boxId={selectedBox?.id}
                                        initialCounts={cashModalMode === 'audit' ? boxInventoryMap : {}}
                                        availableStock={boxInventoryMap}
                                        onCancel={() => setCashModalMode('none')}
                                        onSubmit={handleCashTransaction}
                                        onTotalChange={setCashCountTotal}
                                        selectedDate={cashOpDate}
                                        onSelectedDateChange={setCashOpDate}
                                    />
                                )}
                                {cashModalMode === 'inventory' && (
                                    <BoxInventoryView
                                        boxName={selectedBox?.name || 'Caja'}
                                        inventory={boxInventory}
                                    />
                                )}
                        </Modal>
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
                <Modal
                    open
                    onClose={() => { setShowPurchaseMultiSourceModal(false); setPurchaseInventoriesByBoxId({}); }}
                    variant="amplify"
                    layer="base"
                    instance="admin-purchase-multi-source"
                    usageId="admin-purchase-multi-source"
                    usageLabel="Compra multiorigen"
                    title="Compra"
                    ariaLabel="Compra"
                    headerTone="petroleum"
                    headerTrailing={<CashCountDateButton value={purchaseDate} onChange={setPurchaseDate} />}
                >
                    <PurchaseMultiSourceForm
                        embedded
                        paymentSources={buildPaymentSources()}
                        inventoriesByBoxId={purchaseInventoriesByBoxId}
                        selectedDate={purchaseDate}
                        onSelectedDateChange={setPurchaseDate}
                        onSubmit={handlePurchaseMultiSourceSubmit}
                        onCancel={() => { setShowPurchaseMultiSourceModal(false); setPurchaseInventoriesByBoxId({}); }}
                    />
                </Modal>
            )}

            <StaffSelectionModal
                isOpen={isStaffModalOpen}
                onClose={() => setIsStaffModalOpen(false)}
                employees={showAllEmployeesInPlantilla ? (allEmployeesIncludingInactive ?? allEmployees) : allEmployees}
                onSelect={(emp) => router.push(`/profile?id=${emp.id}`)}
                title="Plantilla"
                variant="profile-list"
                onOpenTips={() => {
                    setIsStaffModalOpen(false);
                    router.push('/dashboard/propinas');
                }}
                hideHeaderClose
                manageVisibility={showAllEmployeesInPlantilla}
                onToggleVisibility={handleTogglePlantillaVisibility}
                headerTextAction={{
                    label: showAllEmployeesInPlantilla ? 'Ver activos' : 'Ver todos',
                    onClick: async () => {
                        if (!showAllEmployeesInPlantilla) {
                            await ensureAllEmployeesIncludingInactive();
                            setShowAllEmployeesInPlantilla(true);
                            return;
                        }
                        setShowAllEmployeesInPlantilla(false);
                    }
                }}
            />

            <AdminProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onOpenSupplierModal={() => { setIsProductModalOpen(false); setTimeout(() => setIsSupplierModalOpen(true), 150); }}
            />

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
                const allWeeks = Array.from(new Map((overtimeWeeksData || []).map((w: any) => [w.weekId, w])).values());
                const sortedWeeks = [...allWeeks].sort((a: any, b: any) => a.weekId.localeCompare(b.weekId));
                const currentIdx = sortedWeeks.findIndex((w: any) => w.weekId === weekDetailModal.week.weekId);
                const prevWeek = currentIdx > 0 ? sortedWeeks[currentIdx - 1] : null;
                const nextWeek = currentIdx >= 0 && currentIdx < sortedWeeks.length - 1 ? sortedWeeks[currentIdx + 1] : null;
                return (
                <Modal
                    open
                    onClose={() => {
                        setWeekDetailModal(null);
                        setSelectedHistory(null);
                    }}
                    variant="standard"
                    layer="base"
                    instance="admin-overtime-week-detail"
                    usageId="admin-overtime-week-detail"
                    usageLabel="Detalle semana horas extras"
                    headerTone="petroleum"
                    title={`Semana ${weekNum}`}
                    subtitle={periodStr}
                >
                    <div>
                        <WorkerListSummary
                            metrics={
                                paidTotal > 0.05
                                    ? [{ label: 'Pagado', value: `${paidTotal.toFixed(0)}€` }]
                                    : []
                            }
                            total={weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                        />
                        <div className="mb-1 flex justify-end">
                            <div className="inline-flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => { if (prevWeek) setWeekDetailModal({ week: prevWeek }); }}
                                    disabled={!prevWeek}
                                    className="flex h-12 w-12 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30"
                                    aria-label="Semana anterior"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { if (nextWeek) setWeekDetailModal({ week: nextWeek }); }}
                                    disabled={!nextWeek}
                                    className="flex h-12 w-12 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30"
                                    aria-label="Semana siguiente"
                                >
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div>
                            {weekStaff.map((s: any) => (
                                <StaffOvertimeRow
                                    key={s.id}
                                    staff={{ ...s, name: s.name?.split?.(' ')[0] ?? s.name, amount: s.totalCost ?? s.amount ?? 0 }}
                                    weekId={weekDetailModal.week.weekId}
                                    isPaid={paidStatus[`${weekDetailModal.week.weekId}-${s.id}`] ?? !!s.isPaid}
                                    onTogglePaid={togglePaid}
                                    onClick={() => {
                                        trackAdminOvertimeWorker(namedEntitySummary(s.name?.split?.(' ')[0] ?? s.name ?? ''), {
                                            workerId: s.id,
                                            weekId: weekDetailModal.week.weekId,
                                        });
                                        setSelectedHistory({ workerId: s.id, weekId: weekDetailModal.week.weekId });
                                    }}
                                />
                            ))}
                            {weekStaff.length === 0 && (
                                <EmptyState instance="admin-overtime-week-none" variant="none" title="Sin importes esta semana" />
                            )}
                        </div>
                    </div>
                </Modal>
                );
            })()}
            <WorkerWeeklyHistoryModal
                isOpen={!!selectedHistory}
                onClose={() => setSelectedHistory(null)}
                workerId={selectedHistory?.workerId || ''}
                weekStart={selectedHistory?.weekId || ''}
                layer="derived"
                parentInstance="admin-overtime-week-detail"
            />
            <SupplierSelectionModal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} />
        </div>
    );
}

export default AdminDashboardView;
