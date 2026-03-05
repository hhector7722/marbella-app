'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X,
    Save,
    Plus,
    ChevronLeft,
    ChevronRight,
    UserPlus,
    Send,
    CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
            <div className="absolute left-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'left')} />
            <div className="absolute left-0 top-0 bottom-0 min-w-[48px] bg-emerald-500 flex items-center justify-center shrink-0 z-20 rounded-full shadow-sm">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2">
                    {shift.start}
                </span>
            </div>
            <div className="flex-1 h-full" />
            <div className="absolute right-0 top-0 bottom-0 min-w-[48px] bg-red-600 flex items-center justify-center shrink-0 z-20 rounded-full shadow-sm">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2">
                    {shift.end}
                </span>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'right')} />
        </div>
    );
};


export default function ScheduleEditorPage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    const [date, setDate] = useState('');
    const [activity, setActivity] = useState('');
    const [shifts, setShifts] = useState<any[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isDayPublished, setIsDayPublished] = useState(false);

    const [defaultStart, setDefaultStart] = useState('');
    const [defaultEnd, setDefaultEnd] = useState('');
    const [participantsCount, setParticipantsCount] = useState<string>('');

    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    useEffect(() => {
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
            const { data: employees } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .order('first_name');

            const startOfDay = `${targetDate}T00:00:00.000Z`;
            const endOfDay = `${targetDate}T23:59:59.999Z`;

            const { data: existingShifts } = await supabase
                .from('shifts')
                .select('*')
                .gte('start_time', startOfDay)
                .lte('start_time', endOfDay);

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

            if (existingShifts && existingShifts.length > 0) {
                if (existingShifts[0].activity) {
                    setActivity(existingShifts[0].activity);
                }
                setIsDayPublished(existingShifts.some(s => s.is_published));
            } else {
                setIsDayPublished(false);
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

    const handleSave = async (silent = false, publish = false) => {
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
                    is_published: publish
                };
            });

            const startOfDay = `${date}T00:00:00.000Z`;
            const endOfDay = `${date}T23:59:59.999Z`;

            await supabase.from('shifts').delete().gte('start_time', startOfDay).lte('start_time', endOfDay);
            const { error } = await supabase.from('shifts').insert(shiftsToInsert);

            if (error) throw error;

            setHasUnsavedChanges(false);
            setIsDayPublished(publish);
            if (!silent) toast.success(`${activeShifts.length} turno(s) guardado(s)`);
            if (!silent) router.push('/staff/schedule');
            return true;
        } catch (error: any) {
            console.error(error);
            if (!silent) toast.error('Error al guardar');
            return false;
        }
    };

    const handleSendNotifications = async () => {
        const saved = await handleSave(true, true);
        if (!saved) return;
        const userIds = shifts.filter(s => s.active).map(s => s.employeeId);
        const dateFormatted = format(new Date(date), "EEEE d 'de' MMMM", { locale: es });
        const loadingToast = toast.loading('Enviando notificaciones...');
        try {
            const result = await sendScheduleNotifications(userIds, dateFormatted);
            toast.dismiss(loadingToast);
            if (result.success) {
                toast.success('Notificaciones enviadas');
                router.push('/staff/schedule');
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Error al enviar');
        }
    };

    const generateCalendarDays = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (number | null)[] = [];
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
        return days;
    };

    const handleSelectCalendarDate = (day: number) => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (hasUnsavedChanges && !confirm('¿Cambiar de fecha sin guardar?')) return;
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
        <div className="min-h-screen w-full flex flex-col bg-[#5B8FB9] p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden text-gray-800">
            {/* CONTENEDOR MAESTRO VERDE PETRÓLEO - SIN PADDING INTERNO y OVERFLOW HIDDEN */}
            <div className="bg-[#36606F] rounded-[32px] shadow-2xl flex flex-col flex-1 max-w-7xl mx-auto w-full overflow-hidden relative">

                {/* CABECERA (Fecha y Botones) - Con padding propio */}
                <div className="flex items-center justify-between px-4 py-3 shrink-0">
                    <button onClick={() => setShowCalendarModal(true)} className="flex items-center gap-2 group cursor-pointer hover:bg-white/10 px-2 py-1.5 rounded-xl transition-all">
                        <h2 className="text-[14px] md:text-xl font-black text-white uppercase tracking-widest whitespace-nowrap capitalize">
                            {date && format(new Date(date), "EEEE d 'de' MMMM", { locale: es })}
                        </h2>
                    </button>

                    <div className="flex items-center gap-1.5 md:gap-2">
                        {isDayPublished && !hasUnsavedChanges && (
                            <div className="bg-emerald-500/20 text-emerald-100 px-2 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle2 size={12} /> <span className="hidden sm:inline">PUBLICADO</span>
                            </div>
                        )}
                        <button onClick={() => handleSave(false, false)} className="bg-white/10 hover:bg-white/20 text-white p-2 md:px-3 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm flex items-center gap-1.5">
                            <Save size={16} /> <span className="hidden sm:inline">BORRADOR</span>
                        </button>
                        <button onClick={() => handleSave(false, true)} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 md:px-3 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm flex items-center gap-1.5">
                            <CheckCircle2 size={16} /> <span className="hidden sm:inline">CONFIRMAR</span>
                        </button>
                        <button onClick={handleSendNotifications} className="bg-white/10 hover:bg-white/20 text-white p-2 md:px-3 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm flex items-center gap-1.5">
                            <Send size={16} /> <span className="hidden sm:inline">ENVIAR</span>
                        </button>
                    </div>
                </div>

                {/* CONTENEDOR BLANCO MONOLÍTICO - SIN BORDES REDONDEADOS NI MÁRGENES */}
                {/* Ocupa todo el ancho y el alto restante. El padre recorta las esquinas inferiores. */}
                <div className="bg-white flex flex-col flex-1 w-full overflow-hidden">

                    {/* ZONA DE INPUTS SUPERIOR - Con padding propio */}
                    <div className="p-4 md:p-6 w-full shrink-0 border-b border-gray-100">
                        <div className="flex items-center gap-2 sm:gap-4 w-full overflow-hidden justify-center max-w-2xl mx-auto">
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest pl-2">Actividad</span>
                                <div className="flex items-center bg-white px-3 py-2 rounded-2xl border-2 border-zinc-100 focus-within:border-zinc-300 transition-colors">
                                    <input
                                        type="text"
                                        value={activity}
                                        onChange={(e) => { setActivity(e.target.value); setHasUnsavedChanges(true); }}
                                        className="w-full bg-transparent text-left font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none uppercase placeholder:text-zinc-300"
                                        placeholder="ARTÍSTICA"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 w-[75px] sm:w-[90px]">
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest text-center">Inicio</span>
                                <div className="flex items-center justify-center bg-white px-2 py-2 rounded-2xl border-2 border-zinc-100 focus-within:border-zinc-300 transition-colors">
                                    <input type="time" value={defaultStart} onChange={(e) => setDefaultStart(e.target.value)} className="bg-transparent text-center font-black text-emerald-600 text-[11px] sm:text-xs focus:outline-none font-mono w-full" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 w-[75px] sm:w-[90px]">
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest text-center">Final</span>
                                <div className="flex items-center justify-center bg-white px-2 py-2 rounded-2xl border-2 border-zinc-100 focus-within:border-zinc-300 transition-colors">
                                    <input type="time" value={defaultEnd} onChange={(e) => setDefaultEnd(e.target.value)} className="bg-transparent text-center font-black text-rose-500 text-[11px] sm:text-xs focus:outline-none font-mono w-full" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 w-[50px] sm:w-[70px]">
                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest text-center">Part.</span>
                                <div className="flex items-center justify-center bg-white px-2 py-2 rounded-2xl border-2 border-zinc-100 focus-within:border-zinc-300 transition-colors h-[34px] sm:h-[38px]">
                                    <input type="text" value={participantsCount} onChange={(e) => setParticipantsCount(e.target.value)} className="bg-transparent text-center font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none w-full" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ZONA DE TABLA Y FILAS */}
                    <div className="flex flex-col flex-1 relative min-h-0 bg-white w-full">

                        {/* ENCABEZADO ROJO */}
                        <div className="flex w-full bg-[#E55353] text-white sticky top-0 z-30 shadow-sm">
                            <div className="w-24 md:w-32 px-3 flex items-center justify-start shrink-0 border-r border-white/20 cursor-pointer hover:bg-white/10 transition-colors group" onClick={() => setShowAddModal(true)}>
                                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white truncate flex items-center gap-1.5">
                                    Trabajador <Plus size={12} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                </span>
                            </div>
                            <div className="flex-1 relative h-8 md:h-9 flex">
                                {hoursHeader.map((hour) => (
                                    <div key={hour} className="flex-1 text-[9px] md:text-[10px] font-black flex items-center justify-center select-none opacity-90 border-r border-white/10 last:border-r-0">
                                        {hour}
                                    </div>
                                ))}
                            </div>
                            <div className="w-10 md:w-12 shrink-0 border-l border-white/20"></div>
                        </div>

                        {/* FILAS DE EMPLEADOS */}
                        <div className="flex-1 overflow-y-auto bg-white custom-scrollbar pb-2">
                            {shifts.map((shift, idx) => (
                                <div key={shift.employeeId} className={`flex w-full h-12 md:h-14 border-b border-gray-100 last:border-b-0 transition-colors ${editingIndex === idx ? 'bg-blue-50/40' : 'bg-white'}`}>
                                    <div className="w-24 md:w-32 px-3 flex items-center shrink-0 border-r border-gray-100 overflow-hidden group/row">
                                        <span className={`font-black text-[10px] md:text-xs truncate uppercase tracking-tight transition-colors ${editingIndex === idx ? 'text-[#5B8FB9]' : 'text-gray-800'} flex-1`}>
                                            {shift.name}
                                        </span>
                                    </div>
                                    <div className="flex-1 relative cursor-pointer group" onClick={() => setEditingIndex(idx)}>
                                        <div className="absolute inset-0 flex">
                                            {hoursHeader.map((_, i) => (
                                                <div key={i} className="flex-1 border-r border-gray-50/50 pointer-events-none last:border-r-0" />
                                            ))}
                                        </div>
                                        {shift.active && <ShiftBar shift={shift} onUpdate={(newS) => handleUpdateShift(idx, newS)} />}
                                    </div>
                                    <div className="w-10 md:w-12 shrink-0 flex items-center justify-center border-l border-gray-100">
                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(idx); }} className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0 hover:bg-red-500 hover:text-white transition-all active:scale-95">
                                            <X size={14} strokeWidth={4} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* FOOTER VERDE */}
                        <div className="flex w-full bg-[#0FA968] text-white shrink-0 sticky bottom-0 z-30">
                            <div className="w-24 md:w-32 h-10 md:h-12 font-black text-white text-[10px] md:text-xs flex items-center justify-center uppercase tracking-widest shrink-0 border-r border-white/20">
                                TOT
                            </div>
                            <div className="flex-1 relative h-10 md:h-12 flex">
                                {totals.map((count, i) => (
                                    <div key={i} className={`flex-1 flex items-center justify-center font-black text-[10px] md:text-xs transition-colors ${count > 0 ? 'text-white' : 'text-white/30'}`}>
                                        {count > 0 ? count : ''}
                                    </div>
                                ))}
                            </div>
                            <div className="w-10 md:w-12 shrink-0 border-l border-white/20"></div>
                        </div>

                    </div>
                </div>

                {/* BARRA EDICIÓN FLOTANTE */}
                {editingIndex !== null && shifts[editingIndex] && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[90%] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
                        <div className="h-14 flex items-center p-1.5 bg-zinc-900/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10">
                            <div className="flex-1 relative h-full rounded-xl overflow-hidden self-center">
                                <ShiftBar shift={shifts[editingIndex]} onUpdate={(newS) => handleUpdateShift(editingIndex, newS)} allowMove={false} barClass="bg-[#5B8FB9] border border-white/20" />
                            </div>
                            <button onClick={() => setEditingIndex(null)} className="ml-3 mr-1 w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-rose-500 text-white transition-all active:scale-95 shrink-0">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODALES (Sin cambios) */}
            {showCalendarModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowCalendarModal(false)}>
                    <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-5 flex items-center justify-between border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="text-white hover:bg-white/10 p-2 rounded-xl transition-all"><ChevronLeft size={20} /></button>
                                <span className="text-white font-black uppercase tracking-widest text-sm min-w-[120px] text-center capitalize">{calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                                <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="text-white hover:bg-white/10 p-2 rounded-xl transition-all"><ChevronRight size={20} /></button>
                            </div>
                            <button onClick={() => setShowCalendarModal(false)} className="bg-white/10 hover:bg-rose-500 text-white p-2 rounded-xl transition-all"><X size={20} /></button>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>)}
                                {generateCalendarDays().map((day, i) => (
                                    <button key={i} onClick={() => day && handleSelectCalendarDate(day)} disabled={!day} className={`aspect-square flex items-center justify-center rounded-2xl text-sm font-bold transition-all ${!day ? 'invisible' : 'hover:bg-blue-50 text-gray-700'} ${day === new Date().getDate() && calendarDate.getMonth() === new Date().getMonth() ? 'bg-[#36606F] text-white shadow-md' : ''}`}>{day}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-[24px] w-full max-w-xs overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-6 py-5 flex justify-between items-center text-white border-b border-white/10">
                            <h3 className="text-sm font-black uppercase tracking-widest">Añadir Personal</h3>
                            <button onClick={() => setShowAddModal(false)} className="bg-white/10 hover:bg-rose-500 p-2 rounded-xl transition-all"><X size={18} /></button>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-3 grid gap-1 custom-scrollbar">
                            {availableProfiles.filter(p => !shifts.some(s => s.employeeId === p.id)).map(profile => (
                                <button key={profile.id} onClick={() => handleAddEmployee(profile.id)} className="flex items-center gap-4 p-3 hover:bg-emerald-50 rounded-2xl transition-all text-left group">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors"><UserPlus size={18} /></div>
                                    <span className="font-bold text-gray-800 text-sm">{profile.first_name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}