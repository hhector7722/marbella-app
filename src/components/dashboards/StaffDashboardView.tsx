'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, ArrowLeft,
    Check, Info, Package,
    Phone, Scale, ShoppingCart, Boxes, MessageCircle,
    ChefHat, Calculator, ArrowRightLeft, Save, ArrowDown, ArrowUp,
    Plus, Minus, BookOpen, CalendarCheck
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { CashDenominationForm, CASH_COUNT_FORM_ID } from '@/components/CashDenominationForm';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { CashCountDateButton, formatCashCountDateInput } from '@/components/cash/CashCountDateButton';
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';
import { toast } from 'sonner';
import { differenceInMinutes, startOfWeek, format } from 'date-fns';
import { formatYmdInMadrid, madridDayUtcRangeIso, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';
import { FICHAJE_OVERLAY_VIDEOS } from '@/lib/fichaje-overlay-videos';
import { syncOvertimeCostAfterTimeLogChange } from '@/app/actions/persist-overtime-cost';
import { getEmployeeHistoryWeek, type HistoryWeekDto } from '@/app/actions/history-read';
import { WeekSummary } from '@/components/staff/WeekSummary';
import { StaffWeekScheduleWidget } from '@/components/dashboards/staff/StaffWeekScheduleWidget';
import WorkTimer, { StaffElapsedDigits, formatStaffElapsedHms } from '@/components/ui/WorkTimer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { HomeScreen, HomeScreenSlot } from '@/components/dashboards/HomeScreen';
import { ConsumptionModal } from '@/app/staff/ConsumptionModal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import {
    STAFF_HORNO_MANUAL_ITEMS,
    STAFF_MANUAL_ASSETS,
    STAFF_MANUAL_MENU,
    STAFF_TPV_MANUAL_ICONS,
    STAFF_TPV_MANUAL_ITEMS,
    STAFF_TPV_MANUAL_VIDEOS,
    type StaffManualMenuId,
} from '@/lib/staff-manuals';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

const CONTACTS_DATA = [
    { name: 'Hielo Fenix', phone: '(3461) 028-8888' },
    { name: 'Servei Tècnic Cafetera', phone: '(3493) 293-6749' },
    { name: "Recollida d'Oli", phone: '(3493) 673-1722' },
    { name: 'Recepció Cem Marbella', phone: '(3493) 221-0676' },
    { name: 'Ramón', phone: '(3466) 023-1748' },
    { name: 'Héctor', phone: '(3464) 722-9309' },
];

const STAFF_INFO_MENU = [
    { title: 'Contactos de Interés', imageSrc: '/icons/whatsapp.png', kind: 'contactos' as const },
    { title: 'Manuales', imageSrc: '/icons/guide.png', kind: 'manuales' as const },
];

const STAFF_WEB_HREF = 'https://marbella-web.vercel.app';

type WorkStatus = 'idle' | 'working' | 'finished';

interface ShiftMock {
    date: Date;
    startTime: string;
    endTime: string;
    activity?: string;
}

type ManualMediaViewerState = { type: 'video' | 'image'; src: string; title: string } | null;

const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

const FICHAJE_LABEL = 'Registro';

function StaffFichajeShortcutShell({
    label,
    hideLabel = false,
    onClick,
    disabled,
    shortcutFill,
    children,
}: {
    label: string;
    hideLabel?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    /** Mismo contrato que DashboardShortcut plate=fill (p. ej. C INICIAL). */
    shortcutFill?: string;
    children: ReactNode;
}) {
    const Tag = onClick ? 'button' : 'div';

    return (
        <Tag
            type={onClick ? 'button' : undefined}
            data-component="StaffFichajeControl"
            data-plate="fill"
            onClick={onClick}
            disabled={disabled}
            className={onClick ? 'touch-manipulation transition-all active:scale-95 disabled:opacity-70' : undefined}
            style={shortcutFill ? { ['--shortcut-fill' as string]: shortcutFill } : undefined}
        >
            <div data-element="iconWrap">
                <div data-element="iconBox">
                    <div data-element="asset" className="flex h-full w-full items-center justify-center">
                        {children}
                    </div>
                </div>
                <span data-element="rim" aria-hidden />
            </div>
            <span data-element="text" className={hideLabel ? 'invisible' : undefined} aria-hidden={hideLabel}>
                {label}
            </span>
        </Tag>
    );
}

function StaffFichajeWorkingControl({
    clockIn,
    actionLoading,
    onClockOut,
}: {
    clockIn?: string;
    actionLoading: boolean;
    onClockOut: () => void;
}) {
    return (
        <div data-component="StaffFichajeControl" data-layout="dual-stack" data-plate="fill">
            <div data-element="iconStack">
                <div data-element="iconWrap">
                    <div
                        data-element="iconBox"
                        aria-live="polite"
                        style={{ ['--shortcut-fill' as string]: 'rgb(15 23 42 / 0.88)' }}
                    >
                        <div
                            data-element="asset"
                            className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-600/90 to-zinc-950/95"
                        >
                            <WorkTimer clockIn={clockIn || null} compact mini inverted />
                        </div>
                    </div>
                    <span data-element="rim" aria-hidden />
                </div>
                <div data-element="iconWrap">
                    <button
                        type="button"
                        data-element="iconBox"
                        onClick={onClockOut}
                        disabled={actionLoading}
                        aria-label="Salida"
                        className={cn(
                            'relative touch-manipulation text-white transition-[filter] active:brightness-[0.99] disabled:opacity-70',
                            'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                        )}
                        style={{ ['--shortcut-fill' as string]: '#e8365a' }}
                    >
                        <div data-element="asset" className="flex h-full w-full items-center justify-center bg-gradient-to-b from-rose-500 to-[#e8365a]">
                            {actionLoading ? (
                                <LoadingSpinner size="sm" className="text-white" />
                            ) : (
                                <span className="text-[10px] font-black uppercase leading-none tracking-wide">Salida</span>
                            )}
                        </div>
                    </button>
                    <span data-element="rim" aria-hidden />
                </div>
            </div>
        </div>
    );
}

function StaffFichajeIcon({
    status,
    clockLoading,
    actionLoading,
    todayLog,
    onClockIn,
    onClockOut,
}: {
    status: WorkStatus;
    clockLoading: boolean;
    actionLoading: boolean;
    todayLog: { clock_in?: string; clock_out?: string } | null;
    onClockIn: () => void;
    onClockOut: () => void;
}) {
    if (clockLoading) {
        return (
            <StaffFichajeShortcutShell label={FICHAJE_LABEL} hideLabel>
                <div data-element="asset" className="flex h-full w-full items-center justify-center bg-black/25">
                    <LoadingSpinner size="sm" className="text-white" />
                </div>
            </StaffFichajeShortcutShell>
        );
    }

    if (status === 'working') {
        return (
            <StaffFichajeWorkingControl
                clockIn={todayLog?.clock_in}
                actionLoading={actionLoading}
                onClockOut={onClockOut}
            />
        );
    }

    if (status === 'finished') {
        return (
            <StaffFichajeShortcutShell
                label={FICHAJE_LABEL}
                shortcutFill="var(--color-positivo)"
            >
                <StaffElapsedDigits
                    value={formatStaffElapsedHms(todayLog?.clock_in, todayLog?.clock_out)}
                    tone="quiet"
                    compact
                    mini
                    inverted
                />
            </StaffFichajeShortcutShell>
        );
    }

    return (
        <div data-component="StaffFichajeControl" data-plate="fill">
            <div data-element="iconWrap">
                <button
                    type="button"
                    data-element="iconBox"
                    onClick={onClockIn}
                    disabled={actionLoading}
                    aria-label="Entrada"
                    className={cn(
                        'relative touch-manipulation text-white transition-[filter] active:brightness-[0.99] disabled:opacity-70',
                        'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                    )}
                    style={{ ['--shortcut-fill' as string]: '#0eab78' }}
                >
                    <div data-element="asset" className="flex h-full w-full items-center justify-center bg-gradient-to-b from-emerald-500 to-[#0eab78]">
                        {actionLoading ? (
                            <LoadingSpinner size="sm" className="text-white" />
                        ) : (
                            <span className="text-[10px] font-black uppercase leading-none tracking-wide">Entrada</span>
                        )}
                    </div>
                </button>
                <span data-element="rim" aria-hidden />
            </div>
            <span data-element="text">{FICHAJE_LABEL}</span>
        </div>
    );
}

export default function StaffDashboardView() {
    const supabase = createClient();
    const router = useRouter();
    const [weekLoading, setWeekLoading] = useState(true);
    const [clockLoading, setClockLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('staff');
    const [userEmail, setUserEmail] = useState<string>('');
    const [status, setStatus] = useState<WorkStatus>('idle');
    const [todayLog, setTodayLog] = useState<any>(null);

    const [historyWeek, setHistoryWeek] = useState<HistoryWeekDto | null>(null);
    const [weekFilterYear, setWeekFilterYear] = useState(() => new Date().getFullYear());
    const [weekFilterMonth, setWeekFilterMonth] = useState(() => new Date().getMonth());
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [monthShifts, setMonthShifts] = useState<ShiftMock[]>([]);
    const [fichajeOverlay, setFichajeOverlay] = useState<'none' | 'confirm' | 'consumption'>('none');
    const [modalAction, setModalAction] = useState<'in' | 'out' | null>(null);
    const [showGiffOverlay, setShowGiffOverlay] = useState(false);
    const [giffOverlaySrc, setGiffOverlaySrc] = useState<string>('/icons/giff.mp4');
    const [giffOverlayFading, setGiffOverlayFading] = useState(false);
    const giffFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const giffFadingRef = useRef(false);
    const GIFF_FADE_MS = 900;

    const clearGiffFadeTimer = () => {
        if (giffFadeTimerRef.current) {
            clearTimeout(giffFadeTimerRef.current);
            giffFadeTimerRef.current = null;
        }
    };

    const beginGiffOverlayFadeOut = () => {
        if (giffFadingRef.current) return;
        giffFadingRef.current = true;
        setGiffOverlayFading(true);
        clearGiffFadeTimer();
        giffFadeTimerRef.current = setTimeout(() => {
            setShowGiffOverlay(false);
            setGiffOverlayFading(false);
            giffFadingRef.current = false;
            giffFadeTimerRef.current = null;
        }, GIFF_FADE_MS);
    };

    useEffect(() => () => clearGiffFadeTimer(), []);
    const [activeMenu, setActiveMenu] = useState<'info' | null>(null);
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | null>(null);
    const [isManualsModalOpen, setIsManualsModalOpen] = useState(false);
    const [isTpvManualModalOpen, setIsTpvManualModalOpen] = useState(false);
    const [isHornoManualModalOpen, setIsHornoManualModalOpen] = useState(false);
    const [manualMediaViewer, setManualMediaViewer] = useState<ManualMediaViewerState>(null);
    const [changeBox, setChangeBox] = useState<any>(null);
    const [changeBoxInventoryMap, setChangeBoxInventoryMap] = useState<Record<number, number>>({});
    const [liveTickets, setLiveTickets] = useState({ total: 0, count: 0 });
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
    const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [scheduleFocusDate, setScheduleFocusDate] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const [userName, setUserName] = useState("");

    // NUEVOS ESTADOS PARA CAJA INICIAL ("COMPRA")
    const [operationalBox, setOperationalBox] = useState<any>(null);
    const [allBoxes, setAllBoxes] = useState<any[]>([]);
    const [isCashChangeModalOpen, setIsCashChangeModalOpen] = useState(false);
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'out'>('none');
    const [cashCountTotal, setCashCountTotal] = useState(0);
    const [cashOpDate, setCashOpDate] = useState(formatCashCountDateInput);
    const [purchaseDate, setPurchaseDate] = useState(formatCashCountDateInput);
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});

    useModalUsageTracking({
        open: Boolean(activeMenu),
        usageId: `staff-info-menu-${infoSubMenu ?? activeMenu ?? 'root'}`,
        usageLabel:
            infoSubMenu === 'contactos' ? 'Contactos'
            : 'Información',
    });
    useModalUsageTracking({
        open: isManualsModalOpen,
        usageId: 'staff-manuals-menu',
        usageLabel: 'Manuales',
    });
    useModalUsageTracking({
        open: isManualsModalOpen && isTpvManualModalOpen,
        usageId: 'staff-tpv-manual',
        usageLabel: 'Manual TPV',
    });
    useModalUsageTracking({
        open: isManualsModalOpen && isHornoManualModalOpen,
        usageId: 'staff-horno-manual',
        usageLabel: 'Manual horno',
    });
    useModalUsageTracking({
        open: manualMediaViewer !== null,
        usageId: 'staff-manual-media',
        usageLabel: manualMediaViewer?.title ?? 'Visor manual',
    });

    const trackStaffClockConfirm = useTrackModalApply('staff-clock-confirm', 'Confirmar fichaje');
    const trackStaffPurchaseMulti = useTrackModalApply('staff-purchase-multi-source', 'Compra multiorigen');
    const trackStaffInfoMenu = useTrackModalApply('staff-info-menu', 'Menú información');
    const trackStaffShortcut = useTrackModalApply('staff-dashboard-shortcut', 'Atajo staff');

    useEffect(() => { initialize(); }, []);

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
            router.replace('/staff/dashboard');
        }
    };



    const cleanPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.startsWith('34') ? `+${cleaned}` : `+34${cleaned}`;
    };

    async function initialize() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) {
                setClockLoading(false);
                setWeekLoading(false);
                return;
            }
            setUserId(user.id);
            setUserEmail(user.email ?? '');

            const { data: profile } = await supabase.from('profiles')
                .select('first_name, role')
                .eq('id', user.id)
                .single();

            if (profile) {
                setUserRole(profile.role as any);
                setUserName(profile.first_name || "Personal");
            }

            const today = new Date();
            const todayYmd = formatYmdInMadrid(today);
            const { startIso: startOfDay, endIso: endOfDay } = madridDayUtcRangeIso(todayYmd);

            const { data: log } = await supabase.from('time_logs')
                .select('*')
                .eq('user_id', user.id)
                .gte('clock_in', startOfDay)
                .lte('clock_in', endOfDay)
                .maybeSingle();

            if (log) {
                setTodayLog(log);
                setStatus(log.clock_out ? 'finished' : 'working');
            } else {
                setTodayLog(null);
                setStatus('idle');
            }
            setClockLoading(false);

            const weekStart = startOfWeek(today, { weekStartsOn: 1 });
            const weekStartYmd = format(weekStart, 'yyyy-MM-dd');

            const weekTask = (async () => {
                const res = await getEmployeeHistoryWeek({ userId: user.id, weekStart: weekStartYmd });
                if (!res.success) {
                    toast.error(res.error || 'No se pudo cargar el resumen semanal');
                    setHistoryWeek(null);
                    return;
                }
                setHistoryWeek(res.week);
                setWeekFilterYear(res.filterYear);
                setWeekFilterMonth(res.filterMonth);
            })().catch((e) => {
                console.error(e);
                toast.error('No se pudo cargar el resumen semanal');
            }).finally(() => setWeekLoading(false));

            const boxesTask = (async () => {
                const { data: allBoxesData, error: boxError } = await supabase.from('cash_boxes').select('*').order('name');
                if (boxError) console.error("Initialize Boxes Error:", boxError);
                if (allBoxesData && allBoxesData.length > 0) {
                    setAllBoxes(allBoxesData);
                    const cBox = allBoxesData.find((b: any) => b.type === 'change') || allBoxesData[0];
                    const oBox = allBoxesData.find((b: any) => b.type === 'operational') || allBoxesData[0];
                    setChangeBox(cBox);
                    setOperationalBox(oBox);
                }
            })().catch(console.error);

            const shiftsTask = (async () => {
                const startOfMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
                const { data: realShifts } = await supabase
                    .from('shifts')
                    .select('start_time, end_time, activity, activity_2')
                    .eq('user_id', user.id)
                    .eq('is_published', true)
                    .gte('start_time', startOfMonthDate.toISOString())
                    .order('start_time', { ascending: true });

                if (realShifts && realShifts.length > 0) {
                    const formattedShifts: ShiftMock[] = realShifts.map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        return {
                            date: start,
                            startTime: start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            endTime: end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            activity: s.activity || s.activity_2 || undefined,
                        };
                    });
                    setMonthShifts(formattedShifts);
                } else {
                    setMonthShifts([]);
                }
            })().catch(console.error);

            const ticketsTask = (async () => {
                const { data: ticketsToday } = await supabase.from('tickets_marbella')
                    .select('total_documento')
                    .eq('fecha', todayYmd);
                const totalVentas = ticketsToday?.reduce((sum, t) => sum + (Number(t.total_documento) || 0), 0) || 0;
                const countVentas = ticketsToday?.reduce((count, t) => {
                    const val = Number(t.total_documento) || 0;
                    if (val > 0) return count + 1;
                    if (val < 0) return count - 1;
                    return count;
                }, 0) || 0;
                setLiveTickets({ total: totalVentas, count: Math.max(0, countVentas) });
            })().catch(console.error);

            await Promise.all([weekTask, boxesTask, shiftsTask, ticketsTask]);
        } catch (error) {
            console.error(error);
            setClockLoading(false);
            setWeekLoading(false);
        }
    }

    const openTreasuryModal = async (box: any, mode: 'out') => {
        setSelectedBox(box);
        if (mode === 'out') {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', box.id).gt('quantity', 0);
            const initial: Record<number, number> = {};
            data?.forEach((d: any) => initial[Number(d.denomination)] = d.quantity);
            setBoxInventoryMap(initial);
            setBoxInventory(data || []);
        }
        setCashModalMode(mode);
    };

    const handleCashTransaction = async (total: number, breakdown: any, notesOrOutBreakdown: any, customDate?: string) => {
        try {
            if (!selectedBox) return;
            const payload: any = {
                box_id: selectedBox.id,
                type: 'OUT',
                amount: total,
                breakdown: breakdown,
                notes: notesOrOutBreakdown as string
            };

            if (customDate) {
                payload.created_at = customDate;
            }

            await supabase.from('treasury_log').insert(payload);
            setCashModalMode('none');
            setSelectedBox(null);
            initialize();
        } catch (error) {
            console.error(error);
            toast.error("Error al registrar movimiento");
        }
    };

    const buildPaymentSources = (): PaymentSourceOption[] => {
        const list: any[] = [];
        const op = allBoxes.find(b => b.type === 'operational');
        const changeBoxes = allBoxes.filter(b => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        const tpvBoxes = allBoxes.filter(b => b.type === 'tpv').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

        if (op) list.push({ id: op.id, name: 'Inicial', shortLabel: 'Inicial', hasInventory: true, image_url: op.image_url });
        changeBoxes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Cambio ${i + 1}`, shortLabel: `Cambio ${i + 1}`, hasInventory: true, image_url: b.image_url }));

        // Add TPVs from DB if they exist, otherwise fallback for migration period
        if (tpvBoxes.length > 0) {
            tpvBoxes.forEach(b => list.push({ id: b.id, name: b.name, shortLabel: b.name, hasInventory: false, image_url: b.image_url }));
        } else {
            list.push({ id: 'tpv1', name: 'TPV 1', shortLabel: 'TPV 1', hasInventory: false });
            list.push({ id: 'tpv2', name: 'TPV 2', shortLabel: 'TPV 2', hasInventory: false });
        }
        return list;
    };

    const openPurchaseMultiSourceModal = async () => {
        const op = allBoxes.find((b: any) => b.type === 'operational');
        const changeBoxes = allBoxes.filter((b: any) => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
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

    const handleOpenCompra = () => {
        trackStaffShortcut('Compra');
        const cashBoxes = allBoxes.filter(
            (b: any) => b.type === 'operational' || b.type === 'change' || b.type === 'tpv',
        );
        if (cashBoxes.length === 0) {
            toast.error('No hay cajas configuradas');
            return;
        }
        void openPurchaseMultiSourceModal();
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
                // EXCLUDE TPVs from database inserts (they don't record inventory movements)
                const isTpvByHardcodedId = entry.sourceId === 'tpv1' || entry.sourceId === 'tpv2';
                const isTpvByDb = allBoxes.some(b => b.id === entry.sourceId && b.type === 'tpv');
                if (isTpvByHardcodedId || isTpvByDb) continue;

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
            initialize();
            trackStaffPurchaseMulti(notesWithTpv || 'Compra registrada');
            toast.success('Compra registrada');
        } catch (error) {
            console.error(error);
            toast.error('Error al registrar la compra');
        }
    };

    const handleClockAction = async (forcedAction?: 'in' | 'out') => {
        if (!userId) return;
        const action = forcedAction ?? modalAction;
        trackStaffClockConfirm(action === 'in' ? 'Entrada' : 'Salida', { action: action ?? '' });
        setFichajeOverlay('none');
        setActionLoading(true);
        try {
            let lat: number | null = null;
            let lng: number | null = null;
            let distance: number | null = null;

            try {
                const pos = await getCurrentPosition();
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
                distance = getDistanceFromLatLonInMeters(lat, lng, MARBELLA_COORDS.lat, MARBELLA_COORDS.lng);
            } catch (geoError: any) {
                console.error("Geo error:", geoError);
                const exemptLocation = userRole === 'manager' || (userEmail?.toLowerCase() === 'marbellaremote@gmail.com');
                if (!exemptLocation) {
                    toast.error(geoError.message || "Ubicación necesaria para fichar");
                    setActionLoading(false);
                    return;
                }
            }

            const exemptLocation = userRole === 'manager' || (userEmail?.toLowerCase() === 'marbellaremote@gmail.com');
            if (!exemptLocation && distance !== null && distance > MAX_DISTANCE_METERS) {
                toast.error(`Estás demasiado lejos del local (${Math.round(distance)}m)`);
                setActionLoading(false);
                return;
            }

            const now = new Date();
            const logCoords = { input_lat: lat, input_lng: lng };

            const openGiffOverlay = (src: string) => {
                clearGiffFadeTimer();
                giffFadingRef.current = false;
                setGiffOverlayFading(false);
                setGiffOverlaySrc(src);
                setShowGiffOverlay(true);
            };

            if (action === 'in') {
                const { data, error: inErr } = await supabase.from('time_logs')
                    .insert({
                        user_id: userId,
                        clock_in: now.toISOString(),
                        is_manual_entry: false,
                        ...logCoords
                    })
                    .select()
                    .single();
                if (inErr) throw inErr;
                setTodayLog(data); setStatus('working'); toast.success("¡Jornada iniciada!");
                const dayYmd = formatYmdInMadrid(now);
                const sync = await syncOvertimeCostAfterTimeLogChange(userId, dayYmd);
                if (!sync.success) {
                    toast.error(sync.error ?? 'Fichaje OK; falló persistencia Cost Engine');
                }
                const { data: { user: u } } = await supabase.auth.getUser();
                const email = u?.email?.toLowerCase().trim() ?? '';
                const overlayConfig = FICHAJE_OVERLAY_VIDEOS[email];
                if (overlayConfig) {
                    openGiffOverlay(overlayConfig.entrada);
                }
            } else if (action === 'out' && todayLog) {
                const clockIn = new Date(todayLog.clock_in);
                const diffMinutes = differenceInMinutes(now, clockIn);
                const roundedHours = applyRoundingRule(diffMinutes);
                const { data, error: outErr } = await supabase.from('time_logs')
                    .update({
                        clock_out: now.toISOString(),
                        total_hours: roundedHours,
                        ...logCoords
                    })
                    .eq('id', todayLog.id)
                    .select()
                    .single();
                if (outErr) throw outErr;

                setTodayLog(data); setStatus('finished'); toast.success("Jornada finalizada.");
                const dayYmd = formatYmdInMadrid(now);
                const sync = await syncOvertimeCostAfterTimeLogChange(userId, dayYmd);
                if (!sync.success) {
                    toast.error(sync.error ?? 'Fichaje OK; falló persistencia Cost Engine');
                }
                const { data: { user: u } } = await supabase.auth.getUser();
                const email = u?.email?.toLowerCase().trim() ?? '';
                const overlayConfig = FICHAJE_OVERLAY_VIDEOS[email];
                if (overlayConfig) {
                    openGiffOverlay(overlayConfig.salida);
                }
            }
            setTimeout(() => initialize(), 0);
        } catch (error) {
            const msg =
                (error as any)?.message ||
                (error as any)?.error_description ||
                (error as any)?.details ||
                "Error al fichar";
            toast.error(msg);
        } finally { setActionLoading(false); }
    };

    const openConfirmation = (action?: 'in' | 'out') => {
        if (status === 'finished' || actionLoading) return;
        setModalAction(action ?? (status === 'idle' ? 'in' : 'out'));
        setFichajeOverlay('confirm');
    };

    const handleClockModalConfirm = () => {
        if (modalAction === 'out') {
            setFichajeOverlay('consumption');
            return;
        }
        setFichajeOverlay('none');
        void handleClockAction('in');
    };

    const closeMenus = () => { setActiveMenu(null); setInfoSubMenu(null); };
    const closeManualsModal = () => {
        setIsManualsModalOpen(false);
        setIsTpvManualModalOpen(false);
        setIsHornoManualModalOpen(false);
    };
    const closeTpvManualModal = () => setIsTpvManualModalOpen(false);
    const closeHornoManualModal = () => setIsHornoManualModalOpen(false);
    const backToInfoFromManuals = () => {
        closeManualsModal();
        setActiveMenu('info');
        setInfoSubMenu(null);
    };

    /** Misma UX que nóminas: visor PDF nativo del navegador en nueva pestaña (`NominasModal.openNomina`). */
    const openStaffPdf = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleStaffManualItem = (id: StaffManualMenuId) => {
        switch (id) {
            case 'check-list':
                openStaffPdf(STAFF_MANUAL_ASSETS.checkListPdf);
                break;
            case 'horno':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(true);
                break;
            case 'tpv':
                setIsHornoManualModalOpen(false);
                setIsTpvManualModalOpen(true);
                break;
            case 'altavoces':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'video', src: STAFF_MANUAL_ASSETS.altavocesVideo, title: 'Altavoces' });
                break;
            case 'bebidas':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'image', src: STAFF_MANUAL_ASSETS.bebidasImage, title: 'Bebidas' });
                break;
            case 'cambios-lluvia':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'image', src: STAFF_MANUAL_ASSETS.cambiosLluviaImage, title: 'Cambios por Lluvia' });
                break;
            case 'cuadro-electrico':
                setIsTpvManualModalOpen(false);
                setIsHornoManualModalOpen(false);
                setManualMediaViewer({ type: 'image', src: STAFF_MANUAL_ASSETS.cuadroElectricoImage, title: 'Acceso Cuadro Eléctrico' });
                break;
            default:
                break;
        }
    };

    return (
        <div className="pt-3 animate-in fade-in duration-500 pb-8">
            <HomeScreen layout="staff">
                <HomeScreenSlot size="wide" instance="staff-semana">
                    <div className="relative h-full min-h-0" data-fit="week">
                        {weekLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center z-10" role="status" aria-label="Cargando semana">
                                <LoadingSpinner size="md" className="text-white" />
                            </div>
                        ) : null}
                        {historyWeek ? (
                            <WeekSummary
                                flush
                                dimOtherMonth={false}
                                weeks={[historyWeek]}
                                filterMonth={weekFilterMonth}
                                filterYear={weekFilterYear}
                                onDayClick={(ymd) => {
                                    const [y, m, d] = ymd.split('-').map(Number);
                                    setSelectedDayDate(new Date(y, m - 1, d));
                                    setIsDayDetailModalOpen(true);
                                }}
                            />
                        ) : !weekLoading ? (
                            <EmptyState instance="staff-week-none" variant="none" title="Sin datos" />
                        ) : null}
                    </div>
                </HomeScreenSlot>

                <HomeScreenSlot size="panel" instance="staff-horarios">
                    <StaffWeekScheduleWidget
                        userId={userId}
                        onOpenNote={(ymd) => {
                            setScheduleFocusDate(ymd);
                            setIsScheduleModalOpen(true);
                        }}
                    />
                </HomeScreenSlot>

                <HomeScreenSlot size="icon" instance="staff-fichaje">
                    <StaffFichajeIcon
                        status={status}
                        clockLoading={clockLoading}
                        actionLoading={actionLoading}
                        todayLog={todayLog}
                        onClockIn={() => openConfirmation()}
                        onClockOut={() => openConfirmation('out')}
                    />
                </HomeScreenSlot>

                <HomeScreenSlot size="icon" instance="staff-albaranes">
                    <DashboardShortcut instance="staff-albaranes" label="Albaranes" img="/icons/scan.png" onClick={() => router.push('/dashboard/albaranes')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-recetas">
                    <DashboardShortcut instance="staff-recetas" label="Recetas" img="/icons/recipes.png" onClick={() => router.push('/recipes?view=staff')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-pedidos">
                    <DashboardShortcut
                        instance="staff-pedidos"
                        label="Pedidos"
                        img="/icons/shipment.png"
                        onClick={() => {
                            trackStaffShortcut('Pedidos');
                            setIsSupplierModalOpen(true);
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-cambio">
                    <DashboardShortcut instance="staff-cambio" label="Cambio" img="/icons/change.png" onClick={() => setIsCashChangeModalOpen(true)} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-propinas">
                    <DashboardShortcut
                        instance="staff-propinas"
                        label="Propinas"
                        img="/icons/tip.png"
                        onClick={() => {
                            trackStaffShortcut('Propinas');
                            router.push('/staff/propinas');
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-compra">
                    <DashboardShortcut instance="staff-compra" label="Compra" img="/icons/shop.png" onClick={handleOpenCompra} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-carta">
                    <DashboardShortcut
                        instance="staff-carta"
                        label="Carta"
                        img="/icons/menu.png"
                        onClick={() => {
                            trackStaffShortcut('Carta');
                            router.push('/staff/carta');
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-reservas">
                    <DashboardShortcut
                        instance="staff-reservas"
                        label="Reservas"
                        img="/icons/reservas.png"
                        onClick={() => {
                            trackStaffShortcut('Reservas');
                            router.push('/staff/reservas');
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-cierre">
                    <DashboardShortcut
                        instance="staff-cierre"
                        label="Cierre"
                        img="/icons/lock.png"
                        onClick={() => {
                            trackStaffShortcut('Cierre');
                            setIsClosingModalOpen(true);
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-proveedores">
                    <DashboardShortcut
                        instance="staff-proveedores"
                        label="Proveedores"
                        img="/icons/suplier.png"
                        onClick={() => {
                            trackStaffShortcut('Proveedores');
                            router.push('/suppliers');
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-inventario">
                    <DashboardShortcut
                        instance="staff-inventario"
                        label="Inventario"
                        img="/icons/inventory.png"
                        onClick={() => {
                            trackStaffShortcut('Inventario');
                            router.push('/dashboard/inventory');
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-info">
                    <DashboardShortcut instance="staff-info" label="Info" img="/icons/information.png" onClick={() => setActiveMenu('info')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-web">
                    <DashboardShortcut
                        instance="staff-web"
                        label="Web"
                        img="/icons/web.png"
                        onClick={() => {
                            trackStaffShortcut('Web');
                            window.open(STAFF_WEB_HREF, '_blank', 'noopener,noreferrer');
                        }}
                    />
                </HomeScreenSlot>
            </HomeScreen>

            {fichajeOverlay === 'consumption' ? (
                <ConsumptionModal
                    onCancel={() => setFichajeOverlay('none')}
                    onConfirm={async () => {
                        setFichajeOverlay('none');
                        await handleClockAction('out');
                    }}
                />
            ) : (
                <ConfirmModal
                    open={fichajeOverlay === 'confirm'}
                    onClose={() => setFichajeOverlay('none')}
                    title="Confirmar fichaje"
                    confirmLabel="Confirmar"
                    cancelLabel="Cancelar"
                    confirmVariant={modalAction === 'out' ? 'destructive' : 'primary'}
                    instance="staff-clock-confirm"
                    usageLabel="Confirmar fichaje"
                    scheme="dark"
                    layer="base"
                    hideHeader
                    hideCloseButton
                    buttonsStretch
                    confirming={actionLoading && modalAction === 'in'}
                    onConfirm={handleClockModalConfirm}
                />
            )}

            {showGiffOverlay && (
                <div
                    role="dialog"
                    aria-label="Fichaje registrado"
                    className={cn(
                        "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none transition-opacity ease-out",
                        giffOverlayFading ? "opacity-0 duration-[900ms]" : "opacity-100 duration-300",
                    )}
                >
                    {/* Mismo tamaño que el círculo antiguo; esquinas redondeadas en lugar de círculo. */}
                    <div
                        className={cn(
                            "w-[min(90vw,90vh)] h-[min(90vw,90vh)] rounded-2xl overflow-hidden flex items-center justify-center shadow-sm transition-[filter,transform] ease-out",
                            giffOverlayFading ? "blur-md scale-[1.02] duration-[900ms]" : "blur-0 scale-100 duration-300",
                        )}
                    >
                        <video
                            key={giffOverlaySrc}
                            src={giffOverlaySrc}
                            autoPlay
                            muted
                            playsInline
                            loop={false}
                            className="w-full h-full object-cover"
                            onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                if (!Number.isFinite(v.duration) || v.duration <= 0) return;
                                if (v.duration - v.currentTime > GIFF_FADE_MS / 1000) return;
                                beginGiffOverlayFadeOut();
                            }}
                            onEnded={() => beginGiffOverlayFadeOut()}
                            onError={() => {
                                clearGiffFadeTimer();
                                giffFadingRef.current = false;
                                setGiffOverlayFading(false);
                                setShowGiffOverlay(false);
                            }}
                        />
                    </div>
                </div>
            )}

            <Modal
                open={!!activeMenu}
                onClose={closeMenus}
                variant="standard"
                layer="base"
                instance="staff-info"
                title={infoSubMenu === 'contactos' ? 'Contactos' : 'Información'}
                headerTone="petroleum"
                scheme="dark"
                onBack={infoSubMenu ? () => setInfoSubMenu(null) : undefined}
            >
                <div className="space-y-2">
                    {!infoSubMenu && (
                        <AccessMenuGrid>
                            {STAFF_INFO_MENU.map((item) => (
                                <CatalogTile
                                    key={item.title}
                                    title={item.title}
                                    imageSrc={item.imageSrc}
                                    onClick={() => {
                                        if (item.kind === 'contactos') {
                                            trackStaffInfoMenu(item.title);
                                            setInfoSubMenu('contactos');
                                            return;
                                        }
                                        trackStaffInfoMenu(item.title);
                                        setInfoSubMenu(null);
                                        setActiveMenu(null);
                                        setIsManualsModalOpen(true);
                                    }}
                                />
                            ))}
                        </AccessMenuGrid>
                    )}
                    {infoSubMenu === 'contactos' && (
                        <div className="max-h-[60vh] overflow-y-auto pr-1 divide-y divide-gray-100">
                            {CONTACTS_DATA.map((c, idx) => (
                                <div key={idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-800 truncate">{c.name}</p>
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <a href={`tel:${cleanPhone(c.phone)}`} className="text-emerald-500 hover:text-emerald-600 transition-colors p-1 active:scale-95"><Phone size={22} /></a>
                                        <a href={`https://wa.me/${cleanPhone(c.phone).replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="transition-all hover:scale-110 active:scale-95">
                                            <Image src="/icons/whatsapp.png" alt="WhatsApp" width={28} height={28} className="object-contain" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                open={isManualsModalOpen}
                onClose={closeManualsModal}
                variant="standard"
                layer="base"
                instance="staff-manuales"
                title="Manuales"
                headerTone="petroleum"
                scheme="dark"
                onBack={backToInfoFromManuals}
            >
                <AccessMenuGrid>
                    {STAFF_MANUAL_MENU.map((item) => (
                        <CatalogTile
                            key={item.id}
                            title={item.label}
                            imageSrc={item.icon}
                            onClick={() => handleStaffManualItem(item.id)}
                        />
                    ))}
                </AccessMenuGrid>
            </Modal>

            <Modal
                open={isManualsModalOpen && isTpvManualModalOpen}
                onClose={closeTpvManualModal}
                variant="standard"
                layer="derived"
                instance="staff-manual-tpv"
                parentInstance="staff-manuales"
                title="TPV"
                headerTone="petroleum"
                scheme="dark"
            >
                <AccessMenuGrid>
                    {STAFF_TPV_MANUAL_ITEMS.map((label) => (
                        <CatalogTile
                            key={label}
                            title={label}
                            imageSrc={STAFF_TPV_MANUAL_ICONS[label]}
                            onClick={() => {
                                const v = STAFF_TPV_MANUAL_VIDEOS[label];
                                if (!v) {
                                    toast.info('Destino pendiente de configurar', { description: label });
                                    return;
                                }
                                setIsTpvManualModalOpen(false);
                                setIsHornoManualModalOpen(false);
                                setManualMediaViewer({ type: 'video', src: v.src, title: v.title });
                            }}
                        />
                    ))}
                </AccessMenuGrid>
            </Modal>

            <Modal
                open={isManualsModalOpen && isHornoManualModalOpen}
                onClose={closeHornoManualModal}
                variant="standard"
                layer="derived"
                instance="staff-manual-horno"
                parentInstance="staff-manuales"
                title="Horno"
                headerTone="petroleum"
                scheme="dark"
            >
                <AccessMenuGrid>
                    {STAFF_HORNO_MANUAL_ITEMS.map((item) => (
                        <CatalogTile
                            key={item.id}
                            title={item.label}
                            imageSrc={item.icon}
                            onClick={() => {
                                if (item.id === 'limpieza') {
                                    openStaffPdf(STAFF_MANUAL_ASSETS.hornoLimpiezaPdf);
                                    return;
                                }
                                setIsHornoManualModalOpen(false);
                                setIsTpvManualModalOpen(false);
                                setManualMediaViewer({
                                    type: 'video',
                                    src: STAFF_MANUAL_ASSETS.hornoFuncionamientoVideo,
                                    title: 'Funcionamiento Horno',
                                });
                            }}
                        />
                    ))}
                </AccessMenuGrid>
            </Modal>

            <Modal
                open={!!manualMediaViewer}
                onClose={() => setManualMediaViewer(null)}
                variant="amplify"
                layer="derived"
                instance="staff-manual-media"
                parentInstance="staff-manuales"
                title={manualMediaViewer?.title ?? ''}
                headerTone="petroleum"
                wrapperClassName="max-w-3xl"
            >
                <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50">
                    {manualMediaViewer?.type === 'video' ? (
                        <video
                            src={manualMediaViewer.src}
                            controls
                            playsInline
                            className="mx-auto w-full max-h-[75vh] rounded-xl bg-black"
                        >
                            Tu navegador no reproduce vídeo embebido.
                        </video>
                    ) : manualMediaViewer ? (
                        <div className="flex justify-center">
                            <Image
                                src={manualMediaViewer.src}
                                alt={manualMediaViewer.title}
                                width={1200}
                                height={1600}
                                className="h-auto max-h-[75vh] w-auto max-w-full object-contain"
                            />
                        </div>
                    ) : null}
                </div>
            </Modal>

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={closeScheduleModal}
                shifts={monthShifts}
                userName={userName}
                userRole={userRole}
                userId={userId}
                initialFocusDate={scheduleFocusDate}
            />

            <Modal
                open={showPurchaseMultiSourceModal}
                onClose={() => { setShowPurchaseMultiSourceModal(false); setPurchaseInventoriesByBoxId({}); }}
                variant="amplify"
                layer="base"
                instance="staff-purchase-multi-source"
                usageId="staff-purchase-multi-source"
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

            <Modal
                open={cashModalMode === 'out' && !showPurchaseMultiSourceModal}
                onClose={() => setCashModalMode('none')}
                variant="amplify"
                layer="base"
                instance="staff-treasury-out"
                usageId="staff-treasury-out"
                usageLabel="Salida de caja"
                title="Compra"
                subtitle={selectedBox?.name || 'Caja'}
                headerTone="petroleum"
                headerTrailing={<CashCountDateButton value={cashOpDate} onChange={setCashOpDate} />}
                footer={
                    <CashCountFooter
                        total={cashCountTotal}
                        instancePrefix="staff-treasury-out"
                        onCancel={() => setCashModalMode('none')}
                        saveType="submit"
                        saveForm={CASH_COUNT_FORM_ID}
                    />
                }
            >
                <CashDenominationForm
                    key={'out' + (selectedBox?.id || '')}
                    variant="embedded"
                    type={'out'}
                    boxName={selectedBox?.name || 'Caja Inicial'}
                    boxId={selectedBox?.id}
                    initialCounts={{}}
                    availableStock={boxInventoryMap}
                    onCancel={() => setCashModalMode('none')}
                    onSubmit={handleCashTransaction}
                    forcePurchaseMode={true}
                    onTotalChange={setCashCountTotal}
                    selectedDate={cashOpDate}
                    onSelectedDateChange={setCashOpDate}
                />
            </Modal>

            {/* (deduplicado) */}

            <CashClosingModal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                onSuccess={() => initialize()}
                initialTotalSales={liveTickets.total}
                initialTicketsCount={liveTickets.count}
            />

            <SupplierSelectionModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
            />

            <AttendanceDetailModal
                isOpen={isDayDetailModalOpen}
                date={selectedDayDate}
                userId={userId}
                userRole={userRole}
                onClose={() => setIsDayDetailModalOpen(false)}
                onSuccess={() => initialize()}
            />
            {isCashChangeModalOpen && (
                <CashChangeModal
                    boxOptions={buildPaymentSources()}
                    isManager={userRole === 'supervisor' || userRole === 'manager'}
                    onClose={() => setIsCashChangeModalOpen(false)}
                    onSuccess={() => {
                        setIsCashChangeModalOpen(false);
                        initialize();
                    }}
                />
            )}
        </div>
    );
}
