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
    Send
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
    const [activity, setActivity] = useState('');
    const [shifts, setShifts] = useState<any[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

    // Estado para detectar cambios sin guardar
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Horas por defecto (celdas vacías por defecto)
    const [defaultStart, setDefaultStart] = useState('');
    const [defaultEnd, setDefaultEnd] = useState('');
    const [participantsCount, setParticipantsCount] = useState<string>('');

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
                setActivity(existingShifts[0].activity);
            }

            setShifts(activeShifts);
            setAvailableProfiles((employees || []).filter((e: any) => {
                const name = (e.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            }));
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
            start: defaultStart || '09:00',
            end: defaultEnd || '17:00',
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

        if (activeShifts.length === 0) {
            if (!silent) toast.error('No hay turnos activos para guardar');
            return false;
        }

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
                    activity: activity || null,
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

            // 2. Insertar los nuevos turnos
            const { error } = await supabase
                .from('shifts')
                .insert(shiftsToInsert);

            if (error) {
                console.error('Supabase error:', error);
                toast.error(`Error: ${error.message}`);
                return;
            }

            setHasUnsavedChanges(false);
            if (!silent) toast.success(`${activeShifts.length} turno(s) guardado(s)`);
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
        <div className="min-h-screen w-full flex flex-col bg-[#5B8FB9] p-4 md:p-6 lg:p-8 overflow-hidden text-gray-800">
            {/* CONTENEDOR VISTA DETALLE */}
            <div className="bg-white rounded-[20px] shadow-xl overflow-hidden flex flex-col flex-1 h-full min-h-0 antialiased animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto w-full">

                {/* CABECERA AZUL PETRÓLEO (NAVEGACIÓN) */}
                <div className="bg-[#36606F] px-4 py-2.5 flex items-center justify-between min-h-[52px] shrink-0">
                    {/* Izquierda: Fecha Justificada */}
                    <button
                        onClick={() => setShowCalendarModal(true)}
                        className="flex items-center gap-2 group cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition-all"
                    >
                        <h2 className="text-[13px] md:text-sm font-black text-white uppercase tracking-widest whitespace-nowrap select-none capitalize">
                            {date && format(new Date(date), "EEEE d 'de' MMMM", { locale: es })}
                        </h2>
                    </button>

                    {/* Derecha: Botones de Acción */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleSave()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center gap-2"
                        >
                            <Save size={14} />
                            <span>GUARDAR</span>
                        </button>
                        <button
                            onClick={handleSendNotifications}
                            className="bg-black/20 hover:bg-black/30 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center gap-2 border border-white/10"
                        >
                            <Send size={14} />
                            <span>ENVIAR</span>
                        </button>
                    </div>
                </div>

                {/* --- CONTENIDO PRINCIPAL --- */}
                <div className="flex-1 flex flex-col min-h-0 bg-[#fafafa] p-3 sm:p-5 lg:p-6 overflow-y-auto no-scrollbar">

                    {/* TARJETA DE CAMPOS EDITABLES SUPERIORES (FILA ÚNICA) */}
                    <div className="p-2 sm:p-3 bg-white rounded-xl border border-gray-100 shadow-sm w-full mb-4">
                        <div className="flex items-center gap-2 sm:gap-4 w-full overflow-hidden">

                            {/* Actividad */}
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest pl-1">Actividad</span>
                                <div className="flex items-center bg-zinc-50 px-2 py-1.5 rounded-xl border border-zinc-200">
                                    <input
                                        type="text"
                                        value={activity}
                                        onChange={(e) => { setActivity(e.target.value); setHasUnsavedChanges(true); }}
                                        className="w-full bg-transparent text-left font-black text-zinc-800 text-[10px] sm:text-xs focus:outline-none uppercase placeholder:text-zinc-300"
                                        placeholder="SERVICIO..."
                                    />
                                </div>
                            </div>

                            {/* Inicio */}
                            <div className="flex flex-col gap-1 shrink-0 w-[70px] sm:w-[85px]">
                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest pl-1 text-center">Inicio</span>
                                <div className="flex items-center justify-center bg-zinc-50 px-1 py-1.5 rounded-xl border border-zinc-200">
                                    <input
                                        type="time"
                                        value={defaultStart}
                                        onChange={(e) => setDefaultStart(e.target.value)}
                                        className="bg-transparent text-center font-black text-emerald-600 text-[10px] sm:text-xs focus:outline-none font-mono w-full"
                                    />
                                </div>
                            </div>

                            {/* Final */}
                            <div className="flex flex-col gap-1 shrink-0 w-[70px] sm:w-[85px]">
                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest pl-1 text-center">Final</span>
                                <div className="flex items-center justify-center bg-zinc-50 px-1 py-1.5 rounded-xl border border-zinc-200">
                                    <input
                                        type="time"
                                        value={defaultEnd}
                                        onChange={(e) => setDefaultEnd(e.target.value)}
                                        className="bg-transparent text-center font-black text-rose-500 text-[10px] sm:text-xs focus:outline-none font-mono w-full"
                                    />
                                </div>
                            </div>

                            {/* Participantes */}
                            <div className="flex flex-col gap-1 shrink-0 w-[45px] sm:w-[60px]">
                                <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest text-center">Part.</span>
                                <div className="flex items-center justify-center bg-zinc-50 px-1 py-1.5 rounded-xl border border-zinc-200 h-[30px] sm:h-[34px]">
                                    <input
                                        type="text"
                                        value={participantsCount}
                                        onChange={(e) => setParticipantsCount(e.target.value)}
                                        className="bg-transparent text-center font-black text-zinc-800 text-[10px] sm:text-xs focus:outline-none w-full"
                                        placeholder=""
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ZONA DE TRABAJO (LA TABLA ORIGINAL) */}
                    <div className="w-full flex flex-col rounded-[20px] overflow-hidden border border-gray-100 shadow-xl bg-white relative">
                        {/* ENCABEZADO DE HORAS - ROJO */}
                        <div className="flex bg-[#D64D5D] text-white sticky top-0 z-30 shadow-sm">
                            <div className="w-20 md:w-32 p-1 border-r border-white/10 shrink-0 flex items-center justify-center">
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#10b981] text-white flex items-center justify-center hover:bg-[#059669] transition-all active:scale-90 shadow-sm"
                                >
                                    <Plus size={18} strokeWidth={4} />
                                </button>
                            </div>
                            <div className="flex-1 relative h-7 flex">
                                {hoursHeader.map((hour, i) => (
                                    <div
                                        key={hour}
                                        className="flex-1 text-[8px] md:text-[9px] font-black flex items-center justify-center select-none opacity-90 border-r border-white/5 last:border-r-0"
                                    >
                                        {i % 2 === 0 ? hour : ''}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* FILAS DE EMPLEADOS */}
                        <div className="bg-white">
                            {shifts.map((shift, idx) => (
                                <div key={shift.employeeId} className={`flex h-10 md:h-12 border-b border-gray-50 last:border-b-0 transition-colors ${editingIndex === idx ? 'bg-blue-50/40' : ''}`}>
                                    {/* Columna Nombre */}
                                    <div className="w-20 md:w-32 px-3 flex items-center shrink-0 border-r border-gray-50 overflow-hidden">
                                        <span className={`font-black text-[9px] md:text-[11px] truncate uppercase tracking-tight transition-colors ${editingIndex === idx ? 'text-[#5B8FB9]' : 'text-gray-700'}`}>
                                            {shift.name}
                                        </span>
                                    </div>

                                    {/* Zona de Barras */}
                                    <div
                                        className="flex-1 relative cursor-pointer group"
                                        onClick={() => setEditingIndex(idx)}
                                    >
                                        {/* Guías de fondo */}
                                        <div className="absolute inset-0 flex">
                                            {hoursHeader.map((_, i) => (
                                                <div key={i} className="flex-1 border-r border-gray-50/50 pointer-events-none last:border-r-0" />
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

                            {/* FILA DE TOTALES */}
                            <div className="flex bg-[#36606F]">
                                <div className="w-20 md:w-32 p-1 font-black text-white text-[8px] flex items-center justify-center uppercase tracking-widest shrink-0 border-r border-white/10">
                                    TOT
                                </div>
                                <div className="flex-1 relative h-7 flex">
                                    {totals.map((count, i) => (
                                        <div
                                            key={i}
                                            className={`flex-1 flex items-center justify-center font-black text-[8px] md:text-[9px] transition-colors ${count > 0 ? 'text-white' : 'text-white/20'}`}
                                        >
                                            {count > 0 ? count : ''}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BARRA DE EDICIÓN FLOTANTE (ESTILIZADA) */}
                    {editingIndex !== null && shifts[editingIndex] && (
                        <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="h-12 relative flex items-center p-1">
                                <div className="flex-1 relative h-full bg-white/10 rounded-xl overflow-hidden self-center">
                                    <ShiftBar
                                        shift={shifts[editingIndex]}
                                        onUpdate={(newShift) => handleUpdateShift(editingIndex, newShift)}
                                        allowMove={false}
                                        barClass="bg-[#5B8FB9] border border-white/20 shadow-sm"
                                    />
                                </div>
                                <button
                                    onClick={() => setEditingIndex(null)}
                                    className="ml-2 w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl hover:bg-rose-500 text-white transition-all active:scale-95 shrink-0"
                                >
                                    <X size={20} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {/* MODAL: Calendario */}
            {showCalendarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        {/* Header del Modal - Petrol con Navegación */}
                        <div className="bg-[#36606F] p-4 flex items-center justify-between border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                                    className="text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                                >
                                    <ChevronLeft size={20} strokeWidth={3} />
                                </button>
                                <span className="text-white font-black uppercase tracking-widest text-sm min-w-[120px] text-center capitalize">
                                    {calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                    onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                                    className="text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                                >
                                    <ChevronRight size={20} strokeWidth={3} />
                                </button>
                            </div>

                            <button
                                onClick={() => setShowCalendarModal(false)}
                                className="bg-white/10 hover:bg-rose-500 text-white p-2 rounded-xl transition-all"
                            >
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="p-4">
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
                                            ${!day ? 'invisible' : 'hover:bg-blue-50 hover:text-[#5B8FB9] text-gray-700'}
                                            ${day === new Date().getDate() &&
                                                calendarDate.getMonth() === new Date().getMonth() &&
                                                calendarDate.getFullYear() === new Date().getFullYear()
                                                ? 'bg-[#5B8FB9] text-white'
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
                        <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0 border-b border-white/10">
                            <div className="flex flex-col">
                                <h3 className="text-sm font-black uppercase tracking-widest leading-none">Añadir Personal</h3>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="bg-white/10 hover:bg-rose-500 text-white p-2 rounded-xl transition-all active:scale-95">
                                <X size={18} strokeWidth={3} />
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