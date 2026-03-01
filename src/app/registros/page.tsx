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
};

type EditingLog = {
    id?: string;
    user_id: string;
    date: Date;
    in_time: string;
    out_time: string;
    event_type: string;
    is_deleted?: boolean;
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

    // --- NUEVOS ESTADOS HÍBRIDOS ---
    const [viewMode, setViewMode] = useState<'calendar' | 'agile'>('calendar');
    const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
    const [agileWeekStart, setAgileWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [weeklyConfig, setWeeklyConfig] = useState<{ contracted: number; preferStock: boolean }>({ contracted: 40, preferStock: false });
    const [isSavingAgile, setIsSavingAgile] = useState(false);

    // --- FILTROS ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
    const isFilterActive = filterStartDate || filterEndDate;

    // --- CARGA ---
    useEffect(() => {
        fetchData();
    }, [currentDate, viewMode, selectedWorkerId, agileWeekStart]);

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
                            is_deleted: !log
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

        const editableLogs: EditingLog[] = dayLogsRaw.map(l => ({
            id: l.id,
            user_id: l.user_id,
            date: day,
            in_time: format(parseISO(l.clock_in), 'HH:mm'),
            out_time: l.clock_out ? format(parseISO(l.clock_out), 'HH:mm') : '',
            event_type: l.event_type || 'regular'
        }));

        setModalLogs(editableLogs);
    };

    const handleCloseModal = () => {
        if (hasUnsavedChanges) {
            if (!confirm('Tienes cambios sin guardar. ¿Salir?')) return;
        }
        setSelectedDate(null);
        setModalLogs([]);
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
        <div className="min-h-screen w-full flex flex-col bg-[#5B8FB9] p-4 md:p-8 overflow-hidden text-gray-800">
            {/* --- CABECERA SUPERIOR (Navegación Mes / Selector Trabajador / Vistas) --- */}
            <div className="mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">

                {/* 1. Navegación Mes */}
                <div className="flex items-center gap-2 justify-center md:justify-start">
                    <button onClick={prevMonth} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all active:scale-90 shadow-lg backdrop-blur-sm border border-white/10 shrink-0">
                        <ChevronLeft size={20} strokeWidth={3} />
                    </button>
                    <div className="bg-white/20 px-4 py-2 rounded-2xl border border-white/20 backdrop-blur-md flex-1 text-center md:flex-none">
                        <h1 onClick={() => setShowMonthPicker(!showMonthPicker)} className="text-[10px] font-black text-white uppercase tracking-[0.2em] min-w-[100px] cursor-pointer hover:text-white/80 transition-colors select-none italic">
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h1>
                    </div>
                    <button onClick={nextMonth} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all active:scale-90 shadow-lg backdrop-blur-sm border border-white/10 shrink-0">
                        <ChevronRight size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* 2. Filtro Empleado + Switch de Vista (Misma Fila en móvil) */}
                <div className="flex items-center gap-2 w-full md:w-auto">

                    {/* Buscador Trabajador Compacto (Modificado a Modal) */}
                    <button
                        onClick={() => setIsStaffModalOpen(true)}
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-white/10 pl-3 pr-3 py-1.5 md:py-2 rounded-xl backdrop-blur-sm border border-white/10 h-10 hover:bg-white/20 transition-all active:scale-95"
                    >
                        <div className="flex items-center gap-2 truncate">
                            <Filter size={14} className="text-white/40 shrink-0" />
                            <span className="text-white font-bold text-xs md:text-sm truncate">
                                {selectedWorkerId
                                    ? employees.find(e => e.id === selectedWorkerId)?.first_name
                                    : 'Seleccionar...'}
                            </span>
                        </div>
                        <ChevronDown size={14} className="text-white/40 shrink-0" />
                    </button>

                    {/* Switch Vistas Compacto */}
                    <div className="flex bg-white/10 p-1 rounded-xl backdrop-blur-sm border border-white/10 shadow-inner h-10 shrink-0">
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={cn(
                                "flex items-center gap-1.5 px-3 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'calendar' ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                            )}
                        >
                            <LayoutGrid size={14} />
                            <span className="hidden sm:inline">Calendario</span>
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('agile');
                                if (!selectedWorkerId && employees.length > 0) setSelectedWorkerId(employees[0].id);
                            }}
                            className={cn(
                                "flex items-center gap-1.5 px-3 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'agile' ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                            )}
                        >
                            <CalendarIcon size={14} />
                            Editar
                        </button>
                    </div>
                </div>
            </div>

            {/* Sub-Header Paginación Semanal y Guardar (Solo modo Editar) */}
            {viewMode === 'agile' && selectedWorkerId && (
                <div className="mb-4 flex items-center justify-between bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/10 w-full md:w-fit md:ml-auto gap-2">
                    <div className="flex items-center gap-1">
                        <button onClick={() => setAgileWeekStart(prev => startOfWeek(subWeeks(prev, 1), { weekStartsOn: 1 }))} className="p-1 text-white/60 hover:text-white">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-[9px] font-bold text-white uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full whitespace-nowrap">
                            Sem. {format(agileWeekStart, 'd MMM', { locale: es })}
                        </span>
                        <button onClick={() => setAgileWeekStart(prev => startOfWeek(addWeeks(prev, 1), { weekStartsOn: 1 }))} className="p-1 text-white/60 hover:text-white">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <button
                        onClick={saveAgileChanges}
                        disabled={isSavingAgile}
                        className={cn(
                            "flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-black tracking-widest transition-all",
                            "bg-white text-[#5B8FB9] shadow-md hover:scale-105 active:scale-95 disabled:opacity-50"
                        )}
                    >
                        {isSavingAgile ? <LoadingSpinner size="sm" /> : <Save size={14} />}
                        GUARDAR
                    </button>
                </div>
            )}

            {/* --- CONTENIDO PRINCIPAL --- */}
            <div className={cn(
                "flex-1 flex flex-col min-h-0",
                viewMode === 'calendar' ? "bg-white rounded-xl shadow-2xl overflow-hidden" : ""
            )}>

                {viewMode === 'calendar' ? (
                    /* --- VISTA CALENDARIO GLOBAL --- */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="grid grid-cols-7 border-b border-gray-100">
                            {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(day => (
                                <div key={day} className="border-r border-gray-100 last:border-r-0">
                                    <div className="h-6 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-wider drop-shadow-sm">{day}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex-1 grid grid-cols-7 gap-[1px] bg-white overflow-y-auto no-scrollbar">
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
                                            "relative p-2 flex flex-col cursor-pointer transition-all border-b border-r border-gray-100 group",
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
                                                const getInitials = () => {
                                                    // 1. Prefer components
                                                    if (log.first_name && log.last_name) return `${log.first_name.charAt(0)}${log.last_name.charAt(0)}`.toUpperCase();
                                                    if (log.first_name) return log.first_name.charAt(0).toUpperCase();

                                                    // 2. Fallback to employee_name string
                                                    if (log.employee_name && log.employee_name !== '?') {
                                                        const parts = log.employee_name.trim().split(/\s+/);
                                                        if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
                                                        return parts[0].charAt(0).toUpperCase();
                                                    }
                                                    return '?';
                                                };
                                                const initials = getInitials();

                                                return (
                                                    <div
                                                        key={log.id}
                                                        title={eventConfig?.label || 'Regular'}
                                                        className={cn(
                                                            "w-full flex items-center justify-between rounded-md border p-0.5 sm:p-1 min-w-0 mb-0.5",
                                                            log.event_type !== 'regular'
                                                                ? (eventConfig?.border || 'bg-gray-50 border-gray-100')
                                                                : (log.clock_out ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.15)]")
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-1 min-w-0">
                                                            <span className={cn(
                                                                "text-[7px] sm:text-[8px] font-black uppercase truncate",
                                                                log.event_type !== 'regular' ? "text-gray-500" : (log.clock_out ? "text-emerald-700" : "text-rose-700")
                                                            )}>
                                                                {initials || '?'}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-end shrink-0">
                                                            <span className={cn(
                                                                "text-[7px] sm:text-[8px] font-mono font-bold leading-tight",
                                                                log.clock_out ? "text-emerald-600" : "text-rose-600"
                                                            )}>
                                                                {format(parseISO(log.clock_in), 'HH:mm')}
                                                            </span>
                                                            {log.clock_out && (
                                                                <span className="text-[7px] sm:text-[8px] font-mono font-bold text-rose-500 leading-tight">
                                                                    {format(parseISO(log.clock_out), 'HH:mm')}
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
                ) : (
                    /* --- VISTA GESTIÓN ÁGIL (Semanal) --- */
                    <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto no-scrollbar">
                        {/* Panel de Configuración Semanal (Compacto) */}
                        <div className="p-3 sm:p-5 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl w-full">
                            <div className="flex flex-row items-center justify-between sm:justify-start gap-4 sm:gap-8 w-full">

                                {/* Bolsa vs Pago Switch */}
                                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                    <span className="text-[8px] font-black text-white/60 uppercase tracking-widest pl-1">Overtime</span>
                                    <div className="flex bg-white/10 p-1 rounded-2xl border border-white/20 shadow-inner max-w-[140px]">
                                        <button
                                            onClick={() => setWeeklyConfig(prev => ({ ...prev, preferStock: false }))}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black transition-all",
                                                !weeklyConfig.preferStock ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                                            )}
                                        >
                                            <Coins size={12} className="hidden sm:inline-block" />
                                            PAGO
                                        </button>
                                        <button
                                            onClick={() => setWeeklyConfig(prev => ({ ...prev, preferStock: true }))}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black transition-all",
                                                weeklyConfig.preferStock ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                                            )}
                                        >
                                            <Landmark size={12} className="hidden sm:inline-block" />
                                            BOLSA
                                        </button>
                                    </div>
                                </div>

                                {/* Horas Contrato */}
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <span className="text-[8px] font-black text-white/60 uppercase tracking-widest pl-1 text-right sm:text-left">Contrato</span>
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-2xl border border-white/20">
                                        <input
                                            type="number"
                                            value={weeklyConfig.contracted || ''}
                                            onChange={(e) => setWeeklyConfig(prev => ({ ...prev, contracted: Number(e.target.value) }))}
                                            className="w-10 sm:w-12 bg-transparent text-center font-black text-white text-base focus:outline-none"
                                        />
                                        <span className="text-[9px] font-bold text-white/60">H</span>
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
            </div >

            {/* MODAL ANTIGUO (Se mantiene solo para cuando haces click en el calendario) */}
            {
                selectedDate && viewMode === 'calendar' && (
                    <div
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={handleCloseModal}
                    >
                        <div
                            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-[#5B8FB9] text-white p-4 flex justify-between items-center shrink-0 shadow-md z-10">
                                <div>
                                    <h3 className="text-lg font-bold leading-tight">Registros</h3>
                                    <p className="text-blue-100 text-xs capitalize opacity-90">{format(selectedDate, 'EEEE, d MMMM', { locale: es })}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={handleCloseModal} className="text-sm font-medium text-white/90 hover:text-white transition-colors px-2">Cancelar</button>
                                    <button
                                        onClick={async () => {
                                            // Mantenemos compatibilidad con saveAgileChanges pero adaptado para 1 solo día
                                            setIsSavingAgile(true);
                                            try {
                                                if (!selectedDate) return;

                                                const logsToUpdate = modalLogs.filter(l => {
                                                    if (!l.id && !l.in_time && l.event_type === 'regular' && !l.is_deleted) return false;
                                                    if (!l.id && l.is_deleted) return false;
                                                    return true;
                                                }).map(l => {
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

                                                const result = await updateWeeklyWorkerConfig(modalLogs[0]?.user_id, format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'), {
                                                    logs: logsToUpdate
                                                });
                                                if (result.success) {
                                                    toast.success("Registros guardados");
                                                    setSelectedDate(null);
                                                    fetchData();
                                                } else throw new Error(result.error);
                                            } catch (e: any) {
                                                toast.error("Error: " + e.message);
                                            } finally { setIsSavingAgile(false); }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white text-[#5B8FB9] shadow-sm active:scale-95"
                                    >
                                        Confirmar
                                    </button>
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                                {/* ... Resto del body del modal original ... */}
                                <div className="space-y-4">
                                    {modalLogs.map((log, idx) => (
                                        <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 flex items-center gap-3 shadow-sm">
                                            <select
                                                value={log.user_id}
                                                onChange={(e) => updateLogField(idx, 'user_id', e.target.value)}
                                                className="flex-1 bg-transparent font-black text-xs text-gray-700 focus:outline-none"
                                            >
                                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.first_name}</option>)}
                                            </select>
                                            <input type="time" value={log.in_time} onChange={(e) => updateLogField(idx, 'in_time', e.target.value)} className="w-20 text-center font-mono font-bold text-emerald-600 bg-emerald-50 rounded-lg p-1" />
                                            <input type="time" value={log.out_time} onChange={(e) => updateLogField(idx, 'out_time', e.target.value)} className="w-20 text-center font-mono font-bold text-rose-500 bg-rose-50 rounded-lg p-1" />
                                            <button onClick={() => deleteLog(idx)} className="text-gray-300 hover:text-rose-500"><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={addNewLog}
                                        className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-400 font-black rounded-xl hover:border-[#5B8FB9] hover:text-[#5B8FB9] flex items-center justify-center gap-2"
                                    >
                                        <Plus size={20} /> Añadir Fichaje
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
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
