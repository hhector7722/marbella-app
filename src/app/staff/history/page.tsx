'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, X, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { WeekCard } from './WeekCard';

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
                        <div className="p-4 bg-zinc-50/50">
                            {weeksData.map((week, idx) => (
                                <WeekCard
                                    key={week.weekNumber}
                                    week={week}
                                    idx={idx}
                                    filterMonth={filterMonth}
                                    filterYear={filterYear}
                                    onDayClick={setEditingDate}
                                />
                            ))}
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