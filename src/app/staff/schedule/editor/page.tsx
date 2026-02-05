'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X,
    Save,
    Plus,
    ArrowLeft,
    Users,
    Calendar,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
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
const ShiftBar = ({ shift, onUpdate }: { shift: any, onUpdate: (s: any) => void }) => {
    const barRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState<'move' | 'left' | 'right' | null>(null);

    const leftPos = timeToPercent(shift.start);
    const width = Math.max(timeToPercent(shift.end) - leftPos, 5);

    const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'left' | 'right') => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setIsDragging(true);
        setDragType(type);
    };

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!isDragging || !barRef.current) return;
            const parentRect = barRef.current.parentElement!.getBoundingClientRect();
            const relativePercent = ((e.clientX - parentRect.left) / parentRect.width) * 100;
            const rawTime = percentToTime(Math.max(0, Math.min(relativePercent, 100)));

            if (dragType === 'left') {
                if (timeToPercent(rawTime) < timeToPercent(shift.end)) onUpdate({ ...shift, start: rawTime });
            } else if (dragType === 'right') {
                if (timeToPercent(rawTime) > timeToPercent(shift.start)) onUpdate({ ...shift, end: rawTime });
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
    }, [isDragging, dragType, shift, onUpdate]);

    return (
        <div
            ref={barRef}
            className="absolute top-1 bottom-1 bg-green-400/90 rounded-full border border-green-500 shadow-sm flex items-center justify-between group cursor-grab active:cursor-grabbing hover:bg-green-400 transition-all z-10 touch-none"
            style={{ left: `${leftPos}%`, width: `${width}%` }}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
            {/* Tirador Izquierda */}
            <div className="w-4 h-full cursor-ew-resize hover:bg-black/10 rounded-l-full flex items-center justify-center shrink-0" onPointerDown={(e) => handlePointerDown(e, 'left')}>
                <div className="w-0.5 h-3 bg-white/50 rounded-full" />
            </div>

            {/* Hora Entrada (izquierda, blanco) */}
            <span className="absolute left-1 text-[7px] md:text-[8px] font-black text-white pointer-events-none select-none drop-shadow-md">
                {shift.start}
            </span>

            {/* Hora Salida (derecha, rojo) */}
            <span className="absolute right-1 text-[7px] md:text-[8px] font-black text-red-600 pointer-events-none select-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
                {shift.end}
            </span>

            {/* Tirador Derecha */}
            <div className="w-4 h-full cursor-ew-resize hover:bg-black/10 rounded-r-full flex items-center justify-center shrink-0" onPointerDown={(e) => handlePointerDown(e, 'right')}>
                <div className="w-0.5 h-3 bg-white/50 rounded-full" />
            </div>
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

    // Estado para detectar cambios sin guardar
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Modal de calendario
    const [showCalendarModal, setShowCalendarModal] = useState(false);
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

            // 3. Crear estructura con todos los empleados
            const shiftMap = new Map(existingShifts?.map(s => [s.user_id, s]) || []);

            const allShifts = employees?.map(emp => {
                const existing = shiftMap.get(emp.id);
                if (existing) {
                    return {
                        employeeId: emp.id,
                        name: `${emp.first_name} ${emp.last_name || ''}`,
                        start: new Date(existing.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                        end: new Date(existing.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                        active: true
                    };
                }
                return {
                    employeeId: emp.id,
                    name: `${emp.first_name} ${emp.last_name || ''}`,
                    start: '09:00',
                    end: '17:00',
                    active: false
                };
            }) || [];

            // Cargar actividad si existe
            if (existingShifts && existingShifts.length > 0 && existingShifts[0].activity) {
                setActivity(existingShifts[0].activity);
            }

            setShifts(allShifts);
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

    const toggleShiftActive = (index: number) => {
        const updated = [...shifts];
        updated[index].active = !updated[index].active;
        setShifts(updated);
        setHasUnsavedChanges(true);
        if (updated[index].active) {
            setEditingIndex(index);
        } else if (editingIndex === index) {
            setEditingIndex(null);
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
                        className="text-black text-[10px] px-3 h-7 rounded-lg font-black bg-white/90 hover:bg-white flex items-center gap-1 transition-colors"
                    >
                        <Calendar size={12} />
                        {new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </button>
                    <input
                        type="text"
                        value={activity}
                        onChange={(e) => { setActivity(e.target.value); setHasUnsavedChanges(true); }}
                        className="text-black text-[10px] px-2 h-7 rounded-lg border-none outline-none focus:ring-2 focus:ring-green-400 w-28 md:w-32 font-black bg-white/90"
                        placeholder="Actividad"
                    />
                    <button
                        onClick={handleSave}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 h-7 rounded-lg font-black flex items-center justify-center gap-1 shadow-md transition-transform active:scale-95 text-[9px] uppercase tracking-wider"
                    >
                        <Save size={12} /> GUARDAR
                    </button>
                </div>
            </div>

            {/* ZONA DE TRABAJO (FLOATING) */}
            <div className="w-full flex flex-col rounded-2xl overflow-hidden border border-gray-200 shadow-xl bg-white mt-2">
                <div className="w-full flex flex-col">
                    {/* ENCABEZADO DE HORAS - ROJO */}
                    <div className="flex bg-red-500 text-white border-b border-red-600">
                        <div
                            className="w-20 md:w-32 p-2 font-black text-[8px] md:text-[10px] flex items-center gap-1 uppercase tracking-tighter shrink-0 cursor-pointer hover:bg-red-600 transition-colors"
                            onClick={() => setShowCalendarModal(true)}
                        >
                            <Calendar size={12} /> {new Date(date).getDate()}
                        </div>
                        <div className="flex-1 relative h-6 flex">
                            {hoursHeader.map((hour, i) => (
                                <div
                                    key={hour}
                                    className="flex-1 text-[8px] md:text-[9px] font-black flex items-center justify-center select-none opacity-90"
                                >
                                    {hour}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* FILAS DE EMPLEADOS */}
                    <div className="bg-white">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className={`flex h-8 md:h-9 transition-colors ${editingIndex === idx ? 'bg-blue-50/50' : ''}`}>
                                {/* Columna Nombre (Botón de Toggle) */}
                                <div
                                    onClick={() => toggleShiftActive(idx)}
                                    className="w-20 md:w-32 px-3 flex items-center justify-start cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors shrink-0"
                                >
                                    <span className={`font-black text-[9px] md:text-[10px] truncate uppercase tracking-tight transition-colors ${shift.active ? (editingIndex === idx ? 'text-blue-600' : 'text-black') : 'text-gray-300'}`}>
                                        {shift.name.split(' ')[0]}
                                    </span>
                                </div>

                                {/* Zona de Barras - Siempre editable si está activa */}
                                <div className="flex-1 relative">
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
                    </div>

                    {/* FILA DE TOTALES - SIEMPRE VISIBLE - FONDO AMARILLO CLARO */}
                    <div className="flex bg-yellow-100 border-t border-yellow-200 sticky bottom-0">
                        <div className="w-20 md:w-32 p-1 font-black text-yellow-700 text-[8px] flex items-center justify-center uppercase tracking-widest shrink-0">
                            SUM
                        </div>
                        <div className="flex-1 relative h-5 md:h-6 flex">
                            {totals.map((count, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 flex items-center justify-center font-black text-[8px] md:text-[9px] transition-colors ${count > 0 ? 'text-green-600' : 'text-gray-300'}`}
                                >
                                    {count > 0 ? count : ''}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* BARRA DE EDICIÓN FLOTANTE - SIEMPRE EDITABLE */}
            {editingIndex !== null && shifts[editingIndex]?.active && (
                <div className="mt-3 mx-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="h-10 relative bg-white/90 rounded-full shadow-lg border border-green-400 flex items-center overflow-hidden backdrop-blur-sm">
                        <div className="flex-1 relative h-full">
                            <div className="absolute inset-0 flex">
                                {hoursHeader.map((_, i) => (
                                    <div key={i} className="flex-1 border-r border-gray-100/30 pointer-events-none last:border-r-0" />
                                ))}
                            </div>
                            <ShiftBar
                                shift={shifts[editingIndex]}
                                onUpdate={(newShift) => handleUpdateShift(editingIndex, newShift)}
                            />
                        </div>
                        <button onClick={() => setEditingIndex(null)} className="p-2 mr-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL: Calendario */}
            {showCalendarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Seleccionar Fecha</h3>
                            <button onClick={() => setShowCalendarModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Navegación de mes */}
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

                        {/* Grid de días */}
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
        </div>
    );
}