'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    addDays,
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isSameWeek,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;

type ShiftRow = {
    start_time: string;
    end_time: string;
    activity: string | null;
    activity_2: string | null;
    categoria: string | null;
    categoria_2: string | null;
    event_start_time: string | null;
    event_end_time: string | null;
    event_participants: number | null;
    event_start_time_2: string | null;
    event_end_time_2: string | null;
    event_participants_2: number | null;
    notes: string | null;
};

type StaffWeekScheduleWidgetProps = {
    userId: string | null;
    /** Solo para «Añadir nota» / «Ver nota»; pulsar un día del mes no lo invoca. */
    onOpenNote?: (ymd: string) => void;
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

function formatEventClock(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 5);
}

function formatEventRange(start: string | null, end: string | null): string | null {
    const s = formatEventClock(start);
    const e = formatEventClock(end);
    if (!s || !e) return null;
    return `${s} – ${e}`;
}

function pickMainActivity(shift: ShiftRow) {
    if (shift.activity?.trim()) {
        return {
            title: shift.activity.trim(),
            timeRange: formatEventRange(shift.event_start_time, shift.event_end_time),
            participants: shift.event_participants,
            category: shift.categoria?.trim() || null,
        };
    }
    if (shift.activity_2?.trim()) {
        return {
            title: shift.activity_2.trim(),
            timeRange: formatEventRange(shift.event_start_time_2, shift.event_end_time_2),
            participants: shift.event_participants_2,
            category: shift.categoria_2?.trim() || null,
        };
    }
    return null;
}

function shiftForDay(shifts: ShiftRow[], day: Date): ShiftRow | null {
    return shifts.find((s) => isSameDay(new Date(s.start_time), day)) ?? null;
}

function chunkWeeks(days: Date[]): Date[][] {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }
    return weeks;
}

function formatWeekdayLong(day: Date): string {
    const raw = format(day, 'EEEE', { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function WeekendDayColumn({
    day,
    shift,
    onOpenNote,
}: {
    day: Date;
    shift: ShiftRow | null;
    onOpenNote?: (ymd: string) => void;
}) {
    const ymd = format(day, 'yyyy-MM-dd');
    const turno =
        shift != null
            ? `${formatClockTime(shift.start_time)} – ${formatClockTime(shift.end_time)}`
            : null;
    const evento = shift != null ? pickMainActivity(shift) : null;
    const hasNote = Boolean(shift?.notes?.trim());

    return (
        <div data-element="weekend-day" className="flex h-full min-h-0 min-w-0 flex-col">
            <p data-element="weekend-title" className="shrink-0 text-center text-[7px] font-normal leading-none text-white/75">
                {formatWeekdayLong(day)}
            </p>

            <div data-element="weekend-details" className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-baseline gap-0.5 border-l border-emerald-400 pl-0.5">
                    <span className="shrink-0 text-[5px] font-black uppercase leading-none text-emerald-300">
                        Turno
                    </span>
                    {turno ? (
                        <span className="min-w-0 truncate text-[8px] font-black tabular-nums leading-none text-white">
                            {turno}
                        </span>
                    ) : null}
                </div>

                <div className="flex min-w-0 items-baseline gap-0.5 border-l border-amber-400 pl-0.5">
                    <span className="shrink-0 text-[5px] font-black uppercase leading-none text-amber-300">
                        Evento
                    </span>
                    {evento ? (
                        <span className="min-w-0 truncate text-[7px] font-bold leading-none text-white">
                            {[
                                evento.timeRange,
                                evento.title,
                                evento.participants != null && evento.participants > 0
                                    ? `${evento.participants} pax`
                                    : null,
                                evento.category,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                    ) : null}
                </div>
            </div>

            <button
                type="button"
                data-element="weekend-note"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpenNote?.(ymd);
                }}
                className={cn(
                    'relative mt-auto inline-flex w-full shrink-0 items-center justify-center gap-0.5 rounded px-0.5 py-px text-[6px] font-medium leading-none transition-colors',
                    'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                    hasNote
                        ? 'text-emerald-200 hover:text-white'
                        : 'text-white/55 hover:text-white/80',
                )}
            >
                <span aria-hidden>+</span>
                {hasNote ? 'Ver nota' : 'Añadir nota'}
            </button>
        </div>
    );
}

function WeekExpansion({
    weekDays,
    shifts,
    onOpenNote,
}: {
    weekDays: Date[];
    shifts: ShiftRow[];
    onOpenNote?: (ymd: string) => void;
}) {
    const saturday = weekDays[5];
    const sunday = weekDays[6];

    return (
        <div
            className="grid grid-cols-2"
            data-element="week-expansion"
        >
            <WeekendDayColumn
                day={saturday}
                shift={shiftForDay(shifts, saturday)}
                onOpenNote={onOpenNote}
            />
            <WeekendDayColumn
                day={sunday}
                shift={shiftForDay(shifts, sunday)}
                onOpenNote={onOpenNote}
            />
        </div>
    );
}

export function StaffWeekScheduleWidget({ userId, onOpenNote }: StaffWeekScheduleWidgetProps) {
    const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
    const [expandedWeekStart, setExpandedWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [shifts, setShifts] = useState<ShiftRow[]>([]);
    const [loading, setLoading] = useState(true);

    const visibleRange = useMemo(() => {
        const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 });
        return { start, end };
    }, [monthAnchor]);

    const monthDays = useMemo(
        () => eachDayOfInterval({ start: visibleRange.start, end: visibleRange.end }),
        [visibleRange],
    );

    const monthWeeks = useMemo(() => chunkWeeks(monthDays), [monthDays]);

    const loadMonthShifts = useCallback(async () => {
        if (!userId) {
            setShifts([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('shifts')
                .select(
                    'start_time, end_time, activity, activity_2, categoria, categoria_2, event_start_time, event_end_time, event_participants, event_start_time_2, event_end_time_2, event_participants_2, notes',
                )
                .eq('user_id', userId)
                .eq('is_published', true)
                .gte('start_time', visibleRange.start.toISOString())
                .lte('start_time', visibleRange.end.toISOString())
                .order('start_time', { ascending: true });

            if (error) throw error;
            setShifts(data ?? []);
        } catch (error) {
            console.error(error);
            setShifts([]);
        } finally {
            setLoading(false);
        }
    }, [userId, visibleRange.end, visibleRange.start]);

    useEffect(() => {
        void loadMonthShifts();
    }, [loadMonthShifts]);

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
                <div className="grid shrink-0 grid-cols-7 gap-px">
                    {WEEKDAY_LABELS.map((label) => (
                        <div key={label} className="flex items-center justify-center">
                            <span className="text-[5px] font-black uppercase leading-none text-white/40">{label}</span>
                        </div>
                    ))}
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

                                return (
                                    <div
                                        key={weekKey}
                                        data-element="week-block"
                                        data-expanded={isExpanded ? 'true' : undefined}
                                    >
                                        <div
                                            className={cn(
                                                'grid grid-cols-7 gap-px',
                                                isExpanded && 'border-l-2 border-emerald-400/70 pl-px',
                                            )}
                                            data-week-row={isExpanded ? 'expanded' : undefined}
                                        >
                                            {weekDays.map((day) => {
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
                                                                !today && inMonth && 'font-black text-white/90',
                                                            )}
                                                        >
                                                            {format(day, 'd')}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {isExpanded ? (
                                            <WeekExpansion
                                                weekDays={weekDays}
                                                shifts={shifts}
                                                onOpenNote={onOpenNote}
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
