'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { endOfWeek, format, startOfWeek, subWeeks } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { getOvertimeData } from '@/app/actions/overtime';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import MasterShortcutGrid from '@/components/dashboards/MasterShortcutGrid';
import { HomeScreen, HomeScreenSlot } from '@/components/dashboards/HomeScreen';
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
import { filterVisiblePlantillaEmployees } from '@/lib/staff/plantilla-employees';

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

    const [closingSalesSummary, setClosingSalesSummary] = useState(
        initialData?.liveTickets || { total: 0, count: 0 }
    );
    const [allEmployees, setAllEmployees] = useState<any[]>(initialData?.allEmployees || []);
    const [allEmployeesIncludingInactive, setAllEmployeesIncludingInactive] = useState<any[] | null>(null);
    const [showAllEmployeesInPlantilla, setShowAllEmployeesInPlantilla] = useState(false);

    const [overtimeSnapshot, setOvertimeSnapshot] = useState<OvertimeWeekSnapshot | null>(null);
    const [overtimeLoading, setOvertimeLoading] = useState(true);
    const [pendingReservationsCount, setPendingReservationsCount] = useState(0);

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

    const buildPaymentSources = (): BoxOption[] => {
        const list: BoxOption[] = [];
        const op = boxes.find((b: any) => b.type === 'operational');
        const changes = boxes.filter((b: any) => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        const tpvBoxes = boxes.filter((b: any) => b.type === 'tpv').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (op) list.push({ id: op.id, name: 'Caja inicial', hasInventory: true, image_url: op.image_url });
        changes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Caja cambio ${i + 1}`, hasInventory: true, image_url: b.image_url }));
        if (tpvBoxes.length > 0) {
            tpvBoxes.forEach((b: any) => list.push({ id: b.id, name: b.name, hasInventory: false, image_url: b.image_url }));
        } else {
            list.push({ id: 'tpv1', name: 'TPV 1', hasInventory: false });
            list.push({ id: 'tpv2', name: 'TPV 2', hasInventory: false });
        }
        return list;
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
            <HomeScreen>
                <HomeScreenSlot size="wide" instance="dashboard-ventas">
                    <DashboardVentasSection
                        initialData={{
                            liveTickets: initialData?.liveTickets,
                            salesChartData: initialData?.salesChartData,
                        }}
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
                    onOpenPlantilla={() => {
                        setIsStaffModalOpen(true);
                        void ensureActivePlantillaEmployees();
                    }}
                    onOpenCierre={() => setIsClosingModalOpen(true)}
                    onOpenChangeBoxAudit={openChangeBoxAudit}
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
        </div>
    );
}
