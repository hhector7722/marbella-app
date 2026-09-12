'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    addDays,
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isSameWeek,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
    fetchBarActivitiesForRangeClient,
    type BarActivity,
} from '@/lib/pavilion/bar-activities-range';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getOvertimeData } from '@/app/actions/overtime';
import { Check, X } from 'lucide-react';
import type { WeeklyStats } from '@/lib/hours-engine/overtime-weeks-ssot';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;

const WEEK_GRID_COLS = 'grid-cols-7';
const WEEK_GRID_COLS_EXT = 'grid-cols-8';

type ShiftRow = {
    start_time: string;
    end_time: string;
};

type StaffWeekScheduleWidgetProps = {
    userId: string | null;
    /**
     * Abre el modal de horario del día (StaffScheduleModal) al pulsar una tarjeta de fin de semana.
     * Si el widget ya tiene actividades cacheadas para ese día, las pasa como semilla (puede ser `[]`).
     */
    onOpenNote?: (ymd: string, activities?: BarActivity[]) => void;
    /** Email de sesión: el master ve indicador naranja en días con nota. */
    userEmail?: string;
    /** Modo Master: pinta la columna «Ext» de horas extra a la derecha del calendario. */
    masterMode?: boolean;
    /** Abre el modal de detalle de semana de horas extras (solo modo Master). */
    onOpenWeekDetail?: (week: WeeklyStats) => void;
    /** Al cambiar, recarga las horas extra del mes visible (p. ej. tras cerrar el modal de detalle). */
    overtimeRefreshKey?: number;
    /** Al cambiar, recarga los turnos del finde expandido (p. ej. tras cerrar el modal de horario). */
    refreshKey?: number;
};

function monthTitle(date: Date): string {
    const raw = format(date, 'MMMM yyyy', { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatClockTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/** Misma presentación de hora que `/horario` (vista Actividades). */
export function fmtHour(time: string): string {
    const parts = time.split(':');
    if (parts.length < 2) return time;
    return `${parseInt(parts[0], 10)}:${parts[1]}`;
}

/** Agrupa por nombre como en `/horario` y `/staff/actividades`. */
export function groupActivities(acts: BarActivity[]): BarActivity[] {
    if (acts.length === 0) return acts;
    const map = new Map<string, BarActivity>();
    for (const a of acts) {
        const name = a.activityName.trim();
        if (!map.has(name)) {
            map.set(name, {
                ...a,
                venueCodes: [...a.venueCodes],
                categories: a.categories ? [...a.categories] : [],
            });
        } else {
            const existing = map.get(name)!;
            if (a.startTime < existing.startTime) existing.startTime = a.startTime;
            if (a.endTime > existing.endTime) existing.endTime = a.endTime;

            if (a.formStartTime && (!existing.formStartTime || a.formStartTime < existing.formStartTime)) {
                existing.formStartTime = a.formStartTime;
            }
            if (a.formEndTime && (!existing.formEndTime || a.formEndTime > existing.formEndTime)) {
                existing.formEndTime = a.formEndTime;
            }

            if (a.totalParticipants) {
                existing.totalParticipants = (existing.totalParticipants || 0) + a.totalParticipants;
            }

            if (a.categories) {
                if (!existing.categories) existing.categories = [];
                for (const c of a.categories) {
                    if (!existing.categories.includes(c)) existing.categories.push(c);
                }
            }

            for (const v of a.venueCodes) {
                if (!existing.venueCodes.includes(v)) existing.venueCodes.push(v);
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function parseTimeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    const h = parseInt(parts[0] ?? '0', 10);
    const m = parseInt(parts[1] ?? '0', 10);
    return h * 60 + m;
}

function compareActivities(a: BarActivity, b: BarActivity): number {
    const aPistas = a.venueCodes.filter((c) => ['P1', 'P2', 'P3', 'P4'].includes(c));
    const bPistas = b.venueCodes.filter((c) => ['P1', 'P2', 'P3', 'P4'].includes(c));
    const aHasPista = aPistas.length > 0;
    const bHasPista = bPistas.length > 0;

    if (aHasPista !== bHasPista) {
        return aHasPista ? -1 : 1;
    }

    const aDur = parseTimeToMinutes(a.endTime) - parseTimeToMinutes(a.startTime);
    const bDur = parseTimeToMinutes(b.endTime) - parseTimeToMinutes(b.startTime);
    if (aDur !== bDur) {
        return bDur - aDur; // mayor duración primero
    }

    if (aHasPista && bHasPista) {
        const aPriority = Math.max(...aPistas.map((c) => (c === 'P1' ? 4 : c === 'P2' ? 3 : c === 'P3' ? 2 : c === 'P4' ? 1 : 0)));
        const bPriority = Math.max(...bPistas.map((c) => (c === 'P1' ? 4 : c === 'P2' ? 3 : c === 'P3' ? 2 : c === 'P4' ? 1 : 0)));
        if (aPriority !== bPriority) {
            return bPriority - aPriority; // mayor prioridad de pista primero
        }
    }

    return 0;
}

function selectPrimaryActivity(acts: BarActivity[]): BarActivity[] {
    if (acts.length === 0) return [];
    const sorted = [...acts].sort(compareActivities);
    const primary = sorted[0];
    return primary ? [primary] : [];
}

function formatDayEventNames(acts: BarActivity[] | undefined): string | null {
    const primary = selectPrimaryActivity(acts ?? []);
    const grouped = groupActivities(primary);
    if (grouped.length === 0) return null;
    return grouped.map((a) => a.activityName).join(' · ');
}

type EventDetailRow = {
    hours: string;
    pax: string | null;
    categories: string | null;
};

/** Una fila por actividad: tres datos (horas, participantes, categoría) que reparten el ancho en tres columnas. */
function formatDayEventDetailRows(acts: BarActivity[] | undefined): EventDetailRow[] {
    const primary = selectPrimaryActivity(acts ?? []);
    const grouped = groupActivities(primary);
    if (grouped.length === 0) return [];
    return grouped.map((act) => ({
        hours: `${fmtHour(act.startTime)} - ${fmtHour(act.endTime)}`,
        pax:
            act.totalParticipants != null && act.totalParticipants > 0
                ? `${act.totalParticipants} pax`
                : null,
        categories: act.categories?.length ? act.categories.join(', ') : null,
    }));
}

function shiftForDay(shifts: ShiftRow[], day: Date): ShiftRow | null {
    const key = format(day, 'yyyy-MM-dd');
    return (
        shifts.find((s) => {
            const start = new Date(s.start_time);
            return format(start, 'yyyy-MM-dd') === key;
        }) ?? null
    );
}

function chunkWeeks(days: Date[]): Date[][] {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }
    return weeks;
}

function formatWeekdayHeading(day: Date): string {
    const raw = format(day, 'EEEE d', { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Importe de horas extra a abonar de una semana (misma regla que el modal de detalle: excluye stock y sin coste). */
function weekOvertimeTotal(week: WeeklyStats | undefined): number {
    if (!week) return 0;
    return (week.staff ?? [])
        .filter((s) => (s.totalCost ?? 0) > 0.05 && s.preferStock !== true)
        .reduce((sum, s) => sum + (s.totalCost ?? 0), 0);
}

/** Una semana está abonada cuando todos sus trabajadores con importe lo están. */
function isWeekPaid(week: WeeklyStats | undefined): boolean {
    if (!week) return false;
    const chargeable = (week.staff ?? []).filter((s) => (s.totalCost ?? 0) > 0.05 && s.preferStock !== true);
    if (chargeable.length === 0) return false;
    return chargeable.every((s) => s.isPaid === true);
}

function WeekendDayColumn({
    day,
    shift,
    eventLabel,
    eventDetailRows,
    onOpenDay,
    cachedActivities,
    masterMode = false,
}: {
    day: Date;
    shift: ShiftRow | null;
    eventLabel: string | null;
    eventDetailRows: EventDetailRow[];
    onOpenDay?: (ymd: string, activities?: BarActivity[]) => void;
    /** Actividades ya cargadas para este día; se reutilizan al abrir el modal. */
    cachedActivities?: BarActivity[];
    masterMode?: boolean;
}) {
    const ymd = format(day, 'yyyy-MM-dd');
    const shiftStart = shift != null ? fmtHour(formatClockTime(shift.start_time)) : null;
    const shiftEnd = shift != null ? fmtHour(formatClockTime(shift.end_time)) : null;

    return (
        <button
            type="button"
            data-element="weekend-card"
            onClick={(e) => {
                e.stopPropagation();
                onOpenDay?.(ymd, cachedActivities);
            }}
            aria-label={`Ver ${formatWeekdayHeading(day)}`}
            className="relative text-left outline-none transition-opacity hover:opacity-90 active:opacity-80 before:absolute before:inset-0 before:-m-0.5 before:min-h-[var(--tactil-minimo)] before:content-['']"
        >
            <div data-element="weekend-day" className="flex h-full min-h-0 min-w-0 flex-col">
                <p data-element="weekend-title" className="shrink-0 text-center text-[7px] lg:text-[11px] font-semibold leading-none">
                    {formatWeekdayHeading(day)}
                </p>

                <div data-element="weekend-details" className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {!masterMode && (
                        <div data-element="weekend-turno" className="flex min-w-0 items-center justify-center">
                            {shiftStart && shiftEnd ? (
                                <span
                                    data-element="weekend-turno-pill"
                                    className="inline-flex max-w-full min-w-0 overflow-hidden rounded-full border border-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                                    aria-label={`Turno ${shiftStart} a ${shiftEnd}`}
                                >
                                    <span
                                        data-element="weekend-turno-start"
                                        className="shrink-0 border-r border-white bg-[var(--color-positivo)] px-1 py-px text-[7px] lg:text-[10px] font-semibold tabular-nums leading-none text-white"
                                    >
                                        {shiftStart}
                                    </span>
                                    <span
                                        data-element="weekend-turno-end"
                                        className="shrink-0 bg-[var(--color-negativo)] px-1 py-px text-[7px] lg:text-[10px] font-semibold tabular-nums leading-none text-white"
                                    >
                                        {shiftEnd}
                                    </span>
                                </span>
                            ) : (
                                <span data-element="weekend-turno-label" className="shrink-0 text-[6px] lg:text-[11px] font-medium leading-none tracking-wide">
                                    Turno
                                </span>
                            )}
                        </div>
                    )}

                    <div data-element="weekend-evento" className="flex min-w-0 items-baseline gap-0.5 border-l-2 pl-0.5">
                        {eventLabel ? (
                            <span data-element="weekend-evento-value" className="min-w-0 truncate text-[6px] lg:text-[11px] font-medium leading-none">
                                {eventLabel}
                            </span>
                        ) : (
                            <span data-element="weekend-evento-label" className="shrink-0 text-[6px] lg:text-[11px] font-medium leading-none tracking-wide">
                                Evento
                            </span>
                        )}
                    </div>
                    {eventDetailRows.length > 0 ? (
                        <div data-element="weekend-evento-detail" className="flex w-full flex-col">
                            {eventDetailRows.map((row, i) => (
                                <div key={i} className="grid w-full grid-cols-[max-content_max-content_minmax(0,1fr)] gap-x-1">
                                    {(
                                        [
                                            { kind: 'hours', text: row.hours },
                                            { kind: 'pax', text: row.pax },
                                            { kind: 'categories', text: row.categories },
                                        ] as const
                                    ).map((cell) => (
                                        <span
                                            key={cell.kind}
                                            data-element="weekend-evento-detail-value"
                                            data-segment-kind={cell.kind}
                                            className={cn(
                                                "text-center text-[6px] lg:text-[11px] font-medium leading-none opacity-80",
                                                cell.kind === 'hours'
                                                    ? cn("shrink-0 whitespace-nowrap", masterMode && "font-semibold")
                                                    : "min-w-0 truncate"
                                            )}
                                        >
                                            {cell.text}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </button>
    );
}

function WeekExpansion({
    weekDays,
    shifts,
    eventsByDate,
    onOpenDay,
    masterMode = false,
    className,
}: {
    weekDays: Date[];
    shifts: ShiftRow[];
    eventsByDate: Record<string, BarActivity[]>;
    onOpenDay?: (ymd: string, activities?: BarActivity[]) => void;
    masterMode?: boolean;
    className?: string;
}) {
    const saturday = weekDays[5];
    const sunday = weekDays[6];
    const satKey = format(saturday, 'yyyy-MM-dd');
    const sunKey = format(sunday, 'yyyy-MM-dd');

    return (
        <div
            className={cn("grid grid-cols-2", className)}
            data-element="week-expansion"
        >
            <WeekendDayColumn
                day={saturday}
                shift={shiftForDay(shifts, saturday)}
                eventLabel={formatDayEventNames(eventsByDate[satKey])}
                eventDetailRows={formatDayEventDetailRows(eventsByDate[satKey])}
                onOpenDay={onOpenDay}
                cachedActivities={eventsByDate[satKey]}
                masterMode={masterMode}
            />
            <WeekendDayColumn
                day={sunday}
                shift={shiftForDay(shifts, sunday)}
                eventLabel={formatDayEventNames(eventsByDate[sunKey])}
                eventDetailRows={formatDayEventDetailRows(eventsByDate[sunKey])}
                onOpenDay={onOpenDay}
                cachedActivities={eventsByDate[sunKey]}
                masterMode={masterMode}
            />
        </div>
    );
}

function WeekExtCell({
    weekDays,
    week,
    loading,
    onOpenWeekDetail,
}: {
    weekDays: Date[];
    week: WeeklyStats | undefined;
    loading: boolean;
    onOpenWeekDetail?: (week: WeeklyStats) => void;
}) {
    const total = weekOvertimeTotal(week);
    const paid = isWeekPaid(week);
    return (
        <button
            type="button"
            data-element="weekend-ext"
            onClick={(e) => {
                e.stopPropagation();
                if (week) onOpenWeekDetail?.(week);
            }}
            aria-label={
                week
                    ? `Horas extra semana del ${format(weekDays[0], 'd MMM', { locale: es })}: ${total.toFixed(0)}€${paid ? ', pagada' : ', sin pagar'}`
                    : 'Horas extra sin importe esta semana'
            }
            className={cn(
                'relative z-10 flex w-full items-center justify-center gap-0.5 transition-colors',
                'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                week && 'hover:bg-white/10',
                !week && 'cursor-default',
            )}
        >
            {loading ? (
                <LoadingSpinner size="sm" className="h-2.5 w-2.5 text-white/60" />
            ) : week ? (
                <>
                    <span
                        data-element="weekend-ext-value"
                        className={cn(
                            'text-[7px] lg:text-[11px] tabular-nums leading-none',
                            paid ? 'font-semibold text-white/90' : 'font-semibold text-white/70',
                        )}
                    >
                        {total.toFixed(0)}€
                    </span>
                    <span
                        data-element="weekend-ext-paid"
                        data-paid={paid ? 'true' : 'false'}
                        className={cn(
                            'flex h-2 w-2 lg:h-3 lg:w-3 shrink-0 items-center justify-center rounded-full',
                            paid ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                    >
                        {paid ? (
                            <Check className="h-1 w-1 text-white" strokeWidth={4} />
                        ) : (
                            <X className="h-1 w-1 text-white" strokeWidth={4} />
                        )}
                    </span>
                </>
            ) : null}
        </button>
    );
}

export function StaffWeekScheduleWidget({
    userId,
    onOpenNote,
    userEmail,
    masterMode = false,
    onOpenWeekDetail,
    overtimeRefreshKey = 0,
    refreshKey = 0,
}: StaffWeekScheduleWidgetProps) {
    const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
    const [expandedWeekStart, setExpandedWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [shifts, setShifts] = useState<ShiftRow[]>([]);
    const [eventsByDate, setEventsByDate] = useState<Record<string, BarActivity[]>>({});
    const [loading, setLoading] = useState(true);
    const [overtimeWeeks, setOvertimeWeeks] = useState<Record<string, WeeklyStats>>({});
    const [overtimeLoading, setOvertimeLoading] = useState(() => masterMode);
    /** Días (yyyy-MM-dd) con al menos una nota; solo se rellena para el usuario master. */
    const [noteDates, setNoteDates] = useState<Set<string>>(() => new Set());
    const showNoteMarkers = isMasterDashboardUser(userEmail);

    const visibleRange = useMemo(() => {
        const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 });
        return { start, end };
    }, [monthAnchor]);

    const rangeStart = format(visibleRange.start, 'yyyy-MM-dd');
    const rangeEnd = format(visibleRange.end, 'yyyy-MM-dd');

    const monthDays = useMemo(
        () => eachDayOfInterval({ start: visibleRange.start, end: visibleRange.end }),
        [visibleRange],
    );

    const monthWeeks = useMemo(() => chunkWeeks(monthDays), [monthDays]);

    const loadOvertimeData = useCallback(async () => {
        if (!masterMode) return;
        setOvertimeLoading(true);
        try {
            const result = await getOvertimeData(rangeStart, rangeEnd);
            const byWeek: Record<string, WeeklyStats> = {};
            (result?.weeksResult ?? []).forEach((w) => {
                byWeek[w.weekId] = w;
            });
            setOvertimeWeeks(byWeek);
        } catch (e) {
            console.error(e);
            setOvertimeWeeks({});
        } finally {
            setOvertimeLoading(false);
        }
    }, [masterMode, rangeStart, rangeEnd]);

    useEffect(() => {
        if (!masterMode) return;
        void loadOvertimeData();
    }, [loadOvertimeData, overtimeRefreshKey, masterMode]);

    const loadedActivityDatesRef = useRef<Set<string>>(new Set());
    const expandedSatKey = useMemo(() => format(addDays(expandedWeekStart, 5), 'yyyy-MM-dd'), [expandedWeekStart]);
    const expandedSunKey = useMemo(() => format(addDays(expandedWeekStart, 6), 'yyyy-MM-dd'), [expandedWeekStart]);

    const loadWeekendActivities = useCallback(async (satKey: string, sunKey: string) => {
        if (loadedActivityDatesRef.current.has(satKey) && loadedActivityDatesRef.current.has(sunKey)) {
            return;
        }

        loadedActivityDatesRef.current.add(satKey);
        loadedActivityDatesRef.current.add(sunKey);

        try {
            const activitiesResult = await fetchBarActivitiesForRangeClient(
                createClient(),
                satKey,
                sunKey,
            );

            if (activitiesResult.success) {
                const next: Record<string, BarActivity[]> = {};
                next[satKey] = activitiesResult.byDate[satKey]?.barActivities ?? [];
                next[sunKey] = activitiesResult.byDate[sunKey]?.barActivities ?? [];
                setEventsByDate((prev) => ({ ...prev, ...next }));
            }
        } catch (error) {
            console.error('Error fetching weekend activities:', error);
            loadedActivityDatesRef.current.delete(satKey);
            loadedActivityDatesRef.current.delete(sunKey);
        }
    }, []);

    useEffect(() => {
        void loadWeekendActivities(expandedSatKey, expandedSunKey);
    }, [loadWeekendActivities, expandedSatKey, expandedSunKey]);

    /** Solo turnos del finde expandido: el grid de días no los usa, solo las cards sáb/dom. */
    const loadWeekendShifts = useCallback(async (satKey: string, sunKey: string) => {
        if (!userId) {
            setShifts([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const supabase = createClient();
            const startIso = `${satKey}T00:00:00`;
            const endIso = `${sunKey}T23:59:59`;

            const { data, error } = await supabase
                .from('shifts')
                .select('start_time, end_time')
                .eq('user_id', userId)
                .eq('is_published', true)
                .gte('start_time', startIso)
                .lte('start_time', endIso)
                .order('start_time', { ascending: true });

            if (error) throw error;
            setShifts(data ?? []);
        } catch (error) {
            console.error(error);
            setShifts([]);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void loadWeekendShifts(expandedSatKey, expandedSunKey);
    }, [loadWeekendShifts, expandedSatKey, expandedSunKey, refreshKey]);

    const loadNoteDates = useCallback(async () => {
        if (!showNoteMarkers) {
            return;
        }
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('schedule_day_notes')
                .select('date')
                .gte('date', rangeStart)
                .lte('date', rangeEnd);
            if (error) throw error;
            setNoteDates(new Set((data ?? []).map((row) => String(row.date))));
        } catch (error) {
            console.error(error);
            setNoteDates(new Set());
        }
    }, [showNoteMarkers, rangeStart, rangeEnd]);

    useEffect(() => {
        void loadNoteDates();
    }, [loadNoteDates, refreshKey]);

    const handleDaySelect = (day: Date) => {
        setExpandedWeekStart(startOfWeek(day, { weekStartsOn: 1 }));
        if (!isSameMonth(day, monthAnchor)) {
            setMonthAnchor(startOfMonth(day));
        }
    };

    const handleMonthChange = (direction: -1 | 1) => {
        setMonthAnchor((current) => {
            const next = direction < 0 ? subMonths(current, 1) : addMonths(current, 1);
            const now = new Date();
            if (isSameMonth(now, next)) {
                setExpandedWeekStart(startOfWeek(now, { weekStartsOn: 1 }));
            } else {
                setExpandedWeekStart(startOfWeek(startOfMonth(next), { weekStartsOn: 1 }));
            }
            return startOfMonth(next);
        });
    };

    return (
        <div
            data-component="StaffWeekSchedule"
            data-layout="month-inline"
            className="relative flex h-full min-h-0 w-full flex-col px-1 py-0.5"
        >
            {loading && (
                <div className="absolute right-3 top-2.5 z-20 flex items-center justify-center pointer-events-none" role="status" aria-label="Cargando horarios">
                    <LoadingSpinner size="sm" className="h-2.5 w-2.5 text-white/60" />
                </div>
            )}
            <div className="flex shrink-0 items-center justify-center gap-0.5 pb-px">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleMonthChange(-1);
                    }}
                    className="relative flex h-6 w-6 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                    aria-label="Mes anterior"
                >
                    <ChevronLeft className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2.5} />
                </button>
                <span className="min-w-[6.5rem] text-center text-[9px] lg:text-[15px] font-black uppercase tracking-widest text-white">
                    {monthTitle(monthAnchor)}
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleMonthChange(1);
                    }}
                    className="relative flex h-6 w-6 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                    aria-label="Mes siguiente"
                >
                    <ChevronRight className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2.5} />
                </button>
            </div>

            <div data-element="month-scroll" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className={cn('grid shrink-0 gap-px', masterMode ? WEEK_GRID_COLS_EXT : WEEK_GRID_COLS)}>
                    {WEEKDAY_LABELS.map((label) => (
                        <div key={label} className="flex items-center justify-center">
                            <span className="text-[5px] lg:text-[11px] font-medium uppercase leading-none text-white/40">{label}</span>
                        </div>
                    ))}
                    {masterMode ? (
                        <div className="flex items-center justify-center">
                            <span className="text-[5px] lg:text-[11px] font-bold uppercase leading-none text-white/60">Ext</span>
                        </div>
                    ) : null}
                </div>

                <div data-element="month-weeks" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {monthWeeks.map((weekDays) => {
                        const weekStart = weekDays[0];
                        const weekKey = format(weekStart, 'yyyy-MM-dd');
                        const isExpanded = isSameWeek(weekStart, expandedWeekStart, { weekStartsOn: 1 });

                                const dayButtons = weekDays.map((day) => {
                                    const inMonth = isSameMonth(day, monthAnchor);
                                    const today = isToday(day);
                                    const ymd = format(day, 'yyyy-MM-dd');
                                    const hasNote = showNoteMarkers && noteDates.has(ymd);

                                    return (
                                        <button
                                            key={day.toISOString()}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDaySelect(day);
                                            }}
                                            aria-label={format(day, "EEEE d 'de' MMMM", { locale: es })}
                                            aria-current={today ? 'date' : undefined}
                                            className={cn(
                                                'relative z-10 flex w-full items-center justify-center transition-colors',
                                                'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                                                !today && !hasNote && 'hover:bg-white/10',
                                            )}
                                        >
                                            <span
                                                data-today={today ? 'true' : undefined}
                                                data-has-note={hasNote && !today ? 'true' : undefined}
                                                className={cn(
                                                    'text-[7px] lg:text-[14px] tabular-nums leading-none',
                                                    today &&
                                                        'flex h-[var(--staff-week-day-size)] w-[var(--staff-week-day-size)] items-center justify-center rounded-full bg-emerald-500 font-black text-white',
                                                    !today &&
                                                        hasNote &&
                                                        'flex h-[var(--staff-week-day-size)] w-[var(--staff-week-day-size)] items-center justify-center rounded-full border-2 border-[var(--color-aviso)] bg-transparent font-semibold',
                                                    !today && hasNote && !inMonth && 'text-white/45',
                                                    !today && hasNote && inMonth && 'text-white/90',
                                                    !today && !hasNote && !inMonth && 'font-medium text-white/45',
                                                    !today && !hasNote && inMonth && 'font-semibold text-white/90',
                                                )}
                                            >
                                                {format(day, 'd')}
                                            </span>
                                        </button>
                                    );
                                });

                                const extCell = masterMode ? (
                                    <WeekExtCell
                                        weekDays={weekDays}
                                        week={overtimeWeeks[weekKey]}
                                        loading={overtimeLoading}
                                        onOpenWeekDetail={onOpenWeekDetail}
                                    />
                                ) : null;

                                return (
                                    <div
                                        key={weekKey}
                                        data-element="week-block"
                                        data-expanded={isExpanded ? 'true' : undefined}
                                    >
                                        {masterMode ? (
                                            <>
                                                <div
                                                    className="grid grid-cols-8 gap-px shrink-0"
                                                    data-week-row={isExpanded ? 'expanded' : 'normal'}
                                                    data-master-row="true"
                                                >
                                                    {dayButtons}
                                                    {extCell}
                                                </div>
                                                {isExpanded ? (
                                                    <WeekExpansion
                                                        weekDays={weekDays}
                                                        shifts={shifts}
                                                        eventsByDate={eventsByDate}
                                                        onOpenDay={onOpenNote}
                                                        masterMode={masterMode}
                                                        className="w-[87.5%] max-w-[87.5%]"
                                                    />
                                                ) : null}
                                            </>
                                        ) : (
                                            <>
                                                <div
                                                    className={cn('grid gap-px', WEEK_GRID_COLS)}
                                                    data-week-row={isExpanded ? 'expanded' : 'normal'}
                                                >
                                                    {dayButtons}
                                                </div>
                                                {isExpanded ? (
                                                    <WeekExpansion
                                                        weekDays={weekDays}
                                                        shifts={shifts}
                                                        eventsByDate={eventsByDate}
                                                        onOpenDay={onOpenNote}
                                                        masterMode={masterMode}
                                                    />
                                                ) : null}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                </div>
            </div>
        </div>
    );
}
