'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDays, format } from 'date-fns';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { getOvertimeData } from '@/app/actions/overtime';
import DashboardVentasSection from '@/components/dashboards/DashboardVentasSection';
import MasterShortcutGrid from '@/components/dashboards/MasterShortcutGrid';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal, type BoxOption } from '@/components/CashChangeModal';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { useMasterTreasuryLive } from '@/hooks/useMasterTreasuryLive';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { pickLatestOvertimeWeekSnapshot, type OvertimeWeekSnapshot } from '@/lib/master-overtime-snapshot';
import { cn } from '@/lib/utils';

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
    const { actualBalance, boxes, refresh } = useMasterTreasuryLive({
        actualBalance: initialData?.actualBalance,
        boxes: initialData?.boxes,
    });

    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [scheduleFocusDate, setScheduleFocusDate] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [auditBox, setAuditBox] = useState<any>(null);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});

    useModalUsageTracking({
        open: auditBox !== null,
        usageId: 'master-cash-audit',
        usageLabel: 'Arqueo de caja',
    });

    const [closingSalesSummary, setClosingSalesSummary] = useState(
        initialData?.liveTickets || { total: 0, count: 0 }
    );
    const [allEmployees, setAllEmployees] = useState<any[]>(initialData?.allEmployees || []);
    const [allEmployeesIncludingInactive, setAllEmployeesIncludingInactive] = useState<any[] | null>(null);
    const [showAllEmployeesInPlantilla, setShowAllEmployeesInPlantilla] = useState(false);

    const [userData, setUserData] = useState<{ id: string; name: string; role: string } | null>(null);
    const [monthShifts, setMonthShifts] = useState<any[]>([]);
    const [overtimeSnapshot, setOvertimeSnapshot] = useState<OvertimeWeekSnapshot | null>(null);
    const [pendingReservationsCount, setPendingReservationsCount] = useState(0);

    const changeBoxes = useMemo(
        () => boxes.filter((b) => b.type === 'change').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        [boxes]
    );

    useEffect(() => {
        async function loadProfileAndShifts() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('profiles')
                .select('first_name, role')
                .eq('id', user.id)
                .single();

            setUserData({
                id: user.id,
                name: data?.first_name || 'Empleado',
                role: data?.role || 'manager',
            });

            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const { data: realShifts } = await supabase
                .from('shifts')
                .select('start_time, end_time, activity, activity_2')
                .eq('user_id', user.id)
                .eq('is_published', true)
                .gte('start_time', startOfMonth.toISOString())
                .order('start_time', { ascending: true });

            if (realShifts && realShifts.length > 0) {
                setMonthShifts(
                    realShifts.map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        return {
                            date: start,
                            startTime: start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            endTime: end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            activity: s.activity || s.activity_2 || undefined,
                        };
                    })
                );
            }
        }

        void loadProfileAndShifts();
    }, [supabase]);

    useEffect(() => {
        const d = searchParams.get('scheduleDate')?.trim();
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        setScheduleFocusDate(d);
        setIsScheduleModalOpen(true);
    }, [searchParams]);

    const closeScheduleModal = () => {
        setIsScheduleModalOpen(false);
        setScheduleFocusDate(null);
        if (searchParams.get('scheduleDate')) {
            router.replace('/master/dashboard');
        }
    };

    useEffect(() => {
        let cancelled = false;

        async function fetchPendingReservationsCount(showErrorToast: boolean) {
            const { count, error } = await supabase
                .from('reservations')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (cancelled) return;

            if (error) {
                if (showErrorToast) {
                    toast.error('No se pudo cargar el contador de reservas pendientes');
                }
                return;
            }

            setPendingReservationsCount(count ?? 0);
        }

        void fetchPendingReservationsCount(true);

        const channel = supabase
            .channel('master:reservations-pending')
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
        const start = format(addDays(new Date(), -60), 'yyyy-MM-dd');
        const end = format(new Date(), 'yyyy-MM-dd');
        getOvertimeData(start, end)
            .then((result) => {
                if (cancelled) return;
                setOvertimeSnapshot(pickLatestOvertimeWeekSnapshot(result?.weeksResult ?? []));
            })
            .catch(() => {
                if (!cancelled) setOvertimeSnapshot(null);
            });
        return () => {
            cancelled = true;
        };
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

    const userRole = (userData?.role as 'staff' | 'manager' | 'supervisor') || 'manager';

    return (
        <div className="pt-3 md:pt-2 animate-in fade-in duration-500 pb-8 md:pb-4">
            <div className="px-4 w-full max-w-sm md:max-w-6xl mx-auto space-y-4 md:space-y-2">
                <DashboardVentasSection
                    initialData={{
                        liveTickets: initialData?.liveTickets,
                        salesChartData: initialData?.salesChartData,
                    }}
                />
                <MasterShortcutGrid
                    actualBalance={actualBalance}
                    changeBoxes={changeBoxes}
                    overtimeSnapshot={overtimeSnapshot}
                    onOpenCambio={() => setIsSwapModalOpen(true)}
                    onOpenReservas={() => router.push('/staff/reservas')}
                    onOpenHorarios={() => setIsScheduleModalOpen(true)}
                    onOpenPlantilla={() => setIsStaffModalOpen(true)}
                    onOpenCierre={() => setIsClosingModalOpen(true)}
                    onOpenChangeBoxAudit={openChangeBoxAudit}
                    pendingReservationsCount={pendingReservationsCount}
                />
            </div>

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={closeScheduleModal}
                shifts={monthShifts}
                userName={userData?.name}
                userRole={userRole}
                userId={userData?.id}
                initialFocusDate={scheduleFocusDate}
            />

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
                includeInactive={showAllEmployeesInPlantilla}
                headerTextAction={{
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

            {auditBox && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200" onClick={() => setAuditBox(null)}>
                    <div className={cn('bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]', 'max-w-2xl')} onClick={(e) => e.stopPropagation()}>
                        <CashDenominationForm
                            key={`audit-${auditBox.id}`}
                            type="audit"
                            boxName={auditBox.name || 'Caja cambio'}
                            initialCounts={boxInventoryMap}
                            availableStock={boxInventoryMap}
                            onCancel={() => setAuditBox(null)}
                            onSubmit={handleAuditSubmit}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
