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
const SNAP_MINUTES = 15;

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
            className="absolute top-1.5 bottom-1.5 bg-green-400/90 rounded-full border border-green-500 shadow-sm flex items-center justify-between group cursor-grab active:cursor-grabbing hover:bg-green-400 transition-all z-10 touch-none"
            style={{ left: `${leftPos}%`, width: `${width}%` }}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
        >
            <div className="w-5 h-full cursor-ew-resize hover:bg-black/10 rounded-l-md flex items-center justify-center shrink-0" onPointerDown={(e) => handlePointerDown(e, 'left')}><div className="w-1 h-4 bg-white/70 rounded-full" /></div>
            {width > 60 && <span className="text-[9px] font-bold text-green-900 pointer-events-none select-none truncate px-1">{shift.start}-{shift.end}</span>}
            <div className="w-5 h-full cursor-ew-resize hover:bg-black/10 rounded-r-md flex items-center justify-center shrink-0" onPointerDown={(e) => handlePointerDown(e, 'right')}><div className="w-1 h-4 bg-white/70 rounded-full" /></div>
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

                    <div className="flex flex-wrap gap-2 md:gap-4 items-end bg-white/10 p-2 md:p-3 rounded-xl w-full md:w-auto">
                        <div className="flex flex-col flex-1 md:flex-none">
                            <label className="text-[9px] uppercase font-bold opacity-70 mb-1 flex items-center gap-1"><Calendar size={10} /> Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="text-black text-xs md:text-sm px-2 py-1.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-300 w-full"
                            />
                        </div>
                        <div className="flex flex-col flex-1 md:w-40">
                            <label className="text-[9px] uppercase font-bold opacity-70 mb-1 flex items-center gap-1"><Trophy size={10} /> Actividad</label>
                            <input
                                type="text"
                                value={activity}
                                onChange={(e) => setActivity(e.target.value)}
                                className="text-black text-xs md:text-sm px-2 py-1.5 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-300 w-full"
                            />
                        </div>
                        <button
                            onClick={handleSave}
                            className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg h-[34px] md:h-[38px] transition-transform active:scale-95 w-full md:w-auto mt-2 md:mt-0"
                        >
                            <Save size={16} /> <span className="text-xs md:text-sm">Guardar</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ZONA DE TRABAJO (SCROLLABLE) */}
            <div className="flex-1 p-2 md:p-4 overflow-hidden flex flex-col">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden w-full flex-1 flex flex-col">

                    {/* ENCABEZADO DE HORAS */}
                    <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-20">
                        <div className="w-20 md:w-32 p-2 font-bold text-gray-500 text-[8px] md:text-[10px] sticky left-0 bg-gray-50 border-r z-30 flex items-center gap-1 shadow-[2px_0_5px_rgba(0,0,0,0.05)] uppercase tracking-tighter">
                            <Users size={12} /> <span className="truncate">STAFF</span>
                        </div>
                        <div className="flex-1 relative h-8 flex">
                            {hoursHeader.map((hour, i) => (
                                <div
                                    key={hour}
                                    className="flex-1 border-l border-gray-100 text-[8px] font-bold text-gray-400 flex items-center justify-center select-none"
                                >
                                    {hour}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* FILAS DE EMPLEADOS */}
                    <div className="divide-y divide-gray-50 bg-white flex-1 overflow-y-auto">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className="flex hover:bg-blue-50/20 transition-colors h-10 md:h-12 group">
                                {/* Columna Nombre */}
                                <div className="w-20 md:w-32 p-1.5 border-r border-gray-100 bg-white sticky left-0 z-10 flex items-center justify-between group-hover:bg-blue-50/20 transition-colors shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                                    <span className={`font-bold text-[10px] md:text-xs truncate ${shift.active ? 'text-gray-900' : 'text-gray-300'}`}>
                                        {shift.name.split(' ')[0]}
                                    </span>
                                    <button
                                        onClick={() => toggleShiftActive(idx)}
                                        className={`w-4 h-4 rounded flex items-center justify-center transition-all shrink-0 ${shift.active ? 'text-red-400' : 'text-green-400'}`}
                                    >
                                        {shift.active ? <X size={12} /> : <Plus size={12} />}
                                    </button>
                                </div>

                                {/* Zona de Barras */}
                                <div className="flex-1 relative bg-gray-50/30">
                                    <div className="absolute inset-0 flex">
                                        {hoursHeader.map((_, i) => (
                                            <div key={i} className="flex-1 border-r border-gray-100/50 pointer-events-none" />
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
                    <div className="flex border-t border-gray-200 bg-gray-100/50 sticky bottom-0 z-20">
                        <div className="w-20 md:w-32 p-1 font-black text-gray-400 text-[8px] sticky left-0 bg-gray-100/50 border-r flex items-center justify-center pr-1 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                            SUM
                        </div>
                        <div className="flex-1 relative h-6 flex">
                            {totals.map((count, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 border-r border-gray-200 flex items-center justify-center font-bold text-[10px] transition-colors ${count > 0 ? 'text-[#5B8FB9] bg-white/40' : 'text-gray-300'}`}
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