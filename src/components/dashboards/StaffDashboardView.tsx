'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Play, Square, CalendarDays,
    Calendar, ArrowRight, Play as PlayIcon, ArrowLeft,
    Info, Package,
    Phone, FileText, Scale, ShoppingCart, Boxes, X, MessageCircle,
    ChefHat, Calculator, ArrowRightLeft, Save, ArrowDown, ArrowUp,
    Plus, Minus, BookOpen, CalendarCheck, ExternalLink
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { StaffProductModal } from '@/components/modals/StaffProductModal';
import { DayDetailModal } from '@/components/modals/DayDetailModal';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { toast } from 'sonner';
import Link from 'next/link';
import { differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';
import WorkTimer from '@/components/ui/WorkTimer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
    date: Date; dayName: string; dayNumber: number; hasLog: boolean; clockIn: string; clockOut: string; totalHours: number; extraHours: number; isToday: boolean;
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
    const [status, setStatus] = useState<WorkStatus>('idle');
    const [todayLog, setTodayLog] = useState<any>(null);

    const [weekDays, setWeekDays] = useState<DailyLog[]>([]);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>({
        totalHours: 0, hoursDifference: 0, currentBalance: 0, estimatedPayout: 0, status: 'pending', startBalance: 0
    });
    const [nextShifts, setNextShifts] = useState<ShiftMock[]>([]);
    const [currentMonthName, setCurrentMonthName] = useState('');
    const [weekNumber, setWeekNumber] = useState<number | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [modalAction, setModalAction] = useState<'in' | 'out' | null>(null);
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

    // NUEVOS ESTADOS PARA CAJA INICIAL ("COMPRA")
    const [operationalBox, setOperationalBox] = useState<any>(null);
    const [isCashOptionsModalOpen, setIsCashOptionsModalOpen] = useState(false);
    const [selectedBox, setSelectedBox] = useState<any>(null);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'out'>('none');
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});

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

            const dayOfWeek = today.getDay();
            const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const monday = new Date(today); monday.setDate(diffToMonday); monday.setHours(0, 0, 0, 0);
            const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);

            setCurrentMonthName(monday.toLocaleDateString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase()));

            const target = new Date(monday.valueOf());
            const dayNr = (monday.getDay() + 6) % 7;
            target.setDate(target.getDate() - dayNr + 3);
            const firstThursday = target.valueOf();
            target.setMonth(0, 1);
            if (target.getDay() !== 4) {
                target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
            }
            const wNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
            setWeekNumber(wNum);

            const { data: weekLogs } = await supabase.from('time_logs')
                .select('clock_in, clock_out, total_hours')
                .eq('user_id', user.id)
                .gte('clock_in', monday.toISOString())
                .lte('clock_in', sunday.toISOString())
                .order('clock_in', { ascending: true });

            const daysStructure: DailyLog[] = [];
            let totalWeekHours = 0;
            let currentAccumulated = 0;
            const effContract = (profile?.role === 'manager' || isFixedSalary) ? 0 : contractHours;

            for (let i = 0; i < 7; i++) {
                const currentDay = new Date(monday); currentDay.setDate(monday.getDate() + i);
                const isToday = currentDay.getDate() === today.getDate() && currentDay.getMonth() === today.getMonth();
                const dayLog = weekLogs?.find(l => new Date(l.clock_in).getDate() === currentDay.getDate());

                let clockInStr = '', clockOutStr = '', hours = 0, dayExtras = 0;
                if (dayLog) {
                    const inDate = new Date(dayLog.clock_in);
                    clockInStr = inDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    if (dayLog.clock_out) {
                        const outDate = new Date(dayLog.clock_out);
                        clockOutStr = outDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    }
                    hours = dayLog.total_hours ? roundHoursValue(dayLog.total_hours) : 0;
                    totalWeekHours += hours;
                    const newAccumulated = currentAccumulated + hours;
                    if (newAccumulated > effContract) {
                        dayExtras = (currentAccumulated >= effContract) ? hours : (newAccumulated - effContract);
                    }
                    currentAccumulated = newAccumulated;
                }
                daysStructure.push({
                    date: currentDay, dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i], dayNumber: currentDay.getDate(),
                    hasLog: !!dayLog, clockIn: clockInStr, clockOut: clockOutStr, totalHours: hours, extraHours: dayExtras, isToday: isToday
                });
            }
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

            // Cargar caja de cambio para acceso directo "Cambiar"
            const { data: changeBoxes } = await supabase.from('cash_boxes').select('*').eq('type', 'change').order('name').limit(1);
            if (changeBoxes && changeBoxes.length > 0) {
                setChangeBox(changeBoxes[0]);
            }

            // Cargar caja operacional para acceso a "Compra"
            const { data: opBoxes } = await supabase.from('cash_boxes').select('*').eq('type', 'operational').order('name').limit(1);
            if (opBoxes && opBoxes.length > 0) {
                setOperationalBox(opBoxes[0]);
            }

            const { data: realShifts } = await supabase
                .from('shifts')
                .select('start_time, end_time, activity')
                .eq('user_id', user.id)
                .eq('is_published', true)
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(5);

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
                setNextShifts(formattedShifts);
            } else {
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
                if (userRole !== 'manager') {
                    toast.error(geoError.message || "Ubicación necesaria para fichar");
                    setActionLoading(false);
                    return;
                }
            }

            if (userRole !== 'manager' && distance !== null && distance > MAX_DISTANCE_METERS) {
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
            }
            initialize();
        } catch (error) { toast.error("Error al fichar"); } finally { setActionLoading(false); }
    };

    const openConfirmation = () => { if (status !== 'finished' && !actionLoading) { setModalAction(status === 'idle' ? 'in' : 'out'); setShowModal(true); } };

    const IOSIconBoxed = ({ icon: Icon, img, color, label, onClick }: { icon?: any, img?: string, color: string, label: string | React.ReactNode, onClick?: () => void }) => (
        <button
            onClick={onClick}
            className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-all group aspect-square w-full h-full"
        >
            <div className="w-12 h-12 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden">
                {img ? (
                    <Image
                        src={img}
                        alt={typeof label === 'string' ? label : 'Icon'}
                        width={48}
                        height={48}
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm", color)}>
                        <Icon size={28} fill="currentColor" strokeWidth={2.5} />
                    </div>
                )}
            </div>
            <span className="text-[9px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5">{label}</span>
        </button>
    );

    const closeMenus = () => { setActiveMenu(null); setInfoSubMenu(null); setIsProductModalOpen(false); };

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-4">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    return (
        <div className="pt-0 md:pt-1 animate-in fade-in duration-500">
            <div className="px-4 md:p-6 w-full max-w-6xl mx-auto space-y-4 md:space-y-6 mt-1 md:mt-0">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 items-start">
                    <div className="lg:col-span-2 space-y-4 md:space-y-6">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                            {/* Header Estrecho - Estilo Vista Marbella Detail */}
                            <div className="bg-[#36606F] px-6 py-3 flex justify-between items-center text-white shrink-0">
                                <div className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded-xl border border-white/10 shadow-sm">
                                    <Calendar size={12} className="text-white/60" />
                                    <span className="text-[9px] font-black uppercase tracking-widest leading-none text-white">
                                        {currentMonthName} {weekNumber ? `- SEM ${weekNumber}` : ''}
                                    </span>
                                </div>
                                <Link href="/staff/history" className="text-[10px] font-black flex items-center gap-1 hover:text-white/80 transition-colors uppercase tracking-widest">
                                    Historial <ArrowRight size={10} strokeWidth={3} />
                                </Link>
                            </div>

                            <div className="p-4">

                                <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                                    <div className="grid grid-cols-7 border-b border-gray-100">
                                        {weekDays.map((day, i) => (
                                            <div key={i} className="flex flex-col border-r border-gray-100 last:border-r-0 min-h-[108px] bg-white relative">
                                                <div className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md relative z-10">
                                                    <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                                </div>
                                                <div
                                                    className="flex-1 p-1 flex flex-col items-center relative z-0 bg-white cursor-pointer hover:bg-blue-50/50 transition-colors"
                                                    onClick={() => {
                                                        setSelectedDayDate(day.date);
                                                        setIsDayDetailModalOpen(true);
                                                    }}
                                                >
                                                    <span className={`absolute top-1 right-1 text-[9px] font-bold ${day.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.dayNumber}</span>
                                                    <div className="flex-1 flex flex-col justify-center gap-0.5 w-full pb-1 mt-4">
                                                        <div className="h-3 flex items-center justify-center gap-1">
                                                            {day.hasLog ? (
                                                                <>
                                                                    <div className="w-1 h-1 rounded-full bg-green-500 shrink-0"></div>
                                                                    <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                        <div className="h-3 flex items-center justify-center gap-1">
                                                            {day.hasLog && day.clockOut ? (
                                                                <>
                                                                    <div className="w-1 h-1 rounded-full bg-red-500 shrink-0"></div>
                                                                    <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                </>
                                                            ) : (day.hasLog && !day.clockOut ? <div className="w-1 h-1 rounded-full bg-orange-400 animate-pulse"></div> : null)}
                                                        </div>
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

                                <div className="p-2 md:p-3 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                                    <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                        <div className="h-4 flex items-center">
                                            <span className="font-black text-black text-[11px] md:text-xs leading-none">{formatWorked(weeklySummary.totalHours)}</span>
                                        </div>
                                        <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Horas</span>
                                    </div>

                                    <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                        <div className="h-4 flex items-center">
                                            <span className={`font-black text-[11px] md:text-xs leading-none text-red-600`}>
                                                {formatWorked(weeklySummary.startBalance)}
                                            </span>
                                        </div>
                                        <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                    </div>
                                    <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                        <div className="h-4 flex items-center">
                                            <span className={`font-black text-[11px] md:text-xs leading-none text-black`}>
                                                {weeklySummary.currentBalance > 0 ? formatWorked(weeklySummary.currentBalance) : " "}
                                            </span>
                                        </div>
                                        <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1 text-center whitespace-nowrap">EXTRAS</span>
                                    </div>
                                    <div className="flex flex-col items-center flex-1">
                                        <div className="h-4 flex items-center">
                                            <span className="font-black text-[11px] md:text-xs leading-none text-emerald-600">
                                                {!preferStock ? formatWorked(weeklySummary.estimatedPayout) : "0"}€
                                            </span>
                                        </div>
                                        <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1 text-center">Importe</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-xl flex flex-col items-center text-center relative gap-3 md:gap-4">
                            <button
                                onClick={openConfirmation}
                                disabled={status === 'finished' || actionLoading}
                                className={cn(
                                    "w-full h-16 rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 duration-150",
                                    status === 'idle' && "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200",
                                    status === 'working' && "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200",
                                    status === 'finished' && "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-100"
                                )}>
                                {actionLoading ? (
                                    <>
                                        <LoadingSpinner size="sm" className="text-white" />
                                        <span className="text-xl font-black uppercase tracking-wider">
                                            {modalAction === 'in' ? 'Iniciando...' : 'Cerrando...'}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xl font-black uppercase tracking-wider">
                                        {status === 'idle' ? 'ENTRADA' : (status === 'working' ? 'SALIDA' : 'FINALIZADO')}
                                    </span>
                                )}
                            </button>
                            <WorkTimer clockIn={todayLog?.clock_in || null} status={status} totalHours={todayLog?.total_hours} />
                        </div>
                    </div>

                    <div className="lg:col-span-1 space-y-4 md:space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <div
                                onClick={() => router.push('/staff/schedule')}
                                className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden relative min-h-[180px] cursor-pointer hover:shadow-2xl transition-all active:scale-[0.98] group/card"
                            >
                                {/* Header Lila - Estilo Personalizado */}
                                <div className="bg-purple-600 px-4 py-2 flex items-center text-white shrink-0">
                                    <h3 className="font-black flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                                        <CalendarDays size={14} className="text-white/80 shrink-0" fill="currentColor" /> <span className="truncate">Horarios</span>
                                    </h3>
                                </div>

                                <div className="p-2 py-1 flex-1 flex flex-col justify-center">
                                    <div className="grid grid-cols-1 gap-1.5 justify-items-center">
                                        {nextShifts.length === 0 ? (
                                            <div className="flex items-center justify-center py-6 px-2">
                                                <p className="text-[10px] text-gray-400 text-center font-bold italic">No tienes turnos.</p>
                                            </div>
                                        ) : (
                                            nextShifts.slice(0, 2).map((shift, idx) => (
                                                <div key={idx} className="flex items-center gap-2 p-1 transition-colors group w-full">
                                                    <div className="bg-white p-1 rounded-xl text-gray-500 font-black text-center min-w-[36px] shadow-sm border border-gray-100 group-hover:border-purple-100 transition-colors shrink-0">
                                                        <span className="block text-[6px] uppercase text-purple-400 mb-0.5">{shift.date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                                        <span className="leading-none text-xs text-gray-800">{shift.date.getDate()}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-0 overflow-hidden items-start min-w-0">
                                                        <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest truncate w-full">{shift.activity || 'Turno'}</span>
                                                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[10px] font-black w-full">
                                                            <span className="text-green-600 whitespace-nowrap">{shift.startTime}</span>
                                                            <span className="text-gray-300 font-light">-</span>
                                                            <span className="text-red-500 whitespace-nowrap">{shift.endTime}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Iconos Flotantes - Ahora fuera de Horarios */}
                            <div className="grid grid-cols-2 gap-2">
                                <IOSIconBoxed img="/icons/change.png" color="bg-red-600" label="Caja" onClick={async () => {
                                    if (!changeBox || !operationalBox) { toast.error('Cajas no configuradas completamente'); return; }
                                    setIsCashOptionsModalOpen(true);
                                }} />
                                <IOSIconBoxed
                                    img="/icons/recipes.png"
                                    color="bg-white"
                                    label="Recetas"
                                    onClick={() => router.push('/recipes?view=staff')}
                                />
                                <IOSIconBoxed
                                    img="/icons/information.png"
                                    color="bg-blue-500"
                                    label={<><span className="hidden sm:inline">Información</span><span className="inline sm:hidden">Info</span></>}
                                    onClick={() => setActiveMenu('info')}
                                />
                                <IOSIconBoxed img="/icons/suppliers.png" color="bg-[#8B5E3C]" label="Productos" onClick={() => setIsProductModalOpen(true)} />
                                {userRole === 'supervisor' && (
                                    <IOSIconBoxed
                                        icon={Calculator}
                                        color="bg-[#5B8FB9]"
                                        label="Cierre"
                                        onClick={() => setIsClosingModalOpen(true)}
                                    />
                                )}
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

                {activeMenu && (
                    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={closeMenus}>
                        <div className={`bg-white w-full ${infoSubMenu === 'contactos' ? 'max-w-md' : (activeMenu === 'pedidos' ? 'max-w-sm' : 'max-w-sm')} rounded-2xl shadow-2xl relative transition-all max-h-[85vh] flex flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
                            {/* Header Petrol - Estilo Modal Marbella */}
                            <div className="bg-[#36606F] px-6 py-4 flex items-center justify-between text-white shrink-0 relative">
                                <div className="flex items-center gap-3">
                                    {infoSubMenu ? (
                                        <button onClick={() => setInfoSubMenu(null)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                            <ArrowLeft size={18} strokeWidth={3} />
                                        </button>
                                    ) : (
                                        <div className="w-8 h-8 flex items-center justify-center bg-blue-500 rounded-xl shadow-sm">
                                            <Info size={18} fill="currentColor" />
                                        </div>
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
                )}

                <StaffProductModal
                    isOpen={isProductModalOpen}
                    onClose={() => setIsProductModalOpen(false)}
                    onOpenSupplierModal={() => setIsSupplierModalOpen(true)}
                />

                {/* MODAL: Cambio de Efectivo (Cambio 1) */}

                {/* MODAL: Cambio de Efectivo (Cambio 1) */}
                {showSwapModal && changeBox && (
                    <CashChangeModal
                        boxId={changeBox.id}
                        boxName={changeBox.name}
                        onClose={() => setShowSwapModal(false)}
                        onSuccess={() => { initialize(); setShowSwapModal(false); }}
                    />
                )}

                {/* MODAL: Opciones de Caja */}
                {isCashOptionsModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4" onClick={() => setIsCashOptionsModalOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white">
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-wider leading-none">Caja</h3>
                                    <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Selecciona una operación</p>
                                </div>
                                <button onClick={() => setIsCashOptionsModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"><X size={20} strokeWidth={3} /></button>
                            </div>
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
                                        <span className="text-[10px] text-gray-400 font-medium">Intercambiar billetes o monedas</span>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        setIsCashOptionsModalOpen(false);
                                        openTreasuryModal(operationalBox, 'out');
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
                )}

                {/* MODAL: Salida (Compra) de Caja */}
                {cashModalMode === 'out' && (
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

                <DayDetailModal
                    isOpen={isDayDetailModalOpen}
                    date={selectedDayDate}
                    userId={userId}
                    userRole={userRole}
                    onClose={() => setIsDayDetailModalOpen(false)}
                    onSuccess={() => initialize()}
                />
            </div>
        </div >
    );
}
