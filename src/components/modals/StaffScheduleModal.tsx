'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { format, addMonths, subMonths, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import { ScheduleDayEditor } from '@/components/schedule/ScheduleDayEditor';
import { Avatar } from '@/components/ui/Avatar';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';
import { ShiftBarTimeLabels } from '@/components/schedule/ShiftBarTimeLabels';
import { ScheduleNotesFooter } from '@/components/schedule/ScheduleNotesFooter';
import { fetchDayDetailAction } from '@/app/staff/actividades/actions';
import { groupActivities } from '@/components/dashboards/staff/StaffWeekScheduleWidget';

/* ─── Constants (match editor exactly) ─────────────────── */
const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;

const timeToPercent = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return ((hours - START_HOUR) + (minutes / 60)) / TOTAL_HOURS * 100;
};

/** Horario del evento: «10:15 - 22:40». Vacío → espacio en blanco (lectura). */
const formatHorario = (start: string, end: string) => {
    const s = String(start ?? '').trim();
    const e = String(end ?? '').trim();
    if (!s && !e) return ' ';
    return [s, e].filter(Boolean).join(' - ');
};

/** «08:00» → «8» · «08:30» → «8:30» · «08:15» → «8:15». Sin segundos; minutos solo si no son en punto. */
function formatHourShort(time: string | null | undefined): string {
    const parts = String(time ?? '').split(':');
    const h = Number.parseInt(parts[0] ?? '', 10);
    if (!Number.isFinite(h)) return String(time ?? '').trim();
    const mins = parts[1] ?? '';
    if (!mins || mins === '00' || mins === '0') return String(h);
    return `${h}:${mins}`;
}

/** Fecha en formato largo («Domingo 6 de septiembre») con la primera letra en mayúscula. */
function formatDateTitle(date: Date, pattern: string): string {
    const raw = format(date, pattern, { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/* ─── Read-Only ShiftBar: barra completa en gradiente difuminado ── */
const ReadOnlyShiftBar = ({ start, end }: { start: string; end: string }) => {
    const barRef = useRef<HTMLDivElement>(null);
    const leftPos = Math.max(0, timeToPercent(start));
    const width = Math.max(timeToPercent(end) - leftPos, 5);
    return (
        <div
            ref={barRef}
            className="absolute top-2.5 bottom-2.5 flex items-center justify-between rounded-full z-10 overflow-hidden touch-none px-1.5"
            style={{
                left: `${leftPos}%`,
                width: `${width}%`,
                background: '#34d399',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
        >
            <ShiftBarTimeLabels barRef={barRef} start={start} end={end} />
        </div>
    );
};

/* ─── Resumen del evento: valor encima del nombre, 4 columnas iguales ── */
const SummaryCell = ({
    label,
    value,
    valueClassName,
}: {
    label: string;
    value: string;
    valueClassName?: string;
}) => (
    <div className="flex min-w-0 w-full flex-col items-center gap-1">
        <div className="flex min-h-[1.4rem] w-full flex-1 items-end justify-center">
            <span
                className={cn(
                    'w-full min-w-0 text-center text-[11px] font-semibold leading-tight text-white sm:text-xs',
                    valueClassName,
                )}
            >
                {value}
            </span>
        </div>
        <span className="shrink-0 text-[9px] font-semibold tracking-widest leading-none text-white/60">
            {label}
        </span>
    </div>
);

const SummaryGrid = ({
    activity,
    horario,
    pax,
    categoria,
}: {
    activity: string;
    horario: string;
    pax: string;
    categoria: string;
}) => (
    <div className="grid w-full min-w-0 auto-rows-min gap-x-1.5 gap-y-1 pb-0.5 [grid-template-columns:repeat(4,minmax(0,1fr))]">
        <SummaryCell label="Evento" value={activity} />
        <SummaryCell label="Horario" value={horario} valueClassName="text-emerald-300 whitespace-nowrap tabular-nums" />
        <SummaryCell label="Pax" value={pax} />
        <SummaryCell label="Categoria" value={categoria} />
    </div>
);

/* ─── Types ─────────────────────────────────────────────── */
interface ShiftMock { date: Date; startTime: string; endTime: string; activity?: string; }
interface DayShiftRow { name: string; avatar_url?: string | null; startTime: string; endTime: string; activity?: string; }
interface Props {
    isOpen: boolean;
    onClose: () => void;
    shifts: ShiftMock[];
    userName?: string;
    userRole?: 'staff' | 'manager' | 'supervisor' | 'admin';
    /** yyyy-MM-dd desde notificación: abre el detalle de ese día al abrir el modal */
    initialFocusDate?: string | null;
    userEmail?: string;
}

/* ─── Modal ─────────────────────────────────────────────── */
export const StaffScheduleModal = ({
    isOpen,
    onClose,
    shifts,
    userRole,
    initialFocusDate,
    userEmail,
}: Props) => {
    const router = useRouter();
    const pathname = usePathname();
    const [navigatingToActividades, setNavigatingToActividades] = useState(false);

    useScrollLock(navigatingToActividades);
    useModalUsageTracking({
        open: isOpen,
        usageId: 'staff-schedule',
        usageLabel: 'Horario del personal',
    });
    const trackScheduleDay = useTrackModalApply('staff-schedule-day', 'Día horario personal');
    const supabase = createClient();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const lastFocusedDateRef = useRef<string | null>(null);
    const [editModeForDate, setEditModeForDate] = useState<string | null>(null);
    const [dayShifts, setDayShifts] = useState<DayShiftRow[]>([]);
    const [dayActivity, setDayActivity] = useState('');
    const [dayCategory, setDayCategory] = useState('');
    const [eventStart, setEventStart] = useState('');
    const [eventEnd, setEventEnd] = useState('');
    const [eventParticipants, setEventParticipants] = useState<number | string>('');

    // Slot 2 (segunda actividad)
    const [dayActivity2, setDayActivity2] = useState('');
    const [dayCategory2, setDayCategory2] = useState('');
    const [eventStart2, setEventStart2] = useState('');
    const [eventEnd2, setEventEnd2] = useState('');
    const [eventParticipants2, setEventParticipants2] = useState<number | string>('');
    const [loadingDay, setLoadingDay] = useState(false);

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

    const navigateMonth = (d: 1 | -1) =>
        setCurrentDate(d === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));

    const generateCalendarDays = () => {
        const y = currentDate.getFullYear(), m = currentDate.getMonth();
        const firstDay = new Date(y, m, 1), lastDay = new Date(y, m + 1, 0);
        const days: (Date | null)[] = [];
        const startPad = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startPad; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(y, m, d));
        return days;
    };

    const handleDayClick = async (day: Date) => {
        trackScheduleDay(formatYmdShort(format(day, 'yyyy-MM-dd')));
        setLoadingDay(true);
        setSelectedDate(day);
        try {
            const localStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
            const localEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

            const { data: rawShifts, error } = await supabase
                .from('shifts')
                .select('start_time, end_time, activity, activity_2, categoria, categoria_2, user_id, is_published, event_start_time, event_end_time, event_participants, event_start_time_2, event_end_time_2, event_participants_2')
                .gte('start_time', localStart.toISOString())
                .lte('start_time', localEnd.toISOString())
                .order('start_time', { ascending: true });

            if (error) throw error;

            if (!rawShifts?.length) {
                setDayShifts([]);
                setDayActivity('');
                setDayCategory('');
                setEventStart('');
                setEventEnd('');
                setEventParticipants('');
                setDayActivity2('');
                setDayCategory2('');
                setEventStart2('');
                setEventEnd2('');
                setEventParticipants2('');
                setLoadingDay(false);
                return;
            }

            // Solo turnos publicados para la tabla (todos los trabajadores del día)
            const publishedShifts = rawShifts.filter((s: any) => s.is_published);
            if (!publishedShifts.length) {
                setDayShifts([]);
                setDayActivity('');
                setDayCategory('');
                setEventStart('');
                setEventEnd('');
                setEventParticipants('');
                setDayActivity2('');
                setDayCategory2('');
                setEventStart2('');
                setEventEnd2('');
                setEventParticipants2('');
                setLoadingDay(false);
                return;
            }

            // El resumen del evento (arriba) siempre se muestra cuando hay turnos publicados,
            // esté quien esté mirando el día. Se alimenta de las actividades reales del
            // pabellón (misma fuente que el widget de horario); si el día no tiene, cae al
            // primer turno publicado.
            const dayYmd = format(day, 'yyyy-MM-dd');
            const dayDetail = await fetchDayDetailAction({ date: dayYmd });
            const dayActivities = dayDetail.success ? dayDetail.data.barActivities : [];
            const groupedActivities = groupActivities(dayActivities);
            if (groupedActivities.length > 0) {
                const g1 = groupedActivities[0];
                const g2 = groupedActivities[1];
                setDayActivity(g1.activityName);
                setDayCategory((g1.categories ?? []).join(', '));
                setEventStart(formatHourShort(g1.startTime));
                setEventEnd(formatHourShort(g1.endTime));
                setEventParticipants(
                    g1.totalParticipants != null && g1.totalParticipants > 0
                        ? String(g1.totalParticipants)
                        : '',
                );
                setDayActivity2(g2?.activityName ?? '');
                setDayCategory2((g2?.categories ?? []).join(', '));
                setEventStart2(g2 ? formatHourShort(g2.startTime) : '');
                setEventEnd2(g2 ? formatHourShort(g2.endTime) : '');
                setEventParticipants2(
                    g2?.totalParticipants != null && g2.totalParticipants > 0
                        ? String(g2.totalParticipants)
                        : '',
                );
            } else {
                setDayActivity(publishedShifts[0]?.activity || '');
                setDayCategory(publishedShifts[0]?.categoria || '');
                setDayActivity2(publishedShifts[0]?.activity_2 || '');
                setDayCategory2(publishedShifts[0]?.categoria_2 || '');
                setEventStart(publishedShifts[0]?.event_start_time || '');
                setEventEnd(publishedShifts[0]?.event_end_time || '');
                setEventParticipants(publishedShifts[0]?.event_participants || '');
                setEventStart2(publishedShifts[0]?.event_start_time_2 || '');
                setEventEnd2(publishedShifts[0]?.event_end_time_2 || '');
                setEventParticipants2(publishedShifts[0]?.event_participants_2 || '');
            }

            // Todos los usuarios ven la tabla completa del día: quién comparte turno.
            const visibleShifts = publishedShifts;

            if (visibleShifts.length === 0) {
                setDayShifts([]);
                setLoadingDay(false);
                return;
            }

            const ids = [...new Set(visibleShifts.map((s: any) => s.user_id))];
            const { data: profiles } = await supabase.from('profiles').select('id, first_name, avatar_url').in('id', ids);
            const nameMap: Record<string, string> = {};
            const avatarMap: Record<string, string | null> = {};
            (profiles || []).forEach((p: any) => {
                nameMap[p.id] = p.first_name || '?';
                avatarMap[p.id] = p.avatar_url ?? null;
            });

            setDayShifts(visibleShifts.map((s: any) => ({
                name: nameMap[s.user_id] || '?',
                avatar_url: avatarMap[s.user_id] ?? null,
                startTime: new Date(s.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                endTime: new Date(s.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                activity: s.activity || undefined,
            })));
        } catch (err: any) {
            console.error('handleDayClick full error:', err);
            toast.error(err?.message || 'Error al cargar el día');
            setDayShifts([]);
            setDayActivity('');
            setDayCategory('');
            setDayActivity2('');
            setDayCategory2('');
            setEventStart('');
            setEventEnd('');
            setEventParticipants('');
            setEventStart2('');
            setEventEnd2('');
            setEventParticipants2('');
        } finally {
            setLoadingDay(false);
        }
    };

    useEffect(() => {
        if (!isOpen || !initialFocusDate) return;
        if (lastFocusedDateRef.current === initialFocusDate) return;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(initialFocusDate);
        if (!m) return;
        lastFocusedDateRef.current = initialFocusDate;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const day = new Date(y, mo - 1, d);
        setCurrentDate(day);
        void handleDayClick(day);
    }, [isOpen, initialFocusDate]);

    useEffect(() => {
        if (!isOpen) lastFocusedDateRef.current = null;
    }, [isOpen]);

    useEffect(() => {
        if (!navigatingToActividades) return;
        if (pathname === '/staff/actividades') {
            setNavigatingToActividades(false);
        }
    }, [navigatingToActividades, pathname]);

    useEffect(() => {
        if (!navigatingToActividades) return;
        const timeout = window.setTimeout(() => setNavigatingToActividades(false), 15000);
        return () => window.clearTimeout(timeout);
    }, [navigatingToActividades]);

    const handleBack = () => { setSelectedDate(null); setDayShifts([]); setEditModeForDate(null); };
    const handleClose = () => { setSelectedDate(null); setDayShifts([]); setEditModeForDate(null); onClose(); };

    const openActividades = () => {
        setNavigatingToActividades(true);
        handleClose();
        router.push('/staff/actividades');
    };

    const exitEditModeAndRefresh = () => {
        setEditModeForDate(null);
        if (selectedDate) handleDayClick(selectedDate);
    };

    const navigationOverlay =
        navigatingToActividades && typeof document !== 'undefined'
            ? createPortal(
                  <div className="fixed inset-0 z-[10100] flex items-center justify-center bg-marbella-shell">
                      <LoadingSpinner size="lg" className="text-zinc-700" />
                  </div>,
                  document.body,
              )
            : null;

    if (!isOpen && !navigatingToActividades) return null;

    const calendarDays = generateCalendarDays();
    const futureShifts = shifts
        .filter(s => s.date >= new Date(new Date().setHours(0, 0, 0, 0)) && isSameMonth(s.date, currentDate))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    // TOT row — same logic as editor
    const totals = hoursHeader.map(hour =>
        dayShifts.filter(s => {
            const sh = parseInt(s.startTime.split(':')[0]);
            const eh = parseInt(s.endTime.split(':')[0]);
            return hour >= sh && hour < eh;
        }).length
    );

    const hasAct1 = dayActivity.trim().length > 0;
    const hasAct2 = dayActivity2.trim().length > 0;
    const hasTwoActivities = hasAct1 && hasAct2;
    const displayOrBlank = (v: any) => {
        if (v === 0) return ' ';
        const s = String(v ?? '').trim();
        return s ? s : ' ';
    };

    return (
        <>
            {navigationOverlay}
            <Modal
                open={isOpen}
                onClose={handleClose}
                title={
                    selectedDate ? (
                        <span className="normal-case">
                            {formatDateTitle(selectedDate, "EEEE d 'de' MMMM")}
                        </span>
                    ) : (
                        <span className="normal-case">
                            {formatDateTitle(currentDate, 'MMMM yyyy')}
                        </span>
                    )
                }
                instance="staff-schedule"
                variant="work"
                layer="base"
                scheme="dark"
                hideHeader={Boolean(editModeForDate)}
                onBack={selectedDate ? handleBack : undefined}
                headerTrailing={
                    !editModeForDate ? (
                        <>
                            {selectedDate ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const prevDay = new Date(selectedDate);
                                        prevDay.setDate(prevDay.getDate() - 1);
                                        void handleDayClick(prevDay);
                                    }}
                                    className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-500 outline-none transition-opacity hover:opacity-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                    aria-label="Día anterior"
                                >
                                    <ChevronLeft size={18} strokeWidth={2.5} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => navigateMonth(-1)}
                                    className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-500 outline-none transition-opacity hover:opacity-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                    aria-label="Mes anterior"
                                >
                                    <ChevronLeft size={20} strokeWidth={2.5} />
                                </button>
                            )}

                            {selectedDate ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextDay = new Date(selectedDate);
                                        nextDay.setDate(nextDay.getDate() + 1);
                                        void handleDayClick(nextDay);
                                    }}
                                    className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-500 outline-none transition-opacity hover:opacity-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                    aria-label="Día siguiente"
                                >
                                    <ChevronRight size={18} strokeWidth={2.5} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => navigateMonth(1)}
                                    className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-500 outline-none transition-opacity hover:opacity-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                    aria-label="Mes siguiente"
                                >
                                    <ChevronRight size={20} strokeWidth={2.5} />
                                </button>
                            )}

                            {selectedDate && userEmail === 'hhector7722@gmail.com' ? (
                                <button
                                    type="button"
                                    onClick={() => setEditModeForDate(format(selectedDate, 'yyyy-MM-dd'))}
                                    className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                    aria-label="Editar este día"
                                >
                                    <Edit2 size={18} strokeWidth={2.5} />
                                </button>
                            ) : null}
                        </>
                    ) : null
                }
                footer={
                    selectedDate ? (
                        <ScheduleNotesFooter
                            key={format(selectedDate, 'yyyy-MM-dd')}
                            date={format(selectedDate, 'yyyy-MM-dd')}
                            isManager={
                                userRole === 'manager' ||
                                userRole === 'supervisor' ||
                                userRole === 'admin'
                            }
                        />
                    ) : undefined
                }
                scrollContent={false}
            >

                {/* ── MODO EDICIÓN: editor embebido (reutiliza su cabecera, sin cabecera extra) ── */}
                {editModeForDate ? (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden day-modal-body">
                        <ScheduleDayEditor
                            initialDate={editModeForDate}
                            onClose={exitEditModeAndRefresh}
                            onSuccess={exitEditModeAndRefresh}
                            onRequestCloseModal={handleClose}
                            embedded
                            modalParentInstance="staff-schedule"
                        />
                    </div>
                ) : (
                <>
                {/* ── BODY ── */}
                {!selectedDate ? (
                    // VISTA A: CALENDARIO MENSUAL
                    <div className="flex flex-col flex-1 overflow-hidden min-h-0 day-modal-body">
                        <div className="p-4 pb-3 shrink-0 border-b border-white/15">
                            <div className="grid grid-cols-7 gap-1 mb-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-xs font-black text-white/40">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-y-0.5">
                                {calendarDays.map((day, i) => {
                                    if (!day) return <div key={`e-${i}`} className="aspect-square" />;
                                    const isToday = isSameDay(day, new Date());
                                    const hasShift = shifts.some(s => isSameDay(s.date, day));
                                    return (
                                        <button key={i} type="button" onClick={() => handleDayClick(day)}
                                            className="aspect-square flex items-center justify-center rounded-xl relative transition-all duration-150 active:scale-95 cursor-pointer hover:bg-white/20">
                                            <span className={`
                                                w-7 h-7 flex items-center justify-center rounded-full text-sm font-black transition-colors
                                                ${hasShift
                                                    ? 'bg-emerald-500 text-white'
                                                    : isToday
                                                        ? 'text-blue-300'
                                                        : 'text-white/80 font-medium'
                                                }
                                            `}>
                                                {day.getDate()}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="flex items-center justify-between gap-3 mb-3 min-h-[48px] shrink-0">
                                <h4 className="text-[10px] font-black uppercase text-white/60 tracking-widest leading-none">
                                    Próximos Turnos
                                </h4>
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    instance="staff-schedule-ver-actividades"
                                    onClick={openActividades}
                                    aria-label="Ver actividades del pabellón"
                                    className="shrink-0"
                                >
                                    Ver actividades
                                </Button>
                            </div>
                            {futureShifts.length === 0 ? (
                                <p className="text-center text-white/60 text-xs font-bold py-10 italic">No hay más turnos este mes.</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {futureShifts.map((shift, idx) => (
                                        <div key={idx} onClick={() => handleDayClick(shift.date)}
                                            className="flex items-center gap-3 p-3 rounded-2xl bg-white/10 border border-white/10 cursor-pointer hover:border-white/25 hover:bg-white/15 transition-all active:scale-[0.98]">
                                            <div className="bg-white/10 text-white rounded-xl px-3 py-2 flex flex-col items-center min-w-[46px]">
                                                <span className="text-[8px] font-black uppercase leading-none">{format(shift.date, "MMM", { locale: es })}</span>
                                                <span className="text-lg font-black leading-none mt-0.5">{shift.date.getDate()}</span>
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest truncate">{shift.activity || 'Turno'}</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-emerald-300 font-black text-sm">{shift.startTime}</span>
                                                    <span className="text-white/30">-</span>
                                                    <span className="text-rose-300 font-black text-sm">{shift.endTime}</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-white/30 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // VISTA B: TABLA IDÉNTICA AL EDITOR — SÓLO LECTURA
                    <div className="flex flex-col flex-1 overflow-hidden min-h-0 day-modal-body">
                        {loadingDay ? (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <div className="w-8 h-8 rounded-full border-4 border-ds-marca border-t-transparent animate-spin" />
                            </div>
                        ) : (
                            <>
                                {/* Resumen del evento — siempre visible */}
                                <div className="p-3 md:p-4 lg:p-2 w-full shrink-0">
                                    <div className="flex w-full max-w-2xl mx-auto flex-col gap-2 rounded-[var(--radio-control)] bg-white/10 p-2">
                                        {!hasAct1 && !hasAct2 ? (
                                            <div className="text-center text-white/50 text-[10px] font-black tracking-widest py-3 lg:py-1">Sin actividad</div>
                                        ) : (
                                            <>
                                                {hasAct1 && (
                                                    <div className="w-full min-w-0">
                                                        {hasTwoActivities && (
                                                            <div className="mb-1.5 w-full text-center">
                                                                <span className="text-[9px] font-black tracking-wide text-white/60 uppercase">MAÑANA</span>
                                                            </div>
                                                        )}
                                                        <SummaryGrid
                                                            activity={displayOrBlank(dayActivity)}
                                                            horario={formatHorario(eventStart, eventEnd)}
                                                            pax={displayOrBlank(eventParticipants)}
                                                            categoria={displayOrBlank(dayCategory)}
                                                        />
                                                    </div>
                                                )}

                                                {hasAct2 && (
                                                    <div className="w-full min-w-0">
                                                        {hasTwoActivities && (
                                                            <div className="mb-1.5 w-full text-center">
                                                                <span className="text-[9px] font-black tracking-wide text-white/60 uppercase">TARDE</span>
                                                            </div>
                                                        )}
                                                        <SummaryGrid
                                                            activity={displayOrBlank(dayActivity2)}
                                                            horario={formatHorario(eventStart2, eventEnd2)}
                                                            pax={displayOrBlank(eventParticipants2)}
                                                            categoria={displayOrBlank(dayCategory2)}
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Tabla o «Sin turno» */}
                                {dayShifts.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center py-16 px-4">
                                        <p className="text-xs font-medium text-white/60">Sin turno</p>
                                    </div>
                                ) : (
                                <div data-element="schedule-shift-table" className="rounded-2xl border border-zinc-100 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.55),0_1px_1px_rgba(0,0,0,0.04),0_6px_18px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col flex-1 min-h-0">
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

                                    {/* Filas de empleados — altura igual en escritorio */}
                                    <div className="flex flex-col w-full bg-white flex-1 overflow-y-auto min-h-0 day-modal-shift-rows">
                                        {dayShifts.map((shift, idx) => (
                                            <div key={idx} className="flex w-full h-9 md:h-10 border-b border-gray-100 last:border-b-0 bg-white day-modal-shift-row">
                                                <div className="w-24 md:w-28 px-2 flex items-center gap-2 shrink-0 overflow-hidden">
                                                    <Avatar src={shift.avatar_url ?? undefined} alt={shift.name} size="sm" className="shrink-0" />
                                                    <span className="min-w-0 truncate text-[11px] font-medium leading-none text-zinc-800 select-none">
                                                        {shift.name}
                                                    </span>
                                                </div>
                                                <div className="flex-1 relative min-h-0">
                                                    <div className="absolute inset-0 flex pointer-events-none">
                                                        {hoursHeader.map((_, i) => (
                                                            <div key={i} className="flex-1" />
                                                        ))}
                                                    </div>
                                                    <ReadOnlyShiftBar start={shift.startTime} end={shift.endTime} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Footer Total — fondo blanco, texto gris claro descriptivo */}
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
                                )}
                            </>
                        )}
                    </div>
                )}
                </>
                )}
            </Modal>
        </>
    );
};
