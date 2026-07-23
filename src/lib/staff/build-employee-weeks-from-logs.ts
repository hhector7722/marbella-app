/**
 * Construye semanas de un empleado desde time_logs crudos.
 * Misma fuente y TZ (Europe/Madrid) que fetchPlantilla — no usa get_monthly_timesheet.
 */

import {
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    getISOWeek,
    isSameDay,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { formatMadridHmFromIso, formatYmdInMadrid } from '../madrid-date-bounds.ts';
import type { TimesheetDayData, TimesheetWeekData, TimesheetWeekSummary } from './timesheet-export-payload.ts';

export type RawTimeLogForWeek = {
    clock_in: string;
    clock_out?: string | null;
    total_hours?: number | null;
    event_type?: string | null;
    clock_out_show_no_registrada?: boolean | null;
};

export type BuiltEmployeeDay = TimesheetDayData & {
    clock_out_show_no_registrada?: boolean;
};

export type BuiltEmployeeWeek = Omit<TimesheetWeekData, 'days' | 'summary'> & {
    days: BuiltEmployeeDay[];
    summary: TimesheetWeekSummary & { bagModeOverride?: boolean | null };
};

type DayAgg = {
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
    eventType: string;
    clock_out_show_no_registrada: boolean;
};

const EMPTY_DAY: DayAgg = {
    hasLog: false,
    clockIn: null,
    clockOut: null,
    totalHours: 0,
    eventType: 'regular',
    clock_out_show_no_registrada: false,
};

/** Varios fichajes el mismo día → entrada más temprana, salida más tardía, suma de horas.
 * Relojes SOLO desde jornada real (regular / no_registered).
 * Día solo especial (F/E/B/P): clockIn/Out = null (la UI muestra la letra).
 * Día mixto (fichaje + justificadas): relojes del regular + horas sumadas + eventType especial. */
export function aggregateLogsForDay(logs: readonly RawTimeLogForWeek[]): DayAgg {
    if (logs.length === 0) return EMPTY_DAY;

    const sorted = [...logs].sort((a, b) => a.clock_in.localeCompare(b.clock_in));

    const isClockSource = (l: RawTimeLogForWeek) => {
        const t = l.event_type || 'regular';
        return t === 'regular' || t === 'no_registered' || t === '';
    };

    const clockLogs = sorted.filter(isClockSource);

    let clockIn: string | null = null;
    let clockOut: string | null = null;
    if (clockLogs.length > 0) {
        clockIn = formatMadridHmFromIso(clockLogs[0]!.clock_in) ?? null;
        for (const log of clockLogs) {
            if (log.clock_out) {
                clockOut = formatMadridHmFromIso(log.clock_out) ?? clockOut;
            }
        }
    }

    let totalHours = 0;
    for (const log of sorted) {
        totalHours += Number(log.total_hours ?? 0);
    }

    const special = sorted.find(
        (l) =>
            l.event_type &&
            l.event_type !== 'regular' &&
            l.event_type !== 'no_registered' &&
            l.event_type !== '',
    );
    const eventType =
        special?.event_type ??
        (clockLogs[0]?.event_type || sorted[0]?.event_type || 'regular');

    return {
        hasLog: true,
        clockIn,
        clockOut,
        totalHours,
        eventType: eventType || 'regular',
        clock_out_show_no_registrada: sorted.some((l) => l.clock_out_show_no_registrada === true),
    };
}

function groupLogsByMadridDay(
    logs: readonly RawTimeLogForWeek[],
): Map<string, RawTimeLogForWeek[]> {
    const byDay = new Map<string, RawTimeLogForWeek[]>();
    for (const log of logs) {
        const ymd = formatYmdInMadrid(log.clock_in);
        if (!ymd) continue;
        const list = byDay.get(ymd);
        if (list) list.push(log);
        else byDay.set(ymd, [log]);
    }
    return byDay;
}

function emptySummary(isPaid: boolean, bagModeOverride?: boolean | null): BuiltEmployeeWeek['summary'] {
    return {
        totalHours: 0,
        startBalance: 0,
        weeklyBalance: 0,
        finalBalance: 0,
        estimatedValue: 0,
        isPaid,
        preferStock: false,
        bagModeOverride: bagModeOverride ?? null,
    };
}

/**
 * Semanas lun–dom que tocan el mes civil (igual rango que plantilla / historial).
 */
export function buildEmployeeWeeksFromTimeLogs(input: {
    filterYear: number;
    /** 0-indexed (0 = enero) */
    filterMonth: number;
    logs: readonly RawTimeLogForWeek[];
    isPaidByWeek: (weekStartYmd: string) => boolean;
    bagModeOverrideByWeek?: (weekStartYmd: string) => boolean | null | undefined;
    today?: Date;
}): BuiltEmployeeWeek[] {
    const today = input.today ?? new Date();
    const monthStart = new Date(input.filterYear, input.filterMonth, 1);
    const monthEnd = endOfMonth(monthStart);
    const rangeStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return buildEmployeeWeeksInRange({
        rangeStart,
        rangeEnd,
        logs: input.logs,
        isPaidByWeek: input.isPaidByWeek,
        bagModeOverrideByWeek: input.bagModeOverrideByWeek,
        today,
    });
}

/**
 * Semanas lun–dom en un intervalo de fechas (p. ej. YTD para simulación/export).
 */
export function buildEmployeeWeeksInRange(input: {
    rangeStart: Date;
    rangeEnd: Date;
    logs: readonly RawTimeLogForWeek[];
    isPaidByWeek: (weekStartYmd: string) => boolean;
    bagModeOverrideByWeek?: (weekStartYmd: string) => boolean | null | undefined;
    today?: Date;
}): BuiltEmployeeWeek[] {
    const today = input.today ?? new Date();
    const byDay = groupLogsByMadridDay(input.logs);
    const calendarDays = eachDayOfInterval({ start: input.rangeStart, end: input.rangeEnd });
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weeks: BuiltEmployeeWeek[] = [];

    for (let i = 0; i < calendarDays.length; i += 7) {
        const weekDays = calendarDays.slice(i, i + 7);
        if (weekDays.length === 0) continue;
        const weekStart = weekDays[0]!;
        const startDate = format(weekStart, 'yyyy-MM-dd');
        const bagOverride = input.bagModeOverrideByWeek?.(startDate);

        const days: BuiltEmployeeDay[] = weekDays.map((day) => {
            const dayYmd = format(day, 'yyyy-MM-dd');
            const agg = aggregateLogsForDay(byDay.get(dayYmd) ?? []);
            return {
                date: dayYmd,
                dayName: format(day, 'EEE', { locale: es }),
                dayNumber: day.getDate(),
                hasLog: agg.hasLog,
                clockIn: agg.clockIn,
                clockOut: agg.clockOut,
                totalHours: agg.totalHours,
                extraHours: 0,
                eventType: agg.eventType,
                isToday: isSameDay(day, today),
                clock_out_show_no_registrada: agg.clock_out_show_no_registrada,
            };
        });

        weeks.push({
            weekNumber: getISOWeek(weekStart),
            startDate,
            isCurrentWeek: isSameDay(weekStart, currentWeekStart),
            days,
            summary: emptySummary(input.isPaidByWeek(startDate), bagOverride),
        });
    }

    return weeks;
}
