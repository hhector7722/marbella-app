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
    X
} from 'lucide-react';
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
    differenceInMinutes
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
                        employee_name: emp ? `${emp.first_name}` : '?'
                    };
                });
                setLogs(enrichedLogs);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }

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

    const saveChanges = async () => {
        if (!selectedDate) return;
        try {
            const promises = modalLogs.map(async (log) => {
                // BORRAR
                if (log.is_deleted && log.id) {
                    return supabase.from('time_logs').delete().eq('id', log.id);
                }
                if (log.is_deleted) return Promise.resolve();

                // PREPARAR DATOS
                const [inH, inM] = log.in_time.split(':').map(Number);
                const clockInDate = setMinutes(setHours(selectedDate, inH), inM);

                let clockOutDate = null;
                let totalHours = 0;

                if (log.out_time) {
                    const [outH, outM] = log.out_time.split(':').map(Number);
                    clockOutDate = setMinutes(setHours(selectedDate, outH), outM);

                    // APLICAR LÓGICA DE NEGOCIO (REDONDEO)
                    totalHours = calculateRoundedHours(clockInDate, clockOutDate);
                }

                const payload = {
                    user_id: log.user_id,
                    clock_in: clockInDate.toISOString(),
                    clock_out: clockOutDate ? clockOutDate.toISOString() : null,
                    total_hours: totalHours !== 0 ? totalHours : null,
                    event_type: log.event_type
                };

                // ACTUALIZAR O INSERTAR
                if (log.id) return supabase.from('time_logs').update(payload).eq('id', log.id);
                else return supabase.from('time_logs').insert([payload]);
            });

            await Promise.all(promises);
            await fetchData();
            setSelectedDate(null);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error("Error saving:", error);
            alert("Error al guardar.");
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col bg-[#5B8FB9] p-4 md:p-8 overflow-hidden text-gray-800">
            {/* CABECERA NAVEGACIÓN */}
            <div className="mb-6 flex items-center justify-center px-2">
                <div className="flex items-center gap-4 bg-white/20 px-6 py-2 rounded-2xl border border-white/20 backdrop-blur-md relative">
                    <button onClick={prevMonth} className="text-white hover:scale-110 transition-transform"><ChevronLeft size={20} /></button>

                    <div className="relative">
                        <h1
                            onClick={() => setShowMonthPicker(!showMonthPicker)}
                            className="text-lg font-black text-white capitalize min-w-[140px] text-center cursor-pointer hover:bg-white/10 px-4 py-1 rounded-xl transition-colors select-none"
                        >
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h1>

                        {showMonthPicker && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)}></div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-3xl shadow-2xl border border-gray-100 p-4 z-50 animate-in fade-in zoom-in duration-200">
                                    <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto no-scrollbar">
                                        {Array.from({ length: 24 }).map((_, i) => {
                                            const d = addMonths(startOfMonth(new Date()), i - 12);
                                            const isCurrent = isSameMonth(d, currentDate);
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { setCurrentDate(d); setShowMonthPicker(false); }}
                                                    className={cn(
                                                        "px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                                                        isCurrent
                                                            ? "bg-rose-500 text-white shadow-md shadow-rose-200"
                                                            : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                                                    )}
                                                >
                                                    {format(d, 'MMM yyyy', { locale: es })}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <button onClick={nextMonth} className="text-white hover:scale-110 transition-transform"><ChevronRight size={20} /></button>
                </div>
            </div>

            {/* BLOQUE CALENDARIO INTEGRADO */}
            <div className="flex-1 flex flex-col overflow-hidden rounded-[3rem] shadow-2xl border border-white/10">
                {/* DÍAS SEMANA ESTILO RESUMEN SEMANAL */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(day => (
                        <div key={day} className="border-r border-gray-100 last:border-r-0">
                            <div className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md">
                                <span className="text-[9px] font-bold text-white uppercase tracking-wider drop-shadow-sm">{day}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* CUADRÍCULA CALENDARIO (CELDAS BLANCAS) */}
                <div className="flex-1 grid grid-cols-7 gap-[1px] bg-white">
                    {calendarDays.map((day: Date) => {
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        let dayLogs = logs.filter(r => isSameDay(parseISO(r.clock_in), day));
                        const isToday = isSameDay(day, new Date());

                        // Aplicar filtro de fecha si existe
                        if (isFilterActive) {
                            const dayISO = format(day, 'yyyy-MM-dd');
                            if (filterStartDate && dayISO < filterStartDate) dayLogs = [];
                            if (filterEndDate && dayISO > filterEndDate) dayLogs = [];
                        }

                        return (
                            <div
                                key={day.toISOString()}
                                onClick={() => handleDayClick(day)}
                                className={cn(
                                    "relative p-2 flex flex-col cursor-pointer transition-all border-b border-r border-gray-100",
                                    !isCurrentMonth ? "bg-gray-50/50 opacity-40" : "bg-white hover:bg-blue-50/30 hover:z-10",
                                    isToday && "bg-emerald-50/30"
                                )}
                            >
                                <span className={`
                                    text-xs font-black mb-1.5 flex items-center justify-center w-6 h-6 rounded-lg
                                    ${isToday ? 'bg-emerald-500 text-white' : (isCurrentMonth ? 'text-gray-800' : 'text-gray-400')}
                                `}>
                                    {format(day, 'd')}
                                </span>

                                <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar w-full">
                                    {dayLogs.map((log) => {
                                        const initial = log.employee_name ? log.employee_name.charAt(0).toUpperCase() : '?';
                                        return (
                                            <div key={log.id} className="flex flex-col gap-0.5 w-full">
                                                <div className="w-full flex items-center gap-1.5 bg-emerald-50 border border-emerald-100/50 px-1.5 py-0.5 rounded-lg">
                                                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-black shrink-0">{initial}</div>
                                                    <span className="text-[9px] font-black text-emerald-700 truncate">{format(parseISO(log.clock_in), 'HH:mm')}</span>
                                                </div>
                                                {log.clock_out && (
                                                    <div className="w-full flex items-center gap-1.5 bg-rose-50 border border-rose-100/50 px-1.5 py-0.5 rounded-lg">
                                                        <div className="w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[8px] font-black shrink-0">{initial}</div>
                                                        <span className="text-[9px] font-black text-rose-600 truncate">{format(parseISO(log.clock_out), 'HH:mm')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MODAL COMPACTO */}
            {selectedDate && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={handleCloseModal}
                >
                    <div
                        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >

                        {/* Cabecera con Botones */}
                        <div className="bg-[#5B8FB9] text-white p-4 flex justify-between items-center shrink-0 shadow-md z-10">
                            <div>
                                <h3 className="text-lg font-bold leading-tight">Registros</h3>
                                <p className="text-blue-100 text-xs capitalize opacity-90">{format(selectedDate, 'EEEE, d MMMM', { locale: es })}</p>
                            </div>

                            {/* Botones de Acción */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleCloseModal}
                                    className="text-sm font-medium text-white/90 hover:text-white transition-colors px-2"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={saveChanges}
                                    disabled={!hasUnsavedChanges}
                                    className={`
                                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all
                                        ${hasUnsavedChanges
                                            ? 'bg-white text-[#5B8FB9] hover:bg-gray-50'
                                            : 'bg-white/20 text-white/50 cursor-not-allowed'}
                                    `}
                                >
                                    <Save size={16} />
                                    Confirmar
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo */}
                        <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                            {modalLogs.filter(l => !l.is_deleted).length === 0 && (
                                <div className="text-center py-6 opacity-50 border-2 border-dashed border-gray-300 rounded-xl mb-4">
                                    <p className="font-bold text-gray-400 text-sm">Sin registros</p>
                                </div>
                            )}

                            {modalLogs.filter(l => !l.is_deleted).length > 0 && (
                                <div className="flex px-2 mb-2 text-[8px] font-black text-gray-400 uppercase tracking-wider">
                                    <div className="flex-1">Trabajador</div>
                                    <div className="w-16 text-center">Entrada</div>
                                    <div className="w-16 text-center">Salida</div>
                                    <div className="w-8"></div>
                                </div>
                            )}

                            <div className="space-y-2">
                                {modalLogs.map((log, idx) => {
                                    if (log.is_deleted) return null;

                                    return (
                                        <div key={idx} className="bg-white p-1.5 rounded-xl border border-gray-200 flex items-center gap-1.5 shadow-sm hover:border-[#5B8FB9] transition-all">
                                            <div className="flex-1 min-w-0">
                                                <select
                                                    value={log.user_id}
                                                    onChange={(e) => updateLogField(idx, 'user_id', e.target.value)}
                                                    className="w-full bg-transparent font-black text-gray-700 text-[11px] focus:outline-none cursor-pointer truncate"
                                                    disabled={!!log.id}
                                                >
                                                    {employees.map(emp => (
                                                        <option key={emp.id} value={emp.id}>{emp.first_name}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={log.event_type}
                                                    onChange={(e) => updateLogField(idx, 'event_type', e.target.value)}
                                                    className="w-full bg-transparent text-[8px] font-black text-gray-400 uppercase focus:outline-none cursor-pointer"
                                                >
                                                    <option value="regular">Regular</option>
                                                    <option value="overtime">Extra</option>
                                                    <option value="weekend">Finde</option>
                                                    <option value="holiday">Festivo</option>
                                                    <option value="personal">Personal</option>
                                                    <option value="adjustment">Ajuste</option>
                                                </select>
                                            </div>

                                            <input
                                                type="time"
                                                value={log.in_time}
                                                onChange={(e) => updateLogField(idx, 'in_time', e.target.value)}
                                                className="w-16 text-center bg-gray-50 border border-gray-100 rounded-lg text-[11px] font-mono text-green-700 font-black focus:ring-1 focus:ring-green-500 focus:outline-none p-1 appearance-none [&::-webkit-calendar-picker-indicator]:hidden"
                                            />

                                            <input
                                                type="time"
                                                value={log.out_time}
                                                onChange={(e) => updateLogField(idx, 'out_time', e.target.value)}
                                                className="w-16 text-center bg-gray-50 border border-gray-100 rounded-lg text-[11px] font-mono text-red-600 font-black focus:ring-1 focus:ring-red-500 focus:outline-none p-1 appearance-none [&::-webkit-calendar-picker-indicator]:hidden"
                                            />

                                            <button
                                                onClick={() => deleteLog(idx)}
                                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                onClick={addNewLog}
                                className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 text-gray-400 font-bold rounded-xl hover:border-[#5B8FB9] hover:text-[#5B8FB9] hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <Plus size={18} /> Añadir Fichaje
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}