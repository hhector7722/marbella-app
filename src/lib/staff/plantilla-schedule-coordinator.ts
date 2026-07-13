/**
 * Coordinación multi-empleado de la simulación de plantilla.
 *
 * Reglas operativas:
 * - Sin turnos regulares en festivos de cierre.
 * - Mínimo 3 personas trabajando por día (bajas / adjustment no cuentan).
 */

import { isMasterDashboardUser } from './simulation-identity';
import {
    getPlantillaDayClosingMinutesOrganic,
    getPlantillaDayOpeningMinutes,
    isPlantillaClosedHoliday,
    PLANTILLA_CLOSED_HOLIDAYS_2026,
} from './plantilla-holidays';
import type { TimesheetDayData, TimesheetWeekData } from './timesheet-export-payload';
import {
    clearFlexibleWorkOnClosedHoliday,
    findDayInWeeks,
    injectSimulatedWorkDay,
    isPlantillaWorkingDay,
    normalizeLockedAbsenceDays,
    purgeClosedHolidayShifts,
    recalculateWeekSummaries,
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
    shiftsAligned: number;
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

function parseHm(hm: string): number {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

function minutesToHm(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function organicMinute(totalMinutes: number, seed: number): number {
    const h = Math.floor(totalMinutes / 60);
    let m = totalMinutes % 60;
    const offsets = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 26, 27, 28, 29, 31, 32, 33, 34, 36, 37, 38, 39, 41, 42, 43, 44, 46, 47, 48, 49, 51, 52, 53, 54, 56, 57, 58, 59];
    m = offsets[(m + seed) % offsets.length];
    return h * 60 + m;
}

function hashDate(date: string, salt: string): number {
    let hash = 0;
    const key = `${date}:${salt}`;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function roundHours(h: number): number {
    return Math.round(h * 100) / 100;
}

function setShiftTimes(day: TimesheetDayData, inMin: number, outMin: number): void {
    const safeOut = Math.max(outMin, inMin + 30);
    day.clockIn = minutesToHm(organicMinute(inMin, hashDate(day.date, 'in')));
    day.clockOut = minutesToHm(organicMinute(safeOut, hashDate(day.date, 'out')));
    day.totalHours = roundHours((parseHm(day.clockOut) - parseHm(day.clockIn)) / 60);
}

/**
 * Alinea turnos del día: primera entrada ~8:00, última salida ~21 (o ~16 dom/vísperas).
 */
function alignDayShifts(
    slots: Array<{ day: TimesheetDayData }>,
    date: string,
): void {
    const closeMax = getPlantillaDayClosingMinutesOrganic(date);
    const openMin = getPlantillaDayOpeningMinutes(date);

    slots.sort(
        (a, b) => parseHm(a.day.clockIn ?? '99:99') - parseHm(b.day.clockIn ?? '99:99'),
    );

    const n = slots.length;
    if (n === 1) {
        const dur = Math.max(60, Math.round((slots[0].day.totalHours ?? 8) * 60));
        setShiftTimes(slots[0].day, openMin, Math.min(openMin + dur, closeMax));
        return;
    }

    const firstDur = Math.max(60, Math.round((slots[0].day.totalHours ?? 8) * 60));
    setShiftTimes(slots[0].day, openMin, openMin + firstDur);

    const lastDay = slots[n - 1].day;
    const lastDur = Math.max(60, Math.round((lastDay.totalHours ?? 8) * 60));
    setShiftTimes(lastDay, closeMax - lastDur, closeMax);

    const firstIn = parseHm(slots[0].day.clockIn!);
    const lastIn = parseHm(lastDay.clockIn!);

    for (let i = 1; i < n - 1; i++) {
        const dur = Math.max(60, Math.round((slots[i].day.totalHours ?? 8) * 60));
        const t = i / (n - 1);
        const start = Math.round(firstIn + t * (lastIn - firstIn));
        const clampedStart = Math.min(Math.max(start, openMin), closeMax - dur);
        setShiftTimes(slots[i].day, clampedStart, clampedStart + dur);
    }
}

function alignPlantillaDailyShifts(
    entries: PlantillaScheduleEntry[],
    dates: string[],
): number {
    let adjusted = 0;

    for (const date of dates) {
        if (isPlantillaClosedHoliday(date)) continue;

        const slots: Array<{ entry: PlantillaScheduleEntry; day: TimesheetDayData }> = [];
        for (const entry of entries) {
            const day = findDayInWeeks(entry.weeks, date);
            if (!day || !isPlantillaWorkingDay(day) || !day.clockIn || !day.clockOut) continue;
            slots.push({ entry, day });
        }

        if (slots.length === 0) continue;
        alignDayShifts(slots, date);
        adjusted += slots.length;
    }

    return adjusted;
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

    const shiftsAligned = alignPlantillaDailyShifts(entries, dates);

    for (const entry of entries) {
        normalizeLockedAbsenceDays(entry.weeks);
        recalculateWeekSummaries(entry.weeks, entry.contractedHoursWeekly);
    }

    return { holidaysCleared, staffingBoosts, shiftsAligned, understaffedDates };
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
