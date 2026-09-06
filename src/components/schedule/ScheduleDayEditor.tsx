'use client';

import {
    startTransition,
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback,
    forwardRef,
    useImperativeHandle,
    type ReactNode,
} from 'react';
import { createClient } from "@/utils/supabase/client";
import { X, Plus, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';
import { ShrinkToFitInput } from '@/components/ui/ShrinkToFitCell';
import { fetchDayDetailAction, type BarActivity } from '@/app/staff/actividades/actions';
import { groupActivities } from '@/components/dashboards/staff/StaffWeekScheduleWidget';
import { sendScheduleNotifications } from '@/app/actions/notifications';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import type { PlantillaEmployee } from '@/components/modals/StaffSelectionModal';
import { filterVisiblePlantillaEmployees } from '@/lib/staff/plantilla-employees';
import { Avatar } from '@/components/ui/Avatar';
import { MiniMonthCalendar } from '@/components/time/MiniMonthCalendar';
import { ShiftBarTimeLabels } from '@/components/schedule/ShiftBarTimeLabels';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    getCachedLaborRate,
    setCachedLaborRate,
} from '@/lib/labor-rate-session-cache';
import { getSsotOrdinaryHourlyRate } from '@/app/actions/ssot-ordinary-rate';
import {
    computeScheduleDayLaborCost,
    computeRequiredBilling,
    formatScheduleEuro,
} from '@/lib/schedule-day-profitability';
import type { Tables, TablesInsert } from '@/types/supabase';

type ScheduleShift = {
    employeeId: string;
    name: string | null;
    avatar_url?: string | null;
    start: string;
    end: string;
    activity: string;
    categoria: string;
    participantsCount: string;
    activity2: string;
    start2: string;
    end2: string;
    participantsCount2: string;
    categoria2: string;
    active: boolean;
};

type ScheduleShiftRow = Tables<'shifts'>;
type ScheduleShiftInsert = TablesInsert<'shifts'>;

export interface ScheduleDayEditorProps {
    initialDate: string;
    onClose: () => void;
    onSuccess?: () => void;
    embedded?: boolean;
    /** Instancia del Modal padre vivo; solo cuando el editor está embebido en StaffScheduleModal. */
    modalParentInstance?: string;
}

export interface ScheduleDayEditorHandle {
    /** Abre el selector de empleados para añadir un turno al día. */
    openAddEmployee: () => void;
    /** Abre el modal de guardado (Guardar / Guardar y enviar / Sobreescribir). */
    openShare: () => void;
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

/** «08:00» → «8» · «08:30» → «8:30». Solo se muestran los minutos si son exactamente «30». */
function formatHourShort(time: string | null | undefined): string {
    const parts = String(time ?? '').split(':');
    const h = Number.parseInt(parts[0] ?? '', 10);
    if (!Number.isFinite(h)) return String(time ?? '').trim();
    const mins = parts[1] ?? '';
    if (mins === '30') return `${h}:30`;
    return String(h);
}

/** Convierte el texto tecleado («8», «8:30», «08:00») a «HH:mm». Vacío → ''. */
function parseHourInput(raw: string): string {
    const t = String(raw ?? '').trim();
    if (!t) return '';
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
    if (!m) return raw;
    const h = Math.min(23, Number(m[1]));
    const min = m[2] ? Math.min(59, Number(m[2])) : 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// --- BARRA INTERACTIVA: mismo aspecto que el modal (verde #34d399, sombra) ---
const ShiftBar = ({
    shift,
    onUpdate,
    allowMove = true,
    barClass = ''
}: {
    shift: ScheduleShift,
    onUpdate: (s: ScheduleShift) => void,
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

                const newStartPct = Math.max(0, Math.min(startPct + diffPercent, 100 - duration));
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
            className={cn('absolute top-2 bottom-2 flex items-center justify-between rounded-full z-10 touch-none overflow-hidden px-1.5', barClass, allowMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
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

/* ─── Celda editable del resumen (mismo aspecto que SummaryCell del modal) ─── */
const EditableSummaryCell = ({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) => (
    <div className="flex min-w-0 w-full flex-col items-center gap-1">
        <div className="flex min-h-[2rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border-0 bg-transparent">
            {children}
        </div>
        <span className="shrink-0 text-[9px] font-semibold tracking-widest leading-none text-white/60">
            {label}
        </span>
    </div>
);

export const ScheduleDayEditor = forwardRef<ScheduleDayEditorHandle, ScheduleDayEditorProps>(function ScheduleDayEditor(
    { initialDate, onClose, onSuccess, embedded = false, modalParentInstance },
    ref,
) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);

    const [date, setDate] = useState('');
    const [activity, setActivity] = useState('');
    const [shifts, setShifts] = useState<ScheduleShift[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [availableProfiles, setAvailableProfiles] = useState<PlantillaEmployee[]>([]);
    // Flag to avoid overwriting manual edits after initial autofill
    const primaryFetchedRef = useRef(false);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isDayPublished, setIsDayPublished] = useState(false);
    const [isDaySent, setIsDaySent] = useState(false);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const [secondSlotExpanded, setSecondSlotExpanded] = useState(false);

    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    // Rentabilidad del día: coste de mano de obra y facturación rentable
    const [isMaster, setIsMaster] = useState(false);
    const [rateByUserId, setRateByUserId] = useState<Record<string, number>>({});

    useImperativeHandle(ref, () => ({
        openAddEmployee: () => setShowAddEmployeeModal(true),
        openShare: () => setShowShareModal(true),
    }));

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

    const fetchData = useCallback(async (targetDate: string) => {
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

            // Fetch bar activities for the day (misma fuente que el widget de horario)
            const dayDetailRes = await fetchDayDetailAction({ date: targetDate });
            let dayGrouped: BarActivity[] = [];
            if (dayDetailRes.success) {
                dayGrouped = groupActivities(dayDetailRes.data.barActivities);
            }

            // DEDUPLICACIÓN: Mapa por user_id, quedándonos con el primero (más reciente)
            const shiftMap = new Map<string, ScheduleShiftRow>();
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
                    avatar_url: emp.avatar_url,
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

            const uniqueShifts = Array.from(shiftMap.values());

            if (uniqueShifts.length > 0) {
                // Keep the first one as day-level fallback/defaults
                const first = uniqueShifts[0];
                const fActivity2 = first.draft_activity_2 || first.activity_2 || '';
                const fNotes = first.draft_notes || first.notes || '{}';

                /** Hora de evento del día: columnas event_* (todas las filas del día deben coincidir). */
                const pickDayEventField = (pick: (s: ScheduleShiftRow) => string | null | undefined) => {
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
                } catch { }

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
                // La cabecera del día la decide el pabellón (misma fuente que el
                // modal de lectura). Sin turnos ni actividad, se limpia; con
                // actividad, la repone el bloque de abajo.
                if (dayGrouped.length === 0) {
                    setActivity('');
                    setCategoria('');
                    setParticipantsCount('');
                    setActivity2('');
                    setCategoria2('');
                    setParticipantsCount2('');
                }
                setDefaultStart('08:00');
                setDefaultEnd('16:00');
                setDefaultStart2('');
                setDefaultEnd2('');
            }

            // El resumen del día refleja las actividades reales del pabellón
            // (misma fuente que el widget de horario), igual que en el modo lectura.
            if (!primaryFetchedRef.current) {
                const g1 = dayGrouped[0];
                const g2 = dayGrouped[1];
                if (g1) {
                    setActivity(g1.activityName);
                    setCategoria((g1.categories ?? []).join(', '));
                    setDefaultStart(g1.startTime);
                    setDefaultEnd(g1.endTime);
                    setParticipantsCount(
                        g1.totalParticipants != null && g1.totalParticipants > 0
                            ? String(g1.totalParticipants)
                            : '',
                    );
                }
                if (g2) {
                    setActivity2(g2.activityName);
                    setCategoria2((g2.categories ?? []).join(', '));
                    setDefaultStart2(g2.startTime);
                    setDefaultEnd2(g2.endTime);
                    setParticipantsCount2(
                        g2.totalParticipants != null && g2.totalParticipants > 0
                            ? String(g2.totalParticipants)
                            : '',
                    );
                }
                primaryFetchedRef.current = true;
            }

            setShifts(activeShifts);
            const profileOptions: PlantillaEmployee[] = (employees || []).map((employee) => ({
                id: employee.id,
                first_name: employee.first_name ?? '',
                last_name: employee.last_name ?? '',
                end_date: employee.end_date,
                avatar_url: employee.avatar_url,
                visible_in_plantilla: employee.visible_in_plantilla ?? undefined,
            }));
            setAvailableProfiles(filterVisiblePlantillaEmployees(profileOptions));
            setHasUnsavedChanges(false);
            setIsDaySent(false); // Reinicia estado "enviado" al cambiar día
        } catch (error: unknown) {
            console.error(error);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    const handleUpdateShift = (index: number, newShift: ScheduleShift) => {
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
        const newShift: ScheduleShift = {
            employeeId: profile.id,
            name: profile.first_name?.toLowerCase() === 'fernando' ? 'Fer' : (profile.first_name?.toLowerCase() === 'mamadou' ? 'Mamdou' : profile.first_name),
            avatar_url: profile.avatar_url,
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

    const handleSave = useCallback(async (silent = false, publish = false) => {
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
                // Las horas de cabecera del EVENTO (slot 1 y 2) deben ser las del día, no las del turno del trabajador.
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

                const data: ScheduleShiftInsert = {
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
        } catch (error: unknown) {
            console.error(error);
            if (!silent) toast.error('Error al guardar');
            return false;
        }
    }, [
        activity,
        activity2,
        categoria,
        categoria2,
        date,
        defaultEnd,
        defaultEnd2,
        defaultStart,
        defaultStart2,
        fetchData,
        isDayPublished,
        onClose,
        onSuccess,
        participantsCount,
        participantsCount2,
        shifts,
        supabase,
    ]);

    useEffect(() => {
        if (!loading && hasUnsavedChanges) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                // El autoguardado NUNCA debe publicar, siempre guarda como borrador (false)
                void handleSave(true, false);
            }, 1000);
        }
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [
        activity,
        activity2,
        categoria,
        categoria2,
        defaultEnd,
        defaultEnd2,
        defaultStart,
        defaultStart2,
        handleSave,
        hasUnsavedChanges,
        loading,
        participantsCount,
        participantsCount2,
        shifts,
    ]);

    useEffect(() => {
        const targetDate = initialDate || new Date().toISOString().split('T')[0];
        startTransition(() => {
            setDate(targetDate);
            setCalendarDate(new Date(`${targetDate}T12:00:00`));
        });
    }, [initialDate]);

    useEffect(() => {
        if (!date) return;
        // Reset secondary slot when date changes and refetch data
        startTransition(() => setSecondSlotExpanded(false));
        primaryFetchedRef.current = false;
        startTransition(() => {
            void fetchData(date);
        });
    }, [date, fetchData]);

    // Identidad de maestro (solo él ve coste laboral)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled) return;
            setIsMaster(isMasterDashboardUser(user?.email));
        })();
        return () => { cancelled = true; };
    }, [supabase]);

    // Tarifas ordinarias por empleado (solo maestro)
    const activeEmployeeIds = useMemo(() => {
        const ids = new Set<string>();
        for (const s of shifts) {
            if (s.active === false || !s.start || !s.end) continue;
            ids.add(s.employeeId);
        }
        return [...ids];
    }, [shifts]);

    useEffect(() => {
        if (!isMaster || !date) return;
        let cancelled = false;

        (async () => {
            const next: Record<string, number> = {};
            const toFetch: string[] = [];

            for (const id of activeEmployeeIds) {
                const cached = getCachedLaborRate(id, date);
                if (cached !== undefined) {
                    next[id] = cached;
                } else {
                    toFetch.push(id);
                }
            }

            if (toFetch.length > 0) {
                const fetched = await Promise.all(
                    toFetch.map(async (userId) => {
                        const res = await getSsotOrdinaryHourlyRate(userId, date);
                        const rate = res.success ? res.rate : 0;
                        setCachedLaborRate(userId, date, rate);
                        return { userId, rate };
                    }),
                );
                if (cancelled) return;
                for (const { userId, rate } of fetched) {
                    next[userId] = rate;
                }
            }

            if (!cancelled) setRateByUserId(next);
        })();

        return () => { cancelled = true; };
    }, [isMaster, date, activeEmployeeIds, supabase]);

    const navigateDay = async (direction: -1 | 1) => {
        if (hasUnsavedChanges) {
            await handleSave(true, isDayPublished);
        }
        const currentDate = new Date(`${date}T12:00:00`);
        const newDate = direction === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1);
        const newDateStr = newDate.toISOString().split('T')[0];
        trackScheduleDayNav(formatYmdShort(newDateStr), { selectedDate: newDateStr });
        setDate(newDateStr);
    };

    const handleSelectCalendarDate = async (picked: Date) => {
        const dateStr = format(picked, 'yyyy-MM-dd');
        if (hasUnsavedChanges) {
            await handleSave(true, isDayPublished);
        }
        setShowCalendarModal(false);
        trackScheduleCalendarDay(formatYmdShort(dateStr), { selectedDate: dateStr });
        setDate(dateStr);
    };

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
    const totals = hoursHeader.map(hour =>
        shifts.filter(s => s.active && hour >= parseInt(s.start.split(':')[0]) && hour < parseInt(s.end.split(':')[0])).length
    );

    const laborCost = useMemo(
        () => computeScheduleDayLaborCost(
            shifts.map((s) => ({ employeeId: s.employeeId, start: s.start, end: s.end, active: s.active })),
            rateByUserId,
        ),
        [shifts, rateByUserId],
    );
    const requiredBilling = useMemo(() => computeRequiredBilling(laborCost), [laborCost]);

    // La cabecera superior es de nivel día, no por empleado seleccionado
    const slot1ActivityValue = (activity ?? '').trim();
    const slot2ActivityValue = (activity2 ?? '').trim();
    const hasSlot1Activity = slot1ActivityValue.length > 0;
    const hasSlot2Activity = slot2ActivityValue.length > 0;
    const hasTwoActivities = hasSlot1Activity && hasSlot2Activity;
    const showSecondActivityCard = hasSlot2Activity || secondSlotExpanded;

    if (loading) {
        return (
            <div className="flex flex-1 min-h-0 w-full items-center justify-center bg-white rounded-2xl">
                <div className="w-8 h-8 rounded-full border-4 border-ds-marca border-t-transparent animate-spin" />
            </div>
        );
    }

    const editableGridSlot1 = (
        <div className="grid w-full min-w-0 auto-rows-min gap-x-1.5 gap-y-1 pb-0.5 [grid-template-columns:repeat(4,minmax(0,1fr))]">
            <EditableSummaryCell label="Evento">
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
                    placeholder="Artística"
                    className="text-white font-semibold leading-tight placeholder:text-white/30 focus:outline-none"
                />
            </EditableSummaryCell>

            <EditableSummaryCell label="Horario">
                <div className="flex w-full items-center gap-0.5">
                    <ShrinkToFitInput
                        wrapClassName="min-h-0 flex-1"
                        type="text"
                        value={formatHourShort(defaultStart)}
                        onChange={(e) => {
                            setDefaultStart(parseHourInput(e.target.value));
                            setHasUnsavedChanges(true);
                        }}
                        maxPx={11}
                        minPx={5}
                        singleLine
                        className="font-semibold leading-tight text-white focus:outline-none"
                    />
                    <span className="text-white/30 select-none">-</span>
                    <ShrinkToFitInput
                        wrapClassName="min-h-0 flex-1"
                        type="text"
                        value={formatHourShort(defaultEnd)}
                        onChange={(e) => {
                            setDefaultEnd(parseHourInput(e.target.value));
                            setHasUnsavedChanges(true);
                        }}
                        maxPx={11}
                        minPx={5}
                        singleLine
                        className="font-semibold leading-tight text-white focus:outline-none"
                    />
                </div>
            </EditableSummaryCell>

            <EditableSummaryCell label="Pax">
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
                    className="text-white font-semibold leading-tight focus:outline-none"
                />
            </EditableSummaryCell>

            <EditableSummaryCell label="Categoria">
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
                    placeholder="Infantiles"
                    className="text-white font-semibold leading-tight placeholder:text-white/30 focus:outline-none"
                />
            </EditableSummaryCell>
        </div>
    );

    const editableGridSlot2 = (
        <div className="grid w-full min-w-0 auto-rows-min gap-x-1.5 gap-y-1 pb-0.5 [grid-template-columns:repeat(4,minmax(0,1fr))]">
            <EditableSummaryCell label="Evento">
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
                    placeholder="Artística"
                    className="text-white font-semibold leading-tight placeholder:text-white/30 focus:outline-none"
                />
            </EditableSummaryCell>

            <EditableSummaryCell label="Horario">
                <div className="flex w-full items-center gap-0.5">
                    <ShrinkToFitInput
                        wrapClassName="min-h-0 flex-1"
                        type="text"
                        value={formatHourShort(defaultStart2)}
                        onChange={(e) => {
                            setDefaultStart2(parseHourInput(e.target.value));
                            setHasUnsavedChanges(true);
                        }}
                        maxPx={11}
                        minPx={5}
                        singleLine
                        className="font-semibold leading-tight text-white focus:outline-none"
                    />
                    <span className="text-white/30 select-none">-</span>
                    <ShrinkToFitInput
                        wrapClassName="min-h-0 flex-1"
                        type="text"
                        value={formatHourShort(defaultEnd2)}
                        onChange={(e) => {
                            setDefaultEnd2(parseHourInput(e.target.value));
                            setHasUnsavedChanges(true);
                        }}
                        maxPx={11}
                        minPx={5}
                        singleLine
                        className="font-semibold leading-tight text-white focus:outline-none"
                    />
                </div>
            </EditableSummaryCell>

            <EditableSummaryCell label="Pax">
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
                    className="text-white font-semibold leading-tight focus:outline-none"
                />
            </EditableSummaryCell>

            <EditableSummaryCell label="Categoria">
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
                    placeholder="Cadetes"
                    className="text-white font-semibold leading-tight placeholder:text-white/30 focus:outline-none"
                />
            </EditableSummaryCell>
        </div>
    );

    return (
        <div
            data-editor-embedded={embedded ? 'true' : undefined}
            className="flex flex-col flex-1 min-h-0 w-full overflow-hidden"
            onClick={() => setEditingIndex(null)}
        >
            {/* ── CABECERA SOLO STANDALONE (fuera del Modal padre) ── */}
            {!modalParentInstance ? (
                <div className="flex shrink-0 items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => navigateDay(-1)} aria-label="Día anterior" className="relative flex h-8 w-8 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 active:scale-95 before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']">
                            <ChevronLeft size={22} />
                        </button>
                        <button type="button" onClick={() => setShowCalendarModal(true)} aria-label="Abrir calendario" className="rounded-xl px-2 py-1.5 hover:bg-white/10 active:scale-95">
                            <h2 className="text-[13px] sm:text-[15px] font-black tracking-widest whitespace-nowrap text-white normal-case">
                                {date && (() => {
                                    const raw = format(new Date(date), "EEEE d 'de' MMMM", { locale: es });
                                    return raw.charAt(0).toUpperCase() + raw.slice(1);
                                })()}
                            </h2>
                        </button>
                        <button type="button" onClick={() => navigateDay(1)} aria-label="Día siguiente" className="relative flex h-8 w-8 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 active:scale-95 before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']">
                            <ChevronRight size={22} />
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button
                            type="button"
                            variant="primary"
                            instance="schedule-day-add-employee"
                            onClick={() => setShowAddEmployeeModal(true)}
                            aria-label="Añadir empleado"
                            icon={<Plus size={16} strokeWidth={3} />}
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            instance="schedule-day-share-open"
                            onClick={() => setShowShareModal(true)}
                        >
                            Guardar
                        </Button>
                    </div>
                </div>
            ) : null}

            {/* ── BODY: copia exacta de la vista de día del modal de lectura ── */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden day-modal-body">
                {/* Resumen del evento — editable, mismo aspecto que el modal de lectura */}
                <div className="p-3 md:p-4 lg:p-2 w-full shrink-0">
                    <div className="flex w-full max-w-2xl mx-auto flex-col gap-2 rounded-[var(--radio-control)] bg-white/10 p-2">
                        {!hasSlot1Activity && !showSecondActivityCard ? (
                            <div className="w-full min-w-0">
                                {editableGridSlot1}
                                <div className="mt-1 flex w-full justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setSecondSlotExpanded(true)}
                                        className="relative shrink-0 self-center rounded-xl text-[10px] font-normal py-3 text-white/80 hover:bg-white/10 transition-colors active:scale-[0.99] before:absolute before:inset-0 before:min-h-[var(--tactil-minimo)] before:content-['']"
                                    >
                                        + Segunda actividad (tarde)
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {hasSlot1Activity && (
                                    <div className="w-full min-w-0">
                                        {hasTwoActivities && (
                                            <div className="mb-1.5 w-full text-center">
                                                <span className="text-[9px] font-black tracking-wide text-white/60 uppercase">MAÑANA</span>
                                            </div>
                                        )}
                                        {editableGridSlot1}
                                    </div>
                                )}

                                {showSecondActivityCard && (
                                    <div className="w-full min-w-0">
                                        {hasTwoActivities && (
                                            <div className="mb-1.5 w-full text-center">
                                                <span className="text-[9px] font-black tracking-wide text-white/60 uppercase">TARDE</span>
                                            </div>
                                        )}
                                        {editableGridSlot2}
                                        {secondSlotExpanded && !hasSlot2Activity && (
                                            <div className="mt-1 flex w-full justify-center">
                                                <Button
                                                    type="button"
                                                    variant="tertiary"
                                                    instance="schedule-day-close-slot2"
                                                    onClick={() => setSecondSlotExpanded(false)}
                                                >
                                                    Cerrar
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {hasSlot1Activity && !hasSlot2Activity && !secondSlotExpanded && (
                                    <button
                                        type="button"
                                        onClick={() => setSecondSlotExpanded(true)}
                                        className="shrink-0 self-center rounded-xl text-[10px] font-normal py-3 text-white/80 hover:bg-white/10 transition-colors active:scale-[0.99] before:absolute before:inset-0 before:min-h-[var(--tactil-minimo)] before:content-[''] relative"
                                    >
                                        + Segunda actividad (tarde)
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Tabla o «Sin turno» */}
                {shifts.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-16 px-4">
                        <p className="text-xs font-medium text-white/60">Sin turno</p>
                    </div>
                ) : (
                <div data-element="schedule-shift-table" className="rounded-2xl border border-zinc-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.16)] overflow-hidden flex flex-col flex-1 min-h-0">
                    {/* Encabezado rojo */}
                    <div className="flex w-full bg-[#E55353] text-white shrink-0">
                        <div className="w-24 md:w-28 flex items-center justify-center shrink-0 h-5 md:h-6" />
                        <div className="flex-1 relative h-5 md:h-6 flex">
                            {hoursHeader.map(hour => (
                                <div key={hour} className="flex-1 text-[9px] font-black flex items-center justify-start -translate-x-1 sm:-translate-x-2 select-none opacity-90">
                                    {hour}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Filas de empleados — editables */}
                    <div className="flex flex-col w-full bg-white flex-1 overflow-y-auto min-h-0 day-modal-shift-rows">
                        {shifts.map((shift, idx) => (
                            <div key={shift.employeeId} className="flex w-full h-9 md:h-10 border-b border-gray-100 last:border-b-0 bg-white day-modal-shift-row">
                                <div className="w-24 md:w-28 px-2 flex items-center gap-2 shrink-0 overflow-hidden">
                                    <Avatar src={shift.avatar_url ?? undefined} alt={shift.name ?? '?'} size="sm" className="shrink-0" />
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingIndex(editingIndex === idx ? null : idx); }}
                                        className="min-w-0 flex-1 truncate text-left text-[11px] font-medium leading-none text-zinc-800 select-none hover:text-[#5B8FB9] transition-colors"
                                    >
                                        {shift.name}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveEmployee(idx); }}
                                        className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition-all shadow-sm hover:bg-red-600 active:scale-95 before:absolute before:inset-0 before:-m-2.5 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                                        title="Quitar del horario"
                                        aria-label={`Quitar ${shift.name}`}
                                    >
                                        <X size={12} strokeWidth={4} />
                                    </button>
                                </div>
                                <div className="flex-1 relative min-h-0">
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {hoursHeader.map((_, i) => (
                                            <div key={i} className="flex-1" />
                                        ))}
                                    </div>
                                    {shift.active && <ShiftBar shift={shift} onUpdate={(newS) => handleUpdateShift(idx, newS)} allowMove={editingIndex === idx} />}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer Total — penúltima fila, fondo blanco, texto gris claro descriptivo */}
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

                    {/* Footer Coste | Rentabilidad — última fila, partida en dos */}
                    <div className="flex w-full bg-white border-t border-gray-100 shrink-0 rounded-b-2xl">
                        <div className="flex-1 h-9 md:h-10 flex items-center justify-start pl-3 gap-1.5 min-w-0">
                            <span className="font-semibold text-gray-400 text-[10px] md:text-xs uppercase tracking-widest shrink-0">Coste</span>
                            <span className="font-semibold text-gray-800 text-[10px] md:text-xs tabular-nums">
                                {formatScheduleEuro(laborCost)}
                            </span>
                        </div>
                        <div className="flex-1 h-9 md:h-10 flex items-center justify-start pl-3 gap-1.5 min-w-0 border-l border-gray-100">
                            <span className="font-semibold text-gray-400 text-[10px] md:text-xs uppercase tracking-widest shrink-0">Rentabilidad</span>
                            <span className="font-semibold text-emerald-600 text-[10px] md:text-xs tabular-nums">
                                {formatScheduleEuro(requiredBilling)}
                            </span>
                        </div>
                    </div>
                </div>
                )}
            </div>

            {/* ── Edición del turno de un trabajador (task surface embebida) ── */}
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
                                    <ShiftBar shift={s} onUpdate={upd} allowMove barClass="bg-[#5B8FB9] border border-white/20" />
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

            {/* ── MODALES ── */}
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
                                    } catch {
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
});