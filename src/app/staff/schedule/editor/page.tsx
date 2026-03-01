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
            className={`absolute top-1 bottom-1 flex items-center group transition-all z-10 touch-none overflow-hidden rounded-full ${barClass} ${allowMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            style={{ left: `${leftPos}%`, width: `${width}%` }}
            onPointerDown={(e) => allowMove && handlePointerDown(e, 'move')}
        >
            {/* Tirador Izquierda */}
            <div className="absolute left-0 top-0 bottom-0 w-8 md:w-10 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'left')} />

            {/* Mini-barra Entrada */}
            <div className="absolute left-0 top-0 bottom-0 min-w-[28px] md:min-w-[36px] px-1 bg-emerald-500 flex items-center justify-center shrink-0 z-20 rounded-full">
                <span className="text-[7px] md:text-[8px] font-black text-white pointer-events-none select-none">
                    {shift.start.replace(':', '')}
                </span>
            </div>

            {/* Espacio Central */}
            <div className="flex-1 h-full" />

            {/* Mini-barra Salida */}
            <div className="absolute right-0 top-0 bottom-0 min-w-[28px] md:min-w-[36px] px-1 bg-red-600 flex items-center justify-center shrink-0 z-20 rounded-full">
                <span className="text-[7px] md:text-[8px] font-black text-white pointer-events-none select-none">
                    {shift.end.replace(':', '')}
                </span>
            </div>

            {/* Tirador Derecha */}
            <div className="absolute right-0 top-0 bottom-0 w-8 md:w-10 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'right')} />
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
        <div className="min-h-[100dvh] bg-[#5B8FB9] flex flex-col p-1.5 gap-1.5 animate-in fade-in duration-300">
            {/* CONTENEDOR SUPERIOR */}
            <div className="w-full bg-white rounded-[1.25rem] shadow-xl overflow-hidden flex flex-col relative shrink-0">
                {/* Cabecera Petróleo */}
                <div className="bg-[#36606F] px-4 py-2.5 flex justify-between items-center text-white">
                    <div className="flex items-center gap-2">
                        <Link href="/staff/schedule" className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 active:scale-95 transition-all text-white">
                            <ArrowLeft size={16} strokeWidth={3} />
                        </Link>
                        <div className="flex flex-col">
                            <h3 className="flex text-sm font-black uppercase tracking-wider leading-none">Horarios</h3>
                            <p className="text-white/40 text-[8px] font-black uppercase tracking-[0.2em] italic">Editor</p>
                        </div>
                    </div>
                </div>

                {/* Controles del Día */}
                <div className="p-2 gap-2 flex flex-col border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center justify-between gap-1 w-full">
                        <div className="flex items-center bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm flex-1">
                            <button onClick={handlePrevDay} className="w-8 h-9 flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors text-[#36606F] shrink-0 border-r border-gray-100">
                                <ChevronLeft size={18} strokeWidth={3} />
                            </button>
                            <button
                                onClick={() => setShowCalendarModal(true)}
                                className="flex-1 h-9 text-[#36606F] font-black text-[10px] md:text-sm uppercase tracking-wider flex items-center justify-center hover:bg-gray-50 transition-colors"
                            >
                                {date && format(new Date(date), "EEE d MMM", { locale: es }).replace('.', '')}
                            </button>
                            <button onClick={handleNextDay} className="w-8 h-9 flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors text-[#36606F] shrink-0 border-l border-gray-100">
                                <ChevronRight size={18} strokeWidth={3} />
                            </button>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => handleSave()}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white w-9 h-9 md:w-auto md:px-3 rounded-xl font-black flex items-center justify-center shadow-md active:scale-95 transition-transform"
                                title="Guardar"
                            >
                                <Save size={16} strokeWidth={3} /> <span className="hidden md:inline ml-1 text-xs">GUARDAR</span>
                            </button>
                            <button
                                onClick={handleSendNotifications}
                                className="bg-[#36606F] hover:bg-[#2a4d59] text-white w-9 h-9 md:w-auto md:px-3 rounded-xl font-black flex items-center justify-center shadow-md active:scale-95 transition-transform"
                                title="Enviar"
                            >
                                <Send size={16} strokeWidth={3} /> <span className="hidden md:inline ml-1 text-xs">ENVIAR</span>
                            </button>
                        </div>
                    </div>

                    {/* Controles de Actividad */}
                    <div className="flex items-center gap-1.5 w-full">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={activityIn}
                                onChange={(e) => { setActivityIn(e.target.value); setHasUnsavedChanges(true); }}
                                className="w-full bg-white border border-gray-200 h-9 rounded-xl px-2 font-black text-[10px] md:text-xs text-center focus:ring-2 focus:ring-emerald-400 outline-none shadow-sm text-gray-800 placeholder:text-gray-300 uppercase"
                                placeholder="INICIO/TURNO"
                            />
                        </div>
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={activityOut}
                                onChange={(e) => { setActivityOut(e.target.value); setHasUnsavedChanges(true); }}
                                className="w-full bg-white border border-gray-200 h-9 rounded-xl px-2 font-black text-[10px] md:text-xs text-center focus:ring-2 focus:ring-emerald-400 outline-none shadow-sm text-gray-800 placeholder:text-gray-300 uppercase"
                                placeholder="FIN/EVENTO"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* TABLA FLUIDA (100% WIDTH) */}
            <div className="w-full flex-1 bg-white rounded-[1.25rem] shadow-xl overflow-hidden flex flex-col relative border border-white/20">
                {/* CABECERA (ROJO) */}
                <div className="flex bg-[#D64D5D] text-white border-b border-[#D64D5D]/80 shrink-0 sticky top-0 z-20 w-full h-8">
                    {/* Botón Añadir */}
                    <div className="w-16 md:w-20 shrink-0 border-r border-[#D64D5D]/40 flex items-center justify-center relative">
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="absolute inset-0 m-auto w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                        >
                            <Plus size={14} strokeWidth={4} />
                        </button>
                    </div>
                    {/* Horas */}
                    <div className="flex-1 flex relative">
                        {hoursHeader.map((hour, i) => (
                            <div
                                key={hour}
                                className="flex-1 text-[7px] md:text-[9px] font-black flex items-center justify-center select-none border-r border-[#D64D5D]/40 last:border-r-0"
                            >
                                {hour}
                            </div>
                        ))}
                    </div>
                </div>

                {/* FILAS DE EMPLEADOS */}
                <div className="flex-1 w-full bg-white flex flex-col relative pb-20">
                    <div className="absolute inset-0 flex pl-16 md:pl-20 pointer-events-none">
                        {hoursHeader.map((_, i) => (
                            <div key={i} className="flex-1 border-r border-gray-50/80 last:border-r-0" />
                        ))}
                    </div>

                    {shifts.map((shift, idx) => (
                        <div key={shift.employeeId} className={`flex h-10 border-b border-gray-100 last:border-b-0 w-full transition-colors relative z-10 ${editingIndex === idx ? 'bg-blue-50/40' : 'bg-transparent'}`}>
                            {/* Celda Nombre y Eliminar */}
                            <div className="w-16 md:w-20 px-1 flex items-center gap-1 shrink-0 border-r border-gray-100 bg-white/90 z-20">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(idx); }}
                                    className="w-4 h-4 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors shrink-0 active:scale-90"
                                >
                                    <X size={10} strokeWidth={3} />
                                </button>
                                <span className={`font-black text-[7px] md:text-[8px] truncate uppercase tracking-tighter w-[calc(100%-1.25rem)] ${editingIndex === idx ? 'text-blue-600' : 'text-gray-800'}`}>
                                    {shift.name}
                                </span>
                            </div>

                            {/* Zona de Barras */}
                            <div
                                className="flex-1 relative cursor-pointer"
                                onClick={() => setEditingIndex(idx)}
                            >
                                {shift.active && (
                                    <ShiftBar
                                        shift={shift}
                                        onUpdate={(newS) => handleUpdateShift(idx, newS)}
                                        barClass={`${editingIndex === idx ? 'bg-[#36606F]/20' : 'bg-blue-100/40 hover:bg-blue-100/60'}`}
                                    />
                                )}
                            </div>
                        </div>
                    ))}

                    {shifts.length === 0 && (
                        <div className="w-full flex-1 flex flex-col items-center justify-center text-gray-200 mt-8 p-4 z-10">
                            <Users size={24} strokeWidth={1.5} className="opacity-30 mb-2" />
                            <p className="text-[9px] font-black uppercase tracking-widest italic opacity-40 text-center">Sin turnos asignados</p>
                        </div>
                    )}
                </div>

                {/* FILA DE TOTALES */}
                <div className="flex bg-[#5B8FB9] border-t border-[#5B8FB9] w-full mt-auto sticky bottom-0 z-30 h-6 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <div className="w-16 md:w-20 text-white text-[7px] font-black uppercase tracking-widest flex items-center justify-center shrink-0 border-r border-[#5B8FB9]/50 bg-[#36606F]/40">
                        TOTAL
                    </div>
                    <div className="flex-1 flex relative">
                        {totals.map((count, i) => (
                            <div
                                key={i}
                                className={`flex-1 flex items-center justify-center text-[7px] md:text-[8px] font-black border-r border-[#5B8FB9]/20 last:border-r-0 ${count > 0 ? 'text-white scale-110' : 'text-white/30'}`}
                            >
                                {count > 0 ? count : ''}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* BARRA DE EDICIÓN FLOTANTE */}
            {editingIndex !== null && shifts[editingIndex] && (
                <div className="fixed bottom-3 left-2 right-2 md:left-4 md:right-4 z-50 animate-in slide-in-from-bottom-5 duration-300">
                    <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 p-2 flex items-center gap-2 max-w-lg mx-auto">
                        <div className="flex-1 h-[2.5rem] relative bg-gray-50 rounded-xl overflow-hidden border border-gray-100 shadow-inner">
                            <ShiftBar
                                shift={shifts[editingIndex]}
                                onUpdate={(newShift) => handleUpdateShift(editingIndex, newShift)}
                                allowMove={false}
                                barClass="bg-[#36606F]"
                            />
                        </div>
                        <button
                            onClick={() => setEditingIndex(null)}
                            className="w-10 h-10 flex items-center justify-center bg-gray-900 hover:bg-black rounded-xl shadow-lg text-white transition-all active:scale-95 shrink-0"
                        >
                            <X size={18} strokeWidth={4} />
                        </button>
                    </div>
                </div>
            )}


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