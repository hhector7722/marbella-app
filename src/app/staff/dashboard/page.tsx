'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Play, Square, CalendarDays,
    Calendar, ArrowRight, Play as PlayIcon, ArrowLeft,
    Info, Package, // Eliminado Sandwich, añadido ChefHat
    Phone, FileText, Scale, ShoppingCart, Boxes, X, MessageCircle,
    ChefHat, Calculator
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { toast } from 'sonner';
import Link from 'next/link';
import { Share_Tech_Mono } from 'next/font/google';
import { differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';

const digitalFont = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

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
    startBalance: number; // Saldo Arrastrado
}

interface ShiftMock {
    date: Date;
    startTime: string;
    endTime: string;
    activity?: string;
}

// --- LÓGICA DE NEGOCIO: REDONDEO 20/40 ---
const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    // Regla: 0-20min -> 0.0 | 21-50min -> 0.5 | 51-59min -> 1.0
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

// Helper para aplicar redondeo a horas ya calculadas (si vienen de DB sin redondear)
const roundHoursValue = (hours: number): number => {
    const minutes = Math.round(hours * 60);
    return applyRoundingRule(minutes);
};

export default function StaffDashboard() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('staff');
    const [status, setStatus] = useState<WorkStatus>('idle');
    const [todayLog, setTodayLog] = useState<any>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00');
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

    // Estado para preferencia de stock
    const [preferStock, setPreferStock] = useState(false);

    useEffect(() => { initialize(); }, []);

    // Timer Logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'working' && todayLog?.clock_in) {
            const updateTimer = () => {
                const start = new Date(todayLog.clock_in).getTime();
                const now = new Date().getTime();
                const diff = now - start;
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
            };
            updateTimer(); interval = setInterval(updateTimer, 60000);
        } else if (status === 'finished' && todayLog?.total_hours) {
            // Mostrar horas redondeadas en el display final
            const rounded = roundHoursValue(todayLog.total_hours);
            const h = Math.floor(rounded);
            const m = Math.round((rounded - h) * 60);
            setElapsedTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        } else { setElapsedTime('00:00'); }
        return () => clearInterval(interval);
    }, [status, todayLog]);

    // --- HELPERS VISUALES ---
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
    const shouldShowPending = (val: number) => {
        const roundedVal = Math.round(val * 2) / 2;
        if (roundedVal < 0) return true; // Mostrar deuda siempre
        if (roundedVal > 0 && preferStock) return true; // Mostrar ahorro solo si prefiere stock
        return false;
    };

    async function initialize() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { console.error("No usuario"); return; }
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

            // CALCULAR NÚMERO DE SEMANA (ISO-8601)
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
            const DAILY_LIMIT = 8;

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

                    // APLICAR REDONDEO 20/40 TAMBIÉN AL MOSTRAR
                    hours = dayLog.total_hours ? roundHoursValue(dayLog.total_hours) : 0;

                    totalWeekHours += hours;
                    if (hours > DAILY_LIMIT) dayExtras = hours - DAILY_LIMIT;
                }
                daysStructure.push({
                    date: currentDay, dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i], dayNumber: currentDay.getDate(),
                    hasLog: !!dayLog, clockIn: clockInStr, clockOut: clockOutStr, totalHours: hours, extraHours: dayExtras, isToday: isToday
                });
            }
            setWeekDays(daysStructure);

            let weekDifference = 0;
            const isManager = profile?.role === 'manager';
            // Managers y empleados con salario fijo: todas las horas son extras
            if (isManager || isFixedSalary) {
                weekDifference = totalWeekHours;
            } else {
                weekDifference = totalWeekHours - contractHours;
            }

            const currentTotalBalance = historicalBalance + weekDifference;

            let payout = 0;
            if (currentTotalBalance > 0 && !userPreferStock) {
                payout = currentTotalBalance * overtimeRate;
            }

            setWeeklySummary({
                totalHours: totalWeekHours,
                hoursDifference: weekDifference,
                currentBalance: currentTotalBalance,
                estimatedPayout: payout,
                status: 'pending',
                startBalance: historicalBalance
            });

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

    // --- COMPONENTES VISUALES ---
    const IOSIconBoxed = ({ icon: Icon, img, color, label, onClick }: { icon?: any, img?: string, color: string, label: string | React.ReactNode, onClick?: () => void }) => (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center gap-1.5 w-full h-full",
                "bg-white rounded-2xl shadow-sm border border-zinc-100",
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

    if (loading) return <div className="p-8 text-white flex items-center gap-2"><div className="w-4 h-4 bg-white animate-pulse rounded-full"></div> Cargando...</div>;

    return (
        <div className="p-4 md:p-8 w-full max-w-7xl mx-auto space-y-6">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* COLUMNA IZQUIERDA (ANCHO 2) - Resumen y Fichaje */}
                <div className="lg:col-span-2 space-y-6">
                    {/* RESUMEN SEMANAL */}
                    <div className="bg-white rounded-[2rem] p-4 shadow-xl border border-gray-50">
                        <div className="flex justify-between items-end mb-2 px-1">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                                    {currentMonthName} {weekNumber ? `- SEM ${weekNumber}` : ''}
                                </span>
                            </div>
                            <Link href="/staff/history" className="text-xs font-bold text-[#5B8FB9] flex items-center gap-1 hover:underline">
                                Histórico <ArrowRight size={12} />
                            </Link>
                        </div>

                        <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
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
                                    <span className={`font-black text-[11px] md:text-xs leading-none ${weeklySummary.hoursDifference >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {formatBalance(weeklySummary.hoursDifference)}
                                    </span>
                                </div>
                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Balance</span>
                            </div>

                            <div className="flex flex-col items-center flex-1 border-r border-gray-100">
                                <div className="h-4 flex items-center">
                                    <span className={`font-black text-[11px] md:text-xs leading-none ${weeklySummary.startBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {formatBalance(weeklySummary.startBalance)}
                                    </span>
                                </div>
                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Pendiente</span>
                            </div>

                            <div className="flex flex-col items-center flex-1">
                                <div className="h-4 flex items-center">
                                    <span className="font-black text-[11px] md:text-xs leading-none text-green-600">
                                        {formatMoney(weeklySummary.estimatedPayout)}
                                    </span>
                                </div>
                                <span className="text-[7px] md:text-[8px] font-bold text-gray-400 uppercase leading-none mt-1">Importe</span>
                            </div>
                        </div>
                    </div>

                    {/* TARJETA DE FICHAJE (DEBAJO DEL RESUMEN) */}
                    <div className="bg-white rounded-[2rem] p-4 md:p-6 shadow-xl flex flex-col items-center text-center relative gap-3 md:gap-4 border border-gray-50">
                        <button
                            onClick={openConfirmation}
                            disabled={status === 'finished' || actionLoading}
                            className={cn(
                                "w-full h-16 rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 duration-150",
                                status === 'idle' && "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200",
                                status === 'working' && "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200",
                                status === 'finished' && "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-100"
                            )}>
                            {actionLoading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : (
                                <span className="text-xl font-black uppercase tracking-wider">
                                    {status === 'idle' ? 'ENTRADA' : (status === 'working' ? 'SALIDA' : 'FINALIZADO')}
                                </span>
                            )}
                        </button>
                        {status !== 'idle' && (
                            <div className="w-full h-12 md:h-16 bg-gray-900 rounded-2xl border-2 md:border-4 border-gray-700 shadow-inner flex flex-col items-center justify-center relative overflow-hidden">
                                <span className={`${digitalFont.className} text-3xl md:text-4xl text-red-600 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] z-10 leading-none tracking-widest`}>
                                    {elapsedTime}
                                </span>
                            </div>
                        )}
                        {status === 'idle' && (
                            <div className="w-full h-12 md:h-16 rounded-2xl bg-gray-50 border-2 border-gray-100 flex items-center justify-center">
                                <span className="text-[10px] text-gray-400 text-center uppercase font-bold tracking-tight">No has fichado hoy</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* COLUMNA DERECHA (ANCHO 1) - Horarios e Iconos */}
                <div className="lg:col-span-1 grid grid-cols-2 lg:block space-y-0 lg:space-y-6 gap-4">
                    {/* TARJETA DE HORARIOS (Nivel 1) */}
                    <div className="bg-white rounded-[2rem] p-4 lg:p-6 shadow-xl flex flex-col overflow-hidden relative border border-gray-50 min-h-[190px] lg:min-h-[220px]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-black text-gray-800 flex items-center gap-2 text-[10px] lg:text-sm uppercase tracking-wider">
                                <CalendarDays size={18} className="text-purple-500 shrink-0" /> <span className="truncate">Horarios</span>
                            </h3>
                            <Link href="/staff/schedule" className="text-[9px] lg:text-xs font-black text-purple-600 hover:underline uppercase tracking-widest bg-purple-50 px-2 lg:px-3 py-1 rounded-full shrink-0">Ver más</Link>
                        </div>
                        <div className="grid grid-cols-1 gap-3 lg:gap-4 flex-1">
                            {nextShifts.length === 0 ? (
                                <div className="flex items-center justify-center py-6 lg:py-10">
                                    <p className="text-[9px] lg:text-xs text-gray-400 text-center px-2 font-bold italic">No tienes turnos.</p>
                                </div>
                            ) : (
                                nextShifts.slice(0, 2).map((shift, idx) => (
                                    <div key={idx} className="flex items-center gap-2 lg:gap-4 p-2 lg:p-3 bg-gray-50/50 rounded-2xl border border-gray-100 hover:border-purple-200 transition-colors group">
                                        <div className="bg-white p-1.5 lg:p-2 rounded-xl text-gray-500 font-black text-[10px] lg:text-xs text-center min-w-[40px] lg:min-w-[50px] shadow-sm border border-gray-100 group-hover:border-purple-100 transition-colors">
                                            <span className="block text-[7px] lg:text-[8px] uppercase text-purple-400 mb-0.5">{shift.date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                            <span className="leading-none text-sm lg:text-lg text-gray-800">{shift.date.getDate()}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5 lg:gap-1 overflow-hidden">
                                            <span className="text-[8px] lg:text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{shift.activity || 'Turno'}</span>
                                            <div className="flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-sm font-black">
                                                <span className="text-green-600">{shift.startTime}</span>
                                                <span className="text-gray-400 font-light">-</span>
                                                <span className="text-red-500">{shift.endTime}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* FILA ÚNICA DE ICONOS ACCESO ACCESIBLES */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        <IOSIconBoxed img="/icons/change.png" color="bg-red-600" label="Cambiar" onClick={() => toast.info("Abriendo guía...")} />

                        <IOSIconBoxed
                            img="/icons/recipes.png"
                            color="bg-white"
                            label="Recetas"
                            onClick={() => router.push('/recipes')}
                        />

                        <IOSIconBoxed
                            img="/icons/information.png"
                            color="bg-blue-500"
                            label={<><span className="hidden sm:inline">Información</span><span className="inline sm:hidden">Info</span></>}
                            onClick={() => setActiveMenu('info')}
                        />
                        <IOSIconBoxed img="/icons/suppliers.png" color="bg-[#8B5E3C]" label="Pedidos" onClick={() => setActiveMenu('pedidos')} />

                        {/* --- BOTÓN CIERRE (SUPERVISORES) --- */}
                        {userRole === 'supervisor' && (
                            <IOSIconBoxed
                                icon={Calculator}
                                color="bg-[#36606F]"
                                label="Cierre"
                                onClick={() => setIsClosingModalOpen(true)}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* MODALES */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-black text-zinc-800 mb-6">{modalAction === 'in' ? 'Iniciar Turno' : 'Finalizar Turno'}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setShowModal(false)}
                                className="h-14 px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl active:scale-95 transition-all duration-150"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleClockAction}
                                className={cn(
                                    "h-14 px-4 text-white font-bold rounded-xl active:scale-95 transition-all duration-150 shadow-lg",
                                    modalAction === 'in' ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200"
                                )}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeMenu && (
                <div
                    className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in"
                    onClick={closeMenus}
                >
                    <div
                        className={`bg-white w-full ${infoSubMenu === 'contactos' ? 'max-w-md' : 'max-w-xs'} rounded-[2rem] p-6 shadow-2xl relative transition-all`}
                        onClick={(e) => e.stopPropagation()}
                    >

                        {infoSubMenu ? (
                            <button onClick={() => setInfoSubMenu(null)} className="absolute top-4 left-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                                <ArrowLeft size={16} />
                            </button>
                        ) : null}
                        <button onClick={closeMenus} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={16} />
                        </button>

                        <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2 justify-center mt-2">
                            {activeMenu === 'info' ? <Info size={24} className="text-blue-500" /> : <Package size={24} className="text-[#8B5E3C]" />}
                            {activeMenu === 'info'
                                ? (infoSubMenu === 'contactos' ? 'Contactos' : infoSubMenu === 'convenio' ? 'Convenio' : infoSubMenu === 'conducta' ? 'Código Conducta' : 'Información')
                                : 'Gestión Stock'}
                        </h3>

                        <div className="space-y-4">
                            {activeMenu === 'info' && !infoSubMenu && (
                                <>
                                    <button
                                        onClick={() => setInfoSubMenu('contactos')}
                                        className="w-full h-16 px-4 bg-zinc-50 hover:bg-zinc-100 rounded-xl flex items-center gap-4 transition-all active:scale-95 border border-zinc-100 group"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-400 group-hover:text-blue-500">
                                            <Phone size={20} />
                                        </div>
                                        <span className="font-bold text-zinc-600 group-hover:text-zinc-900">Contactos</span>
                                    </button>
                                    <button
                                        onClick={() => setInfoSubMenu('convenio')}
                                        className="w-full h-16 px-4 bg-zinc-50 hover:bg-zinc-100 rounded-xl flex items-center gap-4 transition-all active:scale-95 border border-zinc-100 group"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-400 group-hover:text-blue-500">
                                            <FileText size={20} />
                                        </div>
                                        <span className="font-bold text-zinc-600 group-hover:text-zinc-900">Convenio</span>
                                    </button>
                                    <button
                                        onClick={() => setInfoSubMenu('conducta')}
                                        className="w-full h-16 px-4 bg-zinc-50 hover:bg-zinc-100 rounded-xl flex items-center gap-4 transition-all active:scale-95 border border-zinc-100 group"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-400 group-hover:text-blue-500">
                                            <Scale size={20} />
                                        </div>
                                        <span className="font-bold text-zinc-600 group-hover:text-zinc-900">Código de Conducta</span>
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
                                            <div className="flex gap-2">
                                                <a href={`tel:${cleanPhone(c.phone)}`} className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors">
                                                    <Phone size={16} fill="currentColor" />
                                                </a>
                                                <a href={`https://wa.me/${cleanPhone(c.phone).replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                                                    <MessageCircle size={16} />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(infoSubMenu === 'convenio' || infoSubMenu === 'conducta') && (
                                <div className="h-[60vh] w-full bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                                    <iframe
                                        src={infoSubMenu === 'convenio' ? '/docs/convenio.pdf' : '/docs/codigo_conducta.pdf'}
                                        className="w-full h-full"
                                        title="Documento PDF"
                                    />
                                    <div className="bg-white p-2 text-center border-t border-gray-200">
                                        <a
                                            href={infoSubMenu === 'convenio' ? '/docs/convenio.pdf' : '/docs/codigo_conducta.pdf'}
                                            target="_blank"
                                            download
                                            className="text-xs font-bold text-blue-600 hover:underline"
                                        >
                                            Descargar PDF si no visualiza
                                        </a>
                                    </div>
                                </div>
                            )}

                            {activeMenu === 'pedidos' && (
                                <>
                                    <button className="w-full p-4 bg-gray-50 hover:bg-[#8B5E3C]/10 rounded-xl flex items-center gap-3 transition-colors group">
                                        <ShoppingCart size={20} className="text-gray-400 group-hover:text-[#8B5E3C]" />
                                        <span className="font-bold text-gray-600 group-hover:text-[#8B5E3C]">Realizar Pedido</span>
                                    </button>
                                    <button className="w-full p-4 bg-gray-50 hover:bg-[#8B5E3C]/10 rounded-xl flex items-center gap-3 transition-colors group">
                                        <Boxes size={20} className="text-gray-400 group-hover:text-[#8B5E3C]" />
                                        <span className="font-bold text-gray-600 group-hover:text-[#8B5E3C]">Inventario</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <CashClosingModal
                isOpen={isClosingModalOpen}
                onClose={() => setIsClosingModalOpen(false)}
                onSuccess={() => initialize()}
            />
        </div>
    );
}
