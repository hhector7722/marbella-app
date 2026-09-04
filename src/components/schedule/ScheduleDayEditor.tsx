'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X,
    Plus,
    Minus,
    ChevronLeft,
    ChevronRight,
    Share2,
    Check,
    ArrowLeft
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { MiniMonthCalendar } from '@/components/time/MiniMonthCalendar';
import { Button } from '@/components/ui/button';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';
import { ShrinkToFitInput } from '@/components/ui/ShrinkToFitCell';
import { fetchDayDetailAction, BarActivity } from '@/app/staff/actividades/actions';
import { sendScheduleNotifications } from '@/app/actions/notifications';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { filterVisiblePlantillaEmployees } from '@/lib/staff/plantilla-employees';
import { ScheduleDayProfitabilityBar } from '@/components/schedule/ScheduleDayProfitabilityBar';
import { ShiftBarTimeLabels } from '@/components/schedule/ShiftBarTimeLabels';

export interface ScheduleDayEditorProps {
    initialDate: string;
    onClose: () => void;
    onSuccess?: () => void;
    onRequestCloseModal?: () => void;
    embedded?: boolean;
    /** Instancia del Modal padre vivo; solo cuando el editor está embebido en StaffScheduleModal. */
    modalParentInstance?: string;
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
            className={cn('absolute top-1.5 bottom-1.5 flex items-center justify-between rounded-full z-10 touch-none overflow-hidden px-1.5', barClass, allowMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
            style={{
                left: `${leftPos}%`,
                width: `${width}%`,
                ...(isFloating ? {} : { background: '#34d399', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.25)' }),
            }}
            onPointerDown={(e) => allowMove && handlePointerDown(e, 'move')}
        >
            <div className="absolute left-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'left')} />
            <ShiftBarTimeLabels barRef={barRef} start={shift.start} end={shift.end} className="relative z-20" />
            <div className="absolute right-0 top-0 bottom-0 w-12 cursor-ew-resize z-30" onPointerDown={(e) => handlePointerDown(e, 'right')} />
        </div>
    );
};


export function ScheduleDayEditor({ initialDate, onClose, onSuccess, onRequestCloseModal, embedded = false, modalParentInstance }: ScheduleDayEditorProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);

    const [date, setDate] = useState('');
    const [activity, setActivity] = useState('');
    const [shifts, setShifts] = useState<any[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
    // Flag to avoid overwriting manual edits after initial autofill
    const [primaryFetched, setPrimaryFetched] = useState(false);

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
    /** Segunda card solo si hay texto en act. 2 o el usuario elige "añadir segunda actividad". */
    const [secondSlotExpanded, setSecondSlotExpanded] = useState(false);

    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    useModalUsageTracking({
        open: editingIndex !== null,
        usageId: 'schedule-shift-edit',
        usageLabel: 'Editar turno',
    });
    useModalUsageTracking({
        open: showCalendarModal,
        usageId: 'schedule-calendar',
        usageLabel: 'Calendario horarios',
    });
    useModalUsageTracking({
        open: showShareModal,
        usageId: 'schedule-share',
        usageLabel: 'Compartir horario',
    });

    const trackScheduleCalendarDay = useTrackModalApply('schedule-calendar-day', 'Día calendario horarios');
    const trackScheduleDayNav = useTrackModalApply('schedule-day-nav', 'Navegación día horarios');
    const trackScheduleShare = useTrackModalApply('schedule-share-apply', 'Acción compartir horario');

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

    useEffect(() => {
        // Reset secondary slot when date changes and refetch data
        setSecondSlotExpanded(false);
        setPrimaryFetched(false);
        fetchData(date);
    }, [date]);

    const fetchData = async (targetDate: string) => {
        setLoading(true);
        try {
            const { data: employees } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, end_date, avatar_url, visible_in_plantilla')
                .eq('visible_in_plantilla', true)
                .order('first_name');

            const startOfDay = `${targetDate}T00:00:00.000Z`;
            const endOfDay = `${targetDate}T23:59:59.999Z`;

            const { data: existingShifts } = await supabase
                .from('shifts')
                .select('*')
                .gte('start_time', startOfDay)
                .lte('start_time', endOfDay)
                .order('created_at', { ascending: false }); // Mas nuevos primero

            // Fetch bar activities for the day to auto-fill primary activity
            const dayDetailRes = await fetchDayDetailAction({ date: targetDate });
            let autoActivity = '';
            if (dayDetailRes.success) {
                const barActivities = dayDetailRes.data.barActivities;
                if (barActivities && barActivities.length > 0) {
                    // Choose the activity that occupies the most rows * columns in the morning slot (using duration as proxy)
                    const computeArea = (act: BarActivity) => {
                      const startH = parseInt(act.startTime.split(':')[0] ?? '0', 10);
                      const endH = parseInt(act.endTime.split(':')[0] ?? '0', 10);
                      return Math.max(0, endH - startH);
                    };
                    let best = barActivities[0];
                    let maxArea = computeArea(best);
                    for (const act of barActivities) {
                      const area = computeArea(act);
                      if (area > maxArea) {
                        best = act;
                        maxArea = area;
                      }
                    }
                    autoActivity = best.activityName || '';
                }
            }
            // Set primary activity only once per date load (or if user hasn't edited yet)
            if (!primaryFetched) {
                setActivity(autoActivity);
                setPrimaryFetched(true);
            }

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

                /** Hora de evento del día: columnas event_* (todas las filas del día deben coincidir). */
                const pickDayEventField = (pick: (s: any) => string | null | undefined) => {
                    for (const s of uniqueShifts) {
                        const v = String(pick(s) ?? '').trim();
                        if (v) return v;
                    }
                    return '';
                };
                const evStart = pickDayEventField((s) => s.event_start_time);
                const evEnd = pickDayEventField((s) => s.event_end_time);
                const evStart2 = pickDayEventField((s) => s.event_start_time_2);
                const evEnd2 = pickDayEventField((s) => s.event_end_time_2);

                // Set primary activity from fetched bar activities (auto) if available
                setActivity(autoActivity);

                const fCategoria = first.draft_categoria || first.categoria || '';
                const fCategoria2 = first.draft_categoria_2 || first.categoria_2 || '';
                setCategoria(fCategoria);
                setCategoria2(fCategoria2);

                let pStart = evStart;
                let pEnd = evEnd;
                let pPart = '';
                let pStart2 = evStart2;
                let pEnd2 = evEnd2;
                let pPart2 = '';

                try {
                    const parsed = JSON.parse(fNotes);
                    if (!pStart) pStart = parsed.defaultStart || '';
                    if (!pEnd) pEnd = parsed.defaultEnd || '';
                    pPart = parsed.participantsCount || '';
                    if (!pStart2) pStart2 = parsed.defaultStart2 || '';
                    if (!pEnd2) pEnd2 = parsed.defaultEnd2 || '';
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

                // Slot 2: columnas event_*_2, luego notes, luego primera fila (legacy)
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
                setDefaultStart('08:00');
                setDefaultEnd('16:00');
                setParticipantsCount('');
                setCategoria('');
                setActivity2('');
                setDefaultStart2('');
                setDefaultEnd2('');
                setParticipantsCount2('');
                setCategoria2('');
            }

            setShifts(activeShifts);
            setAvailableProfiles(filterVisiblePlantillaEmployees(employees || []));
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
            start: defaultStart || '08:00',
            end: defaultEnd || '16:00',
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
        setShowAddEmployeeModal(false);
    };

    const employeesForPicker = useMemo(
        () => availableProfiles.filter((p) => !shifts.some((s) => s.employeeId === p.id)),
        [availableProfiles, shifts],
    );

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
                // Al guardar, priorizamos SIEMPRE los valores específicos del turno del trabajador (shift.*).
                // Los valores por defecto de la cabecera (defaultStart, activity, etc.) ya actúan como inicializadores
                // en handleAddEmployee, pero una vez creados, el turno del trabajador es independiente.
                const resolvedStart = (shift.start || defaultStart || '08:00').trim();
                const resolvedEnd = (shift.end || defaultEnd || '16:00').trim();
                const startDateTime = new Date(`${date}T${resolvedStart}:00`);
                const endDateTime = new Date(`${date}T${resolvedEnd}:00`);
                const isoStart = startDateTime.toISOString();
                const isoEnd = endDateTime.toISOString();

                const shiftActivity = (shift.activity || activity || null);
                const shiftCategory = (shift.categoria || categoria || null);
                const shiftActivity2 = (shift.activity2 || activity2 || null);
                const shiftCategory2 = (shift.categoria2 || categoria2 || null);

                const slot2Participants = (shift.participantsCount2 || participantsCount2 || '');
                // Las horas de cabecera del EVENTO (slot 1 y 2) deben ser las del día, no las del turno del trabajador;
                // si no, al recargar la UI tomaba defaultStart de una fila cualquiera y parecía que "el evento copiaba" un empleado.
                const dayEventStart = (defaultStart || '').trim();
                const dayEventEnd = (defaultEnd || '').trim();
                const dayEventStart2 = (defaultStart2 || '').trim();
                const dayEventEnd2 = (defaultEnd2 || '').trim();
                const shiftNotes = JSON.stringify({
                    defaultStart: dayEventStart,
                    defaultEnd: dayEventEnd,
                    participantsCount: (shift.participantsCount || participantsCount || ''),
                    defaultStart2: dayEventStart2,
                    defaultEnd2: dayEventEnd2,
                    participantsCount2: (shift.participantsCount2 || participantsCount2 || ''),
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
                    event_participants: participantsCount ? parseInt(participantsCount, 10) : null,
                    event_start_time_2: dayEventStart2 || null,
                    event_end_time_2: dayEventEnd2 || null,
                    event_participants_2: slot2Participants ? parseInt(slot2Participants, 10) : null,
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
            const result = await sendScheduleNotifications(dateFormatted, userShifts, date);
            toast.dismiss(loadingToast);
            if (result?.error || result?.success === false) {
                toast.error(result?.error || 'Error al enviar notificaciones');
                return;
            }
                                            const sent = Number(result?.sentCount ?? 0);
                                            const target = Number(result?.targetCount ?? userShifts.length);
            const missing = Array.isArray(result?.missingSubscriptionUserIds) ? result.missingSubscriptionUserIds.length : Math.max(0, target - sent);
            if (sent <= 0) {
                toast.warning(
                    result?.message ||
                        'Aviso guardado en campana. Activa push en el móvil/PC para recibir también fuera de la app.'
                );
                onSuccess?.();
                onClose();
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
        trackScheduleDayNav(formatYmdShort(newDateStr), { selectedDate: newDateStr });
        setDate(newDateStr);
        fetchData(newDateStr);
    };

    const handleSelectCalendarDate = async (picked: Date) => {
        const dateStr = format(picked, 'yyyy-MM-dd');
        if (hasUnsavedChanges) {
            await handleSave(true, isDayPublished);
        }
        setShowCalendarModal(false);
        trackScheduleCalendarDay(formatYmdShort(dateStr), { selectedDate: dateStr });
        setDate(dateStr);
        fetchData(dateStr);
    };

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
    const totals = hoursHeader.map(hour =>
        shifts.filter(s => s.active && hour >= parseInt(s.start.split(':')[0]) && hour < parseInt(s.end.split(':')[0])).length
    );

    // La cabecera superior es de nivel día, no por empleado seleccionado
    const slot1ActivityValue = (activity ?? '').trim();
    const slot2ActivityValue = (activity2 ?? '').trim();
    const hasSlot1Activity = slot1ActivityValue.length > 0;
    const hasSlot2Activity = slot2ActivityValue.length > 0;
    const hasTwoActivities = hasSlot1Activity && hasSlot2Activity;
    const showSecondActivityCard = hasSlot2Activity || secondSlotExpanded;

    if (loading) {
        if (embedded) {
            return (
                <div className="flex flex-1 min-h-0 items-center justify-center bg-white rounded-2xl">
                    <div className="w-8 h-8 rounded-full border-4 border-ds-marca border-t-transparent animate-spin" />
                </div>
            );
        }
        return <div className="min-h-screen" />;
    }

    return (
        <div className={embedded ? 'flex flex-col flex-1 min-h-0 w-full text-gray-800 overflow-hidden' : 'min-h-[100dvh] w-full flex flex-col p-3 sm:p-4 md:p-6 lg:p-8 text-gray-800'} onClick={() => setEditingIndex(null)}>
            <div className={cn('bg-white shadow-sm border border-zinc-200 flex flex-col shrink w-full relative overflow-hidden', embedded ? 'rounded-2xl flex-1 min-h-0' : 'rounded-[32px] max-w-7xl mx-auto')}>

                {/* WRAPPER STICKY GLOBAL PARA TODA LA CABECERA */}
                <div className={cn('sticky top-[0px] z-30 flex flex-col w-full shadow-sm bg-white -mt-[1px]', embedded ? 'rounded-t-2xl' : 'rounded-t-[32px]')}>
                    {/* CABECERA (Fecha y Botones) */}
                    <div className="flex items-center justify-between px-4 py-3 shrink-0 relative">
                        <div className="flex items-center gap-0 sm:gap-1 mt-2">
                            {embedded && modalParentInstance && (
                                <button type="button" onClick={onClose} aria-label="Volver al calendario" className="p-1.5 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-500 active:scale-95 flex-shrink-0" title="Volver">
                                    <ArrowLeft size={22} strokeWidth={2.5} />
                                </button>
                            )}
                            <button type="button" onClick={() => navigateDay(-1)} aria-label="Día anterior" className="p-1 sm:p-1.5 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-500 active:scale-95 flex-shrink-0">
                                <ChevronLeft size={24} />
                            </button>
                            <button type="button" onClick={() => setShowCalendarModal(true)} aria-label="Abrir calendario" className="flex items-center gap-1 group cursor-pointer hover:bg-zinc-100 px-1 py-1 sm:py-1.5 rounded-xl transition-all">
                                <h2 className="text-[13px] sm:text-[15px] md:text-xl font-black text-zinc-800 tracking-widest whitespace-nowrap">
                                    {date && (() => {
                                        const raw = format(new Date(date), "EEEE d 'de' MMMM", { locale: es });
                                        return raw.charAt(0).toUpperCase() + raw.slice(1);
                                    })()}
                                </h2>
                            </button>
                            <button type="button" onClick={() => navigateDay(1)} aria-label="Día siguiente" className="p-1 sm:p-1.5 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-500 active:scale-95 flex-shrink-0">
                                <ChevronRight size={24} />
                            </button>
                        </div>

                        <div className="flex items-center gap-1 mt-2">
                            {/* Movemos Botón Agregar Empleado a Cabecera */}
                            <Button
                                type="button"
                                variant="primary"
                                instance="schedule-day-add-employee"
                                onClick={() => setShowAddEmployeeModal(true)}
                                aria-label="Añadir empleado"
                                icon={<Plus size={16} strokeWidth={3} />}
                            />

                            <button
                                type="button"
                                onClick={() => setShowShareModal(true)}
                                aria-label="Compartir horario"
                                className={`relative w-7 h-7 md:w-8 md:h-8 rounded-xl text-zinc-600 transition-all active:scale-95 shadow-sm flex items-center justify-center bg-white border border-zinc-200 hover:bg-zinc-50 group ${isDayPublished && hasUnsavedChanges ? 'ring-2 ring-orange-400/80 ring-offset-2 ring-offset-white' : ''}`}
                            >
                                <Share2 size={16} strokeWidth={2.5} className="text-zinc-600" />
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
                        <div className="p-3 md:p-4 w-full shrink-0">
                            <div className="flex flex-col gap-2 w-full max-w-2xl mx-auto">
                                {/* Card actividad 1 */}
                            

                                    {hasTwoActivities && (
                                        <div className="mb-1.5 w-full text-center">
                                            <span className="text-[9px] font-black tracking-wide text-zinc-500 uppercase">MAÑANA</span>
                                        </div>
                                    )}

                                    {/* SLOT 1 — una fila: EVENTO + HORARIO + PAX + CATEGORIA (salvo solo Evento si aún no hay actividad) */}
                                    <div className="flex w-full min-w-0 flex-col">
                                        <div
                                            className={cn(
                                                'grid w-full min-w-0 auto-rows-min gap-x-1.5 gap-y-1 pb-0.5',
                                                hasSlot1Activity
                                                    ? '[grid-template-columns:repeat(4,minmax(0,1fr))]'
                                                    : 'justify-items-center [grid-template-columns:minmax(0,min(100%,14rem))]'
                                            )}
                                        >
                                            <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                    <ShrinkToFitInput
                                                        wrapClassName="min-h-0 flex-1"
                                                        singleLine
                                                        type="text"
                                                        value={activity}
                                                        onChange={(e) => {
                                                            setActivity(e.target.value);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        maxPx={11}
                                                        minPx={5}
                                                        placeholder="ARTÍSTICA"
                                                        className="text-zinc-800 uppercase placeholder:text-zinc-300 focus:outline-none"
                                                    />
                                                </div>
                                                <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Evento</span>
                                            </div>

                                            {hasSlot1Activity && (
                                                <>
                                                    <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                        <div className="flex min-h-[2rem] w-full min-w-0 max-w-full items-center gap-0.5 overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                            <ShrinkToFitInput
                                                                wrapClassName="min-h-0 flex-1"
                                                                type="time"
                                                                value={defaultStart}
                                                                onChange={(e) => {
                                                                    setDefaultStart(e.target.value);
                                                                    setHasUnsavedChanges(true);
                                                                }}
                                                                maxPx={11}
                                                                minPx={5}
                                                                singleLine
                                                                className="font-mono text-emerald-600 focus:outline-none [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0"
                                                            />
                                                            <span className="text-zinc-300 select-none">-</span>
                                                            <ShrinkToFitInput
                                                                wrapClassName="min-h-0 flex-1"
                                                                type="time"
                                                                value={defaultEnd}
                                                                onChange={(e) => {
                                                                    setDefaultEnd(e.target.value);
                                                                    setHasUnsavedChanges(true);
                                                                }}
                                                                maxPx={11}
                                                                minPx={5}
                                                                singleLine
                                                                className="font-mono text-rose-500 focus:outline-none [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0"
                                                            />
                                                        </div>
                                                        <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Horario</span>
                                                    </div>

                                                    <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                        <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                            <ShrinkToFitInput
                                                                wrapClassName="min-h-0 flex-1"
                                                                type="text"
                                                                value={participantsCount}
                                                                onChange={(e) => {
                                                                    setParticipantsCount(e.target.value);
                                                                    setHasUnsavedChanges(true);
                                                                }}
                                                                maxPx={11}
                                                                minPx={5}
                                                                singleLine
                                                                className="text-zinc-800 focus:outline-none"
                                                            />
                                                        </div>
                                                        <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Pax</span>
                                                    </div>

                                                    <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                        <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                            <ShrinkToFitInput
                                                                wrapClassName="min-h-0 flex-1"
                                                                singleLine
                                                                type="text"
                                                                value={categoria}
                                                                onChange={(e) => {
                                                                    setCategoria(e.target.value);
                                                                    setHasUnsavedChanges(true);
                                                                }}
                                                                maxPx={11}
                                                                minPx={5}
                                                                placeholder="INFANTILES"
                                                                className="text-zinc-800 uppercase placeholder:text-zinc-300 focus:outline-none"
                                                            />
                                                        </div>
                                                        <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Categoria</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                </div>

                                {hasSlot1Activity && !hasSlot2Activity && !secondSlotExpanded && (
                                    <button
                                        type="button"
                                        onClick={() => setSecondSlotExpanded(true)}
                                        className={cn(
                                            'w-full min-h-12 shrink-0 rounded-xl border border-zinc-200 bg-white text-[#36606F] text-[10px] font-black uppercase tracking-widest py-3 transition-colors hover:bg-zinc-50 active:scale-[0.99]'
                                        )}
                                    >
                                        + Segunda actividad (TARDE)
                                    </button>
                                )}

                                {/* Card actividad 2 — solo si hay texto en act. 2 o el usuario abrió el slot */}
                                {showSecondActivityCard && (
                                    <div className="bg-zinc-50 rounded-xl border border-zinc-200 shadow-sm p-2 sm:p-3 w-full min-w-0">
                                        <div className="mb-1.5 flex w-full items-center justify-center gap-2 text-center">
                                            <span className="text-[9px] font-black tracking-wide text-zinc-500 uppercase">TARDE</span>
                                            {secondSlotExpanded && !hasSlot2Activity && (
                                                <Button
                                                    type="button"
                                                    variant="tertiary"
                                                    instance="schedule-day-close-slot2"
                                                    onClick={() => setSecondSlotExpanded(false)}
                                                >
                                                    Cerrar
                                                </Button>
                                            )}
                                        </div>

                                        <div className="flex w-full min-w-0 flex-col">
                                            <div
                                                className={cn(
                                                    'grid w-full min-w-0 auto-rows-min gap-x-1.5 gap-y-1 pb-0.5',
                                                    hasSlot2Activity
                                                        ? '[grid-template-columns:repeat(4,minmax(0,1fr))]'
                                                        : 'justify-items-center [grid-template-columns:minmax(0,min(100%,14rem))]'
                                                )}
                                            >
                                                <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                    <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                        <ShrinkToFitInput
                                                            wrapClassName="min-h-0 flex-1"
                                                            singleLine
                                                            type="text"
                                                            value={activity2}
                                                            onChange={(e) => {
                                                                setActivity2(e.target.value);
                                                                setHasUnsavedChanges(true);
                                                            }}
                                                            maxPx={11}
                                                            minPx={5}
                                                            placeholder="ARTÍSTICA"
                                                            className="text-zinc-800 uppercase placeholder:text-zinc-300 focus:outline-none"
                                                        />
                                                    </div>
                                                    <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Evento</span>
                                                </div>

                                                {hasSlot2Activity && (
                                                    <>
                                                        <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                            <div className="flex min-h-[2rem] w-full min-w-0 max-w-full items-center gap-0.5 overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                                <ShrinkToFitInput
                                                                    wrapClassName="min-h-0 flex-1"
                                                                    type="time"
                                                                    value={defaultStart2}
                                                                    onChange={(e) => {
                                                                        setDefaultStart2(e.target.value);
                                                                        setHasUnsavedChanges(true);
                                                                    }}
                                                                    maxPx={11}
                                                                    minPx={5}
                                                                    singleLine
                                                                    className="font-mono text-emerald-600 focus:outline-none [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0"
                                                                />
                                                                <span className="text-zinc-300 select-none">-</span>
                                                                <ShrinkToFitInput
                                                                    type="time"
                                                                    value={defaultEnd2}
                                                                    onChange={(e) => {
                                                                        setDefaultEnd2(e.target.value);
                                                                        setHasUnsavedChanges(true);
                                                                    }}
                                                                    maxPx={11}
                                                                    minPx={5}
                                                                    singleLine
                                                                    className="font-mono text-rose-500 focus:outline-none [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0"
                                                                />
                                                            </div>
                                                            <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Horario</span>
                                                        </div>

                                                        <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                            <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                                <ShrinkToFitInput
                                                                    wrapClassName="min-h-0 flex-1"
                                                                    type="text"
                                                                    value={participantsCount2}
                                                                    onChange={(e) => {
                                                                        setParticipantsCount2(e.target.value);
                                                                        setHasUnsavedChanges(true);
                                                                    }}
                                                                    maxPx={11}
                                                                    minPx={5}
                                                                    singleLine
                                                                    className="text-zinc-800 focus:outline-none"
                                                                />
                                                            </div>
                                                            <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Pax</span>
                                                        </div>

                                                        <div className="flex min-w-0 w-full flex-col items-center gap-0.5">
                                                            <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-zinc-100 bg-white">
                                                                <ShrinkToFitInput
                                                                    wrapClassName="min-h-0 flex-1"
                                                                    singleLine
                                                                    type="text"
                                                                    value={categoria2}
                                                                    onChange={(e) => {
                                                                        setCategoria2(e.target.value);
                                                                        setHasUnsavedChanges(true);
                                                                    }}
                                                                    maxPx={11}
                                                                    minPx={5}
                                                                    placeholder="CADETES"
                                                                    className="text-zinc-800 uppercase placeholder:text-zinc-300 focus:outline-none"
                                                                />
                                                            </div>
                                                            <span className="text-[7px] sm:text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none">Categoria</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                <div data-element="schedule-shift-table" className="flex flex-col shrink min-h-0 w-full bg-white rounded-b-[32px] pt-2">

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
                                            <div className="w-full max-w-md pointer-events-auto flex flex-col gap-2 p-2 bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 animate-in fade-in zoom-in-95 duration-200">
                                                {/* Controles de Tiempo */}
                                                <div className="h-14 flex items-center gap-2">
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

                                                {/* Controles de Actividad y Categoría del Trabajador */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[7px] font-black text-white/60 uppercase tracking-widest pl-1">Actividad Trabajador</span>
                                                        <div className="h-9 bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                                                            <input
                                                                type="text"
                                                                value={s.activity}
                                                                onChange={(e) => upd({ ...s, activity: e.target.value })}
                                                                placeholder="ACT."
                                                                className="w-full h-full bg-transparent border-none focus:outline-none text-white text-[10px] font-black uppercase px-3 placeholder:text-white/20"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[7px] font-black text-white/60 uppercase tracking-widest pl-1">Categoría Trabajador</span>
                                                        <div className="h-9 bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                                                            <input
                                                                type="text"
                                                                value={s.categoria}
                                                                onChange={(e) => upd({ ...s, categoria: e.target.value })}
                                                                placeholder="CAT."
                                                                className="w-full h-full bg-transparent border-none focus:outline-none text-white text-[10px] font-black uppercase px-3 placeholder:text-white/20"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>

                    {/* Footer Total — mismo que modal: fondo blanco, texto gris */}
                    <div className="flex w-full bg-white border-t border-gray-100 shrink-0">
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

                    <ScheduleDayProfitabilityBar
                        date={date}
                        shifts={shifts.map((s) => ({
                            employeeId: s.employeeId,
                            start: s.start,
                            end: s.end,
                            active: s.active,
                        }))}
                    />
                </div>

            </div>

            {/* Task surface embebida migrada al Modal oficial. */}
            {embedded && editingIndex !== null && shifts[editingIndex] && (() => {
                const s = shifts[editingIndex];
                const upd = (newS: typeof s) => handleUpdateShift(editingIndex, newS);
                const step = SNAP_MINUTES;
                return (
                    <Modal
                        open
                        onClose={() => setEditingIndex(null)}
                        title={s.name || 'Editar turno'}
                        instance="schedule-shift-edit"
                        variant="compact"
                        layer={modalParentInstance ? 'derived' : 'base'}
                        {...(modalParentInstance ? { parentInstance: modalParentInstance } : {})}
                    >
                        <div className="flex flex-col gap-2 p-2 bg-zinc-900/95 backdrop-blur-md">
                            {/* Controles de Tiempo */}
                            <div className="h-14 flex items-center gap-2">
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" aria-label="Inicio -30 min" onClick={() => upd({ ...s, start: stepTime(s.start, -step) })} className="w-8 h-6 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95" title="Inicio -30 min"><Plus size={14} strokeWidth={3} /></button>
                                    <button type="button" aria-label="Inicio +30 min" onClick={() => { const t = stepTime(s.start, step); if (timeToPercent(t) < timeToPercent(s.end)) upd({ ...s, start: t }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95" title="Inicio +30 min"><Minus size={14} strokeWidth={3} /></button>
                                </div>
                                <div className="flex-1 relative h-full min-w-0 rounded-xl overflow-hidden">
                                    <ShiftBar shift={s} onUpdate={upd} allowMove={true} barClass="bg-[#5B8FB9] border border-white/20" />
                                </div>
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button type="button" aria-label="Final +30 min" onClick={() => { const t = stepTime(s.end, step); if (timeToPercent(t) > timeToPercent(s.start)) upd({ ...s, end: t }); }} className="w-8 h-6 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95" title="Final +30 min"><Plus size={14} strokeWidth={3} /></button>
                                    <button type="button" aria-label="Final -30 min" onClick={() => upd({ ...s, end: stepTime(s.end, -step) })} className="w-8 h-6 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95" title="Final -30 min"><Minus size={14} strokeWidth={3} /></button>
                                </div>
                            </div>

                            {/* Controles de Actividad y Categoría del Trabajador */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[7px] font-black text-white/60 uppercase tracking-widest pl-1">Actividad Trabajador</span>
                                    <div className="h-9 bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                                        <input
                                            type="text"
                                            value={s.activity}
                                            onChange={(e) => upd({ ...s, activity: e.target.value })}
                                            placeholder="ACT."
                                            className="w-full h-full bg-transparent border-none focus:outline-none text-white text-[10px] font-black uppercase px-3 placeholder:text-white/20"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[7px] font-black text-white/60 uppercase tracking-widest pl-1">Categoría Trabajador</span>
                                    <div className="h-9 bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                                        <input
                                            type="text"
                                            value={s.categoria}
                                            onChange={(e) => upd({ ...s, categoria: e.target.value })}
                                            placeholder="CAT."
                                            className="w-full h-full bg-transparent border-none focus:outline-none text-white text-[10px] font-black uppercase px-3 placeholder:text-white/20"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {/* MODALES */}
            <Modal
                open={showCalendarModal}
                onClose={() => setShowCalendarModal(false)}
                title="Calendario"
                instance="schedule-calendar"
                variant="compact"
                layer={modalParentInstance ? 'derived' : 'base'}
                {...(modalParentInstance ? { parentInstance: modalParentInstance } : {})}
                headerTrailing={
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                            aria-label="Mes anterior"
                            className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 outline-none transition-opacity hover:bg-zinc-100 hover:opacity-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-zinc-700 font-black uppercase tracking-widest text-sm min-w-[120px] text-center capitalize">{calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                        <button
                            type="button"
                            onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                            aria-label="Mes siguiente"
                            className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 outline-none transition-opacity hover:bg-zinc-100 hover:opacity-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                }
                hideTitle
            >
                <MiniMonthCalendar
                    month={calendarDate}
                    onMonthChange={setCalendarDate}
                    monthInHeader
                    onSelectDay={(day) => { void handleSelectCalendarDate(day); }}
                    isSelected={(day) => format(day, 'yyyy-MM-dd') === date}
                />
            </Modal>

            <StaffSelectionModal
                isOpen={showAddEmployeeModal}
                onClose={() => setShowAddEmployeeModal(false)}
                employees={employeesForPicker}
                title="Añadir personal"
                variant="profile-list"
                onSelect={(emp) => handleAddEmployee(emp.id)}
            />

            <Modal
                open={showShareModal}
                onClose={() => setShowShareModal(false)}
                title="Compartir"
                instance="schedule-share"
                variant="compact"
                layer={modalParentInstance ? 'derived' : 'base'}
                {...(modalParentInstance ? { parentInstance: modalParentInstance } : {})}
            >
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1 text-center">
                        <span className="text-[10px] font-black tracking-widest text-zinc-400 uppercase mb-1">Estado del Horario</span>
                        <div className="text-xs uppercase font-black px-4 py-1.5 bg-gray-100 rounded-xl inline-flex self-center">
                            <span className={`${isDayPublished ? (isDaySent ? 'text-emerald-500' : 'text-[#36606F]') : 'text-orange-400'}`}>
                                {isDayPublished ? (isDaySent ? 'Publicado y Enviado' : 'Publicado') : 'Sin publicar'}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="schedule-day-share-cancel"
                            onClick={() => setShowShareModal(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="schedule-day-share-save"
                            onClick={async () => {
                                setShowShareModal(false);
                                trackScheduleShare(!isDayPublished ? 'Guardar borrador' : 'Sobreescribir publicado');
                                await handleSave(false, true);
                            }}
                        >
                            {!isDayPublished ? 'Guardar' : 'Sobreescribir'}
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="schedule-day-share-send"
                            onClick={async () => {
                                setShowShareModal(false);
                                trackScheduleShare(!isDaySent ? 'Enviar notificaciones' : 'Reenviar notificaciones');
                                const saved = await handleSave(true, true);
                                if (saved || isDayPublished) {
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
                                        const res = await sendScheduleNotifications(dateFormatted, userShifts, date);
                                        toast.dismiss(loadToast);
                                        if (res?.error || res?.success === false) {
                                            toast.error(res?.error || 'Error al enviar notificaciones');
                                            return;
                                        }
                                        const sent = Number(res?.sentCount ?? 0);
                                        const target = Number(res?.targetCount ?? userShifts.length);
                                        const missing = Array.isArray(res?.missingSubscriptionUserIds) ? res.missingSubscriptionUserIds.length : Math.max(0, target - sent);
                                        if (sent <= 0) {
                                            toast.warning(
                                                res?.message ||
                                                    'Aviso en campana. Activa push para recibir también fuera de la app.'
                                            );
                                            setIsDaySent(true);
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
                        >
                            {!isDaySent ? 'Enviar' : 'Reenviar'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}