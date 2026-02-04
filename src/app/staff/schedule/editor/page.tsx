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

const START_HOUR = 7; // 7:00 AM
const END_HOUR = 23;  // 23:00 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const SNAP_MINUTES = 30;

const timeToPercent = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours - START_HOUR) * 60 + minutes;
    return (totalMinutes / (TOTAL_HOURS * 60)) * 100;
};

const percentToTime = (percent: number) => {
    const totalMinutes = (percent / 100) * (TOTAL_HOURS * 60);
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

            {/* Label de Tiempo */}
            {width > 12 ? (
                <span className="text-[7px] md:text-[9px] font-black text-green-900 pointer-events-none select-none truncate px-1">
                    {shift.start}-{shift.end}
                </span>
            ) : (
                <>
                    <span className="absolute right-full mr-1 text-[7px] md:text-[8px] font-black text-gray-500 pointer-events-none select-none whitespace-nowrap">
                        {shift.start}
                    </span>
                    <span className="absolute left-full ml-1 text-[7px] md:text-[8px] font-black text-gray-500 pointer-events-none select-none whitespace-nowrap">
                        {shift.end}
                    </span>
                </>
            )}

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

    if (loading) return <div className="p-8 text-center text-white font-bold">Cargando editor...</div>;

    return (
        <div className="min-h-screen bg-[#5B8FB9] flex flex-col p-2 md:p-4 gap-2">

            {/* CABECERA ULTRA-COMPACTA */}
            <div className="flex justify-center w-full">
                <div className="grid grid-cols-3 gap-2 w-full max-w-lg">
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="text-black text-[10px] px-2 h-8 rounded-lg border-none outline-none focus:ring-2 focus:ring-green-400 w-full font-black bg-white/90"
                    />
                    <input
                        type="text"
                        value={activity}
                        onChange={(e) => setActivity(e.target.value)}
                        className="text-black text-[10px] px-2 h-8 rounded-lg border-none outline-none focus:ring-2 focus:ring-green-400 w-full font-black bg-white/90"
                        placeholder="Actividad"
                    />
                    <button
                        onClick={handleSave}
                        className="bg-green-500 hover:bg-green-600 text-white px-2 h-8 rounded-lg font-black flex items-center justify-center gap-1 shadow-md transition-transform active:scale-95 text-[9px] uppercase tracking-wider"
                    >
                        <Save size={12} /> GUARDAR
                    </button>
                </div>
            </div>

            {/* ZONA DE TRABAJO (FLOATING) */}
            <div className="w-full flex flex-col rounded-2xl overflow-hidden border border-white/10 shadow-lg">
                <div className="w-full flex flex-col">
                    {/* ENCABEZADO DE HORAS */}
                    <div className="flex bg-green-500 text-white">
                        <div className="w-20 md:w-32 p-2 font-black text-[8px] md:text-[10px] flex items-center gap-1 uppercase tracking-tighter shrink-0 border-r border-green-600/30">
                            <Users size={12} /> STAFF
                        </div>
                        <div className="flex-1 relative h-8 flex">
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
                    <div className="bg-[#5B8FB9]">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className="flex h-8 md:h-9 border-b border-white/5 last:border-b-0 transition-colors">
                                {/* Columna Nombre (Botón de Toggle) */}
                                <div
                                    onClick={() => toggleShiftActive(idx)}
                                    className="w-20 md:w-32 p-1.5 flex items-center justify-start cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors border-r border-white/5 shrink-0"
                                >
                                    <span className={`font-black text-[9px] md:text-[10px] truncate uppercase tracking-tight transition-colors ${shift.active ? 'text-black' : 'text-white/40'}`}>
                                        {shift.name.split(' ')[0]}
                                    </span>
                                </div>

                                {/* Zona de Barras */}
                                <div className="flex-1 relative bg-black/5">
                                    <div className="absolute inset-0 flex">
                                        {hoursHeader.map((_, i) => (
                                            <div key={i} className="flex-1 border-r border-white/5 pointer-events-none last:border-r-0" />
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

                    {/* FILA DE TOTALES */}
                    <div className="flex bg-white/10 backdrop-blur-sm border-t border-white/10">
                        <div className="w-20 md:w-32 p-1 font-black text-white/30 text-[8px] flex items-center justify-center uppercase tracking-widest border-r border-white/5 shrink-0">
                            SUM
                        </div>
                        <div className="flex-1 relative h-6 flex">
                            {totals.map((count, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 flex items-center justify-center font-black text-[9px] transition-colors ${count > 0 ? 'text-green-300 bg-white/5' : 'text-white/10'}`}
                                >
                                    {count > 0 ? count : ''}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}