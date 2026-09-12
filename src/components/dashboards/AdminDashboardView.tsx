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
import CashClosingModal from '@/components/CashClosingModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { AlbaranesOptionsModal } from './AlbaranesOptionsModal';
import { AdminProductModal } from '@/components/modals/AdminProductModal';
import { AdminMoreFunctionsModal } from '@/components/modals/AdminMoreFunctionsModal';
import { InfoMenuModals } from '@/components/modals/InfoMenuModals';
import Link from 'next/link';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { updateProfile } from '@/app/actions/profile';
import { Modal } from '@/components/ui/modal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { OpsHomeScreen } from '@/components/dashboards/OpsHomeScreen';
import { HorasExtrasWidget } from '@/components/dashboards/ops-widgets';
import { MasterLastClosingWidget } from '@/components/dashboards/MasterLastClosingWidget';
import { StaffWeekScheduleBlock } from '@/components/dashboards/staff/StaffWeekScheduleBlock';
import { CajaInicialControl, MasterCajasCambioControl } from '@/components/dashboards/MasterShortcutGrid';
import { getISOWeek, format, addDays, subDays, startOfWeek, parseISO, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn, calculateRoundedHours, firstGivenName } from '@/lib/utils';
import { togglePaidStatus, togglePreferStockStatus } from '@/app/actions/overtime';
import { invalidateHomeOvertimeCache, useOvertimeWeeks } from '@/hooks/useOvertimeWeeks';
import { invalidateHomeHistoryWeekCache } from '@/hooks/useEmployeeHistoryWeek';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import { Surface } from '@/components/ui/Surface';
import { EmptyState } from '@/components/ui/EmptyState';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { useHomeTreasury } from '@/hooks/useHomeTreasury';
import { filterVisiblePlantillaEmployees } from '@/lib/staff/plantilla-employees';
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
        name={firstGivenName(staff.name, 'Trabajador')}
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

const AdminDashboardView = ({
    initialData,
    initialUserId,
}: {
    initialData?: any;
    initialUserId?: string | null;
}) => {
    const supabase = createClient();
    const router = useRouter();
    const { actualBalance, boxes, loading: treasuryLoading, refresh } = useHomeTreasury({
        actualBalance: initialData?.actualBalance,
        boxes: initialData?.boxes,
    });

    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>(initialData?.paidStatus || {});
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isMoreFunctionsModalOpen, setIsMoreFunctionsModalOpen] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isAlbaranesModalOpen, setIsAlbaranesModalOpen] = useState(false);
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
    const [userId, setUserId] = useState<string | null>(() => initialUserId ?? null);
    const [isCajaInicialActionsOpen, setIsCajaInicialActionsOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    // Horas extras: carga independiente (no bloquea shell del dashboard)
    const [overtimeViewMonth, setOvertimeViewMonth] = useState(() => startOfMonth(new Date()));
    const overtimeRangeStart = format(startOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
    const overtimeRangeEnd = format(endOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
    const [overtimeRefreshKey, setOvertimeRefreshKey] = useState(0);
    const { weeks: overtimeWeeksData, loading: overtimeLoading } = useOvertimeWeeks(
        overtimeRangeStart,
        overtimeRangeEnd,
        { refreshKey: overtimeRefreshKey },
    );
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
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setCurrentUserEmail(session.user.email ?? null);
                setUserId(session.user.id);
            }
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

    useEffect(() => {
        const nextPaid: Record<string, boolean> = {};
        overtimeWeeksData.forEach((week) => {
            week.staff?.forEach((s) => {
                nextPaid[`${week.weekId}-${s.id}`] = !!s.isPaid;
            });
        });
        setPaidStatus(nextPaid);
    }, [overtimeWeeksData]);

    const togglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        try {
            const weekData = overtimeWeeksData.find(w => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s: any) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, {
                totalHours: staffData?.hours ?? staffData?.totalHours ?? 0,
                overtimeHours: staffData?.hours ?? staffData?.overtimeHours ?? 0
            });
            if (!result.success) throw new Error("Error updating paid status");
            invalidateHomeOvertimeCache();
            invalidateHomeHistoryWeekCache();
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
            invalidateHomeOvertimeCache();
            invalidateHomeHistoryWeekCache();
            setOvertimeRefreshKey((k) => k + 1);
        } catch (error: any) {
            console.error(error);
            toast.error("Error al actualizar modo: " + error.message, { id: 'prefer-stock-toggle' });
        }
    };

    const ensureActivePlantillaEmployees = async () => {
        if (allEmployees.length > 0) return allEmployees;
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('visible_in_plantilla', true);
        if (error) {
            console.error(error);
            toast.error('Error al cargar plantilla');
            return null;
        }
        const cleaned = filterVisiblePlantillaEmployees(data || []);
        setAllEmployees(cleaned);
        return cleaned;
    };

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
            void refresh();
        } catch (error) { console.error(error); alert("Error"); }
    };

    const handleCajaInicialAccion = (accion: 'in' | 'out' | 'compra' | 'arqueo') => {
        const box = boxes.find((b: any) => b.type === 'operational');
        if (!box) {
            toast.error('No hay caja operacional configurada');
            return;
        }
        if (accion === 'arqueo') {
            setIsCajaInicialActionsOpen(false);
            openTreasuryModal(box, 'audit');
            return;
        }
        if (accion === 'compra') {
            setIsCajaInicialActionsOpen(false);
            openPurchaseMultiSourceModal();
            return;
        }
        setIsCajaInicialActionsOpen(false);
        openTreasuryModal(box, accion);
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
        const boxesToLoad = [...(op ? [op] : []), ...changeBoxes];
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
            void refresh();
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

    const ultimoCierreSection = (
        <MasterLastClosingWidget />
    );

    const horarioSection = (
        <StaffWeekScheduleBlock
            userId={userId}
            userRole="manager"
            userEmail={currentUserEmail ?? ''}
            masterMode
            onOpenWeekDetail={(week) => {
                trackAdminOvertimeWeek(`Semana ${getISOWeek(new Date(week.weekId))}`, { weekId: week.weekId });
                setWeekDetailModal({ week });
            }}
            overtimeRefreshKey={overtimeRefreshKey}
        />
    );

    const dashboardChangeBoxes = boxes
        .filter((b) => b.type === 'change')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .slice(0, 2);

    const iconCajaInicial = (
        <CajaInicialControl
            treasuryLoading={treasuryLoading}
            actualBalance={actualBalance}
            onOpenMovements={() => router.push('/dashboard/movements')}
            onOpenAcciones={() => setIsCajaInicialActionsOpen(true)}
        />
    );

    const iconCajasCambio = (
        <MasterCajasCambioControl
            treasuryLoading={treasuryLoading}
            box1={dashboardChangeBoxes[0]}
            box2={dashboardChangeBoxes[1]}
            onOpenCambio1={() => {
                const box = dashboardChangeBoxes[0];
                if (box) openTreasuryModal(box, 'audit');
            }}
            onOpenCambio2={() => {
                const box = dashboardChangeBoxes[1];
                if (box) openTreasuryModal(box, 'audit');
            }}
        />
    );

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
                if (card.title === 'Plantilla') {
                    setIsStaffModalOpen(true);
                    void ensureActivePlantillaEmployees();
                }
                else if (card.title === 'Stock') setIsProductModalOpen(true);
                else if (card.link) router.push(card.link);
            }}
        />
    );

    const closingSalesSummary = {
        total: 0,
        count: 0,
    };

    const handleOpenCompra = () => {
        const cashBoxes = boxes.filter(
            (b: any) => b.type === 'operational' || b.type === 'change' || b.type === 'tpv',
        );
        if (cashBoxes.length === 0) {
            toast.error('No hay cajas configuradas');
            return;
        }
        void openPurchaseMultiSourceModal();
    };

    const dashboardHome = (
        <OpsHomeScreen
            ventas={ventasSection}
            ultimoCierre={ultimoCierreSection}
            horario={horarioSection}
            iconCajaInicial={iconCajaInicial}
            iconCajasCambio={iconCajasCambio}
            iconAsistencia={renderQuickActionSquare(quickActionCards[0])}
            iconMasFunciones={
                <DashboardShortcut
                    instance="admin-mas-funciones"
                    label="Otros"
                    img="/icons/more.png"
                    onClick={() => setIsMoreFunctionsModalOpen(true)}
                />
            }
            iconMObra={renderQuickActionSquare(quickActionCards[1])}
            iconPlantilla={renderQuickActionSquare(quickActionCards[2])}
            iconStock={renderQuickActionSquare(quickActionCards[3])}
            iconRecetas={
                <DashboardShortcut
                    instance="admin-recetas"
                    label="Recetas"
                    img="/icons/recipes.png"
                    onClick={() => router.push('/recipes')}
                />
            }
            iconAlbaranes={
                <DashboardShortcut
                    instance="admin-albaranes"
                    label="Albaranes"
                    img="/icons/scan.png"
                    onClick={() => setIsAlbaranesModalOpen(true)}
                />
            }
            iconIngredientes={
                <DashboardShortcut
                    instance="admin-ingredientes"
                    label="Ingredientes"
                    img="/icons/ingrediente.png"
                    onClick={() => router.push('/ingredients')}
                />
            }
        />
    );

    return (
        <div className="home-mosaic-page">
            {dashboardHome}

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
                            onSuccess={() => { void refresh(); setCashModalMode('none'); }}
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
                listEndAction={{
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
            />

            <AdminMoreFunctionsModal
                isOpen={isMoreFunctionsModalOpen}
                onClose={() => setIsMoreFunctionsModalOpen(false)}
                onOpenPedidos={() => setIsSupplierModalOpen(true)}
                onOpenCambio={() => setCashModalMode('swap')}
                onOpenCierre={() => setIsClosingModalOpen(true)}
                onOpenInfo={() => setIsInfoModalOpen(true)}
                onOpenCompra={handleOpenCompra}
            />

            <InfoMenuModals
                open={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
                usagePrefix="admin"
            />

            <CashClosingModal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                onSuccess={() => { void refresh(); }}
                initialTotalSales={closingSalesSummary.total}
                initialTicketsCount={closingSalesSummary.count}
            />

            <SupplierSelectionModal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} />
            <AlbaranesOptionsModal isOpen={isAlbaranesModalOpen} onClose={() => setIsAlbaranesModalOpen(false)} />

            <Modal
                open={isCajaInicialActionsOpen}
                onClose={() => setIsCajaInicialActionsOpen(false)}
                variant="standard"
                layer="base"
                instance="admin-caja-inicial-acciones"
                usageId="admin-caja-inicial-acciones"
                usageLabel="Caja inicial: acciones"
                headerTone="petroleum"
                scheme="dark"
                title="Caja Inicial"
                ariaLabel="Caja inicial: acciones"
            >
                <div className="grid grid-cols-2 gap-2 pb-6 pt-1">
                    {(
                        [
                            {
                                label: 'Entrada',
                                accion: 'in' as const,
                                color: 'bg-emerald-500',
                                icon: <Plus size={18} strokeWidth={2} fill="none" className="text-white" />,
                            },
                            {
                                label: 'Salida',
                                accion: 'out' as const,
                                color: 'bg-rose-500',
                                icon: <Minus size={18} strokeWidth={2} fill="none" className="text-white" />,
                            },
                            {
                                label: 'Compra',
                                accion: 'compra' as const,
                                color: 'bg-[#5B8FB9]',
                                icon: <ShoppingCart size={18} strokeWidth={2} fill="none" className="text-white" />,
                            },
                            {
                                label: 'Arqueo',
                                accion: 'arqueo' as const,
                                color: 'bg-orange-400',
                                icon: <RefreshCw size={18} strokeWidth={2} fill="none" className="text-white" />,
                            },
                        ] as const
                    ).map((opcion) => (
                        <button
                            key={opcion.accion}
                            type="button"
                            onClick={() => handleCajaInicialAccion(opcion.accion)}
                            aria-label={opcion.label}
                            className={`group relative flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 rounded-[var(--radio-superficie)] ${opcion.color} px-2 py-3 text-white transition-transform active:scale-95 touch-manipulation`}
                        >
                            <span className="flex items-center justify-center transition-transform group-hover:scale-110">
                                {opcion.icon}
                            </span>
                            <span className="shrink-0 text-[10px] font-black uppercase leading-none tracking-widest">
                                {opcion.label}
                            </span>
                            <span
                                data-element="rim"
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-[var(--radio-superficie)]"
                                style={{
                                    boxShadow:
                                        'inset 0 0 0 1px rgb(255 255 255 / 0.24), inset 0 1px 0 0 rgb(255 255 255 / 0.58), inset 1px 0 0 0 rgb(255 255 255 / 0.38), inset 0 -1px 0 0 rgb(0 0 0 / 0.2), inset -1px 0 0 0 rgb(0 0 0 / 0.12)',
                                }}
                            />
                        </button>
                    ))}
                </div>
            </Modal>

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
        </div>
    );
}

export default AdminDashboardView;
