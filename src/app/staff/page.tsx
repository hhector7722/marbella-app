'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    Play, Square, CheckCircle2, CalendarDays, AlertCircle, MapPin, ShieldAlert,
    Calendar, ArrowRight, Play as PlayIcon, ArrowLeft,
    Sandwich, Info, Package,
    Phone, FileText, Scale, ShoppingCart, Boxes, X, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Share_Tech_Mono } from 'next/font/google';
import { cn, formatDisplayValue } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';

const digitalFont = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

// --- DATA: CONTACTOS ---
const CONTACTS_DATA = [
    { name: 'Hielo Fenix', phone: '(3461) 028-8888' },
    { name: 'Servei Tècnic Cafetera', phone: '(3493) 293-6749' },
    { name: "Recollida d'Oli", phone: '(3493) 673-1722' },
    { name: 'Recepció Cem Marbella', phone: '(3493) 221-0676' },
    { name: 'Ramón', phone: '(3466) 023-1748' },
    { name: 'Héctor', phone: '(3464) 722-9309' },
];

// --- TYPES & CONFIG ---
type WorkStatus = 'idle' | 'working' | 'finished';

interface DailyLog {
    date: Date; dayName: string; dayNumber: number; hasLog: boolean; clockIn: string; clockOut: string; totalHours: number; extraHours: number; isToday: boolean;
}

interface WeeklySummary {
    totalHours: number;
    totalExtraHours: number;
    pendingHours: number;
    estimatedPayout: number;
    status: 'paid' | 'pending';
    startBalance: number;
}

interface ShiftMock {
    date: Date;
    startTime: string;
    endTime: string;
}

export default function StaffDashboard() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Usuario / Estado
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [userRole, setUserRole] = useState<'staff' | 'manager'>('staff');
    const [status, setStatus] = useState<WorkStatus>('idle');
    const [todayLog, setTodayLog] = useState<any>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00');

    // Datos REALES
    const [weekDays, setWeekDays] = useState<DailyLog[]>([]);
    const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>({
        totalHours: 0, totalExtraHours: 0, pendingHours: 0, estimatedPayout: 0, status: 'pending', startBalance: 0
    });
    const [nextShifts, setNextShifts] = useState<ShiftMock[]>([]);
    const [currentMonthName, setCurrentMonthName] = useState('');

    // Modales
    const [showModal, setShowModal] = useState(false);
    const [modalAction, setModalAction] = useState<'in' | 'out' | null>(null);

    // Estado Menús Emergentes
    const [activeMenu, setActiveMenu] = useState<'info' | 'pedidos' | null>(null);
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | 'convenio' | 'conducta' | null>(null);

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
            const h = Math.floor(todayLog.total_hours); const m = Math.round((todayLog.total_hours - h) * 60);
            setElapsedTime(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        } else { setElapsedTime('00:00'); }
        return () => clearInterval(interval);
    }, [status, todayLog]);

    // Helpers
    const formatValue = (val: number) => formatDisplayValue(Math.abs(val) < 0.1 ? 0 : Math.round(val));
    const formatMoney = (val: number) => val > 0 ? `${val.toFixed(0)}€` : " ";
    const cleanPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.startsWith('34') ? `+${cleaned}` : `+34${cleaned}`;
    };

    async function initialize() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { console.error("No usuario"); return; }
            setUserId(user.id);

            let contractHours = 40;
            let overtimeRate = 0;
            let historicalBalance = 0;
            let preferStock = false;

            const { data: profile } = await supabase.from('profiles')
                .select('first_name, role, contracted_hours_weekly, overtime_cost_per_hour, hours_balance, prefer_stock_hours')
                .eq('id', user.id)
                .single();

            if (profile) {
                setUserName(profile.first_name);
                setUserRole(profile.role === 'manager' ? 'manager' : 'staff');
                if (profile.contracted_hours_weekly !== null) contractHours = profile.contracted_hours_weekly;
                if (profile.overtime_cost_per_hour !== null) overtimeRate = profile.overtime_cost_per_hour;
                if (profile.hours_balance !== undefined && profile.hours_balance !== null) historicalBalance = profile.hours_balance;
                if (profile.prefer_stock_hours) preferStock = profile.prefer_stock_hours;
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
                    hours = dayLog.total_hours || 0;
                    totalWeekHours += hours;
                    if (hours > DAILY_LIMIT) dayExtras = hours - DAILY_LIMIT;
                }
                daysStructure.push({
                    date: currentDay, dayName: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'][i], dayNumber: currentDay.getDate(),
                    hasLog: !!dayLog, clockIn: clockInStr, clockOut: clockOutStr, totalHours: hours, extraHours: dayExtras, isToday: isToday
                });
            }
            setWeekDays(daysStructure);

            const weekDifference = totalWeekHours - contractHours;
            const projectedBalance = historicalBalance + weekDifference;
            let payout = 0;
            let balanceForDisplay = projectedBalance;
            if (projectedBalance > 0 && !preferStock) payout = projectedBalance * overtimeRate;

            setWeeklySummary({
                totalHours: totalWeekHours, totalExtraHours: Math.max(0, weekDifference), pendingHours: balanceForDisplay, estimatedPayout: payout, status: 'pending', startBalance: historicalBalance
            });

            const { data: realShifts } = await supabase
                .from('shifts')
                .select('start_time, end_time')
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
                    };
                });
                setNextShifts(formattedShifts);
            } else { setNextShifts([]); }

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
                const diffHours = (now.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

                const { data } = await supabase.from('time_logs')
                    .update({
                        clock_out: now.toISOString(),
                        total_hours: diffHours,
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

    // --- COMPONENTE VISUAL MEJORADO PARA LINK/BUTTON ---
    const FloatingIconSolid = ({ icon: Icon, img, colorClass, label, onClick, href }: { icon?: any, img?: string, colorClass: string, label: string, onClick?: () => void, href?: string }) => {
        const InnerContent = () => (
            <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full active:scale-95 transition-transform p-2 group hover:bg-gray-50/50 cursor-pointer">
                {img ? (
                    <Image
                        src={img}
                        alt={label}
                        width={48}
                        height={48}
                        priority={true}
                        className="w-12 h-12 object-contain transition-transform group-hover:scale-110"
                    />
                ) : (
                    <Icon size={36} className={`${colorClass} drop-shadow-sm transition-transform group-hover:scale-110`} fill="currentColor" stroke="white" strokeWidth={1.5} />
                )}
                <span className="text-[9px] font-bold text-gray-600 text-center leading-tight group-hover:text-gray-900">{label}</span>
            </div>
        );

        if (href) {
            return (
                <Link href={href} className="block w-full h-full">
                    <InnerContent />
                </Link>
            );
        }

        return (
            <button onClick={onClick} className="w-full h-full block">
                <InnerContent />
            </button>
        );
    };

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

            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white">Hola, {userName || 'Compañero'}</h2>
                    <p className="text-blue-100 text-xs md:text-sm opacity-80 min-h-[1rem]">
                        {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                {userRole === 'manager' && (
                    <Link href="/dashboard" className="bg-orange-500 hover:bg-orange-600 transition-colors px-3 py-1.5 rounded-lg border border-orange-400 shadow-lg flex items-center gap-1.5 cursor-pointer group">
                        <ShieldAlert size={14} className="text-white group-hover:animate-pulse" />
                        <div className="flex flex-col items-end leading-none">
                            <span className="text-[8px] text-orange-200 font-bold uppercase tracking-wider">VOLVER A</span>
                            <span className="text-[10px] font-black text-white uppercase tracking-wide">GESTIÓN</span>
                        </div>
                    </Link>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* COLUMNA IZQUIERDA */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2rem] p-5 shadow-xl">
                        <div className="flex justify-between items-center mb-1 px-1">
                            <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 uppercase tracking-wide">
                                <Calendar size={16} className="text-[#5B8FB9]" /> MIS REGISTROS
                            </h3>
                            <Link href="/staff/history" className="text-xs font-bold text-[#5B8FB9] flex items-center gap-1 hover:underline">
                                Histórico <ArrowRight size={12} />
                            </Link>
                        </div>
                        <div className="mb-3 px-1"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{currentMonthName}</span></div>

                        <div className="bg-white rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.3)] border border-gray-100 mb-4 relative z-0">
                            <div className="grid grid-cols-7 border-b border-gray-100">
                                {weekDays.map((day, i) => (
                                    <div key={i} className="flex flex-col border-r border-gray-100 last:border-r-0 min-h-[110px] bg-white relative">
                                        <div className="h-7 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md relative z-10">
                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{day.dayName}</span>
                                        </div>
                                        <div className="flex-1 p-1 flex flex-col items-center relative z-0 bg-white">
                                            <span className={`absolute top-1 right-1 text-[9px] font-bold ${day.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day.dayNumber}</span>
                                            <div className="flex-1 flex flex-col justify-center gap-1 w-full">
                                                {day.hasLog ? (
                                                    <>
                                                        <div className="flex items-center justify-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 shadow-sm"></div>
                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                        </div>
                                                        {day.clockOut && (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 shadow-sm"></div>
                                                                <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (<span className="text-gray-200 text-xs text-center">-</span>)}
                                            </div>
                                            <div className="w-full mt-auto space-y-0.5 pt-1">
                                                {day.hasLog && day.totalHours > 0 && (
                                                    <div className="flex justify-between items-end text-[8px] text-gray-400 border-t border-gray-50 pt-1">
                                                        <span>Horas</span><span className="font-bold text-gray-800">{day.totalHours.toFixed(0)}</span>
                                                    </div>
                                                )}
                                                {day.extraHours > 0 && (
                                                    <div className="flex justify-between items-end text-[8px] text-gray-400">
                                                        <span>Extras</span><span className="font-bold text-gray-800">{day.extraHours.toFixed(0)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-3 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
                            <div className="flex flex-col items-center px-4 border-r border-gray-200 shrink-0">
                                <span className="font-black text-gray-800 text-sm">{formatValue(weeklySummary.totalHours)}</span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Horas</span>
                            </div>
                            <div className="flex flex-col items-center px-4 border-r border-gray-200 shrink-0">
                                <span className="font-black text-sm text-blue-600">{formatValue(weeklySummary.totalExtraHours)}</span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Extras</span>
                            </div>
                            <div className="flex flex-col items-center px-4 border-r border-gray-200 shrink-0">
                                <span className={`font-black text-sm ${weeklySummary.pendingHours > 0 ? 'text-green-600' :
                                    weeklySummary.pendingHours < 0 ? 'text-red-500' : 'text-gray-400'
                                    }`}>
                                    {formatValue(weeklySummary.pendingHours)}
                                </span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Pendiente</span>
                            </div>
                            <div className="flex flex-col items-center px-4 shrink-0">
                                <span className="font-black text-sm text-green-600">{formatMoney(weeklySummary.estimatedPayout)}</span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">Importe</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA */}
                <div className="space-y-6">
                    <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col items-center text-center relative gap-4">
                        <button onClick={openConfirmation} disabled={status === 'finished' || actionLoading}
                            className={`w-full h-24 rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 duration-200
                                ${status === 'idle' ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-200' : ''}
                                ${status === 'working' ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-200' : ''}
                                ${status === 'finished' ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-gray-100' : ''}
                            `}>
                            {actionLoading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : (
                                <><span className="text-2xl font-black uppercase tracking-wider">
                                    {status === 'idle' ? 'FICHAR ENTRADA' : (status === 'working' ? 'FICHAR SALIDA' : 'JORNADA FINALIZADA')}
                                </span></>
                            )}
                        </button>
                        {status !== 'idle' && (
                            <div className="w-full bg-gray-900 rounded-2xl p-4 border-4 border-gray-700 shadow-inner flex flex-col items-center justify-center relative overflow-hidden">
                                <span className={`${digitalFont.className} text-6xl text-red-600 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] z-10 leading-none tracking-widest`}>
                                    {elapsedTime}
                                </span>
                            </div>
                        )}
                        {status === 'idle' && <div className="w-full py-4 rounded-2xl bg-gray-50 border-2 border-gray-100 flex items-center justify-center text-gray-800 text-xs">No has fichado hoy</div>}
                    </div>

                    <div className="grid grid-cols-2 gap-4 h-[200px]">
                        <div className="bg-white rounded-[2rem] p-4 shadow-xl h-full flex flex-col overflow-hidden relative">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-gray-700 flex items-center gap-2 text-xs">
                                    <CalendarDays size={16} className="text-purple-500" /> Horarios
                                </h3>
                                <Link href="/staff/schedule" className="text-[10px] font-bold text-purple-500 hover:underline">Ver más</Link>
                            </div>
                            <div className="space-y-2 flex-1 overflow-y-auto">
                                {nextShifts.length === 0 ? (
                                    <div className="h-full flex items-center justify-center">
                                        <p className="text-[10px] text-gray-400 text-center px-2">No tienes turnos asignados.</p>
                                    </div>
                                ) : (
                                    nextShifts.map((shift, idx) => (
                                        <div key={idx} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="bg-white p-1 rounded-lg text-gray-500 font-bold text-[10px] text-center min-w-[30px] shadow-sm">
                                                <span className="block text-[6px] uppercase">{shift.date.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3)}</span>
                                                <span className="leading-none text-gray-800">{shift.date.getDate()}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-black">
                                                <span className="text-green-600">{shift.startTime}</span>
                                                <span className="text-gray-800">-</span>
                                                <span className="text-red-500">{shift.endTime}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 flex-1">
                            <IOSIconBoxed img="/icons/change.png" color="bg-red-600" label="Cambiar" onClick={() => toast.info("Abriendo guía...")} />
                            <IOSIconBoxed img="/icons/recipes.png" color="bg-zinc-800" label="Receptes" onClick={() => router.push('/recipes')} />
                        </div>

                        <div className="grid grid-cols-2 gap-2 flex-1">
                            <IOSIconBoxed
                                img="/icons/information.png"
                                color="bg-blue-500"
                                label={<><span className="hidden sm:inline">Informació</span><span className="inline sm:hidden">Info</span></>}
                                onClick={() => setActiveMenu('info')}
                            />
                            <IOSIconBoxed img="/icons/suppliers.png" color="bg-[#8B5E3C]" label="Comandes" onClick={() => setActiveMenu('pedidos')} />
                        </div>
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
                        <h3 className="text-xl font-black text-gray-800 mb-4">{modalAction === 'in' ? 'Iniciar Turno' : 'Finalizar Turno'}</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setShowModal(false)} className="py-3 px-4 bg-gray-100 text-gray-600 font-bold rounded-xl">Cancelar</button>
                            <button onClick={handleClockAction} className="py-3 px-4 bg-blue-600 text-white font-bold rounded-xl">Confirmar</button>
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
                        className={`bg-white w-full ${infoSubMenu === 'contactos' ? 'max-w-md' : 'max-w-xs'} rounded-[2rem] p-6 shadow-2xl relative transition-all max-h-[85vh] flex flex-col`}
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

                        <div className="space-y-3 overflow-y-auto">
                            {activeMenu === 'info' && !infoSubMenu && (
                                <>
                                    <button onClick={() => setInfoSubMenu('contactos')} className="w-full p-4 bg-gray-50 hover:bg-blue-50 rounded-xl flex items-center gap-3 transition-colors group">
                                        <Phone size={20} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-bold text-gray-600 group-hover:text-blue-700">Contactos de Interés</span>
                                    </button>
                                    <button onClick={() => setInfoSubMenu('convenio')} className="w-full p-4 bg-gray-50 hover:bg-blue-50 rounded-xl flex items-center gap-3 transition-colors group">
                                        <FileText size={20} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-bold text-gray-600 group-hover:text-blue-700">Convenio</span>
                                    </button>
                                    <button onClick={() => setInfoSubMenu('conducta')} className="w-full p-4 bg-gray-50 hover:bg-blue-50 rounded-xl flex items-center gap-3 transition-colors group">
                                        <Scale size={20} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-bold text-gray-600 group-hover:text-blue-700">Código de Conducta</span>
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
                                                <a href={`tel:${cleanPhone(c.phone)}`} className="text-emerald-500 hover:text-emerald-600 transition-colors p-1 active:scale-95">
                                                    <Phone size={22} />
                                                </a>
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
        </div>
    );
}