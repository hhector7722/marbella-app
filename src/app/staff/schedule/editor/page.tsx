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
    Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';

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

    const handleSave = async () => {
        const activeShifts = shifts.filter(s => s.active);

        if (activeShifts.length === 0) {
            toast.error('No hay turnos activos para guardar');
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('No hay sesión activa');
                return;
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
            toast.success(`${activeShifts.length} turno(s) guardado(s)`);
            router.push('/staff/schedule');
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error?.message || 'Error al guardar los turnos');
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

    if (loading) return <div className="p-8 text-center text-white font-bold">Cargando editor...</div>;

    return (
        <div className="min-h-screen bg-[#5B8FB9] flex flex-col p-2 md:p-4 gap-2">

            {/* CABECERA ULTRA-COMPACTA */}
            <div className="flex justify-center w-full">
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-lg">
                    {/* Fecha con botón de calendario */}
                    <button
                        onClick={() => setShowCalendarModal(true)}
                        className="text-black text-[10px] px-3 h-7 rounded-lg font-black bg-white/90 hover:bg-white flex items-center gap-1 transition-colors capitalize"
                    >
                        {date && format(new Date(date), "EEE d 'de' MMM", { locale: es }).replace('.', '')}
                    </button>
                    <input
                        type="text"
                        value={activity}
                        onChange={(e) => { setActivity(e.target.value); setHasUnsavedChanges(true); }}
                        className="text-black text-[10px] px-2 h-7 rounded-lg border-none outline-none focus:ring-2 focus:ring-green-400 w-28 md:w-32 font-black bg-white/90 text-center"
                        placeholder="Actividad"
                    />
                    {/* Botón Guardar */}
                    <button
                        onClick={handleSave}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 h-7 rounded-lg font-black flex items-center justify-center gap-1 shadow-md transition-transform active:scale-95 text-[9px] uppercase tracking-wider"
                    >
                        <Save size={12} /> GUARDAR
                    </button>
                </div>
            </div>

            {/* ZONA DE TRABAJO (FLOATING) */}
            <div className="w-full flex flex-col rounded-2xl overflow-hidden border border-zinc-200 shadow-xl bg-white mt-1">
                <div className="w-full flex flex-col relative">
                    {/* ENCABEZADO DE HORAS - ROJO */}
                    <div className="flex bg-red-500 text-white border-b border-red-600 sticky top-0 z-30">
                        <div className="w-20 md:w-32 p-1 font-black text-[8px] md:text-[10px] flex items-center justify-center uppercase tracking-tighter shrink-0">
                            TRABAJADOR
                        </div>
                        <div className="flex-1 relative h-6 flex">
                            {hoursHeader.map((hour, i) => (
                                <div
                                    key={hour}
                                    className="flex-1 text-[8px] md:text-[9px] font-black flex items-center justify-center select-none opacity-90 border-r border-red-400/30 last:border-r-0"
                                >
                                    {hour}
                                </div>
                            ))}
                        </div>
                        <div className="w-10 md:w-12 shrink-0 border-l border-red-600" />
                    </div>


                    {/* FILAS DE EMPLEADOS */}
                    <div className="bg-white">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className={`flex h-9 md:h-10 border-b border-gray-100 last:border-b-0 transition-colors ${editingIndex === idx ? 'bg-blue-50/20' : ''}`}>
                                {/* Columna Nombre */}
                                <div className="w-20 md:w-32 px-2 flex items-center shrink-0 border-r border-gray-100 overflow-hidden">
                                    <span className={`font-black text-[9px] md:text-[10px] truncate uppercase tracking-tight transition-colors ${editingIndex === idx ? 'text-blue-600' : 'text-black'}`}>
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

                                {/* Columna Eliminar */}
                                <div className="w-10 md:w-12 flex items-center justify-center border-l border-gray-100">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(idx); }}
                                        className="w-7 h-7 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0 active:scale-90"
                                        title="Eliminar"
                                    >
                                        <X size={14} strokeWidth={4} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* FILA DE TOTALES - DESPUÉS DE LOS TRABAJADORES */}
                        <div className="flex bg-[#5B8FB9] border-b border-[#5B8FB9]/50">
                            <div className="w-20 md:w-32 p-1 font-black text-white text-[8px] flex items-center justify-center uppercase tracking-widest shrink-0 border-r border-[#5B8FB9]/50">
                                TOT
                            </div>
                            <div className="flex-1 relative h-6 flex">
                                {totals.map((count, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 flex items-center justify-center font-black text-[8px] md:text-[9px] transition-colors ${count > 0 ? 'text-white' : 'text-white/30'}`}
                                    >
                                        {count > 0 ? count : ''}
                                    </div>
                                ))}
                            </div>
                            <div className="w-10 md:w-12 shrink-0 border-l border-[#5B8FB9]/50" />
                        </div>

                        {/* Fila Añadir Trabajador - Relleno verde font blanco */}
                        <div className="flex h-9 md:h-10 border-b border-gray-100 group">
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 transition-colors text-white group"
                            >
                                <Plus size={18} strokeWidth={4} className="group-hover:scale-110 transition-transform text-white" />
                                <span className="font-black text-[10px] uppercase tracking-wider">Añadir Trabajador</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* BARRA DE EDICIÓN FLOTANTE */}
            {editingIndex !== null && shifts[editingIndex] && (
                <div className="mt-2 mx-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="h-12 relative flex items-center">
                        <div className="flex-1 relative h-full">
                            <ShiftBar
                                shift={shifts[editingIndex]}
                                onUpdate={(newShift) => handleUpdateShift(editingIndex, newShift)}
                                allowMove={false}
                                barClass="bg-[#5B8FB9] border border-white/10 shadow-lg"
                            />
                        </div>
                        <button
                            onClick={() => setEditingIndex(null)}
                            className="ml-3 w-10 h-10 flex items-center justify-center bg-white/90 rounded-xl shadow-lg hover:bg-white text-gray-500 transition-all active:scale-95 shrink-0"
                        >
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
            )}


            {/* MODAL: Calendario */}
            {showCalendarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarModal(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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