'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Trash2, Plus, ArrowLeft, ArrowRight as ArrowRightIcon, Save, Filter, X, Calendar as CalendarIcon, LayoutGrid, Coins, Landmark, ArrowLeftCircle, Check } from 'lucide-react';
import { updateWeeklyWorkerConfig } from '@/app/actions/overtime';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { cn } from "@/lib/utils";
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { DaySummaryModal } from '@/components/modals/DaySummaryModal';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    subWeeks,
    addWeeks,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameMonth,
    isSameDay,
    parseISO,
    setHours,
    setMinutes,
    differenceInMinutes,
    addDays
} from 'date-fns';
import { es } from 'date-fns/locale';

// --- TIPOS ---
type Employee = {
    id: string;
    first_name: string;
    last_name: string;
    overtime_cost_per_hour: number;
};

type TimeLog = {
    id: string;
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    total_hours: number | null;
    event_type?: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    clock_out_show_no_registrada?: boolean;
};

type EditingLog = {
    id?: string;
    user_id: string;
    date: Date;
    in_time: string;
    out_time: string;
    event_type: string;
    is_deleted?: boolean;
    clock_out_show_no_registrada?: boolean;
};

// --- CONSTANTES ---
// NOTA: Los `value` han sido ajustados para cumplir con el CHECK CONSTRAINT de la BBDD
// (regular, overtime, weekend, holiday, personal, adjustment) y evitar que Postgres
// rechace subrepticiamente las inserciones. Las labels sí están en castellano.
const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'holiday', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'weekend', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'adjustment', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', initial: 'P', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
    { value: 'no_registered', label: 'No registrado', initial: '', showCross: true, color: 'bg-red-600 text-white', border: 'border-red-200 bg-red-50' },
];

// --- LÓGICA DE NEGOCIO: REDONDEO 20/40 ---
const calculateRoundedHours = (start: Date, end: Date): number => {
    const totalMinutes = differenceInMinutes(end, start);
    if (totalMinutes === 0) return 0;

    const isNeg = totalMinutes < 0;
    const absMinutes = Math.abs(totalMinutes);

    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;

    let fraction = 0;
    // Regla: 0-20min -> 0.0 | 21-50min -> 0.5 | 51-59min -> 1.0
    if (minutes <= 20) {
        fraction = 0;
    } else if (minutes <= 50) {
        fraction = 0.5;
    } else {
        fraction = 1.0;
    }

    const result = hours + fraction;
    return isNeg ? -result : result;
};

export default function RegistrosPage() {
    const supabase = createClient();
    const router = useRouter();

    // --- ESTADOS ---
    const [currentDate, setCurrentDate] = useState(new Date());
    const [logs, setLogs] = useState<TimeLog[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [modalLogs, setModalLogs] = useState<EditingLog[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [detailUserId, setDetailUserId] = useState<string | null>(null);

    // --- NUEVOS ESTADOS HÍBRIDOS ---
    const [viewMode, setViewMode] = useState<'calendar' | 'agile'>('calendar');
    const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
    const [agileWeekStart, setAgileWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [weeklyConfig, setWeeklyConfig] = useState<{ contracted: number; preferStock: boolean }>({ contracted: 40, preferStock: false });
    const [isSavingAgile, setIsSavingAgile] = useState(false);
    const [userRole, setUserRole] = useState<'manager' | 'supervisor' | 'staff'>('staff');

    // --- FILTROS ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const isFilterActive = filterStartDate || filterEndDate;

    // --- CARGA ---
    useEffect(() => {
        fetchData();
        fetchUserRole();
    }, [currentDate, viewMode, selectedWorkerId, agileWeekStart]);

    async function fetchUserRole() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
            if (data?.role) setUserRole(data.role as any);
        }
    }

    async function fetchData() {
        setLoading(true);
        try {
            // 1. Siempre cargar perfiles primero para asegurar enriquecimiento
            const { data: staff } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, overtime_cost_per_hour')
                .order('first_name');

            if (staff) {
                setEmployees(staff.filter((e: any) => {
                    const name = (e.first_name || '').trim().toLowerCase();
                    return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
                }));
            }

            // Helper para enriquecer logs con datos de empleado
            const enrichLogs = (rawLogs: any[]) => {
                if (!staff) return rawLogs;
                return rawLogs.map(log => {
                    const emp = staff.find(e => e.id === log.user_id);
                    return {
                        ...log,
                        employee_name: emp ? `${emp.first_name}` : '?',
                        first_name: emp?.first_name || '',
                        last_name: emp?.last_name || ''
                    };
                });
            };

            // 2. Cargar logs para el Calendario (Rango del mes visible)
            const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
            const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });

            const { data: timeLogs } = await supabase
                .from('time_logs')
                .select('*')
                .gte('clock_in', start.toISOString())
                .lte('clock_in', end.toISOString());

            if (timeLogs) {
                setLogs(enrichLogs(timeLogs));
            }

            // 3. Cargar configuración y logs específicos para el Modo Ágil
            if (viewMode === 'agile' && selectedWorkerId) {
                const ws = format(agileWeekStart, 'yyyy-MM-dd');

                // Configuración semanal (Bolsa/Contrato)
                const { data: snapshot } = await supabase
                    .from('weekly_snapshots')
                    .select('contracted_hours_snapshot, prefer_stock_hours_override')
                    .eq('user_id', selectedWorkerId)
                    .eq('week_start', ws)
                    .maybeSingle();

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('contracted_hours_weekly, prefer_stock_hours')
                    .eq('id', selectedWorkerId)
                    .maybeSingle();

                setWeeklyConfig({
                    contracted: snapshot?.contracted_hours_snapshot ?? profile?.contracted_hours_weekly ?? 40,
                    preferStock: snapshot?.prefer_stock_hours_override ?? profile?.prefer_stock_hours ?? false
                });

                // Logs de la semana para el editor inline
                const { data: weekLogs } = await supabase
                    .from('time_logs')
                    .select('*')
                    .eq('user_id', selectedWorkerId)
                    .gte('clock_in', ws)
                    .lte('clock_in', format(addDays(agileWeekStart, 6), 'yyyy-MM-dd') + 'T23:59:59Z');

                if (weekLogs) {
                    const agileLogs: EditingLog[] = eachDayOfInterval({
                        start: agileWeekStart,
                        end: addDays(agileWeekStart, 6)
                    }).map(day => {
                        const log = weekLogs.find(l => isSameDay(parseISO(l.clock_in), day));
                        return {
                            id: log?.id,
                            user_id: selectedWorkerId,
                            date: day,
                            in_time: log ? format(parseISO(log.clock_in), 'HH:mm') : '',
                            out_time: log?.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '',
                            event_type: log?.event_type || 'regular',
                            is_deleted: !log,
                            clock_out_show_no_registrada: log?.clock_out_show_no_registrada === true
                        };
                    });
                    setModalLogs(agileLogs);
                }
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }

    // Efecto para recargar modo ágil
    useEffect(() => {
        if (viewMode === 'agile' && selectedWorkerId) {
            fetchData();
        }
    }, [selectedWorkerId, agileWeekStart]);

    // --- CALENDARIO ---
    const calendarDays = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    });

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    // --- MODAL ---
    const handleDayClick = (day: Date) => {
        setSelectedDate(day);
        setHasUnsavedChanges(false);

        const dayLogsRaw = logs.filter(l => isSameDay(parseISO(l.clock_in), day));

        // Mapeamos para el resumen y para el estado interno
        const editableLogs: EditingLog[] = dayLogsRaw.map(l => ({
            id: l.id,
            user_id: l.user_id,
            date: day,
            in_time: format(parseISO(l.clock_in), 'HH:mm'),
            out_time: l.clock_out ? format(parseISO(l.clock_out), 'HH:mm') : '',
            event_type: l.event_type || 'regular',
            first_name: l.first_name,
            last_name: l.last_name,
            employee_name: l.employee_name,
            clock_out_show_no_registrada: l.clock_out_show_no_registrada === true
        }));

        setModalLogs(editableLogs);

        if (selectedWorkerId) {
            // Si hay un trabajador filtrado, vamos directo al detalle
            setDetailUserId(selectedWorkerId);
            setIsSummaryModalOpen(false);
        } else {
            // Si estamos en modo plantilla, mostramos el resumen de todos
            setDetailUserId(null);
            setIsSummaryModalOpen(true);
        }
    };

    const handleSelectLogFromSummary = (userId: string) => {
        setDetailUserId(userId);
        setIsSummaryModalOpen(false);
    };

    const handleCloseModal = () => {
        if (hasUnsavedChanges) {
            if (!confirm('Tienes cambios sin guardar. ¿Salir?')) return;
        }
        setSelectedDate(null);
        setModalLogs([]);
        setDetailUserId(null);
        setIsSummaryModalOpen(false);
        setHasUnsavedChanges(false);
    };

    const updateLogField = (index: number, field: keyof EditingLog, value: any) => {
        const newLogs = [...modalLogs];
        newLogs[index] = { ...newLogs[index], [field]: value };

        // Al editar cualquier campo, si el log estaba marcado para borrar o era un placeholder, lo revive
        newLogs[index].is_deleted = false;

        // Si cambia a un tipo especial, forzamos valores por defecto
        if (field === 'event_type' && value !== 'regular') {
            newLogs[index].in_time = '09:00';
            newLogs[index].out_time = '17:00';
        }

        setModalLogs(newLogs);
        setHasUnsavedChanges(true);
    };

    const deleteLog = (index: number) => {
        const newLogs = [...modalLogs];
        if (newLogs[index].id) {
            newLogs[index].is_deleted = true;
        } else {
            newLogs.splice(index, 1);
        }
        setModalLogs(newLogs);
        setHasUnsavedChanges(true);
    };

    const addNewLog = () => {
        if (!selectedDate || employees.length === 0) return;
        const newLog: EditingLog = {
            user_id: employees[0].id,
            date: selectedDate,
            in_time: '',
            out_time: '',
            event_type: 'regular',
            is_deleted: false
        };
        setModalLogs([...modalLogs, newLog]);
        setHasUnsavedChanges(true);
    };

    const saveAgileChanges = async () => {
        if (!selectedWorkerId) return;
        setIsSavingAgile(true);
        const ws = format(agileWeekStart, 'yyyy-MM-dd');

        try {
            // Filtramos logs que realmente han sido editados o son placeholders válidos
            const logsToUpdate = modalLogs.filter(l => {
                // Ignore completely deleted new entries
                if (!l.id && l.is_deleted) return false;
                // Ignore empty regular entries
                if (!l.id && !l.in_time && l.event_type === 'regular') return false;
                return true;
            }).map(l => {
                // Ensure proper valid date strings for server parsing passing local client offset
                let inTimeIso = '';
                let outTimeIso = '';

                if (l.in_time) {
                    const [inH, inM] = l.in_time.split(':').map(Number);
                    const cd = new Date(l.date);
                    cd.setHours(inH, inM, 0, 0);
                    inTimeIso = cd.toISOString();
                }

                if (l.out_time) {
                    const [outH, outM] = l.out_time.split(':').map(Number);
                    const cdo = new Date(l.date);
                    cdo.setHours(outH, outM, 0, 0);

                    // Si la hora de salida es estrictamente menor, probablemente cruzó medianoche (Ej: 20:00 -> 02:00)
                    if (l.in_time) {
                        const [inH] = l.in_time.split(':').map(Number);
                        if (outH < inH) cdo.setDate(cdo.getDate() + 1);
                    }
                    outTimeIso = cdo.toISOString();
                }

                return {
                    ...l,
                    date: format(l.date, 'yyyy-MM-dd'),
                    inTimeIso,
                    outTimeIso
                };
            });

            const result = await updateWeeklyWorkerConfig(selectedWorkerId, ws, {
                contractedHours: weeklyConfig.contracted,
                preferStock: weeklyConfig.preferStock,
                logs: logsToUpdate
            });

            if (result.success) {
                toast.success("Cambios semanales guardados");
                setHasUnsavedChanges(false);
                fetchData();
            } else {
                toast.error("Error: " + result.error);
            }
        } catch (error) {
            console.error(error);
            toast.error("Error crítico al guardar");
        } finally {
            setIsSavingAgile(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col bg-[#5B8FB9] p-4 md:p-6 lg:p-8 overflow-hidden text-gray-800">
            {/* CONTENEDOR VISTA DETALLE */}
            <div className="bg-white rounded-[20px] shadow-xl overflow-hidden flex flex-col flex-1 h-full min-h-0 antialiased animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto w-full">

                {/* CABECERA AZUL MES/AÑO (NAVEGACIÓN) */}
                <div className="bg-[#36606F] px-4 py-2.5 flex items-center justify-between min-h-[52px] shrink-0">
                    {/* Izquierda: Mes y Flechas */}
                    <div className="flex items-center gap-1">
                        <button onClick={prevMonth} className="text-white hover:text-white/70 transition-colors p-1.5 active:scale-90 opacity-80 hover:opacity-100">
                            <span className="text-lg font-bold font-mono">{'<'}</span>
                        </button>

                        <h2 className="text-[13px] md:text-sm font-black text-white uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-white/80 transition-colors select-none" onClick={() => setShowMonthPicker(!showMonthPicker)}>
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h2>

                        <button onClick={nextMonth} className="text-white hover:text-white/70 transition-colors p-1.5 active:scale-90 opacity-80 hover:opacity-100">
                            <span className="text-lg font-bold font-mono">{'>'}</span>
                        </button>
                    </div>

                    {/* Derecha: Selector de Personal + Switch Vistas */}
                    <div className="flex items-center gap-2">
                        {/* Switch Vistas */}
                        <div className="flex bg-black/20 p-1 rounded-xl shadow-inner h-8 shrink-0">
                            <button
                                onClick={() => setViewMode('calendar')}
                                className={cn(
                                    "flex items-center gap-1.5 px-2 md:px-3 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'calendar' ? "bg-white text-[#36606F] shadow-sm" : "text-white/60 hover:text-white"
                                )}
                            >
                                <LayoutGrid size={12} className="md:w-3.5 md:h-3.5" />
                                <span className="hidden sm:inline">Calendario</span>
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('agile');
                                    if (!selectedWorkerId && employees.length > 0) setSelectedWorkerId(employees[0].id);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-2 md:px-3 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'agile' ? "bg-white text-[#36606F] shadow-sm" : "text-white/60 hover:text-white"
                                )}
                            >
                                <CalendarIcon size={12} className="md:w-3.5 md:h-3.5" />
                                <span className="hidden sm:inline">Editar</span>
                            </button>
                        </div>

                        {/* Selector de Personal */}
                        <div className="relative">
                            <button
                                onClick={() => setIsStaffModalOpen(true)}
                                className={cn(
                                    "h-8 px-2 md:px-3 bg-white/10 hover:bg-white/20 rounded-lg border border-white/10 flex items-center justify-center text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 text-white shadow-sm",
                                    selectedWorkerId && "bg-white/20 border-white/30"
                                )}
                            >
                                <Filter size={12} className="opacity-70 hidden sm:block mr-1.5" />
                                <span className="max-w-[70px] md:max-w-xs truncate">
                                    {selectedWorkerId
                                        ? employees.find(e => e.id === selectedWorkerId)?.first_name
                                        : 'Plantilla'}
                                </span>
                                <ChevronDown size={10} className="ml-1.5 opacity-40 shrink-0" />
                            </button>
                            {selectedWorkerId && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedWorkerId(''); }}
                                    className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-30 border-2 border-[#36606F]"
                                >
                                    <X size={8} strokeWidth={4} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sub-Header Paginación Semanal y Guardar (Solo modo Editar) */}
                {viewMode === 'agile' && selectedWorkerId && (
                    <div className="bg-zinc-50 border-b border-gray-100 flex items-center justify-between p-2 w-full gap-2 shrink-0">
                        <div className="flex items-center gap-1 ml-2">
                            <button onClick={() => setAgileWeekStart(prev => startOfWeek(subWeeks(prev, 1), { weekStartsOn: 1 }))} className="p-1 px-1.5 text-zinc-400 hover:text-zinc-800 transition-colors">
                                <span className="text-lg font-bold font-mono">{'<'}</span>
                            </button>
                            <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest bg-zinc-200/50 px-3 py-1 rounded-full whitespace-nowrap">
                                Sem. {format(agileWeekStart, 'd MMM', { locale: es })}
                            </span>
                            <button onClick={() => setAgileWeekStart(prev => startOfWeek(addWeeks(prev, 1), { weekStartsOn: 1 }))} className="p-1 px-1.5 text-zinc-400 hover:text-zinc-800 transition-colors">
                                <span className="text-lg font-bold font-mono">{'>'}</span>
                            </button>
                        </div>

                        <button
                            onClick={saveAgileChanges}
                            disabled={isSavingAgile}
                            className={cn(
                                "flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-black tracking-widest transition-all mr-2",
                                "bg-emerald-600 text-white shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50"
                            )}
                        >
                            {isSavingAgile ? <LoadingSpinner size="sm" /> : <Save size={14} />}
                            GUARDAR
                        </button>
                    </div>
                )}

                {/* --- CONTENIDO PRINCIPAL --- */}
                <div className="flex-1 flex flex-col min-h-0 bg-white relative overflow-y-auto no-scrollbar">

                    {/* ALWAYS SHOW CALENDAR */}
                    <div className={cn(
                        "flex flex-col shrink-0 transition-opacity duration-300",
                        viewMode === 'agile' ? "opacity-50" : "opacity-100 flex-1 h-full"
                    )}>
                        <div className="grid grid-cols-7 border-b border-gray-100 sticky top-0 z-10">
                            {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(day => (
                                <div key={day} className="border-r border-gray-100 last:border-r-0">
                                    <div className="h-6 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-wider drop-shadow-sm">{day}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={cn(
                            "grid grid-cols-7 gap-[1px] bg-white",
                            viewMode === 'calendar' ? "flex-1" : "h-[300px] border-b border-gray-100"
                        )}>
                            {calendarDays.map((day: Date) => {
                                const isCurrentMonth = isSameMonth(day, currentDate);
                                let dayLogs = logs.filter(r => isSameDay(parseISO(r.clock_in), day));
                                if (selectedWorkerId) dayLogs = dayLogs.filter(l => l.user_id === selectedWorkerId);

                                const isToday = isSameDay(day, new Date());

                                return (
                                    <div
                                        key={day.toISOString()}
                                        onClick={() => handleDayClick(day)}
                                        className={cn(
                                            "relative p-0.5 sm:p-2 flex flex-col cursor-pointer transition-all border-b border-r border-gray-100 group",
                                            !isCurrentMonth ? "bg-gray-50/50 opacity-40" : "bg-white hover:bg-blue-50/30",
                                            isToday && "bg-emerald-50/30"
                                        )}
                                    >
                                        <div className="flex justify-between items-start mb-1.5">
                                            <span className={`
                                            text-xs font-black flex items-center justify-center w-6 h-6 rounded-lg transition-transform group-hover:scale-110
                                            ${isToday ? 'bg-emerald-500 text-white shadow-sm' : (isCurrentMonth ? 'text-gray-800' : 'text-gray-400')}
                                        `}>
                                                {format(day, 'd')}
                                            </span>
                                            {dayLogs.length > 0 && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                                            )}
                                        </div>

                                        <div className="flex-1 space-y-1 w-full overflow-hidden">
                                            {dayLogs.slice(0, 4).map((log) => {
                                                const eventConfig = EVENT_TYPES.find(t => t.value === log.event_type);
                                                const isRegular = !log.event_type || log.event_type === 'regular' || log.event_type === '';
                                                const getInitialsPair = () => {
                                                    let f = '?';
                                                    let l = '';

                                                    if (log.first_name && log.last_name) {
                                                        f = log.first_name.charAt(0).toUpperCase();
                                                        l = log.last_name.charAt(0).toUpperCase();
                                                    } else if (log.first_name) {
                                                        f = log.first_name.charAt(0).toUpperCase();
                                                    } else if (log.employee_name && log.employee_name !== '?') {
                                                        const parts = log.employee_name.trim().split(/\s+/);
                                                        f = parts[0].charAt(0).toUpperCase();
                                                        if (parts.length >= 2) l = parts[1].charAt(0).toUpperCase();
                                                    }
                                                    return { f, l };
                                                };

                                                const { f, l } = getInitialsPair();
                                                // Verde solo si hay salida y no está marcado "No registrada". Rojo (iniciales) si no hay salida o clock_out_show_no_registrada. Cruz solo para tipo no_registered.
                                                const isComplete = !!log.clock_out && !log.clock_out_show_no_registrada;

                                                return (
                                                    <div
                                                        key={log.id}
                                                        title={eventConfig?.label || 'Regular'}
                                                        className={cn(
                                                            "flex flex-row items-center gap-[2px] w-full min-w-0 mb-0.5 p-0 overflow-visible",
                                                            !isRegular && cn("rounded-md border p-[1px]", eventConfig?.border || 'bg-gray-50 border-gray-100')
                                                        )}
                                                    >
                                                        {/* Círculo: cruz roja solo para no_registered; resto = iniciales (verde completo, rojo incompleto o "No registrada") */}
                                                        <div className={cn(
                                                            "w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0",
                                                            eventConfig?.showCross ? "bg-red-600 text-white" : (isComplete ? "bg-emerald-600 text-white text-[6.5px] leading-none font-black" : "bg-rose-600 text-white text-[6.5px] leading-none font-black")
                                                        )}>
                                                            {eventConfig?.showCross ? <X size={8} strokeWidth={2.5} className="text-white" /> : `${f}${l}`}
                                                        </div>

                                                        {/* Horas o Inicial del Evento */}
                                                        <div className="flex items-center min-w-0 flex-1 whitespace-nowrap overflow-visible">
                                                            {isRegular ? (
                                                                <>
                                                                    <span className="text-emerald-600 text-[8.5px] sm:text-[10px] font-bold leading-none shrink-0 tracking-tighter">
                                                                        {format(parseISO(log.clock_in), 'H')}
                                                                    </span>
                                                                    <span className="text-gray-400 text-[8.5px] sm:text-[10px] leading-none shrink-0">-</span>
                                                                    {log.clock_out && (
                                                                        <span
                                                                            className="text-rose-600 text-[8.5px] sm:text-[10px] font-bold leading-none shrink-0 tracking-tighter"
                                                                            title={log.clock_out_show_no_registrada ? 'Salida no registrada (olvidó fichar)' : undefined}
                                                                        >
                                                                            {log.clock_out_show_no_registrada ? 'No registrada' : format(parseISO(log.clock_out), 'H')}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <span className={cn(
                                                                    "text-[9px] font-black leading-none px-1 rounded",
                                                                    eventConfig?.color || "text-gray-500"
                                                                )}>
                                                                    {eventConfig?.showCross ? '' : (eventConfig?.initial || '?')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {dayLogs.length > 4 && (
                                                <div className="text-[7px] font-bold text-gray-400 text-center">+ {dayLogs.length - 4} más</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* CONDITIONAL AGILE EDITOR (Week Selection) */}
                    {viewMode === 'agile' && selectedWorkerId && (
                        <div className="p-4 sm:p-6 bg-zinc-50 border-t border-gray-100 animate-in slide-in-from-bottom-4 duration-300">
                            {/* Panel de Configuración Semanal (Compacto) */}
                            <div className="p-3 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm w-full mb-4">
                                <div className="flex flex-row items-center justify-between sm:justify-start gap-4 sm:gap-8 w-full">

                                    {/* Bolsa vs Pago Switch */}
                                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest pl-1">Overtime</span>
                                        <div className="flex bg-zinc-100 p-1 rounded-2xl shadow-inner max-w-[140px]">
                                            <button
                                                onClick={() => setWeeklyConfig(prev => ({ ...prev, preferStock: false }))}
                                                className={cn(
                                                    "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black transition-all",
                                                    !weeklyConfig.preferStock ? "bg-white text-emerald-600 shadow-md" : "text-zinc-500 hover:text-zinc-800"
                                                )}
                                            >
                                                <Coins size={12} className="hidden sm:inline-block" />
                                                PAGO
                                            </button>
                                            <button
                                                onClick={() => setWeeklyConfig(prev => ({ ...prev, preferStock: true }))}
                                                className={cn(
                                                    "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black transition-all",
                                                    weeklyConfig.preferStock ? "bg-white text-blue-600 shadow-md" : "text-zinc-500 hover:text-zinc-800"
                                                )}
                                            >
                                                <Landmark size={12} className="hidden sm:inline-block" />
                                                BOLSA
                                            </button>
                                        </div>
                                    </div>

                                    {/* Horas Contrato */}
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest pl-1 text-right sm:text-left">Contrato</span>
                                        <div className="flex items-center gap-2 bg-zinc-50 px-3 py-1.5 rounded-2xl border border-zinc-200">
                                            <input
                                                type="number"
                                                value={weeklyConfig.contracted || ''}
                                                onChange={(e) => setWeeklyConfig(prev => ({ ...prev, contracted: Number(e.target.value) }))}
                                                className="w-10 sm:w-12 bg-transparent text-center font-black text-zinc-800 text-base focus:outline-none"
                                            />
                                            <span className="text-[9px] font-bold text-zinc-400">H</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Lista de Fichajes de la Semana (En una sola fila de 7 columnas) */}
                            <div className="bg-white rounded-2xl shadow-xl w-full mb-10 overflow-hidden overflow-x-auto no-scrollbar">
                                <div className="min-w-[340px] w-full grid grid-cols-7 divide-x divide-gray-100">
                                    {modalLogs.map((log, idx) => {
                                        const eventConfig = EVENT_TYPES.find(t => t.value === log.event_type);
                                        const isRegular = log.event_type === 'regular';
                                        const dayName = ['L', 'M', 'X', 'J', 'V', 'S', 'D'][idx];

                                        if (log.is_deleted) {
                                            return (
                                                <div key={idx} className="flex flex-col items-center bg-gray-50/30 min-h-[160px]">
                                                    <div className="w-full bg-[#D64D5D] py-1 flex flex-col items-center justify-center shadow-sm mb-auto">
                                                        <span className="text-[7.5px] sm:text-[9px] font-black uppercase text-white tracking-widest leading-none mb-0.5">{dayName}</span>
                                                        <span className="text-[10px] sm:text-[11px] font-black text-white leading-none">{format(log.date, 'd')}</span>
                                                    </div>

                                                    <button
                                                        onClick={() => updateLogField(idx, 'is_deleted', false)}
                                                        className="mt-auto mb-3 p-2 bg-white border border-gray-200 shadow-sm rounded-full text-[#5B8FB9] hover:bg-gray-50 active:scale-95 transition-transform"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={idx}
                                                className={cn(
                                                    "flex flex-col items-center transition-colors relative group min-h-[160px]",
                                                    log.out_time ? "bg-emerald-50/10" : "bg-white"
                                                )}
                                            >
                                                <div className="w-full bg-[#D64D5D] py-1 flex flex-col items-center justify-center shadow-sm mb-1.5">
                                                    <span className="text-[7.5px] sm:text-[9px] font-black uppercase text-white tracking-widest leading-none mb-0.5">{dayName}</span>
                                                    <span className="text-[10px] sm:text-[11px] font-black text-white leading-none">{format(log.date, 'd')}</span>
                                                </div>

                                                <div className="w-full relative flex items-center justify-center mb-1.5 px-1 sm:px-1.5">
                                                    <select
                                                        value={log.event_type}
                                                        onChange={(e) => updateLogField(idx, 'event_type', e.target.value)}
                                                        className={cn(
                                                            "w-full text-[8px] sm:text-[9.5px] font-black px-0.5 py-1.5 rounded-lg border focus:outline-none uppercase appearance-none text-center truncate",
                                                            isRegular ? "bg-gray-50 border-gray-200 text-gray-700" : (eventConfig?.color + " border-transparent")
                                                        )}
                                                        style={{ paddingRight: '4px' }}
                                                    >
                                                        {EVENT_TYPES.map(t => (
                                                            <option key={t.value} value={t.value} className="text-gray-900 bg-white">
                                                                {t.label.substring(0, 3)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {/* Pequeña flecha para indicar que es un select */}
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                                        <svg width="5" height="4" viewBox="0 0 6 4" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M3 4L0.401924 0.25L5.59808 0.25L3 4Z" fill="currentColor" />
                                                        </svg>
                                                    </div>
                                                </div>

                                                {isRegular ? (
                                                    <div className="flex flex-col gap-1 w-full px-1 sm:px-1.5 mb-2">
                                                        <input
                                                            type="time"
                                                            value={log.in_time}
                                                            onChange={(e) => updateLogField(idx, 'in_time', e.target.value)}
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-md px-0 py-1.5 font-mono text-[9.5px] sm:text-[11px] font-black focus:outline-none text-center text-emerald-600"
                                                        />
                                                        <input
                                                            type="time"
                                                            value={log.out_time}
                                                            onChange={(e) => updateLogField(idx, 'out_time', e.target.value)}
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-md px-0 py-1.5 font-mono text-[9.5px] sm:text-[11px] font-black focus:outline-none text-center text-rose-500"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className={cn(
                                                        "w-full py-1.5 rounded-md flex flex-col items-center justify-center gap-0.5 mb-2 px-1 sm:px-1.5 mt-1",
                                                        eventConfig?.border || 'bg-gray-50'
                                                    )}>
                                                        <span className="text-[9.5px] sm:text-[11px] font-black text-yellow-600 font-mono">09:00</span>
                                                        <span className="text-[9.5px] sm:text-[11px] font-black text-yellow-600 font-mono">17:00</span>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => deleteLog(idx)}
                                                    className="mt-auto mb-2 p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors active:scale-95"
                                                    title="Eliminar Registro"
                                                >
                                                    <Trash2 size={13} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div >

            {/* RESUMEN DIARIO */}
            <DaySummaryModal
                isOpen={isSummaryModalOpen}
                onClose={handleCloseModal}
                date={selectedDate}
                logs={modalLogs}
                onSelectLog={handleSelectLogFromSummary}
            />

            {/* MODAL DETALLE REFINADO */}
            <AttendanceDetailModal
                isOpen={!!selectedDate && !!detailUserId && viewMode === 'calendar'}
                onClose={handleCloseModal}
                date={selectedDate}
                userId={detailUserId}
                userRole={userRole}
                onSuccess={fetchData}
            />
            {
                isStaffModalOpen && (
                    <StaffSelectionModal
                        isOpen={isStaffModalOpen}
                        onClose={() => setIsStaffModalOpen(false)}
                        employees={employees}
                        onSelect={(emp) => setSelectedWorkerId(emp.id)}
                        title="Seleccionar Trabajador"
                    />
                )
            }
        </div >
    );
}
