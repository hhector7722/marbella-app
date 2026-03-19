'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from "@/utils/supabase/client";
import {
    X,
    Save,
    Plus,
    Minus,
    ChevronLeft,
    ChevronRight,
    UserPlus,
    Send,
    CheckCircle2,
    Share2,
    Check,
    ArrowLeft
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendScheduleNotifications } from '@/app/actions/notifications';

export interface ScheduleDayEditorProps {
    initialDate: string;
    onClose: () => void;
    onSuccess?: () => void;
    onRequestCloseModal?: () => void;
    embedded?: boolean;
}

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

/** Suma o resta 30 min a una hora "HH:mm", respetando 7:00–23:00 */
const stepTime = (timeStr: string, deltaMinutes: number): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const totalM = (h - START_HOUR) * 60 + m + deltaMinutes;
    const maxM = (END_HOUR - START_HOUR) * 60;
    const clamped = Math.max(0, Math.min(maxM, totalM));
    const hours = Math.floor(clamped / 60) + START_HOUR;
    const mins = clamped % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

// --- BARRA INTERACTIVA: mismo aspecto que el modal (verde #34d399, sombra) ---
const ShiftBar = ({
    shift,
    onUpdate,
    allowMove = true,
    barClass = ''
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
    const isFloating = barClass.includes('bg-[') || barClass.includes('zinc');

    const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'left' | 'right') => {
        if (!allowMove) return;
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
            className={cn('absolute top-1.5 bottom-1.5 flex items-center rounded-full z-10 touch-none overflow-hidden', barClass, allowMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
            style={{
                left: `${leftPos}%`,
                width: `${width}%`,
                ...(isFloating ? {} : { background: '#34d399', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.25)' }),
            }}
            onPointerDown={(e) => allowMove && handlePointerDown(e, 'move')}
        >
            <div className="absolute left-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'left')} />
            <div className="absolute left-0 top-0 bottom-0 min-w-[48px] flex items-center justify-center shrink-0 z-20">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{shift.start}</span>
            </div>
            <div className="flex-1 h-full min-w-0" />
            <div className="absolute right-0 top-0 bottom-0 min-w-[48px] flex items-center justify-center shrink-0 z-20">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{shift.end}</span>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'right')} />
        </div>
    );
};


export function ScheduleDayEditor({ initialDate, onClose, onSuccess, onRequestCloseModal, embedded = false }: ScheduleDayEditorProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);

    const [date, setDate] = useState('');
    const [activity, setActivity] = useState('');
    const [shifts, setShifts] = useState<any[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isDayPublished, setIsDayPublished] = useState(false);
    const [isDaySent, setIsDaySent] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [defaultStart, setDefaultStart] = useState('');
    const [defaultEnd, setDefaultEnd] = useState('');
    const [participantsCount, setParticipantsCount] = useState<string>('');
    const [categoria, setCategoria] = useState<string>('');

    // Slot 2 (segunda actividad dentro del mismo día)
    const [activity2, setActivity2] = useState<string>('');
    const [defaultStart2, setDefaultStart2] = useState<string>('');
    const [defaultEnd2, setDefaultEnd2] = useState<string>('');
    const [participantsCount2, setParticipantsCount2] = useState<string>('');
    const [categoria2, setCategoria2] = useState<string>('');

    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    useEffect(() => {
        if (!loading && hasUnsavedChanges) {
            setIsSaving(true);
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                // El autoguardado NUNCA debe publicar, siempre guarda como borrador (false)
                await handleSave(true, false);
                setIsSaving(false);
            }, 1000);
        }
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [
        shifts,
        activity,
        defaultStart,
        defaultEnd,
        participantsCount,
        categoria,
        activity2,
        defaultStart2,
        defaultEnd2,
        participantsCount2,
        categoria2,
        hasUnsavedChanges,
        loading
    ]);

    useEffect(() => {
        const targetDate = initialDate || new Date().toISOString().split('T')[0];
        setDate(targetDate);
        setCalendarDate(new Date(targetDate));
        fetchData(targetDate);
    }, [initialDate]);

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
                .lte('start_time', endOfDay)
                .order('created_at', { ascending: false }); // Mas nuevos primero

            // DEDUPLICACIÓN: Mapa por user_id, quedándonos con el primero (más reciente)
            const shiftMap = new Map();
            existingShifts?.forEach(s => {
                if (!shiftMap.has(s.user_id)) {
                    shiftMap.set(s.user_id, s);
                }
            });

            const activeShifts = employees?.filter(emp => shiftMap.has(emp.id)).map(emp => {
                const existing = shiftMap.get(emp.id);

                let displayName = emp.first_name;
                const lowerName = displayName?.toLowerCase() || '';
                if (lowerName === 'fernando') displayName = 'Fer';
                if (lowerName === 'mamadou') displayName = 'Mamdou';

                // Usamos los valores de borrador si existen, si no los publicados
                const sTime = existing!.draft_start_time || existing!.start_time;
                const eTime = existing!.draft_end_time || existing!.end_time;
                const sActivity = existing!.draft_activity || existing!.activity || '';
                const sActivity2 = existing!.draft_activity_2 || existing!.activity_2 || '';
                const sCategoria = existing!.draft_categoria || existing!.categoria || '';
                const sCategoria2 = existing!.draft_categoria_2 || existing!.categoria_2 || '';
                const sNotes = existing!.draft_notes || existing!.notes || '{}';

                const parsedNotes = (() => {
                    try {
                        return JSON.parse(sNotes || '{}');
                    } catch {
                        return {};
                    }
                })();

                return {
                    employeeId: emp.id,
                    name: displayName,
                    start: new Date(sTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                    end: new Date(eTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                    activity: sActivity,
                    categoria: sCategoria,
                    participantsCount: parsedNotes.participantsCount || '',
                    activity2: sActivity2,
                    start2: parsedNotes.defaultStart2 || existing!.event_start_time_2 || '',
                    end2: parsedNotes.defaultEnd2 || existing!.event_end_time_2 || '',
                    participantsCount2: parsedNotes.participantsCount2 || (existing!.event_participants_2 != null ? String(existing!.event_participants_2) : ''),
                    categoria2: sCategoria2,
                    active: true
                };
            }) || [];

            const uniqueShifts = Array.from(shiftMap.values()) as any[];

            if (uniqueShifts.length > 0) {
                // Keep the first one as day-level fallback/defaults
                const first = uniqueShifts[0];
                const fActivity = first.draft_activity || first.activity || '';
                const fActivity2 = first.draft_activity_2 || first.activity_2 || '';
                const fNotes = first.draft_notes || first.notes || '{}';

                setActivity(fActivity);

                const fCategoria = first.draft_categoria || first.categoria || '';
                const fCategoria2 = first.draft_categoria_2 || first.categoria_2 || '';
                setCategoria(fCategoria);
                setCategoria2(fCategoria2);

                let pStart = '';
                let pEnd = '';
                let pPart = '';
                let pStart2 = '';
                let pEnd2 = '';
                let pPart2 = '';

                try {
                    const parsed = JSON.parse(fNotes);
                    pStart = parsed.defaultStart || '';
                    pEnd = parsed.defaultEnd || '';
                    pPart = parsed.participantsCount || '';
                    pStart2 = parsed.defaultStart2 || '';
                    pEnd2 = parsed.defaultEnd2 || '';
                    pPart2 = parsed.participantsCount2 || '';
                } catch (e) { }

                // Fallback to actual times if notes are missing or defaults are empty
                const fStartTime = first.draft_start_time || first.start_time;
                const fEndTime = first.draft_end_time || first.end_time;
                if (!pStart && fStartTime) pStart = new Date(fStartTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                if (!pEnd && fEndTime) pEnd = new Date(fEndTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

                setDefaultStart(pStart);
                setDefaultEnd(pEnd);
                setParticipantsCount(pPart);

                setActivity2(fActivity2);

                // Slot 2: apoyamos en notes (nuevo) y fallback en columnas event_*_2 (legacy)
                const fStart2 = first.event_start_time_2 || '';
                const fEnd2 = first.event_end_time_2 || '';
                if (!pStart2 && fStart2) pStart2 = fStart2;
                if (!pEnd2 && fEnd2) pEnd2 = fEnd2;

                if (!pPart2 && first.event_participants_2 != null) pPart2 = String(first.event_participants_2);

                setDefaultStart2(pStart2);
                setDefaultEnd2(pEnd2);
                setParticipantsCount2(pPart2);

                setIsDayPublished(uniqueShifts.some(s => s.is_published));
            } else {
                setIsDayPublished(false);
                setActivity('');
                setDefaultStart('');
                setDefaultEnd('');
                setParticipantsCount('');
                setCategoria('');
                setActivity2('');
                setDefaultStart2('');
                setDefaultEnd2('');
                setParticipantsCount2('');
                setCategoria2('');
            }

            setShifts(activeShifts);
            setAvailableProfiles((employees || []).filter((e: any) => {
                const name = (e.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            }));
            setHasUnsavedChanges(false);
            setIsDaySent(false); // Reinicia estado "enviado" al cambiar día
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
            name: profile.first_name?.toLowerCase() === 'fernando' ? 'Fer' : (profile.first_name?.toLowerCase() === 'mamadou' ? 'Mamdou' : profile.first_name),
            start: defaultStart || '09:00',
            end: defaultEnd || '17:00',
            activity: activity || '',
            categoria: categoria || '',
            participantsCount: participantsCount || '',
            activity2: activity2 || '',
            start2: defaultStart2 || '',
            end2: defaultEnd2 || '',
            participantsCount2: participantsCount2 || '',
            categoria2: categoria2 || '',
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
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                if (!silent) toast.error('No hay sesión activa');
                return false;
            }

            const startOfRange = new Date(`${date}T00:00:00`).toISOString();
            const endOfRange = new Date(`${date}T23:59:59`).toISOString();

            // Si no hay turnos activos: borrar todos los del día y salir (tabla vacía permitida)
            if (activeShifts.length === 0) {
                const { error } = await supabase.from('shifts')
                    .delete()
                    .gte('start_time', startOfRange)
                    .lte('start_time', endOfRange);
                if (error) throw error;
                setHasUnsavedChanges(false);
                setIsDayPublished(false);
                if (!silent) toast.success('Horario vacío guardado');
                fetchData(date);
                return true;
            }

            // Paso 1: Obtener estado actual de la DB para este día
            const { data: dbShifts } = await supabase.from('shifts')
                .select('*')
                .gte('start_time', startOfRange)
                .lte('start_time', endOfRange);

            const dbShiftMap = new Map(dbShifts?.map(s => [s.user_id, s]) || []);

            // Paso 2: Preparar los nuevos registros
            const shiftsToInsert = activeShifts.map(shift => {
                const existing = dbShiftMap.get(shift.employeeId);
                const startDateTime = new Date(`${date}T${shift.start}:00`);
                const endDateTime = new Date(`${date}T${shift.end}:00`);
                const isoStart = startDateTime.toISOString();
                const isoEnd = endDateTime.toISOString();
                const shiftActivity = shift.activity || activity || null;
                const shiftCategory = shift.categoria || categoria || null;
                const shiftActivity2 = shift.activity2 || activity2 || null;
                const shiftCategory2 = shift.categoria2 || categoria2 || null;

                const slot2Start = shift.start2 || defaultStart2;
                const slot2End = shift.end2 || defaultEnd2;
                const slot2Participants = shift.participantsCount2 || participantsCount2;
                const shiftNotes = JSON.stringify({
                    defaultStart: shift.start || defaultStart,
                    defaultEnd: shift.end || defaultEnd,
                    participantsCount: shift.participantsCount || participantsCount,
                    defaultStart2: shift.start2 || defaultStart2,
                    defaultEnd2: shift.end2 || defaultEnd2,
                    participantsCount2: shift.participantsCount2 || participantsCount2
                });

                const data: any = {
                    user_id: shift.employeeId,
                    draft_start_time: isoStart,
                    draft_end_time: isoEnd,
                    draft_activity: shiftActivity,
                    draft_categoria: shiftCategory,
                    draft_activity_2: shiftActivity2,
                    draft_notes: shiftNotes,
                    draft_categoria_2: shiftCategory2,
                    event_start_time: defaultStart || null,
                    event_end_time: defaultEnd || null,
                    event_participants: participantsCount ? parseInt(participantsCount) : null,
                    event_start_time_2: slot2Start || null,
                    event_end_time_2: slot2End || null,
                    event_participants_2: slot2Participants ? parseInt(slot2Participants) : null,
                    is_published: publish ? true : (existing?.is_published || false),
                    // Mantenemos start_time como ancla para el rango del día
                    start_time: isoStart,
                    end_time: isoEnd
                };

                // Si publicamos, sincronizamos con las columnas principales activamente
                if (publish) {
                    data.activity = shiftActivity;
                    data.activity_2 = shiftActivity2;
                    data.notes = shiftNotes;
                    data.categoria = shiftCategory;
                    data.categoria_2 = shiftCategory2;
                    data.is_published = true;
                } else if (existing && existing.is_published) {
                    // Si ya está publicado, NO tocamos las columnas principales durante un autoguardado
                    // Restauramos los valores originales de la DB para las columnas públicas
                    data.start_time = existing.start_time;
                    data.end_time = existing.end_time;
                    data.activity = existing.activity;
                    data.activity_2 = existing.activity_2;
                    data.notes = existing.notes;
                    data.categoria = existing.categoria;
                    data.categoria_2 = existing.categoria_2;
                    data.is_published = true;
                } else if (!existing) {
                    // Si es totalmente nuevo, inicializamos las principales pero como borrador (is_published: false)
                    data.activity = shiftActivity;
                    data.activity_2 = shiftActivity2;
                    data.notes = shiftNotes;
                    data.categoria = shiftCategory;
                    data.categoria_2 = shiftCategory2;
                    data.is_published = false;
                }

                return data;
            });

            // Borramos los turnos de los usuarios del día para re-insertar de forma limpia
            await supabase.from('shifts')
                .delete()
                .gte('start_time', startOfRange)
                .lte('start_time', endOfRange);

            const { error } = await supabase.from('shifts').insert(shiftsToInsert);

            if (error) throw error;

            setHasUnsavedChanges(false);
            setIsDayPublished(publish || isDayPublished);
            if (!silent) toast.success(`${activeShifts.length} turno(s) guardado(s)`);
            if (!silent && !publish) {
                fetchData(date);
            } else if (!silent && publish) {
                onSuccess?.();
                onClose();
            }
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
        // Solo usuarios que tienen turno ese día (activo y con hora inicio/fin)
        const userShifts = shifts
            .filter(s => s.active && s.start && s.end)
            .map(s => ({ userId: s.employeeId, start: s.start, end: s.end }));
        if (userShifts.length === 0) {
            toast.info('No hay nadie con horario ese día para notificar');
            return;
        }
        const dateFormatted = format(new Date(date), "EEEE dd/MM", { locale: es });
        const loadingToast = toast.loading('Enviando notificaciones...');
        try {
            const result = await sendScheduleNotifications(dateFormatted, userShifts);
            toast.dismiss(loadingToast);
            if (result?.error || result?.success === false) {
                toast.error(result?.error || 'Error al enviar notificaciones');
                return;
            }
                                            const sent = Number(result?.sentCount ?? 0);
                                            const target = Number(result?.targetCount ?? userShifts.length);
            const missing = Array.isArray(result?.missingSubscriptionUserIds) ? result.missingSubscriptionUserIds.length : Math.max(0, target - sent);
            if (sent <= 0) {
                toast.error('No se ha enviado ninguna notificación. Activa notificaciones en el móvil/PC (permiso + dispositivo suscrito).');
                return;
            }
            if (sent < target) {
                toast.warning(`Enviadas ${sent}/${target}. Faltan ${missing} sin push activado.`);
            } else {
                toast.success('Notificaciones enviadas');
            }
            onSuccess?.();
            onClose();
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Error al enviar');
        }
    };

    const navigateDay = async (direction: -1 | 1) => {
        if (hasUnsavedChanges) {
            await handleSave(true, isDayPublished);
        }
        const currentDate = new Date(`${date}T12:00:00`);
        const newDate = direction === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1);
        const newDateStr = newDate.toISOString().split('T')[0];
        setDate(newDateStr);
        fetchData(newDateStr);
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

    const handleSelectCalendarDate = async (day: number) => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (hasUnsavedChanges) {
            await handleSave(true, isDayPublished);
        }
        setShowCalendarModal(false);
        setDate(dateStr);
        fetchData(dateStr);
    };

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
    const totals = hoursHeader.map(hour =>
        shifts.filter(s => s.active && hour >= parseInt(s.start.split(':')[0]) && hour < parseInt(s.end.split(':')[0])).length
    );

    const slot1ActivityValue = (editingIndex !== null ? (shifts[editingIndex]?.activity ?? '') : activity).trim();
    const slot2ActivityValue = (editingIndex !== null ? (shifts[editingIndex]?.activity2 ?? '') : activity2).trim();
    const hasSlot1Activity = slot1ActivityValue.length > 0;
    const hasSlot2Activity = slot2ActivityValue.length > 0;

    if (loading) {
        if (embedded) {
            return (
                <div className="flex flex-1 min-h-0 items-center justify-center bg-[#36606F] rounded-2xl">
                    <div className="w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
                </div>
            );
        }
        return <div className="min-h-screen bg-[#5B8FB9]" />;
    }

    return (
        <div className={embedded ? 'flex flex-col flex-1 min-h-0 w-full text-gray-800 overflow-hidden' : 'min-h-[100dvh] w-full flex flex-col bg-[#5B8FB9] p-3 sm:p-4 md:p-6 lg:p-8 text-gray-800'} onClick={() => setEditingIndex(null)}>
            <div className={cn('bg-[#36606F] shadow-xl flex flex-col shrink w-full relative overflow-hidden', embedded ? 'rounded-2xl flex-1 min-h-0' : 'rounded-[32px] max-w-7xl mx-auto')}>

                {/* WRAPPER STICKY GLOBAL PARA TODA LA CABECERA */}
                <div className="sticky top-[0px] z-30 flex flex-col w-full rounded-t-[32px] shadow-sm bg-[#36606F] -mt-[1px]">
                    {/* CABECERA (Fecha y Botones) */}
                    <div className="flex items-center justify-between px-4 py-3 shrink-0 relative">
                        <div className="flex items-center gap-0 sm:gap-1 mt-2">
                            {embedded && (
                                <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white active:scale-95 flex-shrink-0" title="Volver">
                                    <ArrowLeft size={22} strokeWidth={2.5} />
                                </button>
                            )}
                            <button onClick={() => navigateDay(-1)} className="p-1 sm:p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white active:scale-95 flex-shrink-0">
                                <ChevronLeft size={24} />
                            </button>
                            <button onClick={() => setShowCalendarModal(true)} className="flex items-center gap-1 group cursor-pointer hover:bg-white/10 px-1 py-1 sm:py-1.5 rounded-xl transition-all">
                                <h2 className="text-[13px] sm:text-[15px] md:text-xl font-black text-white uppercase tracking-widest whitespace-nowrap capitalize">
                                    {date && format(new Date(date), "EEE d MMMM", { locale: es }).replace(/^(\w{3})\./, '$1')}
                                </h2>
                            </button>
                            <button onClick={() => navigateDay(1)} className="p-1 sm:p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white active:scale-95 flex-shrink-0">
                                <ChevronRight size={24} />
                            </button>
                        </div>

                        <div className="flex items-center gap-1 mt-2">
                            {/* Movemos Botón Agregar Empleado a Cabecera */}
                            <button onClick={() => setShowAddModal(true)} className="w-7 h-7 md:w-8 md:h-8 bg-[#0FA968] hover:bg-emerald-600 rounded-xl flex items-center justify-center text-white transition-colors shadow-sm active:scale-95 group">
                                <Plus size={16} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
                            </button>

                            <button
                                onClick={() => setShowShareModal(true)}
                                className={`relative w-7 h-7 md:w-8 md:h-8 rounded-xl text-white transition-all active:scale-95 shadow-sm flex items-center justify-center bg-[#36606F] hover:bg-[#2a4d59] group ${isDayPublished && hasUnsavedChanges ? 'ring-2 ring-orange-400/80 ring-offset-2 ring-offset-[#36606F]' : ''}`}
                            >
                                <Share2 size={16} strokeWidth={2.5} className="text-white" />
                                {isDayPublished && isDaySent && (
                                    <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow-sm z-10 border border-gray-100">
                                        <Check size={10} className="text-emerald-500" strokeWidth={4} />
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* ZONA BLANCA E INFERIOR (INPUTS + ROJA) */}
                    <div className="flex flex-col shrink w-full bg-white relative">
                        {/* ZONA DE INPUTS SUPERIOR - Sin border-b ni shadow */}
                        <div className="p-4 md:p-6 w-full shrink-0">
                            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3 sm:p-4 w-full overflow-hidden justify-center max-w-2xl mx-auto">
                                <div className="flex items-center justify-between mb-3 gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Datos de la actividad</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                        {hasSlot1Activity || hasSlot2Activity ? 'Listo' : 'Sin actividad'}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {/* SLOT 1 */}
                                    <div className={cn("grid gap-2 sm:gap-4 w-full overflow-hidden", hasSlot1Activity ? "grid-cols-5" : "grid-cols-1")}>
                                        <div className="flex flex-col gap-1.5 min-w-0">
                                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Act</span>
                                            <div className="flex items-center bg-white px-3 h-12 rounded-2xl border border-zinc-100">
                                                <input
                                                    type="text"
                                                    value={editingIndex !== null ? (shifts[editingIndex].activity ?? '') : activity}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (editingIndex !== null) {
                                                            handleUpdateShift(editingIndex, { ...shifts[editingIndex], activity: val });
                                                        } else {
                                                            setActivity(val);
                                                            setHasUnsavedChanges(true);
                                                        }
                                                    }}
                                                    className="w-full bg-transparent text-left font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none uppercase placeholder:text-zinc-300"
                                                    placeholder="ARTÍSTICA"
                                                />
                                            </div>
                                        </div>

                                        {hasSlot1Activity && (
                                            <>
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Inicio</span>
                                                    <div className="flex items-center justify-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="time"
                                                            value={editingIndex !== null ? (shifts[editingIndex].start ?? '') : defaultStart}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], start: val });
                                                                } else {
                                                                    setDefaultStart(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="bg-transparent text-center font-black text-emerald-600 text-[11px] sm:text-xs focus:outline-none font-mono w-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Final</span>
                                                    <div className="flex items-center justify-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="time"
                                                            value={editingIndex !== null ? (shifts[editingIndex].end ?? '') : defaultEnd}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], end: val });
                                                                } else {
                                                                    setDefaultEnd(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="bg-transparent text-center font-black text-rose-500 text-[11px] sm:text-xs focus:outline-none font-mono w-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Part</span>
                                                    <div className="flex items-center justify-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="text"
                                                            value={editingIndex !== null ? (shifts[editingIndex].participantsCount ?? '') : participantsCount}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], participantsCount: val });
                                                                } else {
                                                                    setParticipantsCount(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="bg-transparent text-center font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none w-full"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">cart</span>
                                                    <div className="flex items-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="text"
                                                            value={editingIndex !== null ? (shifts[editingIndex].categoria ?? '') : categoria}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], categoria: val });
                                                                } else {
                                                                    setCategoria(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="w-full bg-transparent text-center font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none uppercase placeholder:text-zinc-300"
                                                            placeholder="INFANTILES"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* SLOT 2 */}
                                    <div className={cn("grid gap-2 sm:gap-4 w-full overflow-hidden", hasSlot2Activity ? "grid-cols-5" : "grid-cols-1")}>
                                        <div className="flex flex-col gap-1.5 min-w-0">
                                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Act 2</span>
                                            <div className="flex items-center bg-white px-3 h-12 rounded-2xl border border-zinc-100">
                                                <input
                                                    type="text"
                                                    value={editingIndex !== null ? (shifts[editingIndex].activity2 ?? '') : activity2}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (editingIndex !== null) {
                                                            handleUpdateShift(editingIndex, { ...shifts[editingIndex], activity2: val });
                                                        } else {
                                                            setActivity2(val);
                                                            setHasUnsavedChanges(true);
                                                        }
                                                    }}
                                                    className="w-full bg-transparent text-left font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none uppercase placeholder:text-zinc-300"
                                                    placeholder="ARTÍSTICA"
                                                />
                                            </div>
                                        </div>

                                        {hasSlot2Activity && (
                                            <>
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Inicio</span>
                                                    <div className="flex items-center justify-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="time"
                                                            value={editingIndex !== null ? (shifts[editingIndex].start2 ?? '') : defaultStart2}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], start2: val });
                                                                } else {
                                                                    setDefaultStart2(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="bg-transparent text-center font-black text-emerald-600 text-[11px] sm:text-xs focus:outline-none font-mono w-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Final</span>
                                                    <div className="flex items-center justify-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="time"
                                                            value={editingIndex !== null ? (shifts[editingIndex].end2 ?? '') : defaultEnd2}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], end2: val });
                                                                } else {
                                                                    setDefaultEnd2(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="bg-transparent text-center font-black text-rose-500 text-[11px] sm:text-xs focus:outline-none font-mono w-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">Part</span>
                                                    <div className="flex items-center justify-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="text"
                                                            value={editingIndex !== null ? (shifts[editingIndex].participantsCount2 ?? '') : participantsCount2}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], participantsCount2: val });
                                                                } else {
                                                                    setParticipantsCount2(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="bg-transparent text-center font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none w-full"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center h-3 flex items-center justify-center">cart</span>
                                                    <div className="flex items-center bg-white px-2 h-12 rounded-2xl border border-zinc-100">
                                                        <input
                                                            type="text"
                                                            value={editingIndex !== null ? (shifts[editingIndex].categoria2 ?? '') : categoria2}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (editingIndex !== null) {
                                                                    handleUpdateShift(editingIndex, { ...shifts[editingIndex], categoria2: val });
                                                                } else {
                                                                    setCategoria2(val);
                                                                    setHasUnsavedChanges(true);
                                                                }
                                                            }}
                                                            className="w-full bg-transparent text-center font-black text-zinc-800 text-[11px] sm:text-xs focus:outline-none uppercase placeholder:text-zinc-300"
                                                            placeholder="CADETES"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ENCABEZADO ROJO (Ancho completo) */}
                        <div className="flex w-full bg-[#E55353] text-white shrink-0 border-b border-gray-100 rounded-t-[24px]">
                            <div className="w-24 md:w-32 px-3 flex items-center justify-center shrink-0">
                                {/* Espacio donde antes estaba el botón de '+' */}
                            </div>
                            <div className="flex-1 relative h-8 md:h-9 flex">
                                {hoursHeader.map((hour) => (
                                    <div key={hour} className="flex-1 text-[9px] md:text-[10px] font-black flex items-center justify-start -translate-x-1 sm:-translate-x-2 select-none opacity-90">
                                        {hour}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ZONA DE TABLA Y FILAS (FUERA DEL PADRE STICKY) */}
                <div className="flex flex-col shrink min-h-0 w-full bg-white rounded-b-[32px] pt-2">

                    {/* FILAS DE EMPLEADOS */}
                    <div className="flex flex-col w-full bg-white relative pb-0 z-10">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className={`flex w-full h-9 md:h-10 border-b border-gray-100 last:border-b-0 transition-colors relative ${editingIndex === idx ? 'bg-blue-50/40 z-50' : 'bg-white z-10'}`} onClick={(e) => { if (editingIndex === idx) e.stopPropagation(); }}>
                                <div
                                    className="w-24 md:w-32 px-2 flex items-center gap-1 shrink-0 overflow-hidden group/row pl-3 md:pl-4 cursor-pointer hover:bg-blue-50/30 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); setEditingIndex(idx); }}
                                >
                                    <span className={`font-black text-[10px] md:text-xs truncate uppercase tracking-tight transition-colors ${editingIndex === idx ? 'text-[#5B8FB9]' : 'text-gray-800'} flex-1 select-none min-w-0`}>
                                        {shift.name}
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(idx); }}
                                        className="w-7 h-7 min-w-[28px] min-h-[28px] rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 hover:bg-red-600 transition-all shadow-sm active:scale-95 opacity-90 group-hover/row:opacity-100"
                                        title="Quitar del horario"
                                    >
                                        <X size={14} strokeWidth={4} />
                                    </button>
                                </div>
                                <div className="flex-1 relative">
                                    <div className="absolute inset-0 flex">
                                        {hoursHeader.map((_, i) => (
                                            <div key={i} className="flex-1 pointer-events-none" />
                                        ))}
                                    </div>
                                    {shift.active && <ShiftBar shift={shift} onUpdate={(newS) => handleUpdateShift(idx, newS)} allowMove={editingIndex === idx} />}
                                </div>

                                {/* BARRA EDICIÓN FLOTANTE: en embebido se pinta por portal; si no, aquí. Tarjeta oscura, + arriba (verde), - abajo (rojo). Cierre tocando fuera. */}
                                {editingIndex === idx && !embedded && (() => {
                                    const s = shift;
                                    const upd = (newS: typeof s) => handleUpdateShift(idx, newS);
                                    const step = SNAP_MINUTES;
                                    return (
                                        <div className="absolute top-[80px] md:top-[90px] left-0 right-0 z-[100] translate-y-2 pointer-events-none flex justify-center w-full px-4" onClick={(e) => e.stopPropagation()}>
                                            <div className="w-full max-w-md pointer-events-auto h-14 flex items-center gap-2 p-2 bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 animate-in fade-in zoom-in-95 duration-200">
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); upd({ ...s, start: stepTime(s.start, -step) }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95" title="Inicio -30 min"><Plus size={14} strokeWidth={3} /></button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); const t = stepTime(s.start, step); if (timeToPercent(t) < timeToPercent(s.end)) upd({ ...s, start: t }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95" title="Inicio +30 min"><Minus size={14} strokeWidth={3} /></button>
                                                </div>
                                                <div className="flex-1 relative h-full min-w-0 rounded-xl overflow-hidden">
                                                    <ShiftBar shift={s} onUpdate={upd} allowMove={true} barClass="bg-[#5B8FB9] border border-white/20" />
                                                </div>
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); const t = stepTime(s.end, step); if (timeToPercent(t) > timeToPercent(s.start)) upd({ ...s, end: t }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95" title="Final +30 min"><Plus size={14} strokeWidth={3} /></button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); upd({ ...s, end: stepTime(s.end, -step) }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95" title="Final -30 min"><Minus size={14} strokeWidth={3} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>

                    {/* Footer Total — mismo que modal: fondo blanco, texto gris */}
                    <div className="flex w-full bg-white border-t border-gray-100 shrink-0 rounded-b-2xl">
                        <div className="w-24 md:w-28 h-9 md:h-10 font-semibold text-gray-400 text-[10px] md:text-xs flex items-center justify-start pl-3 uppercase tracking-widest shrink-0">
                            Total
                        </div>
                        <div className="flex-1 h-9 md:h-10 flex">
                            {totals.map((count, i) => (
                                <div key={i} className={`flex-1 flex items-center justify-center font-semibold text-[10px] md:text-xs ${count > 0 ? 'text-gray-400' : 'text-gray-300'}`}>
                                    {count > 0 ? count : ''}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>

            {/* Barra flotante en portal cuando está embebido: tarjeta oscura, + arriba (verde), - abajo (rojo). Cierre tocando fuera (overlay). */}
            {embedded && editingIndex !== null && typeof document !== 'undefined' && shifts[editingIndex] && (() => {
                const s = shifts[editingIndex];
                const upd = (newS: typeof s) => handleUpdateShift(editingIndex, newS);
                const step = SNAP_MINUTES;
                return createPortal(
                    <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => setEditingIndex(null)} aria-hidden />
                        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md px-4 pointer-events-none" onClick={(e) => e.stopPropagation()}>
                            <div className="pointer-events-auto h-14 flex items-center gap-2 p-2 bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" onClick={() => upd({ ...s, start: stepTime(s.start, -step) })} className="w-8 h-6 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95" title="Inicio -30 min"><Plus size={14} strokeWidth={3} /></button>
                                    <button type="button" onClick={() => { const t = stepTime(s.start, step); if (timeToPercent(t) < timeToPercent(s.end)) upd({ ...s, start: t }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95" title="Inicio +30 min"><Minus size={14} strokeWidth={3} /></button>
                                </div>
                                <div className="flex-1 relative h-full min-w-0 rounded-xl overflow-hidden">
                                    <ShiftBar shift={s} onUpdate={upd} allowMove={true} barClass="bg-[#5B8FB9] border border-white/20" />
                                </div>
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" onClick={() => { const t = stepTime(s.end, step); if (timeToPercent(t) > timeToPercent(s.start)) upd({ ...s, end: t }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95" title="Final +30 min"><Plus size={14} strokeWidth={3} /></button>
                                    <button type="button" onClick={() => upd({ ...s, end: stepTime(s.end, -step) })} className="w-8 h-6 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95" title="Final -30 min"><Minus size={14} strokeWidth={3} /></button>
                                </div>
                            </div>
                        </div>
                    </>,
                    document.body
                );
            })()}

            {/* MODALES */}
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

            {/* MODAL COMPARTIR */}
            {showShareModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setShowShareModal(false)}>
                    <div className="bg-white rounded-[24px] w-full max-w-sm flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] p-4 flex items-center justify-center text-white relative">
                            <h3 className="text-sm font-black uppercase tracking-widest">Compartir</h3>
                        </div>
                        <div className="p-6 flex flex-col gap-5">
                            <div className="flex flex-col gap-1 text-center">
                                <span className="text-[10px] font-black tracking-widest text-zinc-400 uppercase mb-1">Estado del Horario</span>
                                <div className="text-xs uppercase font-black px-4 py-1.5 bg-gray-100 rounded-xl inline-flex self-center">
                                    <span className={`${isDayPublished ? (isDaySent ? 'text-emerald-500' : 'text-[#36606F]') : 'text-orange-400'}`}>
                                        {isDayPublished ? (isDaySent ? 'Publicado y Enviado' : 'Publicado') : 'Sin publicar'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 mt-2">
                                <button
                                    onClick={async () => {
                                        setShowShareModal(false);
                                        await handleSave(false, true);
                                    }}
                                    className="w-full bg-[#36606F] hover:bg-[#2a4d59] text-white py-3.5 rounded-2xl font-black tracking-widest text-sm transition-all active:scale-95 uppercase flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={18} /> {!isDayPublished ? 'Guardar' : 'Sobreescribir'}
                                </button>

                                <button
                                    onClick={async () => {
                                        setShowShareModal(false);
                                        const saved = await handleSave(true, true);
                                        if (saved || isDayPublished) {
                                            // Solo usuarios con turno ese día (activo y con hora inicio/fin)
                                            const userShifts = shifts
                                                .filter(s => s.active && s.start && s.end)
                                                .map(s => ({ userId: s.employeeId, start: s.start, end: s.end }));
                                            if (userShifts.length === 0) {
                                                toast.info('No hay nadie con horario ese día para notificar');
                                                return;
                                            }
                                            const dateFormatted = format(new Date(date), "EEEE dd/MM", { locale: es });
                                            const loadToast = toast.loading('Enviando...');
                                            try {
                                                const res = await sendScheduleNotifications(dateFormatted, userShifts);
                                                toast.dismiss(loadToast);
                                                if (res?.error || res?.success === false) {
                                                    toast.error(res?.error || 'Error al enviar notificaciones');
                                                    return;
                                                }
                                                const sent = Number(res?.sentCount ?? 0);
                                                const target = Number(res?.targetCount ?? userShifts.length);
                                                const missing = Array.isArray(res?.missingSubscriptionUserIds) ? res.missingSubscriptionUserIds.length : Math.max(0, target - sent);
                                                if (sent <= 0) {
                                                    toast.error('No se ha enviado ninguna notificación. Activa notificaciones en el móvil/PC (permiso + dispositivo suscrito).');
                                                    return;
                                                }
                                                if (sent < target) {
                                                    toast.warning(`Enviadas ${sent}/${target}. Faltan ${missing} sin push activado.`);
                                                } else {
                                                    toast.success('Notificaciones enviadas');
                                                }
                                                setIsDaySent(true);
                                            } catch (e) {
                                                toast.dismiss(loadToast);
                                                toast.error('Error al enviar');
                                            }
                                        }
                                    }}
                                    className={`w-full text-white py-3.5 rounded-2xl font-black tracking-widest text-sm transition-all active:scale-95 uppercase flex items-center justify-center gap-2 bg-[#0FA968] hover:bg-emerald-600`}
                                >
                                    <Send size={18} /> {!isDaySent ? 'Enviar' : 'Reenviar'}
                                </button>

                                <button
                                    onClick={() => setShowShareModal(false)}
                                    className="w-full bg-red-500 hover:bg-red-600 text-white py-3.5 rounded-2xl font-black tracking-widest text-sm transition-all active:scale-95 uppercase mt-1"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}