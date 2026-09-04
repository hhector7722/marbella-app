'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, addMonths, endOfMonth, format, getISOWeek, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Circle, Minus, Plus, RefreshCw, ShoppingCart } from 'lucide-react';
import { getOvertimeData, togglePaidStatus } from '@/app/actions/overtime';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import MasterShortcutGrid from '@/components/dashboards/MasterShortcutGrid';
import { HorasExtrasWidget, formatChangeBoxEur } from '@/components/dashboards/ops-widgets';
import { HomeScreen, HomeScreenSlot } from '@/components/dashboards/HomeScreen';
import { MasterPlantillaAttendanceWidget } from '@/components/dashboards/MasterPlantillaAttendanceWidget';
import { StaffWeekScheduleBlock } from '@/components/dashboards/staff/StaffWeekScheduleBlock';
import { MasterMoreFunctionsModal } from '@/components/modals/MasterMoreFunctionsModal';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal, type BoxOption } from '@/components/CashChangeModal';
import { CashDenominationForm, CASH_COUNT_FORM_ID } from '@/components/CashDenominationForm';
import { Modal } from '@/components/ui/modal';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { randomId } from '@/lib/random-id';
import { CashCountDateButton, formatCashCountDateInput } from '@/components/cash/CashCountDateButton';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { updateProfile } from '@/app/actions/profile';
import { useMasterTreasuryLive } from '@/hooks/useMasterTreasuryLive';
import {
    PLANTILLA_EMPLOYEE_SELECT,
    filterVisiblePlantillaEmployees,
    type PlantillaEmployeeRow,
} from '@/lib/staff/plantilla-employees';
import { canManageStaffAttendance } from '@/lib/staff/attendance-access';
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';
import type { StaffWeeklyStats, WeeklyStats } from '@/lib/hours-engine/overtime-weeks-ssot';
import { WorkerListSummary, WorkerPersonRow } from '@/components/staff/WorkerPersonRow';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';

type MasterDashboardViewProps = {
    initialData?: {
        liveTickets?: { total: number; count: number };
        salesChartData?: { hora: number; total: number }[];
        actualBalance?: number;
        boxes?: any[];
        allEmployees?: any[];
    };
};

/** Fila de trabajador en el detalle de semana de horas extras (mismo lenguaje que el dashboard). */
function MasterStaffOvertimeRow({
    staff,
    weekId,
    isPaid,
    onTogglePaid,
    onClick,
}: {
    staff: StaffWeeklyStats;
    weekId: string;
    isPaid: boolean;
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean) => void;
    onClick: () => void;
}) {
    return (
        <WorkerPersonRow
            name={staff.name}
            value={staff.totalCost > 0.05 ? `${staff.totalCost.toFixed(0)}€` : ' '}
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
    );
}

export default function MasterDashboardView({ initialData }: MasterDashboardViewProps) {
    const router = useRouter();
    const supabase = createClient();
    const { actualBalance, boxes, loading: treasuryLoading, refresh } = useMasterTreasuryLive({
        actualBalance: initialData?.actualBalance,
        boxes: initialData?.boxes,
    });

    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [auditBox, setAuditBox] = useState<any>(null);
    const [cashCountTotal, setCashCountTotal] = useState(0);
    const [cashOpDate, setCashOpDate] = useState(formatCashCountDateInput);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});

    // Caja inicial: menú de acciones + procesos (Entrada / Salida / Compra / Arqueo).
    const [isCajaInicialActionsOpen, setIsCajaInicialActionsOpen] = useState(false);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'in' | 'out'>('none');
    const [selectedCashBox, setSelectedCashBox] = useState<any>(null);
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseDate, setPurchaseDate] = useState(formatCashCountDateInput);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});

    const [closingSalesSummary, setClosingSalesSummary] = useState(
        initialData?.liveTickets || { total: 0, count: 0 }
    );
    const [allEmployees, setAllEmployees] = useState<any[]>(initialData?.allEmployees || []);
    const [allEmployeesIncludingInactive, setAllEmployeesIncludingInactive] = useState<any[] | null>(null);
    const [showAllEmployeesInPlantilla, setShowAllEmployeesInPlantilla] = useState(false);

    const [overtimeViewMonth, setOvertimeViewMonth] = useState(() => startOfMonth(new Date()));
    const [overtimeWeeksData, setOvertimeWeeksData] = useState<WeeklyStats[]>([]);
    const [overtimeLoading, setOvertimeLoading] = useState(true);
    const [isOvertimeModalOpen, setIsOvertimeModalOpen] = useState(false);
    const [overtimeWeekDetail, setOvertimeWeekDetail] = useState<WeeklyStats | null>(null);
    const [overtimePaidStatus, setOvertimePaidStatus] = useState<Record<string, boolean>>({});
    const [overtimeWorkerHistory, setOvertimeWorkerHistory] = useState<{ workerId: string; weekId: string } | null>(null);
    const [isCajasCambioOpen, setIsCajasCambioOpen] = useState(false);
    const [pendingReservationsCount, setPendingReservationsCount] = useState(0);

    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('manager');
    const [userEmail, setUserEmail] = useState('');
    const [plantillaEmployees, setPlantillaEmployees] = useState<PlantillaEmployeeRow[]>([]);
    const [isMoreFunctionsModalOpen, setIsMoreFunctionsModalOpen] = useState(false);

    const changeBoxes = useMemo(
        () => boxes.filter((b) => b.type === 'change').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        [boxes]
    );

    useEffect(() => {
        let cancelled = false;

        async function fetchPendingReservationsCount(showErrorToast: boolean) {
            const now = new Date();
            const todayYmd = format(now, 'yyyy-MM-dd');

            const { data, error } = await supabase
                .from('reservations')
                .select('reservation_date, reservation_time')
                .gte('reservation_date', todayYmd);

            if (cancelled) return;

            if (error) {
                if (showErrorToast) {
                    toast.error('No se pudo cargar el contador de reservas pendientes');
                }
                return;
            }

            const futureCount = (data ?? []).filter((r) => {
                if (r.reservation_date > todayYmd) return true;
                // Mismo día: comparar hora
                const timeStr = (r.reservation_time ?? '00:00').slice(0, 5);
                const [hh, mm] = timeStr.split(':').map(Number);
                const resDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                    hh || 0,
                    mm || 0,
                    0,
                    0
                );
                return resDate >= now;
            }).length;

            setPendingReservationsCount(futureCount);
        }

        void fetchPendingReservationsCount(true);

        const channel = supabase
            .channel(`master:reservations-pending:${randomId()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'reservations' },
                () => {
                    void fetchPendingReservationsCount(false);
                }
            )
            .subscribe();

        return () => {
            cancelled = true;
            void supabase.removeChannel(channel);
        };
    }, [supabase]);

    useEffect(() => {
        let cancelled = false;
        const start = format(startOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(overtimeViewMonth), 'yyyy-MM-dd');
        setOvertimeLoading(true);
        getOvertimeData(start, end)
            .then((result) => {
                if (cancelled) return;
                const weeks = result?.weeksResult ?? [];
                setOvertimeWeeksData(weeks);
                const nextPaid: Record<string, boolean> = {};
                weeks.forEach((week) => {
                    week.staff?.forEach((s) => {
                        nextPaid[`${week.weekId}-${s.id}`] = !!s.isPaid;
                    });
                });
                setOvertimePaidStatus(nextPaid);
            })
            .catch(() => {
                if (!cancelled) {
                    setOvertimeWeeksData([]);
                    toast.error('No se pudieron cargar las horas extras');
                }
            })
            .finally(() => {
                if (!cancelled) setOvertimeLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [overtimeViewMonth]);

    const toggleOvertimePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setOvertimePaidStatus((prev) => ({ ...prev, [key]: newStatus }));
        setOvertimeWeeksData((prev) =>
            prev.map((w) =>
                w.weekId === weekId
                    ? { ...w, staff: w.staff?.map((s) => (s.id === staffId ? { ...s, isPaid: newStatus } : s)) }
                    : w
            )
        );
        try {
            const weekData = overtimeWeeksData.find((w) => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, {
                totalHours: staffData?.totalHours ?? 0,
                overtimeHours: staffData?.overtimeHours ?? 0,
            });
            if (!result.success) throw new Error('Error al actualizar pago');
            toast.success(newStatus ? 'Marcado como pagado' : 'Pago cancelado');
        } catch (error) {
            console.error(error);
            setOvertimePaidStatus((prev) => ({ ...prev, [key]: !newStatus }));
            setOvertimeWeeksData((prev) =>
                prev.map((w) =>
                    w.weekId === weekId
                        ? { ...w, staff: w.staff?.map((s) => (s.id === staffId ? { ...s, isPaid: !newStatus } : s)) }
                        : w
                )
            );
            toast.error('Error al actualizar pago');
        }
    };

    // Identidad del maestro: widgets de asistencia y horario usan su userId real.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (!user || cancelled) return;
                setUserId(user.id);
                setUserEmail(user.email ?? '');
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('first_name, role, email')
                    .eq('id', user.id)
                    .single();
                if (cancelled) return;
                if (profile) {
                    setUserRole((profile.role as 'staff' | 'manager' | 'supervisor') || 'manager');
                    setUserEmail(profile.email || user.email || '');
                }
                if (canManageStaffAttendance(profile?.role || 'manager', profile?.email || user.email)) {
                    const { data: emps } = await supabase
                        .from('profiles')
                        .select(PLANTILLA_EMPLOYEE_SELECT)
                        .order('first_name');
                    if (cancelled) return;
                    setPlantillaEmployees(filterVisiblePlantillaEmployees((emps || []) as PlantillaEmployeeRow[]));
                }
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    // Plantilla: no llega por SSR. Se carga solo al abrir el modal (no al montar).
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

    const buildPaymentSources = (): (BoxOption & PaymentSourceOption)[] => {
        const list: (BoxOption & PaymentSourceOption)[] = [];
        const op = boxes.find((b: any) => b.type === 'operational');
        const changes = boxes.filter((b: any) => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        const tpvBoxes = boxes.filter((b: any) => b.type === 'tpv').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (op) list.push({ id: op.id, name: 'Caja inicial', shortLabel: 'Inicial', hasInventory: true, image_url: op.image_url });
        changes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Caja cambio ${i + 1}`, shortLabel: `Cambio ${i + 1}`, hasInventory: true, image_url: b.image_url }));
        if (tpvBoxes.length > 0) {
            tpvBoxes.forEach((b: any) => list.push({ id: b.id, name: b.name, shortLabel: b.name, hasInventory: false, image_url: b.image_url }));
        } else {
            list.push({ id: 'tpv1', name: 'TPV 1', shortLabel: 'TPV 1', hasInventory: false });
            list.push({ id: 'tpv2', name: 'TPV 2', shortLabel: 'TPV 2', hasInventory: false });
        }
        return list;
    };

    const operationalBox = boxes.find((b: any) => b.type === 'operational');

    const openCajaInicialActions = () => setIsCajaInicialActionsOpen(true);

    const openCajaTreasuryModal = async (box: any, mode: 'in' | 'out') => {
        setSelectedCashBox(box);
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach((d) => {
            initial[Number(d.denomination)] = d.quantity;
        });
        setBoxInventoryMap(initial);
        setIsCajaInicialActionsOpen(false);
        setCashModalMode(mode);
    };

    const handleCashTransaction = async (total: number, breakdown: any, notesOrOutBreakdown: any, customDate?: string) => {
        if (!selectedCashBox) return;
        try {
            const payload: any = {
                box_id: selectedCashBox.id,
                type: cashModalMode === 'in' ? 'IN' : 'OUT',
                amount: total,
                breakdown,
                notes: notesOrOutBreakdown as string,
            };
            if (customDate) payload.created_at = customDate;
            await supabase.from('treasury_log').insert(payload);
            setCashModalMode('none');
            setSelectedCashBox(null);
            await refresh();
            toast.success(cashModalMode === 'in' ? 'Entrada registrada' : 'Salida registrada');
        } catch (err) {
            console.error(err);
            toast.error('Error al registrar el movimiento');
        }
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
        setIsCajaInicialActionsOpen(false);
        setShowPurchaseMultiSourceModal(true);
    };

    const handlePurchaseMultiSourceSubmit = async (payload: PurchaseMultiSourcePayload) => {
        try {
            const baseNotes = payload.notes || 'Compra';
            const tpvParts = payload.sources
                .filter((s) => s.sourceId === 'tpv1' || s.sourceId === 'tpv2')
                .filter((s) => s.amount > 0.005)
                .map((s) => `${s.sourceId === 'tpv1' ? 'TPV 1' : 'TPV 2'}: ${s.amount.toFixed(2)}€`);
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
                    notes: notesWithTpv,
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
                    notes: 'Cambio (compra)',
                };
                if (customDate) inRow.created_at = customDate;
                await supabase.from('treasury_log').insert(inRow);
            }

            setShowPurchaseMultiSourceModal(false);
            setPurchaseInventoriesByBoxId({});
            await refresh();
            toast.success('Compra registrada');
        } catch (error) {
            console.error(error);
            toast.error('Error al registrar la compra');
        }
    };

    const handleCajaInicialAccion = (accion: 'in' | 'out' | 'compra' | 'arqueo') => {
        const box = operationalBox;
        if (!box) {
            toast.error('No hay caja operacional configurada');
            return;
        }
        if (accion === 'arqueo') {
            setIsCajaInicialActionsOpen(false);
            void openChangeBoxAudit(box);
            return;
        }
        if (accion === 'compra') {
            setIsCajaInicialActionsOpen(false);
            void openPurchaseMultiSourceModal();
            return;
        }
        void openCajaTreasuryModal(box, accion);
    };

    const openChangeBoxAudit = async (box: any) => {
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach((d) => {
            initial[Number(d.denomination)] = d.quantity;
        });
        setBoxInventoryMap(initial);
        setAuditBox(box);
    };

    const handleAuditSubmit = async (total: number, breakdown: Record<number, number>) => {
        if (!auditBox) return;
        try {
            await supabase.from('treasury_log').insert({
                box_id: auditBox.id,
                type: 'ADJUSTMENT',
                amount: total,
                breakdown,
                notes: 'Arqueo de caja',
            });
            setAuditBox(null);
            await refresh();
            toast.success('Arqueo registrado');
        } catch (err) {
            console.error(err);
            toast.error('Error al registrar arqueo');
        }
    };

    return (
        <div className="pt-1 animate-in fade-in duration-500 pb-8">
            <HomeScreen layout="master">
                <HomeScreenSlot size="wide" instance="dashboard-ventas">
                    <DashboardVentasSection
                        initialData={{
                            liveTickets: initialData?.liveTickets,
                            salesChartData: initialData?.salesChartData,
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="wide" instance="master-asistencia">
                    <MasterPlantillaAttendanceWidget
                        userRole={userRole}
                        viewerEmail={userEmail}
                        employees={plantillaEmployees}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="panel" instance="master-horarios">
                    <StaffWeekScheduleBlock
                        userId={userId}
                        userRole={userRole}
                        userEmail={userEmail}
                    />
                </HomeScreenSlot>
                <MasterShortcutGrid
                    actualBalance={actualBalance}
                    changeBoxes={changeBoxes}
                    treasuryLoading={treasuryLoading}
                    overtimeViewMonth={overtimeViewMonth}
                    overtimeWeeksData={overtimeWeeksData}
                    overtimeLoading={overtimeLoading}
                    onOpenCambio={() => setIsSwapModalOpen(true)}
                    onOpenOvertime={() => setIsOvertimeModalOpen(true)}
                    onOpenCajasCambio={() => setIsCajasCambioOpen(true)}
                    onOpenReservas={() => router.push('/staff/reservas')}
                    onOpenCajaInicialAcciones={openCajaInicialActions}
                    onOpenOtros={() => setIsMoreFunctionsModalOpen(true)}
                    pendingReservationsCount={pendingReservationsCount}
                />
            </HomeScreen>

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
                    },
                }}
            />

            <CashClosingModal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                onSuccess={() => {
                    void refresh();
                }}
                initialTotalSales={closingSalesSummary.total}
                initialTicketsCount={closingSalesSummary.count}
            />

            {isSwapModalOpen && (
                <CashChangeModal
                    boxOptions={buildPaymentSources()}
                    isManager
                    onClose={() => setIsSwapModalOpen(false)}
                    onSuccess={() => {
                        setIsSwapModalOpen(false);
                        void refresh();
                    }}
                />
            )}

            <Modal
                open={Boolean(auditBox)}
                onClose={() => setAuditBox(null)}
                variant="amplify"
                layer="base"
                instance="cash-audit"
                usageId="master-cash-audit"
                usageLabel="Arqueo de caja"
                headerTone="petroleum"
                title="Arqueo de caja"
                subtitle={auditBox?.name || 'Caja cambio'}
                ariaLabel="Arqueo de caja"
                headerTrailing={<CashCountDateButton value={cashOpDate} onChange={setCashOpDate} />}
                footer={
                    <CashCountFooter
                        total={cashCountTotal}
                        instancePrefix="master-cash-audit"
                        onCancel={() => setAuditBox(null)}
                        saveType="submit"
                        saveForm={CASH_COUNT_FORM_ID}
                    />
                }
            >
                {auditBox ? (
                    <CashDenominationForm
                        key={`audit-${auditBox.id}`}
                        variant="embedded"
                        type="audit"
                        boxName={auditBox.name || 'Caja cambio'}
                        initialCounts={boxInventoryMap}
                        availableStock={boxInventoryMap}
                        onCancel={() => setAuditBox(null)}
                        onSubmit={handleAuditSubmit}
                        onTotalChange={setCashCountTotal}
                        selectedDate={cashOpDate}
                        onSelectedDateChange={setCashOpDate}
                    />
                ) : null}
            </Modal>

            <MasterMoreFunctionsModal
                isOpen={isMoreFunctionsModalOpen}
                onClose={() => setIsMoreFunctionsModalOpen(false)}
                onOpenCierre={() => setIsClosingModalOpen(true)}
                onOpenPlantilla={() => {
                    setIsStaffModalOpen(true);
                    void ensureActivePlantillaEmployees();
                }}
            />

            <Modal
                open={isCajaInicialActionsOpen}
                onClose={() => setIsCajaInicialActionsOpen(false)}
                variant="standard"
                layer="base"
                instance="master-caja-inicial-acciones"
                usageId="master-caja-inicial-acciones"
                usageLabel="Caja inicial: acciones"
                headerTone="petroleum"
                scheme="dark"
                title="Caja Inicial"
                ariaLabel="Caja inicial: acciones"
            >
                <div className="grid grid-cols-4 items-start gap-2 pb-6 pt-1">
                    {(
                        [
                            {
                                label: 'Entrada',
                                accion: 'in' as const,
                                color: 'bg-emerald-500',
                                icon: <Plus size={16} strokeWidth={1.75} fill="none" className="text-white" />,
                            },
                            {
                                label: 'Salida',
                                accion: 'out' as const,
                                color: 'bg-rose-500',
                                icon: <Minus size={16} strokeWidth={1.75} fill="none" className="text-white" />,
                            },
                            {
                                label: 'Compra',
                                accion: 'compra' as const,
                                color: 'bg-[#5B8FB9]',
                                icon: <ShoppingCart size={16} strokeWidth={1.75} fill="none" className="text-white" />,
                            },
                            {
                                label: 'Arqueo',
                                accion: 'arqueo' as const,
                                color: 'bg-orange-400',
                                icon: <RefreshCw size={16} strokeWidth={1.75} fill="none" className="text-white" />,
                            },
                        ] as const
                    ).map((opcion) => (
                        <button
                            key={opcion.accion}
                            type="button"
                            onClick={() => handleCajaInicialAccion(opcion.accion)}
                            aria-label={opcion.label}
                            className="group flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1.5 px-1 transition-all active:scale-95"
                        >
                            <div
                                className={`flex h-9 w-9 items-center justify-center rounded-full ${opcion.color} shadow-sm transition-transform group-hover:scale-110`}
                            >
                                {opcion.icon}
                            </div>
                            <span className="flex items-center self-center text-[9px] font-black uppercase leading-none tracking-widest text-zinc-500">
                                {opcion.label}
                            </span>
                        </button>
                    ))}
                </div>
            </Modal>

            <Modal
                open={cashModalMode !== 'none'}
                onClose={() => setCashModalMode('none')}
                variant="amplify"
                layer="base"
                instance="master-cash-in-out"
                usageId={`master-cash-${cashModalMode}`}
                usageLabel={cashModalMode === 'in' ? 'Entrada de caja' : 'Salida de caja'}
                headerTone="petroleum"
                title={cashModalMode === 'in' ? 'Entrada de caja' : 'Salida de caja'}
                subtitle={selectedCashBox?.name || 'Caja Inicial'}
                ariaLabel={cashModalMode === 'in' ? 'Entrada de caja' : 'Salida de caja'}
                headerTrailing={<CashCountDateButton value={cashOpDate} onChange={setCashOpDate} />}
                footer={
                    <CashCountFooter
                        total={cashCountTotal}
                        instancePrefix={`master-cash-${cashModalMode}`}
                        onCancel={() => setCashModalMode('none')}
                        saveType="submit"
                        saveForm={CASH_COUNT_FORM_ID}
                    />
                }
            >
                {selectedCashBox ? (
                    <CashDenominationForm
                        key={`${cashModalMode}-${selectedCashBox.id}`}
                        variant="embedded"
                        type={cashModalMode as 'in' | 'out'}
                        boxName={selectedCashBox.name || 'Caja Inicial'}
                        boxId={selectedCashBox.id}
                        initialCounts={{}}
                        availableStock={boxInventoryMap}
                        onCancel={() => setCashModalMode('none')}
                        onSubmit={handleCashTransaction}
                        onTotalChange={setCashCountTotal}
                        selectedDate={cashOpDate}
                        onSelectedDateChange={setCashOpDate}
                    />
                ) : null}
            </Modal>

            {showPurchaseMultiSourceModal && (
                <Modal
                    open
                    onClose={() => { setShowPurchaseMultiSourceModal(false); setPurchaseInventoriesByBoxId({}); }}
                    variant="amplify"
                    layer="base"
                    instance="master-purchase-multi-source"
                    usageId="master-purchase-multi-source"
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

            <Modal
                open={isCajasCambioOpen}
                onClose={() => setIsCajasCambioOpen(false)}
                variant="compact"
                layer="base"
                instance="master-cajas-cambio-elegir"
                usageId="master-cajas-cambio-elegir"
                usageLabel="Elegir caja cambio"
                headerTone="petroleum"
                title="Cajas Cambio"
                ariaLabel="Cajas Cambio"
            >
                <div className="flex flex-col gap-2 p-2">
                    <Button
                        type="button"
                        variant="secondary"
                        instance="master-cajas-cambio-1"
                        layout="fill"
                        onClick={() => {
                            setIsCajasCambioOpen(false);
                            const box = changeBoxes[0];
                            if (box) void openChangeBoxAudit(box);
                        }}
                    >
                        Cambio 1{changeBoxes[0] ? ` · ${formatChangeBoxEur(Number(changeBoxes[0].current_balance ?? 0))}` : ''}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        instance="master-cajas-cambio-2"
                        layout="fill"
                        onClick={() => {
                            setIsCajasCambioOpen(false);
                            const box = changeBoxes[1];
                            if (box) void openChangeBoxAudit(box);
                        }}
                    >
                        Cambio 2{changeBoxes[1] ? ` · ${formatChangeBoxEur(Number(changeBoxes[1].current_balance ?? 0))}` : ''}
                    </Button>
                </div>
            </Modal>

            <Modal
                open={isOvertimeModalOpen}
                onClose={() => setIsOvertimeModalOpen(false)}
                variant="standard"
                layer="base"
                instance="master-overtime-month"
                usageId="master-overtime-month"
                usageLabel="Horas extras del mes"
                headerTone="petroleum"
                title="Horas extras"
                ariaLabel="Horas extras"
            >
                <HorasExtrasWidget
                    overtimeViewMonth={overtimeViewMonth}
                    onPrevMonth={() => setOvertimeViewMonth((prev) => subMonths(prev, 1))}
                    onNextMonth={() => setOvertimeViewMonth((prev) => addMonths(prev, 1))}
                    overtimeLoading={overtimeLoading}
                    overtimeWeeksData={overtimeWeeksData}
                    onWeekClick={(week) => setOvertimeWeekDetail(week)}
                />
            </Modal>

            {overtimeWeekDetail ? (() => {
                const week = overtimeWeekDetail;
                const weekStaff = (week.staff ?? []).filter((s: StaffWeeklyStats) => {
                    const cost = s.totalCost ?? 0;
                    return cost > 0.05 && s.preferStock !== true;
                });
                const weekTotal = weekStaff.reduce((sum: number, s: StaffWeeklyStats) => sum + (s.totalCost ?? 0), 0);
                const paidTotal = weekStaff
                    .filter((s: StaffWeeklyStats) => overtimePaidStatus[`${week.weekId}-${s.id}`] ?? !!s.isPaid)
                    .reduce((sum: number, s: StaffWeeklyStats) => sum + (s.totalCost ?? 0), 0);
                const weekNum = getISOWeek(new Date(week.weekId));
                const periodStr = `${format(new Date(week.weekId), 'd MMM', { locale: es })} - ${format(addDays(new Date(week.weekId), 6), 'd MMM yyyy', { locale: es })}`;
                const allWeeks = Array.from(new Map((overtimeWeeksData || []).map((w: WeeklyStats) => [w.weekId, w])).values());
                const sortedWeeks = [...allWeeks].sort((a: WeeklyStats, b: WeeklyStats) => a.weekId.localeCompare(b.weekId));
                const currentIdx = sortedWeeks.findIndex((w: any) => w.weekId === week.weekId);
                const prevWeek = currentIdx > 0 ? sortedWeeks[currentIdx - 1] : null;
                const nextWeek = currentIdx >= 0 && currentIdx < sortedWeeks.length - 1 ? sortedWeeks[currentIdx + 1] : null;
                return (
                    <Modal
                        open
                        onClose={() => {
                            setOvertimeWeekDetail(null);
                            setOvertimeWorkerHistory(null);
                        }}
                        variant="standard"
                        layer="base"
                        instance="master-overtime-week-detail"
                        usageId="master-overtime-week-detail"
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
                                        onClick={() => { if (prevWeek) setOvertimeWeekDetail(prevWeek); }}
                                        disabled={!prevWeek}
                                        className="flex h-12 w-12 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30"
                                        aria-label="Semana anterior"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { if (nextWeek) setOvertimeWeekDetail(nextWeek); }}
                                        disabled={!nextWeek}
                                        className="flex h-12 w-12 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30"
                                        aria-label="Semana siguiente"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                            <div>
                                {weekStaff.map((s: StaffWeeklyStats) => (
                                    <MasterStaffOvertimeRow
                                        key={s.id}
                                        staff={{ ...s, name: s.name.split(' ')[0] ?? s.name }}
                                        weekId={week.weekId}
                                        isPaid={overtimePaidStatus[`${week.weekId}-${s.id}`] ?? !!s.isPaid}
                                        onTogglePaid={toggleOvertimePaid}
                                        onClick={() => setOvertimeWorkerHistory({ workerId: s.id, weekId: week.weekId })}
                                    />
                                ))}
                                {weekStaff.length === 0 && (
                                    <EmptyState instance="master-overtime-week-none" variant="none" title="Sin importes esta semana" />
                                )}
                            </div>
                        </div>
                    </Modal>
                );
            })() : null}

            <WorkerWeeklyHistoryModal
                isOpen={!!overtimeWorkerHistory}
                onClose={() => setOvertimeWorkerHistory(null)}
                workerId={overtimeWorkerHistory?.workerId || ''}
                weekStart={overtimeWorkerHistory?.weekId || ''}
                layer="derived"
                parentInstance="master-overtime-week-detail"
            />
        </div>
    );
}
