/**
 * Coordinación multi-empleado de la simulación de plantilla.
 *
 * Reglas operativas:
 * - Sin turnos regulares en festivos de cierre.
 * - Mínimo 3 personas trabajando por día (bajas / adjustment no cuentan).
 */

import { isMasterDashboardUser } from './simulation-identity';
import { isPlantillaClosedHoliday, PLANTILLA_CLOSED_HOLIDAYS_2026 } from './plantilla-holidays';
import type { TimesheetDayData, TimesheetWeekData } from './timesheet-export-payload';
import {
    clearFlexibleWorkOnClosedHoliday,
    findDayInWeeks,
    injectSimulatedWorkDay,
    isPlantillaWorkingDay,
    purgeClosedHolidayShifts,
} from './staff-schedule-normalizer';

export const MIN_PLANTILLA_DAILY_STAFF = 3;

export interface PlantillaScheduleEntry {
    userId: string;
    email?: string | null;
    fullName: string;
    weeks: TimesheetWeekData[];
    contractedHoursWeekly: number;
    joiningDate?: string | null;
    endDate?: string | null;
}

export interface PlantillaCoordinationReport {
    holidaysCleared: number;
    staffingBoosts: number;
    understaffedDates: string[];
}

const BAJA_TYPES = new Set(['adjustment']);
const UNAVAILABLE_DAY_TYPES = new Set(['holiday', 'personal', 'adjustment']);

function isEmployeeActiveOnDate(entry: PlantillaScheduleEntry, date: string): boolean {
    const join = entry.joiningDate?.slice(0, 10);
    const end = entry.endDate?.slice(0, 10);
    if (join && date < join) return false;
    if (end && date > end) return false;
    return true;
}

function isOnBaja(entry: PlantillaScheduleEntry, date: string): boolean {
    const day = findDayInWeeks(entry.weeks, date);
    return day?.hasLog === true && BAJA_TYPES.has(day.eventType ?? '');
}

function canBeScheduled(entry: PlantillaScheduleEntry, date: string): boolean {
    if (!isEmployeeActiveOnDate(entry, date)) return false;
    if (isOnBaja(entry, date)) return false;
    if (isPlantillaClosedHoliday(date)) return false;
    if (isMasterDashboardUser(entry.email) && isWeekend(date)) return false;
    const day = findDayInWeeks(entry.weeks, date);
    if (!day) return false;
    if (day.hasLog && isPlantillaWorkingDay(day)) return false;
    if (day.hasLog && UNAVAILABLE_DAY_TYPES.has(day.eventType ?? '')) return false;
    return true;
}

function countPlantillaStaff(entries: PlantillaScheduleEntry[], date: string): number {
    let count = 0;
    for (const entry of entries) {
        const day = findDayInWeeks(entry.weeks, date);
        if (isPlantillaWorkingDay(day)) count += 1;
    }
    return count;
}

function weekHoursForEntry(entry: PlantillaScheduleEntry, date: string): number {
    const week = entry.weeks.find((w) => w.days.some((d) => d.date === date));
    if (!week) return 0;
    return week.days
        .filter((d) => isPlantillaWorkingDay(d))
        .reduce((acc, d) => acc + (d.totalHours ?? 0), 0);
}

function pickStaffingCandidate(
    entries: PlantillaScheduleEntry[],
    date: string,
    excludeUserIds: ReadonlySet<string> = new Set(),
): PlantillaScheduleEntry | null {
    const eligible = entries.filter((e) => !excludeUserIds.has(e.userId) && canBeScheduled(e, date));
    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
        const hoursA = weekHoursForEntry(a, date);
        const hoursB = weekHoursForEntry(b, date);
        const roomA = Math.max(0, a.contractedHoursWeekly - hoursA);
        const roomB = Math.max(0, b.contractedHoursWeekly - hoursB);
        if (roomB !== roomA) return roomB - roomA;
        return hoursA - hoursB;
    });

    return eligible[0] ?? null;
}

function collectDatesInRange(entries: PlantillaScheduleEntry[], start: string, end: string): string[] {
    const dates = new Set<string>();
    for (const entry of entries) {
        for (const week of entry.weeks) {
            for (const day of week.days) {
                if (day.date >= start && day.date <= end) {
                    dates.add(day.date);
                }
            }
        }
    }
    return [...dates].sort();
}

function isWeekend(date: string): boolean {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6;
}

/**
 * Aplica reglas de plantilla sobre simulaciones ya generadas por empleado.
 */
export function coordinatePlantillaSchedules(
    entries: PlantillaScheduleEntry[],
    bounds: { start: string; end: string },
    minDailyStaff: number = MIN_PLANTILLA_DAILY_STAFF,
): PlantillaCoordinationReport {
    let holidaysCleared = 0;
    let staffingBoosts = 0;

    const dates = collectDatesInRange(entries, bounds.start, bounds.end);

    for (const date of dates) {
        if (!isPlantillaClosedHoliday(date)) continue;
        for (const entry of entries) {
            const before = findDayInWeeks(entry.weeks, date);
            if (before?.hasLog && isPlantillaWorkingDay(before)) {
                clearFlexibleWorkOnClosedHoliday(
                    entry.weeks,
                    date,
                    entry.contractedHoursWeekly,
                );
                holidaysCleared += 1;
            }
        }
    }

    // Barrido final: elimina fichajes reales que hayan quedado con horas en festivo.
    for (const entry of entries) {
        holidaysCleared += purgeClosedHolidayShifts(entry.weeks, entry.contractedHoursWeekly);
    }

    for (const date of dates) {
        if (isPlantillaClosedHoliday(date)) continue;

        const tried = new Set<string>();
        let guard = 0;
        while (countPlantillaStaff(entries, date) < minDailyStaff && guard < entries.length * 4) {
            guard += 1;
            const candidate = pickStaffingCandidate(entries, date, tried);
            if (!candidate) break;

            const added = injectSimulatedWorkDay(
                candidate.weeks,
                date,
                candidate.userId,
                candidate.email,
                candidate.contractedHoursWeekly,
            );
            if (!added) {
                tried.add(candidate.userId);
                continue;
            }
            staffingBoosts += 1;
        }
    }

    const understaffedDates = dates.filter(
        (date) => !isPlantillaClosedHoliday(date) && countPlantillaStaff(entries, date) < minDailyStaff,
    );

    return { holidaysCleared, staffingBoosts, understaffedDates };
}

/** Fechas de festivo de cierre dentro del rango (para informes). */
export function closedHolidaysInRange(start: string, end: string): string[] {
    return [...PLANTILLA_CLOSED_HOLIDAYS_2026].filter((d) => d >= start && d <= end).sort();
}

export function analyzePlantillaStaffingByDate(
    entries: PlantillaScheduleEntry[],
    dates: string[],
): Array<{ date: string; staff: number; workers: string[] }> {
    return dates.map((date) => {
        const workers: string[] = [];
        for (const entry of entries) {
            const day = findDayInWeeks(entry.weeks, date);
            if (isPlantillaWorkingDay(day)) {
                workers.push(entry.fullName);
            }
        }
        return { date, staff: workers.length, workers };
    });
}
