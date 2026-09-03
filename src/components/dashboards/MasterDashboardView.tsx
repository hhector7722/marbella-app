'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { endOfWeek, format, startOfWeek, subWeeks } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { Plus, Minus, ShoppingCart, RefreshCw } from 'lucide-react';
import { getOvertimeData } from '@/app/actions/overtime';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import MasterShortcutGrid from '@/components/dashboards/MasterShortcutGrid';
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
import { pickLatestOvertimeWeekSnapshot, type OvertimeWeekSnapshot } from '@/lib/master-overtime-snapshot';
import {
    PLANTILLA_EMPLOYEE_SELECT,
    filterVisiblePlantillaEmployees,
    type PlantillaEmployeeRow,
} from '@/lib/staff/plantilla-employees';
import { canManageStaffAttendance } from '@/lib/staff/attendance-access';
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';

type MasterDashboardViewProps = {
    initialData?: {
        liveTickets?: { total: number; count: number };
        salesChartData?: { hora: number; total: number }[];
        actualBalance?: number;
        boxes?: any[];
        allEmployees?: any[];
    };
};

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

    const [overtimeSnapshot, setOvertimeSnapshot] = useState<OvertimeWeekSnapshot | null>(null);
    const [overtimeLoading, setOvertimeLoading] = useState(true);
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
        setOvertimeLoading(true);
        // Solo la última semana completada (el tile muestra ese snapshot).
        const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        const start = format(lastWeekStart, 'yyyy-MM-dd');
        const end = format(endOfWeek(lastWeekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        getOvertimeData(start, end)
            .then((result) => {
                if (cancelled) return;
                setOvertimeSnapshot(pickLatestOvertimeWeekSnapshot(result?.weeksResult ?? []));
            })
            .catch(() => {
                if (!cancelled) {
                    setOvertimeSnapshot(null);
                    toast.error('No se pudieron cargar las horas extras');
                }
            })
            .finally(() => {
                if (!cancelled) setOvertimeLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

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
                    overtimeSnapshot={overtimeSnapshot}
                    overtimeLoading={overtimeLoading}
                    onOpenCambio={() => setIsSwapModalOpen(true)}
                    onOpenReservas={() => router.push('/staff/reservas')}
                    onOpenChangeBoxAudit={openChangeBoxAudit}
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
                <AccessMenuGrid align="center">
                    <CatalogTile
                        title="Entrada"
                        fallback={<Plus className="h-8 w-8 text-emerald-500" strokeWidth={2.5} />}
                        onClick={() => handleCajaInicialAccion('in')}
                    />
                    <CatalogTile
                        title="Salida"
                        fallback={<Minus className="h-8 w-8 text-rose-500" strokeWidth={2.5} />}
                        onClick={() => handleCajaInicialAccion('out')}
                    />
                    <CatalogTile
                        title="Compra"
                        fallback={<ShoppingCart className="h-8 w-8 text-[#5B8FB9]" strokeWidth={2.5} />}
                        onClick={() => handleCajaInicialAccion('compra')}
                    />
                    <CatalogTile
                        title="Arqueo"
                        fallback={<RefreshCw className="h-8 w-8 text-orange-500" strokeWidth={2.5} />}
                        onClick={() => handleCajaInicialAccion('arqueo')}
                    />
                </AccessMenuGrid>
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
        </div>
    );
}
