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
    Trophy // <--- Añadido aquí para solucionar el error
} from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';

// --- CONFIGURACIÓN DEL GRID ---
const START_HOUR = 7; // 7:00 AM
const END_HOUR = 23;  // 23:00 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const PIXELS_PER_HOUR = 60;
const SNAP_MINUTES = 15;

// --- UTILIDADES ---
const timeToPixels = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours - START_HOUR) * 60 + minutes;
    return (totalMinutes / 60) * PIXELS_PER_HOUR;
};

const pixelsToTime = (px: number) => {
    const totalMinutes = (px / PIXELS_PER_HOUR) * 60;
    const hours = Math.floor(totalMinutes / 60) + START_HOUR;
    const minutes = Math.round((totalMinutes % 60) / SNAP_MINUTES) * SNAP_MINUTES;
    const finalDate = new Date();
    finalDate.setHours(hours, minutes);
    return format(finalDate, 'HH:mm');
};

// --- COMPONENTE BARRA INTERACTIVA ---
const ShiftBar = ({ shift, onUpdate }: { shift: any, onUpdate: (s: any) => void }) => {
    const barRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState<'move' | 'left' | 'right' | null>(null);

    const leftPos = timeToPixels(shift.start);
    const width = Math.max(timeToPixels(shift.end) - leftPos, 20);

    const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'left' | 'right') => {
        e.stopPropagation();
        setIsDragging(true);
        setDragType(type);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !barRef.current) return;
            const parentRect = barRef.current.parentElement!.getBoundingClientRect();
            const relativeX = e.clientX - parentRect.left;
            const rawTime = pixelsToTime(Math.max(0, Math.min(relativeX, TOTAL_HOURS * PIXELS_PER_HOUR)));

            if (dragType === 'left') {
                if (timeToPixels(rawTime) < timeToPixels(shift.end)) onUpdate({ ...shift, start: rawTime });
            } else if (dragType === 'right') {
                if (timeToPixels(rawTime) > timeToPixels(shift.start)) onUpdate({ ...shift, end: rawTime });
            }
        };

        const handleMouseUp = () => { setIsDragging(false); setDragType(null); };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragType, shift, onUpdate]);

    return (
        <div
            ref={barRef}
            className="absolute top-2 bottom-2 bg-green-400/90 rounded-md border border-green-500 shadow-md flex items-center justify-between group cursor-grab active:cursor-grabbing hover:bg-green-400 transition-all z-10"
            style={{ left: `${leftPos}px`, width: `${width}px` }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
            <div className="w-3 h-full cursor-ew-resize hover:bg-black/10 rounded-l-md flex items-center justify-center" onMouseDown={(e) => handleMouseDown(e, 'left')}><div className="w-0.5 h-3 bg-white/50 rounded-full" /></div>
            {width > 50 && <span className="text-[9px] font-bold text-green-900 pointer-events-none select-none truncate px-1">{shift.start}-{shift.end}</span>}
            <div className="w-3 h-full cursor-ew-resize hover:bg-black/10 rounded-r-md flex items-center justify-center" onMouseDown={(e) => handleMouseDown(e, 'right')}><div className="w-0.5 h-3 bg-white/50 rounded-full" /></div>
        </div>
    );
};

// --- PÁGINA DE EDICIÓN ---
export default function ScheduleEditorPage() {
    const supabase = createClient();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState<any[]>([]);

    // Estados del formulario
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [activity, setActivity] = useState('Servicio General');
    const [shifts, setShifts] = useState<any[]>([]);

    // Carga de empleados
    useEffect(() => {
        const fetchEmployees = async () => {
            const { data } = await supabase.from('profiles').select('id, first_name, last_name, role').order('first_name');
            if (data) {
                setEmployees(data);
                // Inicializar barras vacías para cada empleado
                const initialShifts = data.map(emp => ({
                    employeeId: emp.id,
                    name: `${emp.first_name} ${emp.last_name?.charAt(0) || ''}.`,
                    start: '12:00',
                    end: '16:00',
                    active: false
                }));
                setShifts(initialShifts);
            }
            setLoading(false);
        };
        fetchEmployees();
    }, []);

    const handleUpdateShift = (index: number, newShift: any) => {
        const updated = [...shifts]; updated[index] = newShift; setShifts(updated);
    };

    const toggleShiftActive = (index: number) => {
        const updated = [...shifts]; updated[index].active = !updated[index].active; setShifts(updated);
    };

    const handleSave = async () => {
        // Lógica de guardado (Mock)
        toast.promise(
            new Promise(resolve => setTimeout(resolve, 1000)),
            {
                loading: 'Guardando...',
                success: 'Horario publicado',
                error: 'Error al guardar'
            }
        );
        // Aquí iría el insert a Supabase
    };

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
    const totals = hoursHeader.map(hour =>
        shifts.filter(s => s.active && hour >= parseInt(s.start.split(':')[0]) && hour < parseInt(s.end.split(':')[0])).length
    );

    if (loading) return <div className="p-8 text-center text-gray-400">Cargando editor...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">

            {/* CABECERA DEL EDITOR */}
            <div className="bg-[#5B8FB9] p-4 text-white shadow-md z-20">
                <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/staff/schedule" className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ArrowLeft />
                        </Link>
                        <div>
                            <h2 className="font-bold text-xl leading-none">Editor de Horarios</h2>
                            <p className="text-xs opacity-80 mt-1">Crea turnos arrastrando las barras</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 items-end bg-white/10 p-2 rounded-xl">
                        <div className="flex flex-col">
                            <label className="text-[9px] uppercase font-bold opacity-70 mb-1 flex items-center gap-1"><Calendar size={10} /> Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="text-black text-sm px-2 py-1.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-300"
                            />
                        </div>
                        <div className="flex flex-col w-40">
                            <label className="text-[9px] uppercase font-bold opacity-70 mb-1 flex items-center gap-1"><Trophy size={10} /> Actividad</label>
                            <input
                                type="text"
                                value={activity}
                                onChange={(e) => setActivity(e.target.value)}
                                className="text-black text-sm px-2 py-1.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-300"
                            />
                        </div>
                        <button
                            onClick={handleSave}
                            className="bg-green-500 hover:bg-green-600 text-white px-6 py-1.5 rounded-lg font-bold flex items-center gap-2 shadow-lg h-[34px] transition-transform active:scale-95"
                        >
                            <Save size={16} /> Guardar
                        </button>
                    </div>
                </div>
            </div>

            {/* ZONA DE TRABAJO (SCROLLABLE) */}
            <div className="flex-1 overflow-auto p-4 md:p-8">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden min-w-[1000px] mx-auto max-w-[1400px]">

                    {/* ENCABEZADO DE HORAS */}
                    <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-20">
                        <div className="w-48 p-3 font-bold text-gray-500 text-xs sticky left-0 bg-gray-50 border-r z-30 flex items-center gap-2">
                            <Users size={14} /> EMPLEADO
                        </div>
                        <div className="flex-1 relative h-10">
                            {hoursHeader.map((hour, i) => (
                                <div
                                    key={hour}
                                    className="absolute top-0 bottom-0 border-l border-gray-200 text-[10px] font-bold text-gray-400 pl-1 pt-1 select-none"
                                    style={{ left: `${i * PIXELS_PER_HOUR}px`, width: `${PIXELS_PER_HOUR}px` }}
                                >
                                    {hour}:00
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* FILAS DE EMPLEADOS */}
                    <div className="divide-y divide-gray-100 bg-white">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className="flex hover:bg-blue-50/20 transition-colors h-14 group">
                                {/* Columna Nombre */}
                                <div className="w-48 p-2 border-r border-gray-100 bg-white sticky left-0 z-10 flex items-center justify-between group-hover:bg-blue-50/20 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${shift.active ? 'bg-[#5B8FB9] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                            {shift.name.charAt(0)}
                                        </div>
                                        <span className={`font-medium text-sm truncate max-w-[90px] ${shift.active ? 'text-gray-900' : 'text-gray-400'}`}>
                                            {shift.name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toggleShiftActive(idx)}
                                        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${shift.active ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100' : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'}`}
                                        title={shift.active ? "Quitar turno" : "Añadir turno"}
                                    >
                                        {shift.active ? <X size={14} /> : <Plus size={14} />}
                                    </button>
                                </div>

                                {/* Zona de Barras */}
                                <div className="flex-1 relative">
                                    {hoursHeader.map((_, i) => (
                                        <div key={i} className="absolute top-0 bottom-0 border-r border-dashed border-gray-100 pointer-events-none" style={{ left: `${(i + 1) * PIXELS_PER_HOUR}px` }} />
                                    ))}

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

                    {/* FILA DE TOTALES */}
                    <div className="flex border-t-2 border-gray-100 bg-gray-50 sticky bottom-0 z-20">
                        <div className="w-48 p-2 font-bold text-gray-600 text-xs sticky left-0 bg-gray-50 border-r flex items-center justify-end pr-4">
                            TOTALES
                        </div>
                        <div className="flex-1 relative h-8 flex">
                            {totals.map((count, i) => (
                                <div
                                    key={i}
                                    className={`border-r border-gray-200 flex items-center justify-center font-bold text-xs transition-colors ${count > 0 ? 'text-[#5B8FB9] bg-blue-50/50' : 'text-gray-300'}`}
                                    style={{ width: `${PIXELS_PER_HOUR}px` }}
                                >
                                    {count > 0 ? count : '-'}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}