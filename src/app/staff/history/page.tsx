'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, X, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import { format, startOfWeek, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';

// --- TIPOS ---
interface DayData {
    date: string;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    clock_out_show_no_registrada?: boolean;
    totalHours: number;
    extraHours: number;
    eventType: string;
    isToday: boolean;
}

interface WeekSummary {
    totalHours: number;
    startBalance: number;
    weeklyBalance: number;
    finalBalance: number;
    estimatedValue: number;
    isPaid: boolean;
    preferStock?: boolean;
}

interface WeekData {
    weekNumber: number;
    startDate: string;
    isCurrentWeek: boolean;
    days: DayData[];
    summary: WeekSummary;
}

// --- CONSTANTES ---
const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'adjustment', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', initial: 'P', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
    { value: 'no_registered', label: 'No registrado', initial: '', showCross: true, color: 'bg-red-600 text-white', border: 'border-red-200 bg-red-50' },
];

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

// --- HELPERS VISUALES ---
const fmtHours = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const rounded = Math.round(val * 2) / 2;
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val < 0 ? `-${str}` : str;
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const str = Math.abs(val).toFixed(0);
    return val < 0 ? `-${str}€` : `${str}€`;
};

const getMonthLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

type Employee = { id: string; first_name: string; last_name: string; avatar_url?: string | null };

type MonthlyTimesheetRpcDay = Omit<DayData, 'eventType' | 'clock_out_show_no_registrada'> & {
    eventType?: string;
    event_type?: string;
    clock_out_show_no_registrada?: boolean;
};
type MonthlyTimesheetRpcWeek = Omit<WeekData, 'days'> & { days: MonthlyTimesheetRpcDay[] };

export default function HistoryPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<WeekData[]>([]);

    // Auth & Rol
    const [userRole, setUserRole] = useState<string>('staff');
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth()); // 0-indexed

    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

    const [editingDate, setEditingDate] = useState<string | null>(null);

    const initUser = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);
        setSelectedEmployeeId(user.id);

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile) setUserRole(profile.role);

        if (profile?.role === 'manager') {
            const { data: emps } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url')
                .order('first_name');

            setEmployees((emps || []).filter((e: Employee) => {
                const name = (e.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            }));
        }
    }, [supabase]);

    useEffect(() => { void initUser(); }, [initUser]);
    useEffect(() => {
        if (currentUserId) fetchCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployeeId, currentUserId, filterYear, filterMonth]);

    // Modal Success Handler
    const handleModalSuccess = () => {
        fetchCalendar();
    };

    async function fetchCalendar() {
        setLoading(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;
            // p_month es 1-indexed en PostgreSQL
            const [rpcResult, logsResult, weeklyStatsResult] = await Promise.all([
                supabase.rpc('get_monthly_timesheet', {
                    p_user_id: targetUserId,
                    p_year: filterYear,
                    p_month: filterMonth + 1,
                }),
                // La RPC no devuelve clock_out_show_no_registrada: obtenerlo de time_logs y fusionar por día
                (() => {
                    const start = new Date(filterYear, filterMonth, 1);
                    const end = new Date(filterYear, filterMonth + 1, 0);
                    end.setHours(23, 59, 59, 999);
                    return supabase
                        .from('time_logs')
                        .select('clock_in, clock_out_show_no_registrada')
                        .eq('user_id', targetUserId)
                        .gte('clock_in', start.toISOString())
                        .lte('clock_in', end.toISOString());
                })(),
                // RPC semanal para saber si la semana está configurada como "guardar horas" (preferStock)
                (() => {
                    const monthStart = new Date(filterYear, filterMonth, 1);
                    const monthEnd = new Date(filterYear, filterMonth + 1, 0);
                    const startStr = format(monthStart, 'yyyy-MM-dd');
                    const endStr = format(monthEnd, 'yyyy-MM-dd');
                    return supabase.rpc('get_weekly_worker_stats', {
                        p_start_date: startStr,
                        p_end_date: endStr,
                        p_user_id: targetUserId,
                    });
                })(),
            ]);

            const { data, error } = rpcResult;
            if (error) {
                console.error('Error fetching calendar:', error);
                setWeeksData([]);
                return;
            }

            if (logsResult.error) {
                console.error('Error fetching clock_out_show_no_registrada:', logsResult.error);
                toast.warning('No se pudieron cargar los indicadores de salida no registrada.');
            }

            // Mapa semana -> preferStock (guardar horas esta semana)
            const preferStockByWeekStart: Record<string, boolean> = {};
            if (weeklyStatsResult && !weeklyStatsResult.error && weeklyStatsResult.data) {
                const weeksArray = (weeklyStatsResult.data as any).weeksResult || [];
                (weeksArray as any[]).forEach((week: any) => {
                    if (!week || !week.weekId || !Array.isArray(week.staff) || week.staff.length === 0) return;
                    const staffEntry = week.staff[0];
                    if (typeof staffEntry?.preferStock !== 'boolean') return;
                    const key: string = typeof week.weekId === 'string'
                        ? week.weekId.split('T')[0]
                        : String(week.weekId);
                    preferStockByWeekStart[key] = staffEntry.preferStock;
                });
            } else if (weeklyStatsResult?.error) {
                console.error('Error fetching weekly stats (preferStock):', weeklyStatsResult.error);
            }

            // Mapa fecha (YYYY-MM-DD) -> mostrar "No registrada"
            const noRegistradaByDate: Record<string, boolean> = {};
            (logsResult.data || []).forEach((log: { clock_in: string; clock_out_show_no_registrada?: boolean }) => {
                const dateKey = format(new Date(log.clock_in), 'yyyy-MM-dd');
                if (log.clock_out_show_no_registrada === true) noRegistradaByDate[dateKey] = true;
            });

            const formattedWeeks: WeekData[] = (((data as unknown) as MonthlyTimesheetRpcWeek[]) || []).map((week) => {
                const startDateKey = typeof (week as any).startDate === 'string'
                    ? (week as any).startDate.split('T')[0]
                    : String((week as any).startDate);
                const preferStockForWeek = preferStockByWeekStart[startDateKey];

                return {
                    ...week,
                    summary: {
                        ...week.summary,
                        preferStock: preferStockForWeek,
                    },
                    days: week.days.map((day) => ({
                        ...day,
                        eventType: day.eventType ?? day.event_type ?? 'regular',
                        clock_out_show_no_registrada: noRegistradaByDate[day.date] === true,
                    })),
                };
            });

            setWeeksData(formattedWeeks);
        } catch (err) {
            console.error('fetchCalendar error:', err);
        } finally {
            setLoading(false);
        }
    }

    const nextMonth = () => {
        if (filterMonth === 11) {
            setFilterMonth(0);
            setFilterYear(prev => prev + 1);
        } else {
            setFilterMonth(prev => prev + 1);
        }
    };

    const prevMonth = () => {
        if (filterMonth === 0) {
            setFilterMonth(11);
            setFilterYear(prev => prev - 1);
        } else {
            setFilterMonth(prev => prev - 1);
        }
    };

    const isManager = userRole === 'manager';
    const viewingOther = isManager && selectedEmployeeId && selectedEmployeeId !== currentUserId;
    const selectedEmployeeName = viewingOther
        ? employees.find(e => e.id === selectedEmployeeId)?.first_name || ''
        : '';

    return (
        <div className="pb-10">
            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">



                {/* ── CONTENIDO PRINCIPAL DEL CALENDARIO UNIFICADO ── */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

                    {/* CABECERA AZUL MES/AÑO (NAVEGACIÓN) */}
                    <div className="bg-[#36606F] rounded-t-2xl px-4 py-2.5 flex items-center justify-between min-h-[52px]">
                        {/* Izquierda: Mes y Flechas (Agrupado y Cercano) */}
                        <div className="flex items-center gap-1">
                            <button onClick={prevMonth} className="text-white hover:text-white/70 transition-colors p-1.5 active:scale-90 opacity-80 hover:opacity-100">
                                <span className="text-lg font-bold font-mono">{'<'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setPickerYear(filterYear);
                                    setShowMonthPicker(true);
                                }}
                                className="text-[13px] md:text-sm font-black text-white uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-white/80 transition-colors select-none"
                            >
                                {getMonthLabel(filterYear, filterMonth)}
                            </button>

                            <button onClick={nextMonth} className="text-white hover:text-white/70 transition-colors p-1.5 active:scale-90 opacity-80 hover:opacity-100">
                                <span className="text-lg font-bold font-mono">{'>'}</span>
                            </button>
                        </div>

                        {/* Derecha: Selector de Personal (Manager - Compacto) */}
                        <div className="flex justify-end">
                            {isManager && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowEmployeeDropdown(true)}
                                        className={cn(
                                            "h-8 px-3 bg-white/10 hover:bg-white/20 rounded-lg border border-white/10 flex items-center justify-center text-[8px] font-black uppercase tracking-widest transition-all active:scale-95 text-white shadow-sm",
                                            viewingOther && "bg-white/20 border-white/30"
                                        )}
                                    >
                                        <span className="max-w-[70px] truncate">{viewingOther ? selectedEmployeeName : "Plantilla"}</span>
                                        <ChevronDown size={10} className="ml-1.5 opacity-40 shrink-0" />
                                    </button>
                                    {viewingOther && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedEmployeeId(currentUserId); }}
                                            className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-30 border-2 border-[#36606F]"
                                        >
                                            <X size={8} strokeWidth={4} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <LoadingSpinner size="md" className="text-[#36606F]" />
                        </div>
                    ) : weeksData.length === 0 ? (
                        <div className="py-20 text-center text-zinc-400">
                            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-bold">No hay registros este mes</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-zinc-50/50 space-y-4">
                            {/* Cada semana con contorno y sombra propios */}
                            {weeksData.map((week, idx) => (
                                <div
                                    key={week.weekNumber}
                                    className="rounded-xl border border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden bg-white"
                                >
                                        {/* Cabecera de días (roja) SOLO una vez, al inicio del mes */}
                                        {idx === 0 && (
                                            <div className="rounded-t-2xl overflow-hidden">
                                                <div className="grid grid-cols-7 border-b border-gray-100">
                                                    {DAY_HEADERS.map((d) => (
                                                        <div
                                                            key={d}
                                                            className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                                                        >
                                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">
                                                                {d}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* FILA: Días (sin cabecera de LUN-DOM) */}
                                        <div className="grid grid-cols-7 border-b border-gray-100">
                                            {week.days.map((day, di) => {
                                                const eventConfig = EVENT_TYPES.find(t => t.value === day.eventType);
                                                const isSpecial = day.eventType && day.eventType !== 'regular' && eventConfig;

                                                // Día pertenece a otro mes (comparte semana pero se muestra por contexto)
                                                const isOtherMonth = day.date ? (() => {
                                                    const y = parseInt(day.date.slice(0, 4), 10);
                                                    const m = parseInt(day.date.slice(5, 7), 10) - 1;
                                                    return m !== filterMonth || y !== filterYear;
                                                })() : false;

                                                // Lógica Zero-Display
                                                const hFormatted = fmtHours(day.totalHours);
                                                const exFormatted = fmtHours(day.extraHours);

                                                return (
                                                    <div
                                                        key={di}
                                                        onClick={() => setEditingDate(day.date)}
                                                        className={cn(
                                                            "relative border-r border-gray-100 last:border-r-0 min-h-[85px] flex flex-col items-center p-1 pb-1 cursor-pointer transition-colors",
                                                            "bg-white hover:bg-zinc-50",
                                                            day.isToday && !isOtherMonth && "bg-blue-50/10"
                                                        )}
                                                    >
                                                        {/* Número de día superior derecha */}
                                                        <span
                                                            className={cn(
                                                                "absolute top-1 right-1 text-[9px] font-bold",
                                                                day.isToday && !isOtherMonth ? "text-blue-600" : (isOtherMonth ? "text-gray-400 opacity-50" : "text-gray-400")
                                                            )}
                                                        >
                                                            {day.dayNumber}
                                                        </span>

                                                        {/* Centro: evento especial o fichajes. Filas de altura fija para alinear círculos verde/rojo entre días. */}
                                                        <div className={cn(
                                                            "flex-1 flex flex-col items-stretch justify-center mt-3 w-full min-h-[52px]",
                                                            isOtherMonth && "opacity-45"
                                                        )}>
                                                            {isSpecial ? (
                                                                <>
                                                                    <div className="h-5 flex items-center justify-center shrink-0">
                                                                        <div className={cn("w-6 h-6 rounded-full shadow-sm flex items-center justify-center", eventConfig.color, isOtherMonth && "opacity-60")}>
                                                                            {eventConfig.showCross ? (
                                                                                <X size={14} strokeWidth={2.5} className="text-white" />
                                                                            ) : (
                                                                                <span className="text-[10px] font-black uppercase tracking-widest leading-none">{eventConfig.initial}</span>
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
                                                                                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isOtherMonth ? "bg-gray-400" : "bg-green-500")} />
                                                                                <span className={cn("text-[9px] font-mono leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockIn}</span>
                                                                            </>
                                                                        ) : <span className="text-[9px] text-transparent select-none">0</span>}
                                                                    </div>
                                                                    {/* Fila salida: misma altura en todos los días para alinear círculos rojos */}
                                                                    <div className="h-5 flex items-center justify-center gap-1 shrink-0">
                                                                        {day.hasLog && day.clockOut ? (
                                                                            day.clock_out_show_no_registrada ? (
                                                                                <span title="Salida no registrada (olvidó fichar)" className="inline-flex items-center justify-center">
                                                                                    <X size={14} strokeWidth={2.5} className={cn("shrink-0", isOtherMonth ? "text-gray-400" : "text-red-600")} />
                                                                                </span>
                                                                            ) : (
                                                                                <>
                                                                                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isOtherMonth ? "bg-gray-400" : "bg-red-500")} />
                                                                                    <span className={cn("text-[9px] font-mono leading-none", isOtherMonth ? "text-gray-400" : "text-gray-700")}>{day.clockOut}</span>
                                                                                </>
                                                                            )
                                                                        ) : (day.hasLog && !day.clockOut && day.isToday) ? (
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                                                                        ) : (
                                                                            <span className="text-[9px] text-transparent select-none">0</span>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Pie: H y Ex en miniatura, Zero-Display */}
                                                        {!isSpecial && (
                                                            <div className={cn(
                                                                "w-full space-y-0 mt-0.5 min-h-[20px]",
                                                                isOtherMonth && "opacity-45"
                                                            )}>
                                                                {day.hasLog && hFormatted ? (
                                                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                        <span className="ml-0.5">H</span>
                                                                        <span className={cn("font-bold pr-1", isOtherMonth ? "text-gray-400" : "text-gray-800")}>{hFormatted}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-3" />
                                                                )}
                                                                {exFormatted ? (
                                                                    <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                        <span className="ml-0.5">Ex</span>
                                                                        <span className={cn("font-bold pr-1", isOtherMonth ? "text-gray-400" : "text-gray-800")}>{exFormatted}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-3" />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* FILA: Resumen Semanal (integrada) */}
                                        <div className="bg-white border-t border-gray-100 flex items-center h-10 relative z-10">
                                            {/* Sello PAGADO centrado en altura en la fila */}
                                            {week.summary.isPaid && (
                                                <img
                                                    src="/sello/pagado.png"
                                                    alt="PAGADO"
                                                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-[64px] h-auto z-30 pointer-events-none md:w-[72px]"
                                                />
                                            )}
                                            {/* ZONA IZQUIERDA (Fija) */}
                                            <div className="w-24 pl-3 shrink-0 flex items-center h-full">
                                                <span className="font-black text-[11px] md:text-[12px] uppercase leading-none text-zinc-600 whitespace-nowrap">
                                                    SEMANA {week.weekNumber}
                                                </span>
                                            </div>

                                            {/* ZONA DERECHA (Grid de valores desplazado a la izquierda para el sello) */}
                                            <div className="flex-1 grid grid-cols-4 h-full relative z-20 pr-16 md:pr-24">
                                                {/* COL 1: HORAS */}
                                                <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                    <span className="text-[9px] font-black leading-none text-black block">
                                                        {week.summary.totalHours > 0.05 ? week.summary.totalHours.toFixed(1).replace('.0', '') : " "}
                                                    </span>
                                                    <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">HORAS</span>
                                                </div>

                                            {/* COL 2: PENDIENTE */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                {(() => {
                                                    const startBalance = week.summary.startBalance ?? 0;
                                                    const hasPending = Math.abs(startBalance) > 0.05;
                                                    const weekStartStr = typeof week.startDate === 'string' ? week.startDate.split('T')[0] : String(week.startDate);
                                                    const weekStartDate = parseISO(weekStartStr);
                                                    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                                                    const isFutureWeek = weekStartDate > currentWeekStart;
                                                    const showPending = hasPending && !isFutureWeek;
                                                    const colorClass = !showPending
                                                        ? "text-transparent"
                                                        : startBalance >= 0
                                                            ? "text-emerald-600"
                                                            : "text-red-600";
                                                    const text = showPending
                                                        ? `${Math.abs(startBalance).toFixed(1).replace('.0', '')}`
                                                        : " ";
                                                    return (
                                                        <span className={cn("text-[9px] font-black leading-none block", colorClass)}>
                                                            {text}
                                                        </span>
                                                    );
                                                })()}
                                                <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter text-center">PENDIENTES</span>
                                            </div>

                                                {/* COL 3: EXTRAS */}
                                                <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                    <span className="text-[9px] font-black leading-none text-black block">
                                                        {(week.summary.weeklyBalance ?? 0) > 0.05 ? Math.abs(week.summary.weeklyBalance).toFixed(1).replace('.0', '') : " "}
                                                    </span>
                                                    <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">EXTRAS</span>
                                                </div>

                                            {/* COL 4: IMPORTE */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span className="text-[9px] font-black leading-none text-emerald-600 block">
                                                    {(week.summary.estimatedValue ?? 0) > 0.05 && week.summary.preferStock !== true
                                                        ? fmtMoney(week.summary.estimatedValue)
                                                        : " "}
                                                </span>
                                                <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">IMPORTE</span>
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <AttendanceDetailModal
                    isOpen={!!editingDate}
                    onClose={() => setEditingDate(null)}
                    date={editingDate ? new Date(editingDate + 'T12:00:00') : null}
                    userId={selectedEmployeeId || currentUserId}
                    userRole={userRole}
                    onSuccess={handleModalSuccess}
                />

            </div>

            <StaffSelectionModal
                isOpen={showEmployeeDropdown}
                onClose={() => setShowEmployeeDropdown(false)}
                employees={employees}
                onSelect={(emp: { id: string; first_name: string; last_name: string }) => {
                    setSelectedEmployeeId(emp.id);
                    setShowEmployeeDropdown(false);
                }}
            />

            {showMonthPicker && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200" onClick={() => setShowMonthPicker(false)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Header Estilo Marbella (como Plantilla) */}
                        <div className="bg-[#36606F] px-8 py-6 flex justify-between items-center text-white shrink-0">
                            <h3 className="text-xl font-black uppercase tracking-wider leading-none">Seleccionar mes</h3>
                            <button onClick={() => setShowMonthPicker(false)} className="w-12 h-12 min-h-[48px] flex items-center justify-center bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white active:scale-90">
                                <X size={24} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto bg-white">
                            <div className="flex items-center justify-between mb-6 px-2">
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const date = new Date(pickerYear, i, 1);
                                    const isSelected = filterMonth === i && filterYear === pickerYear;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                setFilterMonth(i);
                                                setFilterYear(pickerYear);
                                                setShowMonthPicker(false);
                                            }}
                                            className={cn(
                                                "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 min-h-[48px]",
                                                isSelected ? "bg-[#36606F] border-[#36606F] text-white shadow-lg" : "bg-zinc-50 border-transparent text-zinc-400 hover:border-[#36606F]/20 hover:text-zinc-900 hover:bg-[#36606F]/5"
                                            )}
                                        >
                                            {format(date, 'MMM', { locale: es })}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-4 bg-zinc-50 border-t border-zinc-100 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowMonthPicker(false)}
                                className="w-full min-h-[48px] h-12 bg-zinc-200 text-zinc-600 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-300 transition-all active:scale-95"
                            >
                                Cerrar Ventana
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}