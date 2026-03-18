'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Play, Square, CalendarDays,
    Calendar, ArrowRight, Play as PlayIcon, ArrowLeft,
    Check, Info, Package,
    Phone, FileText, Scale, ShoppingCart, Boxes, X, MessageCircle,
    ChefHat, Calculator, ArrowRightLeft, Save, ArrowDown, ArrowUp,
    Plus, Minus, BookOpen, CalendarCheck, ExternalLink
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
import { differenceInMinutes, startOfWeek, addDays, format, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';
import { FICHAJE_OVERLAY_VIDEOS } from '@/lib/fichaje-overlay-videos';
import WorkTimer from '@/components/ui/WorkTimer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';

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
    const [activeMenu, setActiveMenu] = useState<'info' | 'pedidos' | null>(null);
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | 'convenio' | 'conducta' | 'reservas' | 'carta' | null>(null);
    const [preferStock, setPreferStock] = useState(false);
    const [changeBox, setChangeBox] = useState<any>(null);
    const [changeBoxInventoryMap, setChangeBoxInventoryMap] = useState<Record<number, number>>({});
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [liveTickets, setLiveTickets] = useState({ total: 0, count: 0 });
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
    const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [userName, setUserName] = useState("");

    // NUEVOS ESTADOS PARA CAJA INICIAL ("COMPRA")
    const [operationalBox, setOperationalBox] = useState<any>(null);
    const [allBoxes, setAllBoxes] = useState<any[]>([]);
    const [isCashOptionsModalOpen, setIsCashOptionsModalOpen] = useState(false);
    const [cashOptionsCalculatorOpen, setCashOptionsCalculatorOpen] = useState(false);
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'out'>('none');
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});

    useEffect(() => { initialize(); }, []);



    const formatNumber = (val: number) => {
        if (Math.abs(val) < 0.1) return " ";
        return val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
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
            let overtimeRate = 0;
            let historicalBalance = 0;
            let isFixedSalary = false;
            let userPreferStock = false;

            const { data: profile } = await supabase.from('profiles')
                .select('first_name, role, contracted_hours_weekly, overtime_cost_per_hour, hours_balance, prefer_stock_hours, is_fixed_salary')
                .eq('id', user.id)
                .single();

            if (profile) {
                setUserRole(profile.role as any);
                setUserName(profile.first_name || "Personal");
                if (profile.contracted_hours_weekly !== null) contractHours = profile.contracted_hours_weekly;
                if (profile.overtime_cost_per_hour !== null) overtimeRate = profile.overtime_cost_per_hour;
                if (profile.hours_balance !== undefined && profile.hours_balance !== null) historicalBalance = profile.hours_balance;
                if (profile.prefer_stock_hours) userPreferStock = profile.prefer_stock_hours;
                if (profile.is_fixed_salary) isFixedSalary = profile.is_fixed_salary;
                setPreferStock(userPreferStock);
            }

            const today = new Date();
            const todayISO = today.toISOString().split('T')[0];
            const startOfDay = new Date(todayISO).toISOString();
            const endOfDay = new Date(todayISO + 'T23:59:59.999Z').toISOString();

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

            const effContract = (profile?.role === 'manager' || isFixedSalary) ? 0 : contractHours;
            const { data: gridDays } = await supabase.rpc('get_worker_weekly_log_grid', {
                p_user_id: user.id,
                p_start_date: format(weekStart, 'yyyy-MM-dd'),
                p_contracted_hours: effContract
            });

            // Fetch logs for the week to get event_type and clock_out_show_no_registrada (RPC doesn't return them)
            const { data: weekLogs } = await supabase
                .from('time_logs')
                .select('clock_in, event_type, clock_out_show_no_registrada')
                .eq('user_id', user.id)
                .gte('clock_in', weekStart.toISOString())
                .lte('clock_in', addDays(weekStart, 7).toISOString());

            let totalWeekHours = 0;
            const daysStructure: DailyLog[] = (gridDays || []).map((day: any, i: number) => {
                totalWeekHours += day.totalHours || 0;
                const d = realWeekDays[i];
                const dayLog = weekLogs?.find(l => isSameDay(new Date(l.clock_in), d));
                return {
                    ...day,
                    date: d,
                    dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i] || '',
                    dayNumber: parseInt(format(d, 'd'), 10),
                    isToday: isSameDay(d, today),
                    eventType: dayLog?.event_type || day.eventType || day.event_type || 'regular',
                    clock_out_show_no_registrada: dayLog?.clock_out_show_no_registrada === true
                };
            });
            setWeekDays(daysStructure);

            let weekDifference = 0;
            let displayHours = totalWeekHours;

            if (profile?.role === 'manager' || isFixedSalary) {
                weekDifference = totalWeekHours;
                // REGLA SOLICITADA: Mostrar 40 si hay 0 horas, o 40 + horas si hay horas
                if (totalWeekHours === 0) {
                    displayHours = contractHours;
                } else {
                    displayHours = contractHours + totalWeekHours;
                }
            } else {
                weekDifference = totalWeekHours - contractHours;
                displayHours = totalWeekHours;
            }

            const effectivePivot = (!userPreferStock && historicalBalance > 0) ? 0 : historicalBalance;
            const currentTotalBalance = effectivePivot + weekDifference;
            let payout = 0;
            if (currentTotalBalance > 0 && !userPreferStock) {
                payout = currentTotalBalance * overtimeRate;
            }

            setWeeklySummary({
                totalHours: displayHours,
                hoursDifference: weekDifference,
                currentBalance: currentTotalBalance,
                estimatedPayout: payout,
                status: 'pending',
                startBalance: effectivePivot
            });

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
                .select('start_time, end_time, activity')
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
                        activity: s.activity || undefined
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

            // --- FETCH LIVE TICKETS FOR CLOSING ---
            const { data: ticketsToday } = await supabase.from('tickets_marbella')
                .select('total_documento')
                .eq('fecha', todayISO);

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
        const list: PaymentSourceOption[] = [];
        const op = allBoxes.find(b => b.type === 'operational');
        const changeBoxes = allBoxes.filter(b => b.type === 'change').sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (op) list.push({ id: op.id, name: 'Inicial', shortLabel: 'Inicial', hasInventory: true });
        changeBoxes.forEach((b: any, i: number) => list.push({ id: b.id, name: `Cambio ${i + 1}`, shortLabel: `Cambio ${i + 1}`, hasInventory: true }));
        list.push({ id: 'tpv1', name: 'TPV 1', shortLabel: 'TPV 1', hasInventory: false });
        list.push({ id: 'tpv2', name: 'TPV 2', shortLabel: 'TPV 2', hasInventory: false });
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
            initialize();
            toast.success('Compra registrada');
        } catch (error) {
            console.error(error);
            toast.error('Error al registrar la compra');
        }
    };

    const handleClockAction = async () => {
        if (!userId) return;
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

            if (modalAction === 'in') {
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
            } else if (modalAction === 'out' && todayLog) {
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
        } catch (error) { toast.error("Error al fichar"); } finally { setActionLoading(false); }
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

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-4">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    return (
        <div className="pt-0 md:pt-2 animate-in fade-in duration-500 pb-8 md:pb-32">
            <div className="px-4 md:px-0 w-full max-w-lg md:max-w-2xl mx-auto space-y-3 md:space-y-4 mt-1 md:mt-2">
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
                                <Link href="/staff/history" className="text-[10px] font-black flex items-center gap-1 hover:text-white/80 transition-colors uppercase tracking-widest">
                                    Historial <ArrowRight size={10} strokeWidth={3} />
                                </Link>
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
                                                        {day.eventType && day.eventType !== 'regular' ? (
                                                            <>
                                                                <div className="h-5 flex items-center justify-center shrink-0">
                                                                    <div className={cn(
                                                                        "w-5 h-5 rounded-full shadow-sm flex items-center justify-center leading-none",
                                                                        day.eventType === 'no_registered' ? 'bg-red-600 text-white' :
                                                                            day.eventType === 'holiday' ? 'bg-red-500 text-white' :
                                                                                day.eventType === 'weekend' ? 'bg-yellow-400 text-white' :
                                                                                    day.eventType === 'adjustment' ? 'bg-orange-500 text-white' :
                                                                                        day.eventType === 'personal' ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'
                                                                    )}>
                                                                        {day.eventType === 'no_registered' ? (
                                                                            <X size={12} strokeWidth={2.5} className="text-white shrink-0" />
                                                                        ) : (
                                                                            <span className="text-[9px] font-black">
                                                                                {day.eventType === 'holiday' ? 'F' :
                                                                                    day.eventType === 'weekend' ? 'E' :
                                                                                        day.eventType === 'adjustment' ? 'B' :
                                                                                            day.eventType === 'personal' ? 'P' : '?'}
                                                                            </span>
                                                                        )}
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
                                                                    {day.hasLog && day.clockOut ? (
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
                                            <span className={`font-black text-[11px] md:text-sm leading-none text-red-600`}>
                                                {formatWorked(weeklySummary.startBalance)}
                                            </span>
                                        </div>
                                        <span className="text-[7px] md:text-[10px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                    </div>
                                    <div className="flex flex-col items-center flex-1">
                                        <div className="h-4 md:h-5 flex items-center">
                                            <span className={`font-black text-[11px] md:text-sm leading-none text-black`}>
                                                {weeklySummary.currentBalance > 0 ? formatWorked(weeklySummary.currentBalance) : " "}
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
                            onClick={openConfirmation}
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
                                            const isPast = day < today;
                                            const hasShift = monthShifts.some(s => s.date.getDate() === d && s.date.getMonth() === new Date().getMonth());

                                            return (
                                                <div key={d} className="flex items-center justify-center py-[1px] md:py-0.5">
                                                    <span className={`
                                                            w-3.5 h-3.5 md:w-5 md:h-5 flex items-center justify-center rounded-full text-[7px] md:text-[9px] leading-none transition-colors
                                                            ${hasShift ? 'bg-emerald-500 text-white font-black' : (isToday ? 'text-blue-600 font-black' : (isPast ? 'text-gray-300' : 'text-gray-900'))}
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
                            <IOSIconBoxed img="/icons/suppliers.png" color="bg-white" label="Productos" onClick={() => setIsProductModalOpen(true)} />
                        </div>
                    </div>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-zinc-800 mb-6">{modalAction === 'in' ? 'Iniciar Turno' : 'Finalizar Turno'}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => setShowModal(false)} className="h-14 px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl active:scale-95 transition-all duration-150">Cancelar</button>
                            <button onClick={handleClockAction} className={cn("h-14 px-4 text-white font-bold rounded-xl active:scale-95 transition-all duration-150 shadow-lg", modalAction === 'in' ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200")}>Confirmar</button>
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
                                        <button onClick={() => setInfoSubMenu(null)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                            <ArrowLeft size={18} strokeWidth={3} />
                                        </button>
                                    )}
                                    <h3 className="text-[10px] font-black uppercase tracking-widest">
                                        {infoSubMenu === 'contactos' ? 'Contactos' : infoSubMenu === 'convenio' ? 'Convenio' : infoSubMenu === 'conducta' ? 'Código Conducta' : infoSubMenu === 'reservas' ? 'Reservas' : infoSubMenu === 'carta' ? 'Carta' : 'Información'}
                                    </h3>
                                </div>
                                <button onClick={closeMenus} className="w-8 h-8 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20">
                                    <X size={18} strokeWidth={3} />
                                </button>
                            </div>

                            <div className="p-8 space-y-2 overflow-y-auto">
                                {!infoSubMenu && (
                                    <div className="space-y-1">
                                        <button onClick={() => setInfoSubMenu('contactos')} className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl">
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/whatsapp.png" alt="Contactos" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Contactos de Interés</span>
                                        </button>

                                        <button onClick={() => setInfoSubMenu('convenio')} className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl">
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/convenio.png" alt="Convenio" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Convenio Col·lectiu</span>
                                        </button>

                                        <button onClick={() => setInfoSubMenu('conducta')} className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl">
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/ley.png" alt="Código de Conducta" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Código de Conducta</span>
                                        </button>

                                        <button onClick={() => setInfoSubMenu('reservas')} className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl">
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/reservas.png" alt="Reservas" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">Reservas</span>
                                        </button>

                                        <button onClick={() => setInfoSubMenu('carta')} className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 transition-all group active:scale-95 min-h-[56px] rounded-2xl">
                                            <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
                                                <Image src="/icons/menu.png" alt="Carta" width={36} height={36} className="object-contain transition-transform group-hover:scale-110" />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight text-left">La Carta</span>
                                        </button>
                                    </div>
                                )}
                                {infoSubMenu === 'contactos' && (
                                    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-2">
                                        {CONTACTS_DATA.map((c, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-gray-800 truncate">{c.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-mono">{c.phone}</p>
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
                                {(infoSubMenu === 'convenio' || infoSubMenu === 'conducta') && (
                                    <div className="flex flex-col items-center gap-6 py-4">
                                        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center">
                                            <FileText size={40} className="text-blue-400" strokeWidth={1.5} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base font-black text-gray-800 mb-1">
                                                {infoSubMenu === 'convenio' ? 'Convenio Colectivo' : 'Código de Conducta'}
                                            </p>
                                            <p className="text-xs text-gray-400 font-medium">Documento PDF</p>
                                        </div>
                                        <button
                                            onClick={() => window.open(infoSubMenu === 'convenio' ? '/docs/convenio.pdf' : '/docs/codigo_conducta.pdf', '_blank')}
                                            className="w-full h-14 bg-[#5B8FB9] hover:bg-[#4a7a9e] text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-200"
                                        >
                                            <ExternalLink size={20} />
                                            <span>Abrir Documento</span>
                                        </button>
                                        <a
                                            href={infoSubMenu === 'convenio' ? '/docs/convenio.pdf' : '/docs/codigo_conducta.pdf'}
                                            download
                                            className="text-xs font-bold text-gray-400 hover:text-gray-600 underline transition-colors"
                                        >
                                            Descargar PDF
                                        </a>
                                    </div>
                                )}
                                {(infoSubMenu === 'reservas' || infoSubMenu === 'carta') && (
                                    <div className="flex flex-col items-center gap-6 py-4">
                                        <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center">
                                            {infoSubMenu === 'reservas' ? (
                                                <CalendarCheck size={40} className="text-amber-400" strokeWidth={1.5} />
                                            ) : (
                                                <BookOpen size={40} className="text-amber-400" strokeWidth={1.5} />
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base font-black text-gray-800 mb-1">
                                                {infoSubMenu === 'reservas' ? 'Reservas' : 'Carta del Restaurante'}
                                            </p>
                                            <p className="text-xs text-gray-400 font-medium">Próximamente disponible</p>
                                        </div>
                                        <div className="w-full h-14 bg-gray-100 text-gray-400 font-bold rounded-2xl flex items-center justify-center gap-3">
                                            <span className="text-sm">En desarrollo</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <StaffProductModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onOpenSupplierModal={() => setIsSupplierModalOpen(true)}
            />

            <StaffScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                shifts={monthShifts}
                userName={userName}
                userRole={userRole}
                userId={userId}
            />

            {/* MODAL: Cambio entre cajas (selector Caja A / Caja B, luego De A→B y De B→A) */}
            {
                showSwapModal && (
                    <CashChangeModal
                        boxOptions={buildPaymentSources()}
                        isManager={userRole === 'manager'}
                        onClose={() => setShowSwapModal(false)}
                        onSuccess={() => { initialize(); setShowSwapModal(false); }}
                    />
                )
            }

            {/* MODAL: Opciones de Caja */}
            {
                isCashOptionsModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200"
                        onClick={() => setIsCashOptionsModalOpen(false)}
                    >
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white">
                                <h3 className="text-lg font-black uppercase tracking-wider leading-none">Caja</h3>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => setIsCashOptionsModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90 min-h-[48px] min-w-[48px]"><X size={20} strokeWidth={3} /></button>
                                </div>
                            </div>
                            <QuickCalculatorModal isOpen={cashOptionsCalculatorOpen} onClose={() => setCashOptionsCalculatorOpen(false)} />
                            <FloatingCalculatorFab isOpen={cashOptionsCalculatorOpen} onToggle={() => setCashOptionsCalculatorOpen(true)} />
                            <div className="p-4 flex flex-col gap-3 bg-gray-50/50">
                                <button
                                    onClick={() => {
                                        setIsCashOptionsModalOpen(false);
                                        setShowSwapModal(true);
                                    }}
                                    className="w-full bg-white border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md p-4 rounded-xl flex items-center gap-4 transition-all active:scale-[0.98] group"
                                >
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                                        <Image src="/icons/change.png" alt="Cambio" width={48} height={48} className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-col text-left">
                                        <span className="font-black text-gray-800 uppercase tracking-wide">Cambio</span>
                                        <span className="text-[10px] text-gray-400 font-medium">Intercambiar billetes o monedas entre cajas</span>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        const cashBoxes = allBoxes.filter((b: any) => b.type === 'operational' || b.type === 'change');
                                        if (cashBoxes.length === 0) {
                                            toast.error('No hay cajas configuradas');
                                            return;
                                        }
                                        setIsCashOptionsModalOpen(false);
                                        openPurchaseMultiSourceModal();
                                    }}
                                    className="w-full bg-white border border-gray-100 shadow-sm hover:border-rose-200 hover:shadow-md p-4 rounded-xl flex items-center gap-4 transition-all active:scale-[0.98] group"
                                >
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                                        <Image src="/icons/shipment.png" alt="Compra" width={48} height={48} className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-col text-left">
                                        <span className="font-black text-gray-800 uppercase tracking-wide">Compra</span>
                                        <span className="text-[10px] text-gray-400 font-medium">Salida de caja para compras o gastos</span>
                                    </div>
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
                onClose={() => setIsScheduleModalOpen(false)}
                shifts={monthShifts}
                userRole={userRole}
                userId={userId}
            />
        </div>
    );
}
