'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Play, Square, CalendarDays,
    Calendar, ArrowRight, Play as PlayIcon, ArrowLeft,
    Check, Info, Package,
    Phone, Scale, ShoppingCart, Boxes, X, MessageCircle,
    ChefHat, Calculator, ArrowRightLeft, Save, ArrowDown, ArrowUp,
    Plus, Minus, BookOpen, CalendarCheck
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { StaffProductModal } from '@/components/modals/StaffProductModal';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';
import { toast } from 'sonner';
import Link from 'next/link';
import { differenceInMinutes, startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { formatYmdInMadrid, madridDayUtcRangeIso, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import { es } from 'date-fns/locale';
import { cn, calculateRoundedHours } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';
import { FICHAJE_OVERLAY_VIDEOS } from '@/lib/fichaje-overlay-videos';
import WorkTimer from '@/components/ui/WorkTimer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { ConsumptionModal } from '@/app/staff/ConsumptionModal';
import { STAFF_MANUAL_ASSETS, STAFF_MANUAL_MENU, STAFF_TPV_MANUAL_ITEMS, STAFF_TPV_MANUAL_VIDEOS, type StaffManualMenuId } from '@/lib/staff-manuals';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { liquidateWeekForCard, loadEmployeeBoundaryFacts, resolveOpeningCarryIn, employeeTimelineStartWeek, isPaidLookupFromRows, bagModeOverrideLookupFromRows } from '@/lib/hours-engine';

const CONTACTS_DATA = [
    { name: 'Hielo Fenix', phone: '(3461) 028-8888' },
    { name: 'Servei Tècnic Cafetera', phone: '(3493) 293-6749' },
    { name: "Recollida d'Oli", phone: '(3493) 673-1722' },
    { name: 'Recepció Cem Marbella', phone: '(3493) 221-0676' },
    { name: 'Ramón', phone: '(3466) 023-1748' },
    { name: 'Héctor', phone: '(3464) 722-9309' },
];

type WorkStatus = 'idle' | 'working' | 'finished';

interface DailyLog {
    date: Date; dayName: string; dayNumber: number; hasLog: boolean; clockIn: string; clockOut: string; totalHours: number; extraHours: number; isToday: boolean; eventType?: string; clock_out_show_no_registrada?: boolean;
}

interface WeeklySummary {
    totalHours: number;
    hoursDifference: number;
    currentBalance: number;
    estimatedPayout: number;
    status: 'paid' | 'pending';
    startBalance: number;
}

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

const roundHoursValue = (hours: number): number => {
    const minutes = Math.round(hours * 60);
    return applyRoundingRule(minutes);
};

export default function StaffDashboardView() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('staff');
    const [userEmail, setUserEmail] = useState<string>('');
    const [status, setStatus] = useState<WorkStatus>('idle');
    const [todayLog, setTodayLog] = useState<any>(null);

    const [weekDays, setWeekDays] = useState<DailyLog[]>([]);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>({
        totalHours: 0, hoursDifference: 0, currentBalance: 0, estimatedPayout: 0, status: 'pending', startBalance: 0
    });
    const [monthShifts, setMonthShifts] = useState<ShiftMock[]>([]);
    const [nextShifts, setNextShifts] = useState<ShiftMock[]>([]);
    const [currentMonthName, setCurrentMonthName] = useState('');
    const [weekNumber, setWeekNumber] = useState<number | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [modalAction, setModalAction] = useState<'in' | 'out' | null>(null);
    const [showGiffOverlay, setShowGiffOverlay] = useState(false);
    const [giffOverlaySrc, setGiffOverlaySrc] = useState<string>('/icons/giff.mp4');
    const [showConsumptionModal, setShowConsumptionModal] = useState(false);
    const [activeMenu, setActiveMenu] = useState<'info' | 'pedidos' | null>(null);
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | 'web' | null>(null);
    const [isManualsModalOpen, setIsManualsModalOpen] = useState(false);
    const [isTpvManualModalOpen, setIsTpvManualModalOpen] = useState(false);
    const [isHornoManualModalOpen, setIsHornoManualModalOpen] = useState(false);
    const [manualMediaViewer, setManualMediaViewer] = useState<ManualMediaViewerState>(null);
    const [preferStock, setPreferStock] = useState(false);
    const [changeBox, setChangeBox] = useState<any>(null);
    const [changeBoxInventoryMap, setChangeBoxInventoryMap] = useState<Record<number, number>>({});
    const [liveTickets, setLiveTickets] = useState({ total: 0, count: 0 });
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
    const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [scheduleFocusDate, setScheduleFocusDate] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const [userName, setUserName] = useState("");

    // NUEVOS ESTADOS PARA CAJA INICIAL ("COMPRA")
    const [operationalBox, setOperationalBox] = useState<any>(null);
    const [allBoxes, setAllBoxes] = useState<any[]>([]);
    const [isCashOptionsModalOpen, setIsCashOptionsModalOpen] = useState(false);
    const [isCashChangeModalOpen, setIsCashChangeModalOpen] = useState(false);
    const [cashOptionsCalculatorOpen, setCashOptionsCalculatorOpen] = useState(false);
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'out'>('none');
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});

    useModalUsageTracking({
        open: showModal,
        usageId: 'staff-clock-confirm',
        usageLabel: modalAction === 'in' ? 'Confirmar entrada' : 'Confirmar salida',
    });
    useModalUsageTracking({
        open: Boolean(activeMenu),
        usageId: `staff-info-menu-${infoSubMenu ?? activeMenu ?? 'root'}`,
        usageLabel:
            infoSubMenu === 'contactos' ? 'Contactos'
            : infoSubMenu === 'web' ? 'Página web'
            : activeMenu === 'pedidos' ? 'Pedidos'
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
    useModalUsageTracking({
        open: isCashOptionsModalOpen,
        usageId: 'staff-cash-options',
        usageLabel: 'Opciones de caja',
    });
    useModalUsageTracking({
        open: showPurchaseMultiSourceModal,
        usageId: 'staff-purchase-multi-source',
        usageLabel: 'Compra multiorigen',
    });
    useModalUsageTracking({
        open: cashModalMode !== 'none',
        usageId: 'staff-treasury-out',
        usageLabel: 'Salida de caja',
    });

    const trackStaffClockConfirm = useTrackModalApply('staff-clock-confirm', 'Confirmar fichaje');
    const trackStaffCashOption = useTrackModalApply('staff-cash-options', 'Opciones de caja');
    const trackStaffPurchaseMulti = useTrackModalApply('staff-purchase-multi-source', 'Compra multiorigen');
    const trackStaffInfoMenu = useTrackModalApply('staff-info-menu', 'Menú información');

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



    /** Horas Marbella: solo enteros o .5 */
    const formatNumber = (val: number) => {
        if (Math.abs(val) < 0.1) return " ";
        const rounded = calculateRoundedHours(Math.abs(val));
        const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
        return val < 0 ? `-${str}` : str;
    };

    const formatWorked = (val: number) => formatNumber(Math.abs(val));
    const formatBalance = (val: number) => formatNumber(val);
    const formatMoney = (val: number) => {
        if (Math.abs(val) < 0.1) return " ";
        return `${val.toFixed(0)}€`;
    };

    const cleanPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.startsWith('34') ? `+${cleaned}` : `+34${cleaned}`;
    };

    async function initialize() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);
            setUserEmail(user.email ?? '');

            let contractHours = 40;
            let isFixedSalary = false;
            let userPreferStock = false;

            const { data: profile } = await supabase.from('profiles')
                .select('first_name, role, contracted_hours_weekly, prefer_stock_hours, is_fixed_salary')
                .eq('id', user.id)
                .single();

            if (profile) {
                setUserRole(profile.role as any);
                setUserName(profile.first_name || "Personal");
                if (profile.contracted_hours_weekly !== null) contractHours = profile.contracted_hours_weekly;
                if (profile.prefer_stock_hours) userPreferStock = profile.prefer_stock_hours;
                if (profile.is_fixed_salary) isFixedSalary = profile.is_fixed_salary;
                setPreferStock(userPreferStock);
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
            } else { setTodayLog(null); setStatus('idle'); }

            const weekStart = startOfWeek(today, { weekStartsOn: 1 });
            const realWeekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

            setCurrentMonthName(weekStart.toLocaleDateString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase()));

            const target = new Date(weekStart.valueOf());
            const dayNr = (weekStart.getDay() + 6) % 7;
            target.setDate(target.getDate() - dayNr + 3);
            const firstThursday = target.valueOf();
            target.setMonth(0, 1);
            if (target.getDay() !== 4) {
                target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
            }
            const wNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
            setWeekNumber(wNum);

            const weekStartYmd = format(weekStart, 'yyyy-MM-dd');
            const weekEndYmd = format(addDays(weekStart, 6), 'yyyy-MM-dd');

            const employeeFacts = await loadEmployeeBoundaryFacts(supabase, user.id);
            const timelineStart = employeeTimelineStartWeek(employeeFacts);
            const logsFromYmd =
                timelineStart && timelineStart < weekStartYmd ? timelineStart : weekStartYmd;
            const { startIso: logsStartIso, endIso: weekEndIso } = madridRangeUtcIso(
                logsFromYmd,
                weekEndYmd,
            );

            const effContract = (profile?.role === 'manager' || isFixedSalary) ? 0 : contractHours;
            const [{ data: gridDays }, snapsRes, logsRes] = await Promise.all([
                supabase.rpc('get_worker_weekly_log_grid', {
                    p_user_id: user.id,
                    p_start_date: weekStartYmd,
                    p_contracted_hours: effContract,
                }),
                supabase
                    .from('weekly_snapshots')
                    .select('week_start, is_paid, prefer_stock_hours_override')
                    .eq('user_id', user.id)
                    .gte('week_start', logsFromYmd)
                    .lte('week_start', weekStartYmd),
                supabase
                    .from('time_logs')
                    .select('clock_in, clock_out, total_hours, event_type, clock_out_show_no_registrada')
                    .eq('user_id', user.id)
                    .gte('clock_in', logsStartIso)
                    .lte('clock_in', weekEndIso),
            ]);

            if (logsRes.error) {
                console.error('Error fetching time_logs for carry:', logsRes.error);
            }
            if (snapsRes.error) {
                console.error('Error fetching weekly_snapshots for carry:', snapsRes.error);
            }

            const engineLogs = (logsRes.data ?? []).map((l) => ({
                clockInIso: l.clock_in,
                clockOutIso: l.clock_out,
                totalHours: l.total_hours,
            }));

            const isPaidByWeek = isPaidLookupFromRows(snapsRes.data ?? []);
            const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapsRes.data ?? []);
            const isPaid = isPaidByWeek(weekStartYmd);
            const bagModeOverride = bagModeOverrideByWeek(weekStartYmd);
            const carryIn = resolveOpeningCarryIn({
                employee: employeeFacts,
                chainStart: weekStartYmd,
                logs: engineLogs,
                isPaidByWeek,
                bagModeOverrideByWeek,
            });

            // Misma liquidación que historial: PENDIENTES = carryIn; EXTRAS/IMPORTE desde el motor.
            const { extrasByDay, summary } = liquidateWeekForCard({
                employee: employeeFacts,
                weekStart: weekStartYmd,
                logs: engineLogs,
                isPaid,
                carryIn,
                bagModeOverride,
            });

            const daysStructure: DailyLog[] = (gridDays || []).map((day: any, i: number) => {
                const d = realWeekDays[i];
                const dayYmd = format(d, 'yyyy-MM-dd');
                const dayLog = logsRes.data?.find((l) => formatYmdInMadrid(l.clock_in) === dayYmd);
                return {
                    ...day,
                    date: d,
                    dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i] || '',
                    dayNumber: parseInt(format(d, 'd'), 10),
                    isToday: isSameDay(d, today),
                    extraHours: extrasByDay[dayYmd] ?? 0,
                    eventType: dayLog?.event_type || day.eventType || day.event_type || 'regular',
                    clock_out_show_no_registrada: dayLog?.clock_out_show_no_registrada === true,
                };
            });
            setWeekDays(daysStructure);

            // Manager / fijo: presentación de HORAS (no altera carryIn del motor).
            let displayHours = summary.totalHours;
            if (profile?.role === 'manager' || isFixedSalary) {
                if (summary.totalHours === 0) {
                    displayHours = contractHours;
                } else {
                    displayHours = contractHours + summary.totalHours;
                }
            }

            setWeeklySummary({
                totalHours: displayHours,
                hoursDifference: summary.weeklyBalance,
                currentBalance: summary.weeklyBalance,
                estimatedPayout: summary.estimatedValue,
                status: 'pending',
                startBalance: summary.startBalance,
            });
            setPreferStock(summary.preferStock);

            // Cargar cajas de forma más robusta (Consolidación de Tesorería)
            const { data: allBoxes, error: boxError } = await supabase.from('cash_boxes').select('*').order('name');
            console.log("Initialize Boxes Data:", allBoxes);
            if (boxError) console.error("Initialize Boxes Error:", boxError);

            if (allBoxes && allBoxes.length > 0) {
                setAllBoxes(allBoxes);
                const cBox = allBoxes.find(b => b.type === 'change') || allBoxes[0];
                const oBox = allBoxes.find(b => b.type === 'operational') || allBoxes[0];
                setChangeBox(cBox);
                setOperationalBox(oBox);
            } else {
                console.warn("No cash boxes found or accessible via RLS for this user.");
            }

            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const { data: realShifts } = await supabase
                .from('shifts')
                .select('start_time, end_time, activity, activity_2')
                .eq('user_id', user.id)
                .eq('is_published', true)
                .gte('start_time', startOfMonth.toISOString())
                .order('start_time', { ascending: true });

            if (realShifts && realShifts.length > 0) {
                const formattedShifts: ShiftMock[] = realShifts.map(s => {
                    const start = new Date(s.start_time);
                    const end = new Date(s.end_time);
                    return {
                        date: start,
                        startTime: start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                        endTime: end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                        activity: s.activity || s.activity_2 || undefined
                    };
                });
                setMonthShifts(formattedShifts);
                const todayStart = new Date(today);
                todayStart.setHours(0, 0, 0, 0);
                setNextShifts(formattedShifts.filter(s => s.date >= todayStart).slice(0, 2));
            } else {
                setMonthShifts([]);
                setNextShifts([]);
            }

            // --- FETCH LIVE TICKETS FOR CLOSING (día negocio TPV `fecha`) ---
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

        } catch (error) { console.error(error); }
        finally { setLoading(false); }
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
        setShowModal(false);
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

            if (action === 'in') {
                const { data } = await supabase.from('time_logs')
                    .insert({
                        user_id: userId,
                        clock_in: now.toISOString(),
                        is_manual_entry: false,
                        ...logCoords
                    })
                    .select()
                    .single();
                setTodayLog(data); setStatus('working'); toast.success("¡Jornada iniciada!");
                const { data: { user: u } } = await supabase.auth.getUser();
                const email = u?.email?.toLowerCase().trim() ?? '';
                const overlayConfig = FICHAJE_OVERLAY_VIDEOS[email];
                if (overlayConfig) {
                    setGiffOverlaySrc(overlayConfig.entrada);
                    setShowGiffOverlay(true);
                }
            } else if (action === 'out' && todayLog) {
                const clockIn = new Date(todayLog.clock_in);
                const diffMinutes = differenceInMinutes(now, clockIn);
                const roundedHours = applyRoundingRule(diffMinutes);
                const { data } = await supabase.from('time_logs')
                    .update({
                        clock_out: now.toISOString(),
                        total_hours: roundedHours,
                        ...logCoords
                    })
                    .eq('id', todayLog.id)
                    .select()
                    .single();

                setTodayLog(data); setStatus('finished'); toast.success("Jornada finalizada.");
                const { data: { user: u } } = await supabase.auth.getUser();
                const email = u?.email?.toLowerCase().trim() ?? '';
                const overlayConfig = FICHAJE_OVERLAY_VIDEOS[email];
                if (overlayConfig) {
                    setGiffOverlaySrc(overlayConfig.salida);
                    setShowGiffOverlay(true);
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

    const openConfirmation = () => {
        if (status !== 'finished' && !actionLoading) {
            setModalAction(status === 'idle' ? 'in' : 'out');
            setShowModal(true);
        }
    };

    const IOSIconBoxed = ({ icon: Icon, img, color, label, onClick }: { icon?: any, img?: string, color: string, label: string | React.ReactNode, onClick?: () => void }) => (
        <button
            onClick={onClick}
            className="bg-white rounded-2xl p-2 md:p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1.5 md:gap-2 active:scale-95 transition-all group aspect-square w-full h-full min-h-0"
        >
            <div className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0">
                {img ? (
                    <Image
                        src={img}
                        alt={typeof label === 'string' ? label : 'Icon'}
                        width={48}
                        height={48}
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className={cn("w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white shadow-sm", color)}>
                        <Icon size={28} fill="currentColor" strokeWidth={2.5} className="w-6 h-6 md:w-8 md:h-8" />
                    </div>
                )}
            </div>
            <span className="text-[9px] md:text-[11px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 shrink-0">{label}</span>
        </button>
    );

    const closeMenus = () => { setActiveMenu(null); setInfoSubMenu(null); setIsProductModalOpen(false); };
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

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    return (
        <div className="pt-3 md:pt-3 animate-in fade-in duration-500 pb-8">
            <div className="px-4 md:px-0 w-full max-w-lg md:max-w-2xl mx-auto space-y-3 md:space-y-4">
                <div className="flex flex-col gap-4 md:gap-4 items-center">
                    <div className="w-full space-y-3 md:space-y-4">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                            {/* Header Estrecho - Estilo Vista Marbella Detail */}
                            <div className="bg-[#36606F] px-4 py-1.5 md:py-1 flex justify-between items-center text-white shrink-0">
                                <div className="flex items-center">
                                    <span className="text-[10px] md:text-sm font-black uppercase tracking-widest leading-none text-white">
                                        {currentMonthName} {weekNumber ? `- SEMANA ${weekNumber}` : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <Link href="/staff/history" className="text-[10px] font-black flex items-center gap-1 hover:text-white/80 transition-colors uppercase tracking-widest">
                                        Historial <ArrowRight size={10} strokeWidth={3} />
                                    </Link>
                                </div>
                            </div>

                            <div className="p-4">

                                <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                                    <div className="grid grid-cols-7">
                                        {weekDays.map((day, i) => (
                                            <div key={i} className="flex flex-col border-r border-gray-100 last:border-r-0 min-h-[108px] bg-white relative">
                                                <div className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center relative z-10">
                                                    <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                                </div>
                                                <div
                                                    className="flex-1 p-1 flex flex-col items-stretch relative z-0 bg-white cursor-pointer hover:bg-blue-50/50 transition-colors"
                                                    onClick={() => {
                                                        setSelectedDayDate(day.date);
                                                        setIsDayDetailModalOpen(true);
                                                    }}
                                                >
                                                    <span className={`absolute top-1 right-1 text-[9px] font-bold ${day.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.dayNumber}</span>
                                                    {/* Filas de altura fija para alinear círculos verde/rojo entre todos los días */}
                                                    <div className="flex-1 flex flex-col justify-center w-full pb-1 mt-4 min-h-[52px]">
                                                        {day.eventType && day.eventType !== 'regular' && day.eventType !== 'no_registered' ? (
                                                            <>
                                                                <div className="h-5 flex items-center justify-center shrink-0">
                                                                    <div className={cn(
                                                                        "w-5 h-5 rounded-full shadow-sm flex items-center justify-center leading-none",
                                                                        day.eventType === 'holiday' ? 'bg-red-500 text-white' :
                                                                            day.eventType === 'weekend' ? 'bg-yellow-400 text-white' :
                                                                                day.eventType === 'adjustment' ? 'bg-orange-500 text-white' :
                                                                                    day.eventType === 'personal' ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'
                                                                    )}>
                                                                        <span className="text-[9px] font-black">
                                                                            {day.eventType === 'holiday' ? 'F' :
                                                                                day.eventType === 'weekend' ? 'E' :
                                                                                    day.eventType === 'adjustment' ? 'B' :
                                                                                        day.eventType === 'personal' ? 'P' : '?'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="h-5 shrink-0" aria-hidden />
                                                            </>
                                                        ) : (
                                                            <>
                                                                {/* Fila entrada: misma altura en todos los días para alinear círculos verdes */}
                                                                <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                                                    {day.hasLog ? (
                                                                        <>
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                                        </>
                                                                    ) : <span className="text-[9px] text-transparent select-none">0</span>}
                                                                </div>
                                                                {/* Fila salida: misma altura en todos los días para alinear círculos rojos */}
                                                                <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                                                    {day.eventType === 'no_registered' ? (
                                                                        <X size={14} strokeWidth={2.5} className="text-red-600 shrink-0" />
                                                                    ) : day.hasLog && day.clockOut ? (
                                                                        day.clock_out_show_no_registrada ? (
                                                                            <span title="Salida no registrada (olvidó fichar)" className="inline-flex items-center justify-center">
                                                                                <X size={14} strokeWidth={2.5} className="text-red-600 shrink-0" />
                                                                            </span>
                                                                        ) : (
                                                                            <>
                                                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                                                                <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                            </>
                                                                        )
                                                                    ) : (day.hasLog && !day.clockOut ? <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" /> : <span className="text-[9px] text-transparent select-none">0</span>)}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="w-full space-y-0 pt-0.5 min-h-[26px]">
                                                        {day.hasLog && day.totalHours > 0 ? (
                                                            <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                <span className="ml-0.5">H</span>
                                                                <span className="font-bold text-gray-800 pr-1">{formatWorked(day.totalHours)}</span>
                                                            </div>
                                                        ) : <div className="h-3" />}
                                                        {day.extraHours > 0 ? (
                                                            <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                <span className="ml-0.5">Ex</span>
                                                                <span className="font-bold text-gray-800 pr-1">{formatWorked(day.extraHours)}</span>
                                                            </div>
                                                        ) : <div className="h-3" />}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-2 md:p-3 flex items-center justify-between gap-1 md:gap-2 overflow-x-auto no-scrollbar">
                                    <div className="flex flex-col items-center flex-1">
                                        <div className="h-4 md:h-5 flex items-center">
                                            <span className="font-black text-black text-[11px] md:text-sm leading-none">{formatWorked(weeklySummary.totalHours)}</span>
                                        </div>
                                        <span className="text-[7px] md:text-[10px] font-bold text-gray-400 uppercase leading-none mt-1">Horas</span>
                                    </div>

                                    <div className="flex flex-col items-center flex-1">
                                        <div className="h-4 md:h-5 flex items-center">
                                            {(() => {
                                                const pending = weeklySummary.startBalance ?? 0;
                                                const show = Math.abs(pending) > 0.05;
                                                const color = !show
                                                    ? 'text-transparent'
                                                    : pending >= 0
                                                      ? 'text-emerald-600'
                                                      : 'text-red-600';
                                                return (
                                                    <span className={cn('font-black text-[11px] md:text-sm leading-none', color)}>
                                                        {show ? formatWorked(pending) : '\u00a0'}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <span className="text-[7px] md:text-[10px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                    </div>
                                    <div className="flex flex-col items-center flex-1">
                                        <div className="h-4 md:h-5 flex items-center">
                                            <span className={`font-black text-[11px] md:text-sm leading-none text-black`}>
                                                {(weeklySummary.currentBalance ?? 0) > 0.05
                                                    ? formatWorked(weeklySummary.currentBalance)
                                                    : '\u00a0'}
                                            </span>
                                        </div>
                                        <span className="text-[7px] md:text-[10px] font-bold text-gray-400 uppercase leading-none mt-1 text-center whitespace-nowrap">EXTRAS</span>
                                    </div>
                                    <div className="flex flex-col items-center flex-1">
                                        <div className="h-4 md:h-5 flex items-center">
                                            <span className="font-black text-[11px] md:text-sm leading-none text-emerald-600">
                                                {formatMoney(weeklySummary.estimatedPayout)}
                                            </span>
                                        </div>
                                        <span className="text-[7px] md:text-[10px] font-bold text-gray-400 uppercase leading-none mt-1 text-center">Importe</span>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    <div className="w-full bg-white rounded-2xl p-4 md:p-3 shadow-xl flex flex-col items-center text-center relative gap-3 md:gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (status === 'working') {
                                    setShowConsumptionModal(true);
                                } else {
                                    openConfirmation();
                                }
                            }}
                            disabled={status === 'finished' || actionLoading}
                            className={cn(
                                "w-full h-16 md:h-8 rounded-2xl md:rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 duration-150",
                                status === 'idle' && "bg-emerald-500 hover:bg-emerald-600 text-white",
                                status === 'working' && "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200",
                                status === 'finished' && "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-100"
                            )}>
                            {actionLoading ? (
                                <>
                                    <LoadingSpinner size="sm" className="text-white" />
                                    <span className="text-xl md:text-sm font-black uppercase tracking-wider">
                                        {modalAction === 'in' ? 'Iniciando...' : 'Cerrando...'}
                                    </span>
                                </>
                            ) : (
                                <span className="text-xl md:text-sm font-black uppercase tracking-wider">
                                    {status === 'idle' ? 'ENTRADA' : (status === 'working' ? 'SALIDA' : 'FINALIZADO')}
                                </span>
                            )}
                        </button>
                        <div className="w-full">
                            <WorkTimer clockIn={todayLog?.clock_in || null} status={status} totalHours={todayLog?.total_hours} />
                        </div>
                    </div>

                    <div className="w-full grid grid-cols-2 gap-3 md:gap-4">
                        {/* MINI CALENDAR HORARIOS CARD — scaled */}
                        <div
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden aspect-square cursor-pointer hover:shadow-2xl transition-all active:scale-[0.98]"
                        >
                            {/* Header compacto */}
                            <div className="bg-purple-600 px-4 py-1.5 md:py-2 flex items-center justify-between text-white shrink-0">
                                <h3 className="font-black flex items-center gap-1 text-[10px] md:text-sm uppercase tracking-wider">
                                    <CalendarDays size={12} className="text-white/80 shrink-0 md:w-4 md:h-4" fill="currentColor" />
                                    <span>Horarios</span>
                                </h3>
                                <div className="bg-white/20 rounded px-1 py-px text-[6px] md:text-[7px] font-black">VER</div>
                            </div>

                            <div className="flex-1 flex flex-col justify-between px-2 py-1.5 md:py-3 md:px-3 min-h-0">
                                <div>
                                    <div className="grid grid-cols-7 mb-1 md:mb-1.5">
                                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                            <div key={d} className="text-center text-[6px] md:text-[9px] font-black text-gray-300 leading-none">{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7">
                                        {Array.from({ length: (new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() + 6) % 7 }).map((_, i) => (
                                            <div key={`e-${i}`} />
                                        ))}
                                        {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }).map((_, i) => {
                                            const d = i + 1;
                                            const day = new Date(new Date().getFullYear(), new Date().getMonth(), d);
                                            const today = new Date(); today.setHours(0, 0, 0, 0);
                                            const isToday = d === new Date().getDate() && day.getMonth() === today.getMonth();
                                            const hasShift = monthShifts.some(s => s.date.getDate() === d && s.date.getMonth() === new Date().getMonth());

                                            return (
                                                <div key={d} className="flex items-center justify-center py-[1px] md:py-0.5">
                                                    <span className={`
                                                            w-3.5 h-3.5 md:w-5 md:h-5 flex items-center justify-center rounded-full text-[7px] md:text-[9px] leading-none transition-colors
                                                            ${hasShift ? 'bg-emerald-500 text-white font-black' : (isToday ? 'text-blue-600 font-black' : 'text-gray-900')}
                                                        `}>
                                                        {d}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 pt-1 px-1 md:pt-2 md:px-1">
                                    {nextShifts.length === 0 ? (
                                        <p className="text-[7px] md:text-[10px] text-zinc-400 font-black italic text-center">Sin turnos</p>
                                    ) : (
                                        <div className="flex items-center gap-1 overflow-hidden justify-between md:gap-2">
                                            {nextShifts.slice(0, 2).map((shift, idx) => (
                                                <div key={idx} className="flex items-center gap-1 md:gap-1.5 flex-1 min-w-0">
                                                    <div className="flex flex-col items-center bg-purple-50 rounded-lg px-0.5 py-0.5 min-w-[20px] md:min-w-[24px]">
                                                        <span className="text-[5px] md:text-[8px] font-black text-purple-400 uppercase leading-none">{format(shift.date, "MMM", { locale: es })}</span>
                                                        <span className="text-[9px] md:text-xs font-black text-purple-700 leading-none">{shift.date.getDate()}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-0 min-w-0">
                                                        <div className="flex items-center gap-0.5 font-black leading-none text-[7px] md:text-[10px]">
                                                            <span className="text-emerald-600">{shift.startTime}</span>
                                                            <span className="text-rose-500">{shift.endTime}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Iconos Flotantes - Now in a grid beside horarios */}
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <IOSIconBoxed img="/icons/change.png" color="bg-white" label="Caja" onClick={() => setIsCashOptionsModalOpen(true)} />
                            <IOSIconBoxed img="/icons/recipes.png" color="bg-white" label="Recetas" onClick={() => router.push('/recipes?view=staff')} />
                            <IOSIconBoxed img="/icons/information.png" color="bg-white" label="Info" onClick={() => setActiveMenu('info')} />
                            <IOSIconBoxed img="/icons/suppliers.png" color="bg-white" label="Stock" onClick={() => setIsProductModalOpen(true)} />
                        </div>
                    </div>
                </div>
            </div>

            {showConsumptionModal && (
                <ConsumptionModal
                    onCancel={() => setShowConsumptionModal(false)}
                    onConfirm={async () => {
                        setShowConsumptionModal(false);
                        await handleClockAction('out');
                    }}
                />
            )}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-zinc-800 mb-6">{modalAction === 'in' ? 'Iniciar Turno' : 'Finalizar Turno'}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button type="button" onClick={() => setShowModal(false)} className="h-14 px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl active:scale-95 transition-all duration-150">Cancelar</button>
                            <button type="button" onClick={() => void handleClockAction()} className={cn("h-14 px-4 text-white font-bold rounded-xl active:scale-95 transition-all duration-150 shadow-lg", modalAction === 'in' ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200")}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {showGiffOverlay && (
                <div
                    role="dialog"
                    aria-label="Fichaje registrado"
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none"
                >
                    <div className="w-[min(90vw,90vh)] h-[min(90vw,90vh)] rounded-full overflow-hidden flex items-center justify-center">
                        <video
                            key={giffOverlaySrc}
                            src={giffOverlaySrc}
                            autoPlay
                            muted
                            playsInline
                            loop={false}
                            className="w-full h-full object-cover"
                            onEnded={() => setShowGiffOverlay(false)}
                            onError={() => setShowGiffOverlay(false)}
                        />
                    </div>
                </div>
            )}

            {
                activeMenu && (
                    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={closeMenus}>
                        <div className={`bg-white w-full ${infoSubMenu === 'contactos' ? 'max-w-md' : (activeMenu === 'pedidos' ? 'max-w-sm' : 'max-w-sm')} rounded-2xl shadow-2xl relative transition-all max-h-[85vh] flex flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
                            {/* Header Petrol - Estilo Modal Marbella */}
                            <div className="bg-[#36606F] px-6 py-4 flex items-center justify-between text-white shrink-0 relative">
                                <div className="flex items-center gap-3">
                                    {infoSubMenu && (
                                        <button
                                            type="button"
                                            onClick={() => setInfoSubMenu(null)}
                                            aria-label="Volver"
                                            className="flex h-12 w-12 shrink-0 items-center justify-center text-white transition-all hover:opacity-80 active:scale-90 -ml-2"
                                        >
                                            <ArrowLeft size={20} strokeWidth={3} />
                                        </button>
                                    )}
                                    <h3 className="text-[10px] font-black uppercase tracking-widest">
                                        {infoSubMenu === 'contactos'
                                            ? 'Contactos'
                                            : infoSubMenu === 'web'
                                                ? 'Página web'
                                                : 'Información'}
                                    </h3>
                                </div>
                                <button onClick={closeMenus} className="w-8 h-8 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20">
                                    <X size={18} strokeWidth={3} />
                                </button>
                            </div>

                            <div className="p-8 space-y-2 overflow-y-auto">
                                {!infoSubMenu && (
                                    <div className="space-y-1">
                                        <button onClick={() => { trackStaffInfoMenu('Contactos de Interés'); setInfoSubMenu('contactos'); }} className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl">
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/whatsapp.png" alt="Contactos" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Contactos de Interés</span>
                                        </button>

                                        <a
                                            href="https://marbella-web.vercel.app"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl"
                                        >
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image
                                                    src="/icons/web.png"
                                                    alt="Página web"
                                                    width={36}
                                                    height={36}
                                                    className="rounded-xl object-contain transition-transform group-hover:scale-110"
                                                />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Página web</span>
                                        </a>

                                        <Link
                                            href="/staff/reservas"
                                            onClick={() => { trackStaffInfoMenu('Reservas y encargos'); closeMenus(); }}
                                            className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl"
                                        >
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/reservas.png" alt="Reservas y encargos" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Reservas y encargos</span>
                                        </Link>

                                        <Link
                                            href="/staff/carta"
                                            onClick={closeMenus}
                                            className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl"
                                        >
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/menu.png" alt="Carta" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Carta</span>
                                        </Link>

                                        <button
                                            onClick={() => {
                                                trackStaffInfoMenu('Manuales');
                                                setInfoSubMenu(null);
                                                setActiveMenu(null);
                                                setIsManualsModalOpen(true);
                                            }}
                                            className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl"
                                        >
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/guide.png" alt="Manuales" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Manuales</span>
                                        </button>
                                    </div>
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
                        </div>
                    </div>
                )
            }

            {isManualsModalOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-[115] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in"
                    onClick={closeManualsModal}
                >
                    <div
                        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative transition-all max-h-[85vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Manuales"
                    >
                        <div className="bg-[#36606F] px-6 py-4 flex items-center justify-between text-white shrink-0 relative">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={backToInfoFromManuals}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center text-white/90 hover:text-white transition-colors active:scale-90 min-h-[48px] min-w-[48px]"
                                    aria-label="Volver a información"
                                >
                                    <ArrowLeft size={20} strokeWidth={3} />
                                </button>
                                <h3 className="min-w-0 truncate text-[10px] font-black uppercase tracking-widest">Manuales</h3>
                            </div>
                            <button
                                onClick={closeManualsModal}
                                className="w-10 h-10 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20 min-h-[48px] min-w-[48px]"
                                aria-label="Cerrar manuales"
                            >
                                <X size={18} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="p-8 space-y-1 overflow-y-auto">
                            {STAFF_MANUAL_MENU.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleStaffManualItem(item.id)}
                                    className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl"
                                    type="button"
                                >
                                    <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                        <Image
                                            src={item.icon}
                                            alt={item.label}
                                            width={36}
                                            height={36}
                                            className="object-contain transition-transform group-hover:scale-110"
                                        />
                                    </div>
                                    <span className="font-bold text-sm tracking-tight text-left">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isManualsModalOpen && isTpvManualModalOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in"
                    onClick={closeTpvManualModal}
                >
                    <div
                        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative transition-all max-h-[85vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Manual TPV"
                    >
                        <div className="bg-[#36606F] px-6 py-4 flex items-center justify-between text-white shrink-0 relative gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={closeTpvManualModal}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center text-white/90 hover:text-white transition-colors active:scale-90 min-h-[48px] min-w-[48px]"
                                    aria-label="Volver a manuales"
                                >
                                    <ArrowLeft size={20} strokeWidth={3} />
                                </button>
                                <h3 className="min-w-0 truncate text-[10px] font-black uppercase tracking-widest">TPV</h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeTpvManualModal}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white transition-all hover:bg-rose-600 active:scale-90 min-h-[48px] min-w-[48px]"
                                aria-label="Cerrar submenú TPV"
                            >
                                <X size={18} strokeWidth={3} />
                            </button>
                        </div>
                        <div className="max-h-[60vh] space-y-1 overflow-y-auto p-6">
                            {STAFF_TPV_MANUAL_ITEMS.map((label) => (
                                <button
                                    key={label}
                                    type="button"
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
                                    className="flex min-h-[56px] w-full items-center rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-left text-sm font-bold text-gray-700 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600 active:scale-[0.99]"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isManualsModalOpen && isHornoManualModalOpen && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
                    onClick={closeHornoManualModal}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Manual horno"
                    >
                        <div className="relative flex shrink-0 items-center justify-between gap-3 bg-[#36606F] px-6 py-4 text-white">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={closeHornoManualModal}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center text-white/90 hover:text-white transition-colors active:scale-90 min-h-[48px] min-w-[48px]"
                                    aria-label="Volver a manuales"
                                >
                                    <ArrowLeft size={20} strokeWidth={3} />
                                </button>
                                <h3 className="min-w-0 truncate text-[10px] font-black uppercase tracking-widest">Horno</h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeHornoManualModal}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white transition-all hover:bg-rose-600 active:scale-90 min-h-[48px] min-w-[48px]"
                                aria-label="Cerrar submenú horno"
                            >
                                <X size={18} strokeWidth={3} />
                            </button>
                        </div>
                        <div className="space-y-3 p-6">
                            <button
                                type="button"
                                onClick={() => openStaffPdf(STAFF_MANUAL_ASSETS.hornoLimpiezaPdf)}
                                className="flex min-h-[56px] w-full items-center rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-left text-sm font-bold text-gray-700 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600 active:scale-[0.99]"
                            >
                                Limpieza Horno
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsHornoManualModalOpen(false);
                                    setIsTpvManualModalOpen(false);
                                    setManualMediaViewer({
                                        type: 'video',
                                        src: STAFF_MANUAL_ASSETS.hornoFuncionamientoVideo,
                                        title: 'Funcionamiento Horno',
                                    });
                                }}
                                className="flex min-h-[56px] w-full items-center rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-left text-sm font-bold text-gray-700 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600 active:scale-[0.99]"
                            >
                                Funcionamiento Horno
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {manualMediaViewer && (
                <div
                    className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in"
                    onClick={() => setManualMediaViewer(null)}
                    role="dialog"
                    aria-label={manualMediaViewer.title}
                >
                    <div
                        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 bg-[#36606F] px-4 py-3 text-white">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setManualMediaViewer(null)}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center text-white/90 hover:text-white transition-colors active:scale-90 min-h-[48px] min-w-[48px]"
                                    aria-label="Volver a manuales"
                                >
                                    <ArrowLeft size={20} strokeWidth={3} />
                                </button>
                                <h3 className="min-w-0 truncate text-sm font-black uppercase tracking-wide">{manualMediaViewer.title}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setManualMediaViewer(null)}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white transition-colors hover:bg-rose-600 min-h-[48px] min-w-[48px]"
                                aria-label="Cerrar visor"
                            >
                                <X size={18} strokeWidth={3} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4">
                            {manualMediaViewer.type === 'video' ? (
                                <video
                                    src={manualMediaViewer.src}
                                    controls
                                    playsInline
                                    className="mx-auto w-full max-h-[75vh] rounded-xl bg-black"
                                >
                                    Tu navegador no reproduce vídeo embebido.
                                </video>
                            ) : (
                                <div className="flex justify-center">
                                    <Image
                                        src={manualMediaViewer.src}
                                        alt={manualMediaViewer.title}
                                        width={1200}
                                        height={1600}
                                        className="h-auto max-h-[75vh] w-auto max-w-full object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <StaffProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onOpenSupplierModal={() => setIsSupplierModalOpen(true)}
            />

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={closeScheduleModal}
                shifts={monthShifts}
                userName={userName}
                userRole={userRole}
                userId={userId}
                initialFocusDate={scheduleFocusDate}
            />

            {/* MODAL: Opciones de Caja */}
            {
                isCashOptionsModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200"
                        onClick={() => setIsCashOptionsModalOpen(false)}
                    >
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="relative shrink-0 bg-[#36606F] px-6 py-4 text-white">
                                <h3 className="text-center text-lg font-black uppercase tracking-wider leading-none">Caja</h3>
                                {(userRole === 'supervisor' || userRole === 'manager') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCashOptionsModalOpen(false);
                                            setIsCashChangeModalOpen(true);
                                        }}
                                        className={cn(
                                            'absolute right-14 top-1/2 flex min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center',
                                            'border-0 bg-transparent p-0 shadow-none text-white opacity-80 transition-all hover:opacity-100 active:scale-90',
                                        )}
                                        aria-label="Cambio entre cajas"
                                    >
                                        <Image src="/icons/change.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" aria-hidden />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsCashOptionsModalOpen(false)}
                                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-rose-600 p-0 text-white transition-all hover:bg-rose-700 active:scale-90"
                                >
                                    <X size={16} strokeWidth={2.5} />
                                </button>
                            </div>
                            <QuickCalculatorModal isOpen={cashOptionsCalculatorOpen} onClose={() => setCashOptionsCalculatorOpen(false)} />
                            <FloatingCalculatorFab isOpen={cashOptionsCalculatorOpen} onToggle={() => setCashOptionsCalculatorOpen(true)} />
                            <div className="px-6 py-5 flex flex-col gap-5 bg-white">
                                <button
                                    onClick={() => {
                                        trackStaffCashOption('Cambio');
                                        setIsCashOptionsModalOpen(false);
                                        setIsCashChangeModalOpen(true);
                                    }}
                                    className="w-full flex min-h-12 items-center gap-4 py-1 text-left transition-all active:scale-[0.98] group hover:opacity-80"
                                >
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center transition-transform group-hover:scale-110">
                                        <Image src="/icons/change.png" alt="Cambio" width={48} height={48} className="h-full w-full object-contain" />
                                    </div>
                                    <span className="font-black uppercase tracking-wide text-gray-800">Cambio</span>
                                </button>

                                <button
                                    onClick={() => {
                                        trackStaffCashOption('Compra');
                                        const cashBoxes = allBoxes.filter((b: any) => b.type === 'operational' || b.type === 'change' || b.type === 'tpv');
                                        if (cashBoxes.length === 0) {
                                            toast.error('No hay cajas configuradas');
                                            return;
                                        }
                                        setIsCashOptionsModalOpen(false);
                                        openPurchaseMultiSourceModal();
                                    }}
                                    className="w-full flex min-h-12 items-center gap-4 py-1 text-left transition-all active:scale-[0.98] group hover:opacity-80"
                                >
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center transition-transform group-hover:scale-110">
                                        <Image src="/icons/shipment.png" alt="Compra" width={48} height={48} className="h-full w-full object-contain" />
                                    </div>
                                    <span className="font-black uppercase tracking-wide text-gray-800">Compra</span>
                                </button>

                                <button
                                    onClick={() => {
                                        trackStaffCashOption('Cierre de caja');
                                        setIsCashOptionsModalOpen(false);
                                        setIsClosingModalOpen(true);
                                    }}
                                    className="w-full flex min-h-12 items-center gap-4 py-1 text-left transition-all active:scale-[0.98] group hover:opacity-80"
                                >
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center transition-transform group-hover:scale-110">
                                        <Image src="/icons/lock.png" alt="Cierre" width={48} height={48} className="h-full w-full object-contain" />
                                    </div>
                                    <span className="font-black uppercase tracking-wide text-gray-800">Cierre</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setIsCashOptionsModalOpen(false);
                                        router.push('/staff/propinas');
                                    }}
                                    className="w-full flex min-h-12 items-center gap-4 py-1 text-left transition-all active:scale-[0.98] group hover:opacity-80"
                                >
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center transition-transform group-hover:scale-110">
                                        <Image src="/icons/tip.png" alt="Propinas" width={48} height={48} className="h-full w-full object-contain" />
                                    </div>
                                    <span className="font-black uppercase tracking-wide text-gray-800">Propinas</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

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

            {/* Legacy single-box compra modal (mantener por si se abre Salida desde otra ruta) */}
            {
                cashModalMode === 'out' && !showPurchaseMultiSourceModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-in fade-in duration-200" onClick={() => setCashModalMode('none')}>
                        <div className={cn("bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]", "max-w-2xl")} onClick={(e) => e.stopPropagation()}>
                            <CashDenominationForm
                                key={'out' + (selectedBox?.id || '')}
                                type={'out'}
                                boxName={selectedBox?.name || 'Caja Inicial'}
                                boxId={selectedBox?.id}
                                initialCounts={{}}
                                availableStock={boxInventoryMap}
                                onCancel={() => setCashModalMode('none')}
                                onSubmit={handleCashTransaction}
                                forcePurchaseMode={true}
                            />
                        </div>
                    </div>
                )
            }

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

            <StaffProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onOpenSupplierModal={() => setIsSupplierModalOpen(true)}
            />

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={closeScheduleModal}
                shifts={monthShifts}
                userRole={userRole}
                userId={userId}
                initialFocusDate={scheduleFocusDate}
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
