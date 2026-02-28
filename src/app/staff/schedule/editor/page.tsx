'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X,
    Save,
    Plus,
    ArrowLeft,
    Users,
    ChevronLeft,
    ChevronRight,
    UserPlus,
    Trash2,
    Send,
    Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { sendScheduleNotifications } from '@/app/actions/notifications';

const START_HOUR = 7; // 7:00 AM
const END_HOUR = 23;  // 23:00 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SNAP_MINUTES = 30;

const timeToPercent = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return ((hours - START_HOUR) + (minutes / 60)) / TOTAL_HOURS * 100;
};

const percentToTime = (percent: number) => {
    const totalMinutes = (percent / 100) * TOTAL_HOURS * 60;
    const snappedMinutes = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const hours = Math.floor(snappedMinutes / 60) + START_HOUR;
    const mins = snappedMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

// --- COMPONENTE BARRA INTERACTIVA ---
const ShiftBar = ({
    shift,
    onUpdate,
    allowMove = true,
    barClass = "bg-emerald-100/50 hover:bg-emerald-200/60"
}: {
    shift: any,
    onUpdate: (s: any) => void,
    allowMove?: boolean,
    barClass?: string
}) => {
    const barRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState<'move' | 'left' | 'right' | null>(null);
    const [dragStartShift, setDragStartShift] = useState<{ start: string, end: string } | null>(null);
    const [dragStartPercent, setDragStartPercent] = useState<number>(0);

    const leftPos = timeToPercent(shift.start);
    const width = Math.max(timeToPercent(shift.end) - leftPos, 5);

    const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'left' | 'right') => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setIsDragging(true);
        setDragType(type);
        setDragStartShift({ start: shift.start, end: shift.end });

        const parentRect = (e.currentTarget.parentElement || e.currentTarget).getBoundingClientRect();
        const relativePercent = ((e.clientX - parentRect.left) / parentRect.width) * 100;
        setDragStartPercent(relativePercent);
    };

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!isDragging || !barRef.current || !dragStartShift) return;
            const parentRect = barRef.current.parentElement!.getBoundingClientRect();
            const currentPercent = ((e.clientX - parentRect.left) / parentRect.width) * 100;

            if (dragType === 'left') {
                const rawTime = percentToTime(Math.max(0, Math.min(currentPercent, 100)));
                if (timeToPercent(rawTime) < timeToPercent(shift.end)) onUpdate({ ...shift, start: rawTime });
            } else if (dragType === 'right') {
                const rawTime = percentToTime(Math.max(0, Math.min(currentPercent, 100)));
                if (timeToPercent(rawTime) > timeToPercent(shift.start)) onUpdate({ ...shift, end: rawTime });
            } else if (dragType === 'move' && allowMove) {
                const diffPercent = currentPercent - dragStartPercent;
                const startPct = timeToPercent(dragStartShift.start);
                const endPct = timeToPercent(dragStartShift.end);
                const duration = endPct - startPct;

                let newStartPct = Math.max(0, Math.min(startPct + diffPercent, 100 - duration));
                const newStart = percentToTime(newStartPct);
                const actualStartPct = timeToPercent(newStart);
                const newEnd = percentToTime(actualStartPct + duration);

                if (newStart !== shift.start) {
                    onUpdate({ ...shift, start: newStart, end: newEnd });
                }
            }
        };

        const handlePointerUp = () => { setIsDragging(false); setDragType(null); };

        if (isDragging) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging, dragType, shift, onUpdate, allowMove, dragStartPercent, dragStartShift]);

    return (
        <div
            ref={barRef}
            className={`absolute top-1.5 bottom-1.5 flex items-center group transition-all z-10 touch-none overflow-hidden rounded-full ${barClass} ${allowMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            style={{ left: `${leftPos}%`, width: `${width}%` }}
            onPointerDown={(e) => allowMove && handlePointerDown(e, 'move')}
        >
            {/* Tirador Izquierda (transparente) - Agrandado para táctil */}
            <div className="absolute left-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'left')} />

            {/* Mini-barra Entrada (Verde) */}
            <div className="absolute left-0 top-0 bottom-0 min-w-[48px] bg-emerald-500 flex items-center justify-center shrink-0 z-20 rounded-full">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2">
                    {shift.start}
                </span>
            </div>

            {/* Espacio Central */}
            <div className="flex-1 h-full" />

            {/* Mini-barra Salida (Roja) */}
            <div className="absolute right-0 top-0 bottom-0 min-w-[48px] bg-red-600 flex items-center justify-center shrink-0 z-20 rounded-full">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2">
                    {shift.end}
                </span>
            </div>

            {/* Tirador Derecha (transparente) - Agrandado para táctil */}
            <div className="absolute right-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'right')} />
        </div>
    );
};


// --- PÁGINA DE EDICIÓN ---
export default function ScheduleEditorPage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Estado del editor
    const [date, setDate] = useState('');
    const [activityIn, setActivityIn] = useState('');
    const [activityOut, setActivityOut] = useState('');
    const [shifts, setShifts] = useState<any[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

    // Estado para detectar cambios sin guardar
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Modales
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    useEffect(() => {
        // Obtener fecha de URL o usar hoy
        const params = new URLSearchParams(window.location.search);
        const urlDate = params.get('date');
        const targetDate = urlDate || new Date().toISOString().split('T')[0];
        setDate(targetDate);
        setCalendarDate(new Date(targetDate));
        fetchData(targetDate);
    }, []);

    const fetchData = async (targetDate: string) => {
        setLoading(true);
        try {
            // 1. Obtener todos los empleados
            const { data: employees } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .order('first_name');

            // 2. Obtener turnos existentes para esta fecha
            const startOfDay = `${targetDate}T00:00:00.000Z`;
            const endOfDay = `${targetDate}T23:59:59.999Z`;

            const { data: existingShifts } = await supabase
                .from('shifts')
                .select('*')
                .gte('start_time', startOfDay)
                .lte('start_time', endOfDay);

            // 3. Crear estructura con empleados que tienen turnos
            const shiftMap = new Map(existingShifts?.map(s => [s.user_id, s]) || []);

            const activeShifts = employees?.filter(emp => shiftMap.has(emp.id)).map(emp => {
                const existing = shiftMap.get(emp.id);
                return {
                    employeeId: emp.id,
                    name: emp.first_name,
                    start: new Date(existing!.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                    end: new Date(existing!.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                    active: true
                };
            }) || [];

            // Cargar actividad si existe
            if (existingShifts && existingShifts.length > 0 && existingShifts[0].activity) {
                const parts = existingShifts[0].activity.split(' - ');
                setActivityIn(parts[0] || '');
                setActivityOut(parts[1] || '');
            } else {
                setActivityIn('');
                setActivityOut('');
            }

            setShifts(activeShifts);
            setAvailableProfiles(employees || []);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateShift = (index: number, newShift: any) => {
        const updated = [...shifts];
        updated[index] = newShift;
        setShifts(updated);
        setHasUnsavedChanges(true);
    };

    const handleAddEmployee = (profileId: string) => {
        const profile = availableProfiles.find(p => p.id === profileId);
        if (!profile) return;

        // Verificar si ya está en la lista
        if (shifts.some(s => s.employeeId === profileId)) {
            toast.error('Este empleado ya está en el horario');
            return;
        }

        const newShift = {
            employeeId: profile.id,
            name: profile.first_name,
            start: '09:00',
            end: '17:00',
            active: true
        };

        setShifts([...shifts, newShift]);
        setHasUnsavedChanges(true);
        setEditingIndex(shifts.length);
        setShowAddModal(false);
    };

    const handleRemoveEmployee = (index: number) => {
        const updated = shifts.filter((_, i) => i !== index);
        setShifts(updated);
        setHasUnsavedChanges(true);
        if (editingIndex === index) {
            setEditingIndex(null);
        } else if (editingIndex !== null && editingIndex > index) {
            setEditingIndex(editingIndex - 1);
        }
    };

    const handleSave = async (silent = false) => {
        const activeShifts = shifts.filter(s => s.active);
        const combinedActivity = (activityIn || activityOut) ? `${activityIn}${activityOut ? ` - ${activityOut}` : ''}` : null;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                if (!silent) toast.error('No hay sesión activa');
                return false;
            }

            const shiftsToInsert = activeShifts.map(shift => {
                const startDateTime = new Date(`${date}T${shift.start}:00`);
                const endDateTime = new Date(`${date}T${shift.end}:00`);

                return {
                    user_id: shift.employeeId,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    activity: combinedActivity,
                    notes: null,
                    is_published: true
                };
            });

            // 1. Eliminar turnos existentes para esa fecha
            const startOfDay = `${date}T00:00:00.000Z`;
            const endOfDay = `${date}T23:59:59.999Z`;

            const { error: deleteError } = await supabase
                .from('shifts')
                .delete()
                .gte('start_time', startOfDay)
                .lte('start_time', endOfDay);

            if (deleteError) {
                console.error('Delete error:', deleteError);
                toast.error(`Error al limpiar turnos: ${deleteError.message}`);
                return;
            }

            // 2. Insertar los nuevos turnos (solo si hay)
            if (shiftsToInsert.length > 0) {
                const { error } = await supabase
                    .from('shifts')
                    .insert(shiftsToInsert);

                if (error) {
                    console.error('Supabase error:', error);
                    toast.error(`Error: ${error.message}`);
                    return;
                }
            }

            setHasUnsavedChanges(false);
            if (!silent) toast.success(activeShifts.length > 0 ? `${activeShifts.length} turno(s) guardado(s)` : 'Horario vaciado');
            if (!silent) router.push('/staff/schedule');
            return true;
        } catch (error: any) {
            console.error('Save error:', error);
            if (!silent) toast.error(error?.message || 'Error al guardar los turnos');
            return false;
        }
    };

    const handleSendNotifications = async () => {
        // 1. Guardar primero de forma silenciosa
        const saved = await handleSave(true);
        if (!saved) return;

        const userIds = shifts.filter(s => s.active).map(s => s.employeeId);
        if (userIds.length === 0) return;

        const dateFormatted = format(new Date(date), "EEEE d 'de' MMMM", { locale: es });

        const loadingToast = toast.loading('Enviando notificaciones...');

        try {
            const result = await sendScheduleNotifications(userIds, dateFormatted);
            toast.dismiss(loadingToast);

            if (result.success) {
                toast.success('Notificaciones enviadas con éxito');
                router.push('/staff/schedule');
            } else {
                toast.error(result.error || 'Error al enviar notificaciones');
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Error al enviar notificaciones');
        }
    };

    const handlePrevDay = () => {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() - 1);
        const dateStr = newDate.toISOString().split('T')[0];
        setDate(dateStr);
        setCalendarDate(newDate);
        fetchData(dateStr);
        router.push(`/staff/schedule/editor?date=${dateStr}`, { scroll: false });
    };

    const handleNextDay = () => {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() + 1);
        const dateStr = newDate.toISOString().split('T')[0];
        setDate(dateStr);
        setCalendarDate(newDate);
        fetchData(dateStr);
        router.push(`/staff/schedule/editor?date=${dateStr}`, { scroll: false });
    };

    // Generar días del calendario
    const generateCalendarDays = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days: (number | null)[] = [];
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(d);
        }
        return days;
    };

    const handleSelectCalendarDate = (day: number) => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (hasUnsavedChanges) {
            if (!confirm('Tienes cambios sin guardar. ¿Seguro que quieres cambiar de fecha?')) {
                return;
            }
        }

        setShowCalendarModal(false);
        setDate(dateStr);
        fetchData(dateStr);
    };

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
    const totals = hoursHeader.map(hour =>
        shifts.filter(s => s.active && hour >= parseInt(s.start.split(':')[0]) && hour < parseInt(s.end.split(':')[0])).length
    );

    if (loading) return <div className="min-h-screen bg-[#5B8FB9]"></div>;

    return (
        <div className="min-h-screen bg-[#5B8FB9] flex flex-col p-2 md:p-6 animate-in fade-in duration-500">
            <div className="max-w-6xl mx-auto w-full space-y-4">

                {/* CONTENEDOR PRINCIPAL: HORARIOS */}
                <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-white/20">

                    {/* CABECERA PETROLEO: HORARIOS */}
                    <div className="bg-[#36606F] px-8 py-5 flex justify-between items-center text-white shrink-0">
                        <div className="flex items-center gap-4">
                            <Link href="/staff/schedule" className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                <ArrowLeft size={20} className="text-white" strokeWidth={3} />
                            </Link>
                            <div className="flex flex-col">
                                <h3 className="text-lg font-black uppercase tracking-widest leading-none">Horarios</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Gestión de Turnos</p>
                            </div>
                        </div>
                    </div>

                    {/* CUERPO BLANCO */}
                    <div className="p-4 md:p-8 space-y-6">

                        {/* CABECERA DEL DÍA */}
                        <div className="bg-[#5B8FB9] rounded-2xl flex items-center justify-between p-3 md:p-4 text-white shadow-lg">
                            <div className="flex items-center gap-2 md:gap-4">
                                <button onClick={handlePrevDay} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all active:scale-90">
                                    <ChevronLeft size={24} strokeWidth={3} />
                                </button>
                                <button
                                    onClick={() => setShowCalendarModal(true)}
                                    className="px-4 py-2 bg-white rounded-xl text-[#36606F] font-black text-sm md:text-base capitalize flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-colors"
                                >
                                    <Calendar size={18} fill="currentColor" />
                                    {date && format(new Date(date), "EEEE d 'de' MMMM", { locale: es })}
                                </button>
                                <button onClick={handleNextDay} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all active:scale-90">
                                    <ChevronRight size={24} strokeWidth={3} />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleSave()}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 h-10 rounded-xl font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-[10px] md:text-xs uppercase tracking-widest"
                                >
                                    <Save size={16} strokeWidth={3} /> <span className="hidden sm:inline">GUARDAR</span>
                                </button>
                                <button
                                    onClick={handleSendNotifications}
                                    className="bg-white/10 hover:bg-white/20 text-white px-4 h-10 rounded-xl font-black flex items-center justify-center gap-2 shadow-inner transition-all active:scale-95 text-[10px] md:text-xs uppercase tracking-widest"
                                >
                                    <Send size={16} strokeWidth={3} /> <span className="hidden sm:inline">ENVIAR</span>
                                </button>
                            </div>
                        </div>

                        {/* CELDAS DE ACTIVIDAD */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Inicio Actividad</label>
                                <input
                                    type="text"
                                    value={activityIn}
                                    onChange={(e) => { setActivityIn(e.target.value); setHasUnsavedChanges(true); }}
                                    className="w-full bg-white border border-gray-200 h-12 rounded-xl px-4 font-black text-gray-800 text-lg outline-none focus:ring-4 focus:ring-blue-100 transition-all placeholder:text-gray-200"
                                    placeholder="00:00"
                                />
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Finalización Actividad</label>
                                <input
                                    type="text"
                                    value={activityOut}
                                    onChange={(e) => { setActivityOut(e.target.value); setHasUnsavedChanges(true); }}
                                    className="w-full bg-white border border-gray-200 h-12 rounded-xl px-4 font-black text-gray-800 text-lg outline-none focus:ring-4 focus:ring-blue-100 transition-all placeholder:text-gray-200"
                                    placeholder="00:00"
                                />
                            </div>
                        </div>

                        {/* TABLA DE HORARIOS */}
                        <div className="rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
                            <div className="w-full flex flex-col relative overflow-x-auto no-scrollbar">

                                {/* CABECERA DE LA TABLA */}
                                <div className="flex bg-red-500 text-white min-w-[600px]">
                                    <div className="w-24 md:w-40 flex items-center justify-center shrink-0 border-r border-red-400/30">
                                        <button
                                            onClick={() => setShowAddModal(true)}
                                            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-90 transition-transform hover:rotate-90 duration-300"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                                                <Plus size={20} strokeWidth={4} />
                                            </div>
                                        </button>
                                    </div>
                                    <div className="flex-1 relative h-10 flex">
                                        {hoursHeader.map((hour, i) => (
                                            <div
                                                key={hour}
                                                className="flex-1 text-[10px] font-black flex items-center justify-center select-none opacity-90 border-r border-red-400/30 last:border-r-0 uppercase tracking-tighter"
                                            >
                                                {hour}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* FILAS DE LOS EMPLEADOS */}
                                <div className="bg-white min-w-[600px]">
                                    {shifts.map((shift, idx) => (
                                        <div key={shift.employeeId} className={`flex h-12 border-b border-gray-100 last:border-b-0 transition-colors ${editingIndex === idx ? 'bg-blue-50/30' : ''}`}>
                                            {/* Columna Nombre con Eliminar */}
                                            <div className="w-24 md:w-40 px-3 flex items-center gap-2 shrink-0 border-r border-gray-100 overflow-hidden relative group">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(idx); }}
                                                    className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md active:scale-75 transition-all opacity-100 shrink-0"
                                                    title="Eliminar"
                                                >
                                                    <X size={12} strokeWidth={4} />
                                                </button>
                                                <span className={`font-black text-[10px] md:text-xs truncate uppercase tracking-tight transition-colors ${editingIndex === idx ? 'text-blue-600' : 'text-gray-800'}`}>
                                                    {shift.name}
                                                </span>
                                            </div>

                                            {/* Zona de Barras */}
                                            <div
                                                className="flex-1 relative cursor-pointer"
                                                onClick={() => setEditingIndex(idx)}
                                            >
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {hoursHeader.map((_, i) => (
                                                        <div key={i} className="flex-1 border-r border-gray-50/80 last:border-r-0" />
                                                    ))}
                                                </div>

                                                {shift.active && (
                                                    <ShiftBar
                                                        shift={shift}
                                                        onUpdate={(newS) => handleUpdateShift(idx, newS)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {shifts.length === 0 && (
                                        <div className="h-32 flex flex-col items-center justify-center text-gray-300 gap-2">
                                            <Users size={32} strokeWidth={1.5} className="opacity-20" />
                                            <p className="text-[10px] font-black uppercase tracking-widest italic opacity-50">Sin empleados programados</p>
                                        </div>
                                    )}

                                    {/* FILA DE TOTALES: BLANCO / NEGRO */}
                                    <div className="flex bg-white border-t border-gray-200">
                                        <div className="w-24 md:w-40 p-1 font-black text-gray-400 text-[10px] flex items-center justify-center uppercase tracking-widest shrink-0 border-r border-gray-100 bg-gray-50">
                                            TOTAL
                                        </div>
                                        <div className="flex-1 relative h-10 flex bg-white">
                                            {totals.map((count, i) => (
                                                <div
                                                    key={i}
                                                    className={`flex-1 flex items-center justify-center font-black text-[11px] transition-colors ${count > 0 ? 'text-gray-900 scale-110' : 'text-gray-200'}`}
                                                >
                                                    {count > 0 ? count : ''}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BARRA DE EDICIÓN FLOTANTE */}
                {editingIndex !== null && shifts[editingIndex] && (
                    <div className="fixed bottom-6 left-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-10 duration-500">
                        <div className="max-w-4xl mx-auto flex items-center gap-4 bg-white/90 backdrop-blur-xl p-3 rounded-3xl shadow-2xl border border-white/50">
                            <div className="flex-1 h-14 relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 shadow-inner">
                                <ShiftBar
                                    shift={shifts[editingIndex]}
                                    onUpdate={(newShift) => handleUpdateShift(editingIndex, newShift)}
                                    allowMove={false}
                                    barClass="bg-[#36606F] border border-white/10 shadow-lg"
                                />
                            </div>
                            <button
                                onClick={() => setEditingIndex(null)}
                                className="w-14 h-14 flex items-center justify-center bg-gray-900 rounded-2xl shadow-lg hover:bg-black text-white transition-all active:scale-90 shrink-0"
                            >
                                <X size={24} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                )}
            </div>


            {/* MODAL: Calendario */}
            {showCalendarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#5B8FB9] px-8 py-4 flex justify-between items-center text-white shrink-0">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-black uppercase tracking-wider leading-none">Calendario</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Seleccionar Fecha</p>
                            </div>
                            <button onClick={() => setShowCalendarModal(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <button
                                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                                className="p-2 hover:bg-gray-100 rounded-xl"
                            >
                                <ChevronLeft size={20} className="text-gray-600" />
                            </button>
                            <span className="font-bold text-gray-800 capitalize">
                                {calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                                className="p-2 hover:bg-gray-100 rounded-xl"
                            >
                                <ChevronRight size={20} className="text-gray-600" />
                            </button>
                        </div>

                        <div className="p-4 pt-0">
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {generateCalendarDays().map((day, i) => (
                                    <button
                                        key={i}
                                        onClick={() => day && handleSelectCalendarDate(day)}
                                        disabled={!day}
                                        className={`aspect-square flex items-center justify-center rounded-xl text-sm font-bold transition-all
                                            ${!day ? 'invisible' : 'hover:bg-red-100 hover:text-red-600 text-gray-700'}
                                            ${day === new Date().getDate() &&
                                                calendarDate.getMonth() === new Date().getMonth() &&
                                                calendarDate.getFullYear() === new Date().getFullYear()
                                                ? 'bg-red-500 text-white hover:bg-red-600 hover:text-white'
                                                : ''
                                            }
                                        `}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Añadir Empleado */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#5B8FB9] px-8 py-4 flex justify-between items-center text-white shrink-0">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-black uppercase tracking-wider leading-none">Añadir Staff</h3>
                                <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Plantilla Marbella</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-2 grid gap-1">
                            {availableProfiles
                                .filter(p => !shifts.some(s => s.employeeId === p.id))
                                .map(profile => (
                                    <button
                                        key={profile.id}
                                        onClick={() => handleAddEmployee(profile.id)}
                                        className="flex items-center gap-3 p-3 hover:bg-emerald-50 rounded-xl transition-all group text-left border border-transparent hover:border-emerald-100"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                            <UserPlus size={16} />
                                        </div>
                                        <span className="font-bold text-gray-700 text-sm">{profile.first_name}</span>
                                    </button>
                                ))
                            }
                            {availableProfiles.filter(p => !shifts.some(s => s.employeeId === p.id)).length === 0 && (
                                <div className="p-8 text-center text-gray-400 text-xs font-medium italic">
                                    Todos los empleados están en el horario
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}