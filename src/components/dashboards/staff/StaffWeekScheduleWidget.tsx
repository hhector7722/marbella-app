'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
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
    fetchActivitiesForRangeAction,
    type BarActivity,
} from '@/app/staff/actividades/actions';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getOvertimeData } from '@/app/actions/overtime';
import { Check, X } from 'lucide-react';
import type { WeeklyStats } from '@/lib/hours-engine/overtime-weeks-ssot';

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;

const WEEK_GRID_COLS = 'grid-cols-7';
const WEEK_GRID_COLS_EXT = 'grid-cols-8';

type ShiftRow = {
    start_time: string;
    end_time: string;
};

type StaffWeekScheduleWidgetProps = {
    userId: string | null;
    /** Abre el modal de horario del día (StaffScheduleModal) al pulsar una tarjeta de fin de semana. */
    onOpenNote?: (ymd: string) => void;
    /** Modo Master: pinta la columna «Ext» de horas extra a la derecha del calendario. */
    masterMode?: boolean;
    /** Abre el modal de detalle de semana de horas extras (solo modo Master). */
    onOpenWeekDetail?: (week: WeeklyStats) => void;
    /** Al cambiar, recarga las horas extra del mes visible (p. ej. tras cerrar el modal de detalle). */
    overtimeRefreshKey?: number;
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

function formatDayEventNames(acts: BarActivity[] | undefined): string | null {
    const grouped = groupActivities(acts ?? []);
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
    const grouped = groupActivities(acts ?? []);
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
}: {
    day: Date;
    shift: ShiftRow | null;
    eventLabel: string | null;
    eventDetailRows: EventDetailRow[];
    onOpenDay?: (ymd: string) => void;
}) {
    const ymd = format(day, 'yyyy-MM-dd');
    const turno =
        shift != null
            ? `${formatClockTime(shift.start_time)} – ${formatClockTime(shift.end_time)}`
            : null;

    return (
        <button
            type="button"
            data-element="weekend-card"
            onClick={(e) => {
                e.stopPropagation();
                onOpenDay?.(ymd);
            }}
            aria-label={`Ver ${formatWeekdayHeading(day)}`}
            className="relative text-left outline-none transition-opacity hover:opacity-90 active:opacity-80 before:absolute before:inset-0 before:-m-0.5 before:min-h-[var(--tactil-minimo)] before:content-['']"
        >
            <div data-element="weekend-day" className="flex h-full min-h-0 min-w-0 flex-col">
                <p data-element="weekend-title" className="shrink-0 text-center text-[7px] font-semibold leading-none">
                    {formatWeekdayHeading(day)}
                </p>

                <div data-element="weekend-details" className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div data-element="weekend-turno" className="flex min-w-0 items-baseline gap-0.5 border-l-2 pl-0.5">
                        {turno ? (
                            <span data-element="weekend-turno-value" className="min-w-0 truncate text-[6px] font-medium tabular-nums leading-none">
                                {turno}
                            </span>
                        ) : (
                            <span data-element="weekend-turno-label" className="shrink-0 text-[6px] font-medium leading-none tracking-wide">
                                Turno
                            </span>
                        )}
                    </div>

                    <div data-element="weekend-evento" className="flex min-w-0 items-baseline gap-0.5 border-l-2 pl-0.5">
                        {eventLabel ? (
                            <span data-element="weekend-evento-value" className="min-w-0 truncate text-[6px] font-medium leading-none">
                                {eventLabel}
                            </span>
                        ) : (
                            <span data-element="weekend-evento-label" className="shrink-0 text-[6px] font-medium leading-none tracking-wide">
                                Evento
                            </span>
                        )}
                    </div>
                    <div data-element="weekend-evento-detail" className="flex w-full flex-col">
                        {eventDetailRows.map((row, i) => (
                            <div key={i} className="grid w-full grid-cols-3">
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
                                        className="min-w-0 truncate text-center text-[6px] font-medium leading-none opacity-80"
                                    >
                                        {cell.text}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
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
}: {
    weekDays: Date[];
    shifts: ShiftRow[];
    eventsByDate: Record<string, BarActivity[]>;
    onOpenDay?: (ymd: string) => void;
}) {
    const saturday = weekDays[5];
    const sunday = weekDays[6];
    const satKey = format(saturday, 'yyyy-MM-dd');
    const sunKey = format(sunday, 'yyyy-MM-dd');

    return (
        <div
            className="grid grid-cols-2"
            data-element="week-expansion"
        >
            <WeekendDayColumn
                day={saturday}
                shift={shiftForDay(shifts, saturday)}
                eventLabel={formatDayEventNames(eventsByDate[satKey])}
                eventDetailRows={formatDayEventDetailRows(eventsByDate[satKey])}
                onOpenDay={onOpenDay}
            />
            <WeekendDayColumn
                day={sunday}
                shift={shiftForDay(shifts, sunday)}
                eventLabel={formatDayEventNames(eventsByDate[sunKey])}
                eventDetailRows={formatDayEventDetailRows(eventsByDate[sunKey])}
                onOpenDay={onOpenDay}
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
                'relative flex w-full items-center justify-center gap-0.5 transition-colors',
                'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                week && 'hover:bg-white/10',
                !week && 'cursor-default',
            )}
        >
            {loading ? (
                <LoadingSpinner size="sm" className="text-white/60" />
            ) : week ? (
                <>
                    <span
                        data-element="weekend-ext-value"
                        className={cn(
                            'text-[7px] tabular-nums leading-none',
                            paid ? 'font-semibold text-white/90' : 'font-semibold text-white/70',
                        )}
                    >
                        {total.toFixed(0)}€
                    </span>
                    <span
                        data-element="weekend-ext-paid"
                        data-paid={paid ? 'true' : 'false'}
                        className={cn(
                            'flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full',
                            paid ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                    >
                        {paid ? (
                            <Check className="h-1.5 w-1.5 text-white" strokeWidth={4} />
                        ) : (
                            <X className="h-1.5 w-1.5 text-white" strokeWidth={4} />
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
    masterMode = false,
    onOpenWeekDetail,
    overtimeRefreshKey = 0,
}: StaffWeekScheduleWidgetProps) {
    const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
    const [expandedWeekStart, setExpandedWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [shifts, setShifts] = useState<ShiftRow[]>([]);
    const [eventsByDate, setEventsByDate] = useState<Record<string, BarActivity[]>>({});
    const [loading, setLoading] = useState(true);
    const [overtimeWeeks, setOvertimeWeeks] = useState<Record<string, WeeklyStats>>({});
    const [overtimeLoading, setOvertimeLoading] = useState(false);

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
        void loadOvertimeData();
    }, [loadOvertimeData, overtimeRefreshKey]);

    const loadMonthData = useCallback(async () => {
        if (!userId) {
            setShifts([]);
            setEventsByDate({});
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const supabase = createClient();
            const startIso = `${rangeStart}T00:00:00`;
            const endIso = `${rangeEnd}T23:59:59`;

            const [shiftsResult, activitiesResult] = await Promise.all([
                supabase
                    .from('shifts')
                    .select('start_time, end_time')
                    .eq('user_id', userId)
                    .eq('is_published', true)
                    .gte('start_time', startIso)
                    .lte('start_time', endIso)
                    .order('start_time', { ascending: true }),
                fetchActivitiesForRangeAction({ startDate: rangeStart, endDate: rangeEnd }),
            ]);

            if (shiftsResult.error) throw shiftsResult.error;
            setShifts(shiftsResult.data ?? []);

            if (activitiesResult.success) {
                const next: Record<string, BarActivity[]> = {};
                for (const [date, day] of Object.entries(activitiesResult.byDate)) {
                    next[date] = day.barActivities;
                }
                setEventsByDate(next);
            } else {
                setEventsByDate({});
            }
        } catch (error) {
            console.error(error);
            setShifts([]);
            setEventsByDate({});
        } finally {
            setLoading(false);
        }
    }, [userId, rangeEnd, rangeStart]);

    useEffect(() => {
        void loadMonthData();
    }, [loadMonthData]);

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
            className="flex h-full min-h-0 w-full flex-col px-1 py-0.5"
        >
            <div className="flex shrink-0 items-center justify-center gap-0.5 pb-px">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleMonthChange(-1);
                    }}
                    className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                    aria-label="Mes anterior"
                >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <span className="min-w-[6.5rem] text-center text-[9px] font-black uppercase tracking-widest text-white">
                    {monthTitle(monthAnchor)}
                </span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleMonthChange(1);
                    }}
                    className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 before:absolute before:inset-0 before:-m-2 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                    aria-label="Mes siguiente"
                >
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
            </div>

            <div data-element="month-scroll" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className={cn('grid shrink-0 gap-px', masterMode ? WEEK_GRID_COLS_EXT : WEEK_GRID_COLS)}>
                    {WEEKDAY_LABELS.map((label) => (
                        <div key={label} className="flex items-center justify-center">
                            <span className="text-[5px] font-medium uppercase leading-none text-white/40">{label}</span>
                        </div>
                    ))}
                    {masterMode ? (
                        <div className="flex items-center justify-center">
                            <span className="text-[5px] font-bold uppercase leading-none text-white/60">Ext</span>
                        </div>
                    ) : null}
                </div>

                <div data-element="month-weeks" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {loading ? (
                        <div className="flex flex-1 items-center justify-center" role="status" aria-label="Cargando horarios">
                            <LoadingSpinner size="sm" className="text-white" />
                        </div>
                    ) : (
                        <>
                            {monthWeeks.map((weekDays) => {
                                const weekStart = weekDays[0];
                                const weekKey = format(weekStart, 'yyyy-MM-dd');
                                const isExpanded = isSameWeek(weekStart, expandedWeekStart, { weekStartsOn: 1 });

                                const dayButtons = weekDays.map((day) => {
                                    const inMonth = isSameMonth(day, monthAnchor);
                                    const today = isToday(day);

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
                                                'relative flex w-full items-center justify-center transition-colors',
                                                'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                                                !today && 'hover:bg-white/10',
                                            )}
                                        >
                                            <span
                                                data-today={today ? 'true' : undefined}
                                                className={cn(
                                                    'text-[7px] tabular-nums leading-none',
                                                    today &&
                                                        'flex h-[var(--staff-week-day-size)] w-[var(--staff-week-day-size)] items-center justify-center rounded-full bg-emerald-500 font-black text-white',
                                                    !today && !inMonth && 'font-medium text-white/45',
                                                    !today && inMonth && 'font-semibold text-white/90',
                                                )}
                                            >
                                                {format(day, 'd')}
                                            </span>
                                        </button>
                                    );
                                });

                                return (
                                    <div
                                        key={weekKey}
                                        data-element="week-block"
                                        data-expanded={isExpanded ? 'true' : undefined}
                                    >
                                        {masterMode && isExpanded ? (
                                            <div className="grid grid-cols-8 gap-px">
                                                <div
                                                    className="col-span-7 grid grid-cols-7 gap-px"
                                                    data-week-row="expanded"
                                                >
                                                    {dayButtons}
                                                </div>
                                                <div className="col-span-1 flex items-center justify-center" data-element="week-ext-cell">
                                                    <WeekExtCell
                                                        weekDays={weekDays}
                                                        week={overtimeWeeks[weekKey]}
                                                        loading={overtimeLoading}
                                                        onOpenWeekDetail={onOpenWeekDetail}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className={cn('grid gap-px', masterMode ? WEEK_GRID_COLS_EXT : WEEK_GRID_COLS)}
                                                data-week-row={isExpanded ? 'expanded' : undefined}
                                            >
                                                {dayButtons}

                                                {masterMode ? (
                                                    <WeekExtCell
                                                        weekDays={weekDays}
                                                        week={overtimeWeeks[weekKey]}
                                                        loading={overtimeLoading}
                                                        onOpenWeekDetail={onOpenWeekDetail}
                                                    />
                                                ) : null}
                                            </div>
                                        )}

                                        {isExpanded ? (
                                            <WeekExpansion
                                                weekDays={weekDays}
                                                shifts={shifts}
                                                eventsByDate={eventsByDate}
                                                onOpenDay={onOpenNote}
                                            />
                                        ) : null}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
