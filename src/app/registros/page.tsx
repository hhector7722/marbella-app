'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    ChevronLeft,
    ChevronRight,
    Trash2,
    Plus,
    ArrowLeft,
    ArrowRight as ArrowRightIcon,
    Save,
    Filter,
    X,
    Calendar as CalendarIcon,
    LayoutGrid,
    Coins,
    Landmark,
    ArrowLeftCircle,
    Check
} from 'lucide-react';
import { updateWeeklyWorkerConfig } from '@/app/actions/overtime';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from "@/lib/utils";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
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
const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'festivo', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'enfermedad', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'baja', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
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
    const isFilterActive = filterStartDate || filterEndDate;

    // --- CARGA ---
    useEffect(() => {
        fetchData();
    }, [currentDate]);

    async function fetchData() {
        setLoading(true);
        try {
            const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
            const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });

            const { data: staff } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, overtime_cost_per_hour')
                .order('first_name');

            if (staff) setEmployees(staff);

            const { data: timeLogs } = await supabase
                .from('time_logs')
                .select('*')
                .gte('clock_in', start.toISOString())
                .lte('clock_in', end.toISOString());

            if (timeLogs && staff) {
                const enrichedLogs = timeLogs.map(log => {
                    const emp = staff.find(e => e.id === log.user_id);
                    return {
                        ...log,
                        employee_name: emp ? `${emp.first_name}` : '?',
                        first_name: emp?.first_name || '',
                        last_name: emp?.last_name || ''
                    };
                });
                setLogs(enrichedLogs);
            }

            // Si estamos en modo ágil, cargamos la config semanal
            if (viewMode === 'agile' && selectedWorkerId) {
                const ws = format(agileWeekStart, 'yyyy-MM-dd');
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
                    .single();

                setWeeklyConfig({
                    contracted: snapshot?.contracted_hours_snapshot ?? profile?.contracted_hours_weekly ?? 40,
                    preferStock: snapshot?.prefer_stock_hours_override ?? profile?.prefer_stock_hours ?? false
                });

                // Cargar logs de la semana para el modo ágil
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
                            in_time: log ? format(parseISO(log.clock_in), 'HH:mm') : '09:00',
                            out_time: log?.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '',
                            event_type: log?.event_type || 'regular',
                            is_deleted: !log // Si no hay log, lo marcamos como "para crear" si se edita
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
            in_time: '09:00',
            out_time: '17:00',
            event_type: 'regular'
        };
        setModalLogs([...modalLogs, newLog]);
        setHasUnsavedChanges(true);
    };

    const saveAgileChanges = async () => {
        if (!selectedWorkerId) return;
        setIsSavingAgile(true);
        const ws = format(agileWeekStart, 'yyyy-MM-dd');

        try {
            // Filtramos logs que realmente han sido editados (tienen out_time o no son los default si eran nuevos)
            const logsToUpdate = modalLogs.filter(l => {
                const original = logs.find(old => old.id === l.id);
                if (!l.id && !l.out_time) return false; // No crear vacíos
                return true;
            }).map(l => ({
                ...l,
                date: format(l.date, 'yyyy-MM-dd')
            }));

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
            {/* --- CABECERA SUPERIOR (Navegación Mes / Selector Trabajador) --- */}
            <div className="mb-6 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Navegación Mes */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={prevMonth}
                            className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all active:scale-90 shadow-lg backdrop-blur-sm border border-white/10"
                        >
                            <ChevronLeft size={20} strokeWidth={3} />
                        </button>

                        <div className="relative">
                            <div className="bg-white/20 px-6 py-2 rounded-2xl border border-white/20 backdrop-blur-md">
                                <h1
                                    onClick={() => setShowMonthPicker(!showMonthPicker)}
                                    className="text-[10px] font-black text-white uppercase tracking-[0.2em] min-w-[120px] text-center cursor-pointer hover:text-white/80 transition-colors select-none italic"
                                >
                                    {format(currentDate, 'MMMM yyyy', { locale: es })}
                                </h1>
                            </div>
                        </div>

                        <button
                            onClick={nextMonth}
                            className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all active:scale-90 shadow-lg backdrop-blur-sm border border-white/10"
                        >
                            <ChevronRight size={20} strokeWidth={3} />
                        </button>
                    </div>

                    {/* Switch de Modo de Vista */}
                    <div className="flex bg-white/10 p-1 rounded-xl backdrop-blur-sm border border-white/10 shadow-inner">
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'calendar' ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                            )}
                        >
                            <LayoutGrid size={14} />
                            Calendario
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('agile');
                                if (!selectedWorkerId && employees.length > 0) setSelectedWorkerId(employees[0].id);
                            }}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'agile' ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                            )}
                        >
                            <CalendarIcon size={14} />
                            Gestión Ágil
                        </button>
                    </div>
                </div>

                {/* Sub-Header: Selector de Trabajador (Solo visible en Modo Ágil o como filtro) */}
                <div className="flex items-center gap-4 bg-white/10 p-2 rounded-2xl backdrop-blur-sm border border-white/10">
                    <div className="flex-1 flex items-center gap-3 px-3">
                        <Filter size={16} className="text-white/40" />
                        <select
                            value={selectedWorkerId}
                            onChange={(e) => setSelectedWorkerId(e.target.value)}
                            className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer w-full [&>option]:text-gray-800"
                        >
                            <option value="">Filtrar trabajador...</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                            ))}
                        </select>
                    </div>

                    {viewMode === 'agile' && selectedWorkerId && (
                        <div className="flex items-center gap-2 pr-2">
                            <button
                                onClick={() => setAgileWeekStart(subMonths(agileWeekStart, 0.25))} // Retroceder 1 semana (aprox)
                                className="p-2 text-white/60 hover:text-white"
                                onClickCapture={() => setAgileWeekStart(prev => new Date(prev.getTime() - 7 * 24 * 60 * 60 * 1000))}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full whitespace-nowrap">
                                Sem. {format(agileWeekStart, 'd MMM', { locale: es })}
                            </span>
                            <button
                                onClickCapture={() => setAgileWeekStart(prev => new Date(prev.getTime() + 7 * 24 * 60 * 60 * 1000))}
                                className="p-2 text-white/60 hover:text-white"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* --- CONTENIDO PRINCIPAL --- */}
            <div className={cn(
                "flex-1 flex flex-col min-h-0",
                viewMode === 'calendar' ? "bg-white rounded-xl shadow-2xl border border-white/10 overflow-hidden" : ""
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
                                                const initials = `${(log.first_name || '').charAt(0)}${(log.last_name || '').charAt(0)}`.toUpperCase();

                                                return (
                                                    <div
                                                        key={log.id}
                                                        className={cn(
                                                            "w-full flex items-center justify-between rounded-md border p-1",
                                                            log.event_type !== 'regular'
                                                                ? (eventConfig?.border || 'bg-gray-50')
                                                                : (log.clock_out ? "bg-emerald-50 border-emerald-100/50" : "bg-rose-50 border-rose-100/50 shadow-[0_0_10px_rgba(244,63,94,0.2)]")
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "text-[7px] font-black uppercase truncate",
                                                            log.event_type !== 'regular' ? "text-gray-500" : (log.clock_out ? "text-emerald-700" : "text-rose-700")
                                                        )}>
                                                            {log.event_type !== 'regular' ? eventConfig?.initial : initials}
                                                        </span>
                                                        <div className="flex flex-col items-end">
                                                            <span className={cn(
                                                                "text-[8px] font-mono font-bold leading-tight",
                                                                log.clock_out ? "text-emerald-600" : "text-rose-600"
                                                            )}>
                                                                {format(parseISO(log.clock_in), 'HH:mm')}
                                                            </span>
                                                            {log.clock_out && (
                                                                <span className="text-[8px] font-mono font-bold text-rose-500 leading-tight">
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
                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto no-scrollbar">
                        {/* Panel de Configuración Semanal */}
                        <div className="p-6 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-8">
                                {/* Bolsa vs Pago Switch */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-[8px] font-black text-white/60 uppercase tracking-widest pl-1">Modo Overtime</span>
                                    <div className="flex bg-white/10 p-1 rounded-2xl border border-white/20 shadow-inner">
                                        <button
                                            onClick={() => setWeeklyConfig(prev => ({ ...prev, preferStock: false }))}
                                            className={cn(
                                                "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black transition-all",
                                                !weeklyConfig.preferStock ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                                            )}
                                        >
                                            <Coins size={14} />
                                            NÓMINA
                                        </button>
                                        <button
                                            onClick={() => setWeeklyConfig(prev => ({ ...prev, preferStock: true }))}
                                            className={cn(
                                                "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black transition-all",
                                                weeklyConfig.preferStock ? "bg-white text-[#5B8FB9] shadow-md" : "text-white/60 hover:text-white"
                                            )}
                                        >
                                            <Landmark size={14} />
                                            BOLSA
                                        </button>
                                    </div>
                                </div>

                                {/* Horas Contrato */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-[8px] font-black text-white/60 uppercase tracking-widest pl-1">Horas Contrato</span>
                                    <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-2xl border border-white/20">
                                        <input
                                            type="number"
                                            value={weeklyConfig.contracted}
                                            onChange={(e) => setWeeklyConfig(prev => ({ ...prev, contracted: Number(e.target.value) }))}
                                            className="w-12 bg-transparent text-center font-black text-white text-lg focus:outline-none"
                                        />
                                        <span className="text-[10px] font-bold text-white/60">HORAS</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={saveAgileChanges}
                                disabled={isSavingAgile}
                                className={cn(
                                    "w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-sm font-black tracking-widest transition-all",
                                    "bg-white text-[#5B8FB9] shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50"
                                )}
                            >
                                {isSavingAgile ? <LoadingSpinner size="sm" /> : <Save size={20} />}
                                GUARDAR SEMANA
                            </button>
                        </div>

                        {/* Lista de Fichajes de la Semana */}
                        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            {modalLogs.map((log, idx) => {
                                const eventConfig = EVENT_TYPES.find(t => t.value === log.event_type);
                                const isRegular = log.event_type === 'regular';

                                return (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "bg-white p-3 rounded-2xl border transition-all hover:shadow-2xl hover:-translate-y-1 group",
                                            log.out_time ? "border-emerald-100 shadow-lg" : "border-white/20 shadow-xl"
                                        )}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                                                    {format(log.date, 'EEEE', { locale: es })}
                                                </span>
                                                <span className="text-[11px] font-black text-[#5B8FB9] uppercase">
                                                    {format(log.date, 'd MMM', { locale: es })}
                                                </span>
                                            </div>
                                            <select
                                                value={log.event_type}
                                                onChange={(e) => updateLogField(idx, 'event_type', e.target.value)}
                                                className="text-[8px] font-black bg-gray-50 px-1.5 py-1 rounded-lg border border-gray-100 focus:outline-none uppercase"
                                            >
                                                {EVENT_TYPES.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {isRegular ? (
                                            <div className="flex flex-col gap-2">
                                                <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                                                    <span className="text-[7px] font-black text-gray-400 uppercase block mb-0.5">Entrada</span>
                                                    <input
                                                        type="time"
                                                        value={log.in_time}
                                                        onChange={(e) => updateLogField(idx, 'in_time', e.target.value)}
                                                        className="w-full bg-transparent font-mono text-sm font-black text-emerald-600 focus:outline-none"
                                                    />
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                                                    <span className="text-[7px] font-black text-gray-400 uppercase block mb-0.5">Salida</span>
                                                    <input
                                                        type="time"
                                                        value={log.out_time}
                                                        onChange={(e) => updateLogField(idx, 'out_time', e.target.value)}
                                                        className="w-full bg-transparent font-mono text-sm font-black text-rose-500 focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={cn(
                                                "w-full py-4 rounded-xl flex flex-col items-center justify-center gap-1",
                                                eventConfig?.border || 'bg-gray-50'
                                            )}>
                                                <div className={cn("px-2 py-0.5 rounded-full text-white text-[8px] font-black shadow-sm", eventConfig?.color)}>
                                                    {eventConfig?.label}
                                                </div>
                                                <span className="text-[7px] font-bold text-gray-400">8H AUTO</span>
                                            </div>
                                        )}

                                        <div className="mt-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[8px] font-bold text-gray-300"># {idx + 1}</span>
                                            <button
                                                onClick={() => {
                                                    const newLogs = [...modalLogs];
                                                    newLogs[idx].out_time = '';
                                                    setModalLogs(newLogs);
                                                    setHasUnsavedChanges(true);
                                                }}
                                                className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

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
                                                const result = await updateWeeklyWorkerConfig(modalLogs[0]?.user_id, format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'), {
                                                    logs: modalLogs.map(l => ({ ...l, date: format(l.date, 'yyyy-MM-dd') }))
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
        </div>
    );
}
