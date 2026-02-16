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
    Plus, Minus
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
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
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | 'convenio' | 'conducta' | null>(null);
    const [preferStock, setPreferStock] = useState(false);
    const [changeBox, setChangeBox] = useState<any>(null);
    const [changeBoxInventoryMap, setChangeBoxInventoryMap] = useState<Record<number, number>>({});
    const [showSwapModal, setShowSwapModal] = useState(false);

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

            const currentTotalBalance = historicalBalance + weekDifference;
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
                startBalance: historicalBalance
            });

            // Cargar caja de cambio para acceso directo "Cambiar"
            const { data: changeBoxes } = await supabase.from('cash_boxes').select('*').eq('type', 'change').order('name').limit(1);
            if (changeBoxes && changeBoxes.length > 0) {
                setChangeBox(changeBoxes[0]);
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
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    }

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
            } catch (geoError) {
                console.error("Geo error:", geoError);
                if (userRole !== 'manager') {
                    toast.error("Ubicación necesaria para fichar");
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
            className={cn(
                "flex flex-col items-center justify-center gap-1.5 w-full h-full",
                "bg-white rounded-2xl shadow-sm",
                "active:scale-95 transition-all duration-150 p-2 group",
                "min-h-[88px]"
            )}
        >
            <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
                {img ? (
                    <Image
                        src={img}
                        alt={typeof label === 'string' ? label : 'Icon'}
                        width={48}
                        height={48}
                        className="w-full h-full object-contain transition-transform group-hover:scale-110"
                    />
                ) : (
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm", color)}>
                        <Icon size={24} fill="currentColor" strokeWidth={2.5} />
                    </div>
                )}
            </div>
            <span className="text-[10px] font-bold text-zinc-500 text-center leading-tight group-hover:text-zinc-900 uppercase tracking-tight">{label}</span>
        </button>
    );

    const closeMenus = () => { setActiveMenu(null); setInfoSubMenu(null); };

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-4">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    return (
        <div className="p-4 md:p-8 w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        {/* Header Estrecho - Estilo Vista Marbella Detail */}
                        <div className="bg-[#36606F] px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
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
                                            <div className="flex-1 p-1 flex flex-col items-center relative z-0 bg-white">
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
                                        <span className="font-black text-gray-800 text-[11px] md:text-xs leading-none">{formatWorked(weeklySummary.totalHours)}</span>
                                    </div>
                                    <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Horas</span>
                                </div>

                                <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                    <div className="h-4 flex items-center">
                                        <span className={`font-black text-[11px] md:text-xs leading-none ${weeklySummary.startBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {formatBalance(weeklySummary.startBalance)}
                                        </span>
                                    </div>
                                    <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                                </div>
                                <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                    <div className="h-4 flex items-center">
                                        <span className={`font-black text-[11px] md:text-xs leading-none ${weeklySummary.currentBalance > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {weeklySummary.currentBalance > 0 ? formatBalance(weeklySummary.currentBalance) : " "}
                                        </span>
                                    </div>
                                    <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1 text-center whitespace-nowrap">H Extras</span>
                                </div>
                                <div className="flex flex-col items-center flex-1">
                                    <div className="h-4 flex items-center">
                                        <span className="font-black text-[11px] md:text-xs leading-none text-green-600">
                                            {!preferStock ? formatMoney(weeklySummary.estimatedPayout) : " "}
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

                <div className="lg:col-span-1 space-y-6">
                    <div className="flex flex-row md:flex-col xl:flex-row gap-3 md:gap-6">
                        <div
                            onClick={() => router.push('/staff/schedule')}
                            className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden relative min-h-[180px] w-1/2 md:w-full xl:flex-1 cursor-pointer hover:shadow-2xl transition-all active:scale-[0.98] group/card"
                        >
                            {/* Header Lila - Estilo Personalizado */}
                            <div className="bg-purple-600 px-3 md:px-6 py-2.5 md:py-3 flex justify-between items-center text-white shrink-0">
                                <h3 className="font-black flex items-center gap-1.5 text-[9px] md:text-xs uppercase tracking-wider">
                                    <CalendarDays size={14} className="text-white/80 shrink-0" fill="currentColor" /> <span className="truncate">Horarios</span>
                                </h3>
                                <Link href="/staff/schedule" className="text-[8px] md:text-[10px] font-black hover:text-white/80 transition-colors uppercase tracking-widest shrink-0">Ver más</Link>
                            </div>

                            <div className="p-4 flex-1">
                                <div className="grid grid-cols-1 gap-3 lg:gap-4 flex-1 justify-items-start">
                                    {nextShifts.length === 0 ? (
                                        <div className="flex items-center justify-start py-6 lg:py-10 px-4">
                                            <p className="text-[9px] lg:text-xs text-gray-400 text-left font-bold italic">No tienes turnos.</p>
                                        </div>
                                    ) : (
                                        nextShifts.slice(0, 2).map((shift, idx) => (
                                            <div key={idx} className="flex items-center gap-2 md:gap-4 p-1.5 md:p-3 transition-colors group w-full">
                                                <div className="bg-white p-1 md:p-2 rounded-xl text-gray-500 font-black text-[9px] md:text-xs text-center min-w-[36px] md:min-w-[50px] shadow-sm border border-gray-100 group-hover:border-purple-100 transition-colors shrink-0">
                                                    <span className="block text-[6px] md:text-[8px] uppercase text-purple-400 mb-0.5">{shift.date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                                    <span className="leading-none text-xs md:text-lg text-gray-800">{shift.date.getDate()}</span>
                                                </div>
                                                <div className="flex flex-col gap-0 overflow-hidden items-start min-w-0">
                                                    <span className="text-[7px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate w-full">{shift.activity || 'Turno'}</span>
                                                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[10px] md:text-sm font-black w-full">
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
                        <div className="grid grid-cols-2 xl:grid-cols-2 gap-1.5 md:gap-3 w-1/2 md:w-full xl:w-44 shrink-0 px-0 md:px-2 lg:px-0">
                            <IOSIconBoxed img="/icons/change.png" color="bg-red-600" label="Cambiar" onClick={async () => {
                                if (!changeBox) { toast.error('No hay caja de cambio configurada'); return; }
                                setShowSwapModal(true);
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
                            <IOSIconBoxed img="/icons/suppliers.png" color="bg-[#8B5E3C]" label="Pedidos" onClick={() => setActiveMenu('pedidos')} />
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
                    <div className={`bg-white w-full ${infoSubMenu === 'contactos' ? 'max-w-md' : (activeMenu === 'pedidos' ? 'max-w-sm' : 'max-w-xs')} rounded-2xl shadow-2xl relative transition-all max-h-[85vh] flex flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
                        {infoSubMenu && (
                            <button onClick={() => setInfoSubMenu(null)} className="absolute top-4 left-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                                <ArrowLeft size={16} />
                            </button>
                        )}
                        {activeMenu === 'info' && (
                            <>
                                <button onClick={closeMenus} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                                    <X size={16} />
                                </button>
                                <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2 justify-center mt-2">
                                    <Info size={24} className="text-blue-500" />
                                    {infoSubMenu === 'contactos' ? 'Contactos' : infoSubMenu === 'convenio' ? 'Convenio' : infoSubMenu === 'conducta' ? 'Código Conducta' : 'Información'}
                                </h3>
                                <div className="p-8 space-y-2 overflow-y-auto">
                                    {!infoSubMenu && (
                                        <>
                                            <button onClick={() => setInfoSubMenu('contactos')} className="w-full h-16 px-4 bg-transparent rounded-2xl flex items-center gap-5 transition-all active:scale-95 group min-h-[56px] text-gray-600 hover:text-[#5B8FB9]">
                                                <div className="p-3 rounded-xl transition-all group-hover:bg-gray-50 text-gray-400 group-hover:text-[#5B8FB9]"><Phone size={24} strokeWidth={2.5} /></div>
                                                <span className="font-bold text-base tracking-tight text-left flex-1">Contactos</span>
                                            </button>
                                            <button onClick={() => setInfoSubMenu('convenio')} className="w-full h-16 px-4 bg-transparent rounded-2xl flex items-center gap-5 transition-all active:scale-95 group min-h-[56px] text-gray-600 hover:text-[#5B8FB9]">
                                                <div className="p-3 rounded-xl transition-all group-hover:bg-gray-50 text-gray-400 group-hover:text-[#5B8FB9]"><FileText size={24} strokeWidth={2.5} /></div>
                                                <span className="font-bold text-base tracking-tight text-left flex-1">Convenio</span>
                                            </button>
                                            <button onClick={() => setInfoSubMenu('conducta')} className="w-full h-16 px-4 bg-transparent rounded-2xl flex items-center gap-5 transition-all active:scale-95 group min-h-[56px] text-gray-600 hover:text-[#5B8FB9]">
                                                <div className="p-3 rounded-xl transition-all group-hover:bg-gray-50 text-gray-400 group-hover:text-[#5B8FB9]"><Scale size={24} strokeWidth={2.5} /></div>
                                                <span className="font-bold text-base tracking-tight text-left flex-1">Código de Conducta</span>
                                            </button>
                                        </>
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
                                        <div className="h-[60vh] w-full bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                                            <iframe src={infoSubMenu === 'convenio' ? '/docs/convenio.pdf' : '/docs/codigo_conducta.pdf'} className="w-full h-full" title="Documento PDF" />
                                            <div className="bg-white p-2 text-center border-t border-gray-200">
                                                <a href={infoSubMenu === 'convenio' ? '/docs/convenio.pdf' : '/docs/codigo_conducta.pdf'} target="_blank" download className="text-xs font-bold text-blue-600 hover:underline">Descargar PDF si no visualiza</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        {activeMenu === 'pedidos' && (
                            <>
                                <div className="bg-[#36606F] px-8 py-4 flex justify-between items-center text-white shrink-0">
                                    <div className="flex flex-col">
                                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Gestión Stock</h3>
                                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Pedidos y Logística</p>
                                    </div>
                                    <button onClick={closeMenus} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                        <X size={20} strokeWidth={3} />
                                    </button>
                                </div>
                                <div className="p-8 grid grid-cols-2 gap-4 bg-transparent overflow-y-auto">
                                    {[
                                        { title: 'Pedidos', img: '/icons/shipment.png', link: '/orders/new' },
                                        { title: 'Inventario', img: '/icons/inventory.png' },
                                        { title: 'Proveedores', img: '/icons/suplier.png', link: '/suppliers' },
                                    ].map((item, i) => (
                                        <button key={i} onClick={() => item.link ? router.push(item.link) : toast.info(`${item.title} próximamente`)} className="bg-transparent border-0 flex flex-col items-center gap-3 transition-all active:scale-95 group">
                                            <div className="w-14 h-14 transition-transform group-hover:scale-110">
                                                <Image src={item.img} alt={item.title} width={56} height={56} className="w-full h-full object-contain" />
                                            </div>
                                            <span className="font-black text-xs text-zinc-500 uppercase tracking-tight group-hover:text-zinc-900">{item.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL: Cambio de Efectivo (Cambio 1) */}
            {showSwapModal && changeBox && (
                <CashChangeModal
                    boxId={changeBox.id}
                    boxName={changeBox.name}
                    onClose={() => setShowSwapModal(false)}
                    onSuccess={() => { initialize(); setShowSwapModal(false); }}
                />
            )}

            <CashClosingModal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                onSuccess={() => initialize()}
            />
        </div>
    );
}
