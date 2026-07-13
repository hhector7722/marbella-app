/**
 * Coordinación multi-empleado de la simulación de plantilla.
 *
 * Reglas operativas:
 * - Sin turnos regulares en festivos de cierre.
 * - Mínimo 3 personas trabajando por día (bajas / adjustment no cuentan).
 */

import { isMasterDashboardUser } from './simulation-identity';
import {
    getMorningExclusiveRule,
    isMorningExclusiveWorker,
    type PlantillaMorningExclusiveRule,
} from './plantilla-special-days';
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
    findWeekForDate,
    injectSimulatedWorkDay,
    isPlantillaWorkingDay,
    normalizeLockedAbsenceDays,
    purgeClosedHolidayShifts,
    rebalancePlantillaSchedule,
    recalculateWeekSummaries,
    sumWeekBillableHours,
} from './staff-schedule-normalizer';
export const MIN_PLANTILLA_DAILY_STAFF = 3;
/** Mínimo sábado y domingo (más exigente que entre semana). */
export const MIN_PLANTILLA_WEEKEND_STAFF = 4;
/** Tope laborables para evitar sobredimensionar L–V. */
export const MAX_PLANTILLA_WEEKDAY_STAFF = 6;
/** Tope fines de semana. */
export const MAX_PLANTILLA_WEEKEND_STAFF = 6;

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
    staffingRelocations: number;
    staffingTrims: number;
    shiftsAligned: number;
    morningExclusiveAdjustments: number;
    weeksRebalanced: number;
    understaffedDates: string[];
    overstaffedDates: string[];
}

const BAJA_TYPES = new Set(['adjustment']);
const UNAVAILABLE_DAY_TYPES = new Set(['holiday', 'personal', 'adjustment']);
/** Margen al añadir refuerzos o recortar tras alinear horarios. */
const WEEKLY_HOURS_TOLERANCE = 1.5;

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

function weekBillableHoursForEntry(entry: PlantillaScheduleEntry, date: string): number {
    const week = findWeekForDate(entry.weeks, date);
    if (!week) return 0;
    return sumWeekBillableHours(week);
}

function estimatedBoostHours(entry: PlantillaScheduleEntry, date: string): number {
    if (isMasterDashboardUser(entry.email)) {
        return 8.15;
    }
    const target = entry.contractedHoursWeekly;
    return target > 0 ? Math.max(6, target / 5) : 8;
}

function hasWeeklyCapacity(entry: PlantillaScheduleEntry, date: string): boolean {
    const current = weekBillableHoursForEntry(entry, date);
    const projected = current + estimatedBoostHours(entry, date);
    return projected <= entry.contractedHoursWeekly + WEEKLY_HOURS_TOLERANCE;
}

function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function weekStartMonday(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const cursor = new Date(y, m - 1, d);
    const wd = cursor.getDay();
    const diff = wd === 0 ? 6 : wd - 1;
    cursor.setDate(cursor.getDate() - diff);
    return ymd(cursor);
}

function canRelocateWorkDay(entry: PlantillaScheduleEntry, date: string): boolean {
    const day = findDayInWeeks(entry.weeks, date);
    if (!day || !isPlantillaWorkingDay(day)) return false;
    if (UNAVAILABLE_DAY_TYPES.has(day.eventType ?? '')) return false;
    return true;
}

function boostMinimumDailyStaffForDate(
    entries: PlantillaScheduleEntry[],
    date: string,
    weekdayMin: number,
): number {
    const minDailyStaff = minDailyStaffForDate(date, weekdayMin);
    if (minDailyStaff <= 0) return 0;

    let boosts = 0;
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
        boosts += 1;
    }

    return boosts;
}

function tryRelocateWorker(
    entries: PlantillaScheduleEntry[],
    fromDate: string,
    toDate: string,
    weekdayMin: number,
): boolean {
    if (fromDate === toDate) return false;
    if (isPlantillaClosedHoliday(fromDate) || isPlantillaClosedHoliday(toDate)) return false;
    const fromMin = minDailyStaffForDate(fromDate, weekdayMin);
    const toMin = minDailyStaffForDate(toDate, weekdayMin);
    if (countPlantillaStaff(entries, fromDate) <= fromMin) return false;
    if (countPlantillaStaff(entries, toDate) >= toMin) return false;

    const candidates = entries.filter(
        (entry) => canRelocateWorkDay(entry, fromDate) && canBeScheduled(entry, toDate),
    );
    if (candidates.length === 0) return false;

    candidates.sort((a, b) => {
        const hoursA = weekBillableHoursForEntry(a, fromDate);
        const hoursB = weekBillableHoursForEntry(b, fromDate);
        return hoursB - hoursA;
    });

    for (const entry of candidates) {
        clearSimulatedWorkDay(entry, fromDate);
        if (countPlantillaStaff(entries, fromDate) < fromMin) {
            injectSimulatedWorkDay(
                entry.weeks,
                fromDate,
                entry.userId,
                entry.email,
                entry.contractedHoursWeekly,
            );
            continue;
        }

        const added = injectSimulatedWorkDay(
            entry.weeks,
            toDate,
            entry.userId,
            entry.email,
            entry.contractedHoursWeekly,
        );
        if (added) {
            recalculateWeekSummaries(entry.weeks, entry.contractedHoursWeekly);
            return true;
        }

        injectSimulatedWorkDay(
            entry.weeks,
            fromDate,
            entry.userId,
            entry.email,
            entry.contractedHoursWeekly,
        );
    }

    return false;
}

/**
 * Garantiza mínimo diario inyectando refuerzos o moviendo turnos desde días sobredimensionados.
 */
function enforceMinimumDailyStaff(
    entries: PlantillaScheduleEntry[],
    dates: string[],
    weekdayMin: number,
): { boosts: number; relocations: number } {
    let boosts = 0;
    let relocations = 0;
    const maxPasses = Math.max(12, dates.length);

    for (let pass = 0; pass < maxPasses; pass++) {
        const understaffed = dates
            .filter(
                (date) =>
                    minDailyStaffForDate(date, weekdayMin) > 0 &&
                    countPlantillaStaff(entries, date) < minDailyStaffForDate(date, weekdayMin),
            )
            .sort((a, b) => countPlantillaStaff(entries, a) - countPlantillaStaff(entries, b));

        if (understaffed.length === 0) break;

        let progress = false;

        for (const date of understaffed) {
            const minStaff = minDailyStaffForDate(date, weekdayMin);
            if (countPlantillaStaff(entries, date) >= minStaff) continue;

            const added = boostMinimumDailyStaffForDate(entries, date, weekdayMin);
            if (added > 0) {
                boosts += added;
                progress = true;
            }
            if (countPlantillaStaff(entries, date) >= minStaff) continue;

            const targetWeek = weekStartMonday(date);
            const donorDates = dates
                .filter(
                    (donorDate) =>
                        minDailyStaffForDate(donorDate, weekdayMin) > 0 &&
                        donorDate !== date &&
                        countPlantillaStaff(entries, donorDate) > minDailyStaffForDate(donorDate, weekdayMin),
                )
                .sort((a, b) => {
                    const sameWeekA = weekStartMonday(a) === targetWeek ? 1 : 0;
                    const sameWeekB = weekStartMonday(b) === targetWeek ? 1 : 0;
                    if (sameWeekB !== sameWeekA) return sameWeekB - sameWeekA;
                    return countPlantillaStaff(entries, b) - countPlantillaStaff(entries, a);
                });

            for (const donorDate of donorDates) {
                if (tryRelocateWorker(entries, donorDate, date, weekdayMin)) {
                    relocations += 1;
                    progress = true;
                    break;
                }
            }
        }

        if (!progress) break;
    }

    return { boosts, relocations };
}

function tryTrimWorkerFromDate(
    entries: PlantillaScheduleEntry[],
    fromDate: string,
    dates: string[],
    weekdayMin: number,
): boolean {
    const maxStaff = maxDailyStaffForDate(fromDate);
    const minStaff = minDailyStaffForDate(fromDate, weekdayMin);
    if (maxStaff == null || countPlantillaStaff(entries, fromDate) <= maxStaff) return false;

    const candidates = entries.filter((entry) => {
        if (!canRelocateWorkDay(entry, fromDate)) return false;
        const rule = getMorningExclusiveRule(fromDate);
        if (rule && isMorningExclusiveWorker(entry.fullName, rule)) return false;
        return true;
    });
    if (candidates.length === 0) return false;

    candidates.sort(
        (a, b) => weekBillableHoursForEntry(b, fromDate) - weekBillableHoursForEntry(a, fromDate),
    );

    for (const entry of candidates) {
        clearSimulatedWorkDay(entry, fromDate);
        if (countPlantillaStaff(entries, fromDate) < minStaff) {
            injectSimulatedWorkDay(
                entry.weeks,
                fromDate,
                entry.userId,
                entry.email,
                entry.contractedHoursWeekly,
            );
            continue;
        }

        const targetWeek = weekStartMonday(fromDate);
        const weekendTargets = dates
            .filter((targetDate) => {
                if (!isWeekend(targetDate) || isPlantillaClosedHoliday(targetDate)) return false;
                const targetMin = minDailyStaffForDate(targetDate, weekdayMin);
                return countPlantillaStaff(entries, targetDate) < targetMin;
            })
            .sort((a, b) => {
                const sameWeekA = weekStartMonday(a) === targetWeek ? 1 : 0;
                const sameWeekB = weekStartMonday(b) === targetWeek ? 1 : 0;
                if (sameWeekB !== sameWeekA) return sameWeekB - sameWeekA;
                return countPlantillaStaff(entries, a) - countPlantillaStaff(entries, b);
            });

        for (const targetDate of weekendTargets) {
            if (!canBeScheduled(entry, targetDate)) continue;
            if (
                injectSimulatedWorkDay(
                    entry.weeks,
                    targetDate,
                    entry.userId,
                    entry.email,
                    entry.contractedHoursWeekly,
                )
            ) {
                recalculateWeekSummaries(entry.weeks, entry.contractedHoursWeekly);
                return true;
            }
        }

        recalculateWeekSummaries(entry.weeks, entry.contractedHoursWeekly);
        return true;
    }

    return false;
}

function balancePlantillaStaffingDistribution(
    entries: PlantillaScheduleEntry[],
    dates: string[],
    weekdayMin: number,
): { boosts: number; relocations: number; trims: number } {
    let boosts = 0;
    let relocations = 0;
    let trims = 0;
    const maxPasses = Math.max(12, dates.length);

    for (let pass = 0; pass < maxPasses; pass++) {
        let progress = false;

        const enforced = enforceMinimumDailyStaff(entries, dates, weekdayMin);
        boosts += enforced.boosts;
        relocations += enforced.relocations;
        if (enforced.boosts + enforced.relocations > 0) progress = true;

        const overcrowded = dates
            .filter((date) => isOverstaffed(entries, date))
            .sort((a, b) => countPlantillaStaff(entries, b) - countPlantillaStaff(entries, a));

        for (const date of overcrowded) {
            if (tryTrimWorkerFromDate(entries, date, dates, weekdayMin)) {
                trims += 1;
                progress = true;
            }
        }

        if (!progress) break;
    }

    return { boosts, relocations, trims };
}

function pickStaffingCandidate(
    entries: PlantillaScheduleEntry[],
    date: string,
    excludeUserIds: ReadonlySet<string> = new Set(),
): PlantillaScheduleEntry | null {
    const schedulable = entries.filter(
        (e) => !excludeUserIds.has(e.userId) && canBeScheduled(e, date),
    );
    if (schedulable.length === 0) return null;

    const withCapacity = schedulable.filter((e) => hasWeeklyCapacity(e, date));
    const pool = withCapacity.length > 0 ? withCapacity : schedulable;

    pool.sort((a, b) => {
        const hoursA = weekBillableHoursForEntry(a, date);
        const hoursB = weekBillableHoursForEntry(b, date);
        const roomA = a.contractedHoursWeekly - hoursA;
        const roomB = b.contractedHoursWeekly - hoursB;
        if (roomB !== roomA) return roomB - roomA;
        return hoursA - hoursB;
    });

    return pool[0] ?? null;
}

function rebalanceAllEntries(
    entries: PlantillaScheduleEntry[],
    bounds: { start: string; end: string },
): number {
    const todayYmd = bounds.end;
    let count = 0;
    for (const entry of entries) {
        rebalancePlantillaSchedule(
            entry.weeks,
            { userId: entry.userId, email: entry.email },
            {
                contractedHoursWeekly: entry.contractedHoursWeekly,
                joiningDate: entry.joiningDate,
                endDate: entry.endDate,
            },
            entry.contractedHoursWeekly,
            todayYmd,
        );
        count += entry.weeks.length;
    }
    return count;
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

function minDailyStaffForDate(date: string, weekdayMin: number): number {
    if (isPlantillaClosedHoliday(date)) return 0;
    return isWeekend(date) ? MIN_PLANTILLA_WEEKEND_STAFF : weekdayMin;
}

function maxDailyStaffForDate(date: string): number | null {
    if (isPlantillaClosedHoliday(date)) return null;
    return isWeekend(date) ? MAX_PLANTILLA_WEEKEND_STAFF : MAX_PLANTILLA_WEEKDAY_STAFF;
}

function isOverstaffed(entries: PlantillaScheduleEntry[], date: string): boolean {
    const maxStaff = maxDailyStaffForDate(date);
    return maxStaff != null && countPlantillaStaff(entries, date) > maxStaff;
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
    const durationMin = Math.max(
        30,
        Math.round((day.totalHours ?? Math.max(0.5, (outMin - inMin) / 60)) * 60),
    );
    const inOrganic = organicMinute(inMin, hashDate(day.date, 'in'));
    let outTarget = inOrganic + durationMin;
    if (outMin >= inOrganic + durationMin - 20) {
        outTarget = Math.min(outTarget, outMin + 8);
    }
    const outOrganic = organicMinute(Math.max(inOrganic + 30, outTarget), hashDate(day.date, 'out'));
    day.clockIn = minutesToHm(inOrganic);
    day.clockOut = minutesToHm(outOrganic);
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
        if (getMorningExclusiveRule(date)) continue;

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

function clearSimulatedWorkDay(entry: PlantillaScheduleEntry, date: string): void {
    const day = findDayInWeeks(entry.weeks, date);
    if (!day?.hasLog || !isPlantillaWorkingDay(day)) return;
    day.hasLog = false;
    day.clockIn = null;
    day.clockOut = null;
    day.totalHours = 0;
    day.extraHours = 0;
    day.eventType = 'regular';
}

function ensureMorningExclusiveWorkers(
    entries: PlantillaScheduleEntry[],
    rule: PlantillaMorningExclusiveRule,
): number {
    let ensured = 0;
    for (const entry of entries) {
        if (!isMorningExclusiveWorker(entry.fullName, rule)) continue;
        if (!isEmployeeActiveOnDate(entry, rule.date)) continue;
        const day = findDayInWeeks(entry.weeks, rule.date);
        if (isPlantillaWorkingDay(day)) continue;
        if (
            injectSimulatedWorkDay(
                entry.weeks,
                rule.date,
                entry.userId,
                entry.email,
                entry.contractedHoursWeekly,
            )
        ) {
            ensured += 1;
        }
    }
    return ensured;
}

/**
 * En fechas con regla de mañana exclusiva, solo los trabajadores permitidos
 * pueden tener entrada antes de untilMinutes; el resto pasa a turno de tarde (≥13:00).
 */
function applyMorningExclusivePlantillaRules(
    entries: PlantillaScheduleEntry[],
    dates: string[],
): number {
    let adjusted = 0;

    for (const date of dates) {
        const rule = getMorningExclusiveRule(date);
        if (!rule || isPlantillaClosedHoliday(date)) continue;

        adjusted += ensureMorningExclusiveWorkers(entries, rule);

        const closeMax = getPlantillaDayClosingMinutesOrganic(date);
        const openMin = getPlantillaDayOpeningMinutes(date);
        const minAfternoonMinutes = 60;

        for (const entry of entries) {
            const day = findDayInWeeks(entry.weeks, date);
            if (!day || !isPlantillaWorkingDay(day) || !day.clockIn || !day.clockOut) continue;

            if (isMorningExclusiveWorker(entry.fullName, rule)) {
                const durationMin = Math.max(60, Math.round((day.totalHours ?? 8) * 60));
                setShiftTimes(day, openMin, Math.min(openMin + durationMin, closeMax));
                adjusted += 1;
                continue;
            }

            const inMin = parseHm(day.clockIn);
            if (inMin >= rule.untilMinutes) {
                const durationMin = Math.max(60, Math.round((day.totalHours ?? 8) * 60));
                const afternoonIn = organicMinute(
                    rule.untilMinutes,
                    hashDate(date, `pm-${entry.userId}`),
                );
                const afternoonOut = Math.min(afternoonIn + durationMin, closeMax);
                if (afternoonOut - afternoonIn >= minAfternoonMinutes) {
                    setShiftTimes(day, afternoonIn, afternoonOut);
                }
                adjusted += 1;
                continue;
            }

            const durationMin = Math.max(60, Math.round((day.totalHours ?? 8) * 60));
            const afternoonIn = organicMinute(
                rule.untilMinutes,
                hashDate(date, `pm-${entry.userId}`),
            );

            if (afternoonIn + minAfternoonMinutes > closeMax) {
                clearSimulatedWorkDay(entry, date);
                adjusted += 1;
                continue;
            }

            const afternoonOut = Math.min(afternoonIn + durationMin, closeMax);
            if (afternoonOut - afternoonIn < minAfternoonMinutes) {
                clearSimulatedWorkDay(entry, date);
                adjusted += 1;
                continue;
            }

            setShiftTimes(day, afternoonIn, afternoonOut);
            adjusted += 1;
        }
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

    for (const entry of entries) {
        normalizeLockedAbsenceDays(entry.weeks);
    }

    for (const date of dates) {
        staffingBoosts += boostMinimumDailyStaffForDate(entries, date, minDailyStaff);
    }

    const weeksRebalancedBeforeAlign = rebalanceAllEntries(entries, bounds);

    let shiftsAligned = alignPlantillaDailyShifts(entries, dates);
    let morningExclusiveAdjustments = applyMorningExclusivePlantillaRules(entries, dates);
    rebalanceAllEntries(entries, bounds);

    const distribution = balancePlantillaStaffingDistribution(entries, dates, minDailyStaff);
    staffingBoosts += distribution.boosts;
    let staffingRelocations = distribution.relocations;
    let staffingTrims = distribution.trims;

    shiftsAligned += alignPlantillaDailyShifts(entries, dates);
    morningExclusiveAdjustments += applyMorningExclusivePlantillaRules(entries, dates);

    for (let pass = 0; pass < 8; pass++) {
        let progress = false;
        const overcrowded = dates
            .filter((date) => isOverstaffed(entries, date))
            .sort((a, b) => countPlantillaStaff(entries, b) - countPlantillaStaff(entries, a));
        for (const date of overcrowded) {
            if (tryTrimWorkerFromDate(entries, date, dates, minDailyStaff)) {
                staffingTrims += 1;
                progress = true;
            }
        }
        if (!progress) break;
    }

    const postSpecialEnforced = enforceMinimumDailyStaff(entries, dates, minDailyStaff);
    staffingBoosts += postSpecialEnforced.boosts;
    staffingRelocations += postSpecialEnforced.relocations;
    morningExclusiveAdjustments += applyMorningExclusivePlantillaRules(entries, dates);

    for (const entry of entries) {
        normalizeLockedAbsenceDays(entry.weeks);
        recalculateWeekSummaries(entry.weeks, entry.contractedHoursWeekly);
    }

    const understaffedDates = dates.filter(
        (date) =>
            minDailyStaffForDate(date, minDailyStaff) > 0 &&
            countPlantillaStaff(entries, date) < minDailyStaffForDate(date, minDailyStaff),
    );
    const overstaffedDates = dates.filter((date) => isOverstaffed(entries, date));

    return {
        holidaysCleared,
        staffingBoosts,
        staffingRelocations,
        staffingTrims,
        shiftsAligned,
        morningExclusiveAdjustments,
        weeksRebalanced: weeksRebalancedBeforeAlign,
        understaffedDates,
        overstaffedDates,
    };
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
