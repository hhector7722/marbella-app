/**
 * Generador de histórico simulado por empleado (solo en memoria).
 *
 * Alcance: fecha de alta en la empresa → mes actual del año en curso (sin compensación agosto+).
 * No modifica BD ni conoce el resto de la plantilla.
 */

import { isMasterDashboardUser } from '@/lib/master-dashboard';
import type { TimesheetDayData, TimesheetWeekData } from './timesheet-export-payload';

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface NormalizerEmployee {
    userId: string;
    email?: string | null;
}

export interface NormalizerContract {
    contractedHoursWeekly: number;
    joiningDate?: string | null;
    endDate?: string | null;
}

export interface SimulationResolution {
    canSimulate: boolean;
    reason?: string;
    contractedHoursWeekly: number;
}

export class SimulationUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SimulationUnavailableError';
    }
}

interface ShiftPattern {
    startMinutes: number;
    durationMinutes: number;
    worksWeekends: boolean;
}

const LOCKED_EVENT_TYPES = new Set(['holiday', 'personal', 'adjustment']);

const DAY_NAMES = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const;

const MIN_SHIFT_HOURS = 4;
const MAX_SHIFT_HOURS = 10;
const IDEAL_SHIFT_HOURS = 7;
const BALANCE_TOLERANCE = 0.25;
const TRIM_STEP_HOURS = 5 / 60; // 5 minutos

/** Mínimo de jornadas flexibles en el período de referencia para inferir patrón/contrato. */
const MIN_REFERENCE_FLEX_DAYS = 4;
const MIN_REFERENCE_ACTIVE_WEEKS = 2;

const INSUFFICIENT_HISTORY_MESSAGE =
    'No hay información suficiente para simular el histórico. Se necesitan fichajes fiables desde mediados de febrero.';

/**
 * Comprueba si el empleado puede simularse y resuelve las horas contratadas efectivas.
 * Para contrato 0 h, infiere desde la 2ª mitad de febrero si hay histórico fiable.
 */
export function resolveSimulationProfile(
    weeksData: TimesheetWeekData[],
    contract: NormalizerContract,
    todayYmd?: string,
): SimulationResolution {
    const today = todayYmd ?? formatYmd(new Date());
    const simBounds = getSimulationBounds(today);
    const refStart = referencePeriodStart(simBounds.start);
    const refEnd = referencePeriodEnd(simBounds, contract.endDate, today);

    const statedContract = Math.max(0, contract.contractedHoursWeekly);

    if (statedContract > 0) {
        return { canSimulate: true, contractedHoursWeekly: statedContract };
    }

    if (!hasReliableReferenceHistory(weeksData, refStart, refEnd)) {
        return {
            canSimulate: false,
            reason: INSUFFICIENT_HISTORY_MESSAGE,
            contractedHoursWeekly: 0,
        };
    }

    const inferred = inferContractFromReference(weeksData, refStart, refEnd);
    if (inferred <= 0) {
        return {
            canSimulate: false,
            reason: INSUFFICIENT_HISTORY_MESSAGE,
            contractedHoursWeekly: 0,
        };
    }

    return { canSimulate: true, contractedHoursWeekly: inferred };
}

/**
 * Genera un histórico simulado para un empleado a partir de sus registros reales.
 * Solo transforma datos en memoria; no escribe en BD.
 *
 * @param resolution Resolución precalculada (evita repetir `resolveSimulationProfile`).
 */
export function normalizeStaffSchedule(
    weeksData: TimesheetWeekData[],
    employee: NormalizerEmployee,
    contract: NormalizerContract,
    todayYmd?: string,
    resolution?: SimulationResolution,
): TimesheetWeekData[] {
    if (weeksData.length === 0) return [];

    const today = todayYmd ?? formatYmd(new Date());
    const resolved = resolution ?? resolveSimulationProfile(weeksData, contract, today);
    if (!resolved.canSimulate) {
        throw new SimulationUnavailableError(resolved.reason ?? INSUFFICIENT_HISTORY_MESSAGE);
    }

    const weeks = cloneWeeks(weeksData);
    const isHector = isMasterDashboardUser(employee.email);
    const weeklyTarget = resolved.contractedHoursWeekly;
    const employeeBounds = getEmployeeSimulationBounds(today, contract.joiningDate, contract.endDate);
    const refStart = referencePeriodStart(employeeBounds.start);
    const refEnd = referencePeriodEnd(employeeBounds, contract.endDate, today);
    const pattern = extractShiftPattern(weeks, employee.userId, refStart, refEnd);

    if (isHector) {
        applyHectorBaseline(weeks, employee.userId, contract, pattern, employeeBounds);
        clearHectorWeekends(weeks);
    }

    for (const week of weeks) {
        balanceWeek(week, employee.userId, weeklyTarget, contract, isHector, pattern, employeeBounds);
        recalcWeekSummary(week, resolveWeeklyTarget(week, weeklyTarget));
    }

    clearDaysOutsideBounds(weeks, employeeBounds);

    return weeks;
}

// ---------------------------------------------------------------------------
// Período de referencia (patrón real observado desde 16 feb)
// ---------------------------------------------------------------------------

function referencePeriodStart(simYearStart: string): string {
    const year = simYearStart.slice(0, 4);
    return `${year}-02-16`;
}

function referencePeriodEnd(
    simBounds: { start: string; end: string },
    endDate: string | null | undefined,
    todayYmd: string,
): string {
    let end = ymdMin(simBounds.end, todayYmd);
    if (endDate) {
        end = ymdMin(end, endDate.slice(0, 10));
    }
    return end;
}

function hasReliableReferenceHistory(
    weeks: TimesheetWeekData[],
    referenceStart: string,
    referenceEnd: string,
): boolean {
    if (referenceEnd < referenceStart) return false;

    let flexDays = 0;
    const activeWeeks = new Set<string>();

    for (const week of weeks) {
        for (const day of week.days) {
            if (day.date < referenceStart || day.date > referenceEnd) continue;
            if (!isFlexibleDay(day)) continue;
            flexDays += 1;
            activeWeeks.add(week.startDate);
        }
    }

    return flexDays >= MIN_REFERENCE_FLEX_DAYS && activeWeeks.size >= MIN_REFERENCE_ACTIVE_WEEKS;
}

function inferContractFromReference(
    weeks: TimesheetWeekData[],
    referenceStart: string,
    referenceEnd: string,
): number {
    const limits: number[] = [];
    const weekFlexTotals: number[] = [];

    for (const week of weeks) {
        const refDays = week.days.filter(
            (d) => d.date >= referenceStart && d.date <= referenceEnd,
        );
        if (refDays.length === 0) continue;

        const limit = week.summary.limitHours;
        if (typeof limit === 'number' && limit > 0) {
            limits.push(limit);
        }

        const flexHours = sumHours(refDays.filter((d) => isFlexibleDay(d)));
        if (flexHours > 0) {
            weekFlexTotals.push(flexHours);
        }
    }

    if (limits.length > 0) {
        return roundHours(median(limits));
    }

    if (weekFlexTotals.length >= 2) {
        return roundHours(median(weekFlexTotals));
    }

    if (weekFlexTotals.length === 1) {
        return roundHours(weekFlexTotals[0]);
    }

    return 0;
}

// ---------------------------------------------------------------------------
// Caso Héctor: L–V, ~8 h, sin festivos bloqueados
// ---------------------------------------------------------------------------

function applyHectorBaseline(
    weeks: TimesheetWeekData[],
    userId: string,
    contract: NormalizerContract,
    pattern: ShiftPattern,
    simBounds: { start: string; end: string },
) {
    for (const week of weeks) {
        for (const day of week.days) {
            if (!isInSimulationRange(day.date, simBounds.start, simBounds.end, contract.endDate)) continue;
            if (isWeekend(day.date)) continue;
            if (day.hasLog && LOCKED_EVENT_TYPES.has(day.eventType)) continue;

            const shift = buildShiftTimes(day.date, userId, 8, pattern);
            applyShiftToDay(day, shift);
        }
    }
}

function clearHectorWeekends(weeks: TimesheetWeekData[]) {
    for (const week of weeks) {
        for (const day of week.days) {
            if (!isWeekend(day.date)) continue;
            if (!day.hasLog) continue;
            if (LOCKED_EVENT_TYPES.has(day.eventType)) continue;
            clearDay(day);
        }
    }
}

// ---------------------------------------------------------------------------
// Balance semanal
// ---------------------------------------------------------------------------

function balanceWeek(
    week: TimesheetWeekData,
    userId: string,
    weeklyTarget: number,
    contract: NormalizerContract,
    isHector: boolean,
    pattern: ShiftPattern,
    simBounds: { start: string; end: string },
) {
    const weekTarget = resolveWeeklyTarget(week, weeklyTarget);
    const inRange = (day: TimesheetDayData) =>
        isInSimulationRange(day.date, simBounds.start, simBounds.end, contract.endDate);

    const lockedHours = sumHours(
        week.days.filter((d) => d.hasLog && LOCKED_EVENT_TYPES.has(d.eventType) && inRange(d)),
    );
    const flexTarget = Math.max(0, weekTarget - lockedHours);

    if (weekTarget <= 0) {
        for (const day of getFlexibleDays(week).filter(inRange)) clearDay(day);
        return;
    }

    let flexDays = getFlexibleDays(week).filter(inRange);
    let flexHours = sumHours(flexDays);

    if (flexHours > flexTarget + BALANCE_TOLERANCE) {
        trimFlexibleHours(flexDays, flexHours - flexTarget, userId);

        flexDays = getFlexibleDays(week).filter(inRange);
        flexHours = sumHours(flexDays);

        if (flexHours > flexTarget + BALANCE_TOLERANCE) {
            removeFlexibleDaysNaturally(week, flexTarget, userId, pattern, inRange);
            flexDays = getFlexibleDays(week).filter(inRange);
            flexHours = sumHours(flexDays);
        }

        if (flexHours > flexTarget + BALANCE_TOLERANCE) {
            trimFlexibleHours(flexDays, flexHours - flexTarget, userId);
        }
        return;
    }

    if (flexHours < flexTarget - BALANCE_TOLERANCE) {
        const deficit = flexTarget - flexHours;
        extendFlexibleHours(flexDays, deficit, userId);

        flexDays = getFlexibleDays(week).filter(inRange);
        flexHours = sumHours(flexDays);

        if (flexHours < flexTarget - BALANCE_TOLERANCE) {
            addFlexibleDays(
                week,
                userId,
                flexTarget - flexHours,
                contract,
                isHector,
                pattern,
                simBounds,
            );
        }
    }
}

/** Recorta horas repartiendo pequeños ajustes entre jornadas (salida antes / entrada después). */
function trimFlexibleHours(
    flexDays: TimesheetDayData[],
    hoursToRemove: number,
    userId: string,
): boolean {
    let remaining = hoursToRemove;
    let guard = 0;

    while (remaining > BALANCE_TOLERANCE && guard < 500) {
        guard += 1;
        const adjustable = flexDays.filter((d) => d.totalHours - MIN_SHIFT_HOURS > TRIM_STEP_HOURS);
        if (adjustable.length === 0) return false;

        const step = Math.min(TRIM_STEP_HOURS, remaining / adjustable.length);
        let progressed = false;

        for (const day of adjustable) {
            const maxTrim = day.totalHours - MIN_SHIFT_HOURS;
            const trim = Math.min(step, maxTrim, remaining);
            if (trim <= 0.01) continue;

            adjustDayDuration(day, -trim, userId);
            remaining -= trim;
            progressed = true;
            if (remaining <= BALANCE_TOLERANCE) return true;
        }

        if (!progressed) return false;
    }

    return remaining <= BALANCE_TOLERANCE;
}

/** Alarga jornadas existentes antes de crear días nuevos. */
function extendFlexibleHours(
    flexDays: TimesheetDayData[],
    hoursToAdd: number,
    userId: string,
) {
    let remaining = hoursToAdd;
    let guard = 0;

    while (remaining > BALANCE_TOLERANCE && guard < 500) {
        guard += 1;
        const extendable = flexDays.filter((d) => d.totalHours < MAX_SHIFT_HOURS - TRIM_STEP_HOURS);
        if (extendable.length === 0) break;

        const step = Math.min(TRIM_STEP_HOURS, remaining / extendable.length);
        let progressed = false;

        for (const day of extendable) {
            const maxExtend = MAX_SHIFT_HOURS - day.totalHours;
            const extend = Math.min(step, maxExtend, remaining);
            if (extend <= 0.01) continue;

            adjustDayDuration(day, extend, userId);
            remaining -= extend;
            progressed = true;
            if (remaining <= BALANCE_TOLERANCE) return;
        }

        if (!progressed) break;
    }
}

/**
 * Elimina jornadas buscando una distribución natural (p. ej. 5×6 h → 4×7 h).
 */
function removeFlexibleDaysNaturally(
    week: TimesheetWeekData,
    flexTarget: number,
    userId: string,
    pattern: ShiftPattern,
    inRange: (day: TimesheetDayData) => boolean,
) {
    let flexDays = getFlexibleDays(week).filter(inRange);
    const idealCount = idealFlexibleDayCount(flexTarget, flexDays.length);
    let toRemove = Math.max(0, flexDays.length - idealCount);

    while (toRemove > 0 && flexDays.length > 1) {
        const removeDay = pickDayToRemove(flexDays, flexTarget);
        clearDay(removeDay);
        toRemove -= 1;
        flexDays = getFlexibleDays(week).filter(inRange);
    }

    flexDays = getFlexibleDays(week).filter(inRange);
    const diff = flexTarget - sumHours(flexDays);
    if (Math.abs(diff) > BALANCE_TOLERANCE && flexDays.length > 0) {
        if (diff > 0) {
            extendFlexibleHours(flexDays, diff, userId);
        } else {
            trimFlexibleHours(flexDays, -diff, userId);
        }
    }
}

function idealFlexibleDayCount(flexTarget: number, currentCount: number): number {
    if (currentCount <= 0) return 0;

    let bestCount = currentCount;
    let bestScore = Infinity;

    for (let n = 1; n <= currentCount; n++) {
        const avg = flexTarget / n;
        if (avg < MIN_SHIFT_HOURS || avg > MAX_SHIFT_HOURS) continue;

        const score = Math.abs(avg - IDEAL_SHIFT_HOURS);
        if (score < bestScore) {
            bestScore = score;
            bestCount = n;
        }
    }

    return bestCount;
}

function pickDayToRemove(flexDays: TimesheetDayData[], flexTarget: number): TimesheetDayData {
    let best = flexDays[0];
    let bestScore = Infinity;

    for (const candidate of flexDays) {
        const others = flexDays.filter((d) => d.date !== candidate.date);
        if (others.length === 0) return candidate;

        const idealAvg = flexTarget / others.length;
        const othersSum = sumHours(others);
        const score =
            Math.abs(othersSum - flexTarget) +
            Math.abs(othersSum / others.length - idealAvg) * 2 +
            (isWeekend(candidate.date) ? -0.3 : 0) +
            (candidate.totalHours < idealAvg ? -0.1 : 0.1);

        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return best;
}

function addFlexibleDays(
    week: TimesheetWeekData,
    userId: string,
    hoursNeeded: number,
    contract: NormalizerContract,
    isHector: boolean,
    pattern: ShiftPattern,
    simBounds: { start: string; end: string },
) {
    if (hoursNeeded <= BALANCE_TOLERANCE) return;

    const candidates = week.days
        .filter((d) => {
            if (d.hasLog) return false;
            if (!isInSimulationRange(d.date, simBounds.start, simBounds.end, contract.endDate)) return false;
            if (isWeekend(d.date) && (isHector || !pattern.worksWeekends)) return false;
            return true;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

    let remaining = hoursNeeded;

    for (const day of candidates) {
        if (remaining <= BALANCE_TOLERANCE) break;

        const targetHours = clamp(
            remaining,
            MIN_SHIFT_HOURS,
            Math.min(MAX_SHIFT_HOURS, pattern.durationMinutes / 60 + 1),
        );

        const shift = buildShiftTimes(day.date, userId, targetHours, pattern);
        applyShiftToDay(day, shift);
        remaining -= shift.totalHours;
    }
}

// ---------------------------------------------------------------------------
// Patrón horario del empleado (solo desde período de referencia)
// ---------------------------------------------------------------------------

function extractShiftPattern(
    weeks: TimesheetWeekData[],
    userId: string,
    referenceStart?: string,
    referenceEnd?: string,
): ShiftPattern {
    const starts: number[] = [];
    const durations: number[] = [];
    let worksWeekends = false;

    for (const week of weeks) {
        for (const day of week.days) {
            if (referenceStart && day.date < referenceStart) continue;
            if (referenceEnd && day.date > referenceEnd) continue;
            if (!day.hasLog || LOCKED_EVENT_TYPES.has(day.eventType)) continue;
            if (isWeekend(day.date)) worksWeekends = true;
            if (!day.clockIn || !day.clockOut) {
                durations.push(Math.round((day.totalHours || 8) * 60));
                continue;
            }
            starts.push(parseHm(day.clockIn));
            durations.push(Math.round(day.totalHours * 60));
        }
    }

    if (starts.length === 0 && durations.length === 0) {
        return { startMinutes: 9 * 60, durationMinutes: 8 * 60, worksWeekends: false };
    }

    return {
        startMinutes: starts.length > 0 ? median(starts) : 9 * 60,
        durationMinutes: durations.length > 0 ? median(durations) : 8 * 60,
        worksWeekends,
    };
}

// ---------------------------------------------------------------------------
// Helpers de jornada
// ---------------------------------------------------------------------------

function getFlexibleDays(week: TimesheetWeekData): TimesheetDayData[] {
    return week.days.filter((d) => isFlexibleDay(d));
}

function isFlexibleDay(day: TimesheetDayData): boolean {
    if (!day.hasLog) return false;
    return !LOCKED_EVENT_TYPES.has(day.eventType);
}

function applyShiftToDay(
    day: TimesheetDayData,
    shift: { clockIn: string; clockOut: string; totalHours: number },
) {
    day.hasLog = true;
    day.clockIn = shift.clockIn;
    day.clockOut = shift.clockOut;
    day.totalHours = shift.totalHours;
    day.extraHours = 0;
    day.eventType = 'regular';
}

function clearDay(day: TimesheetDayData) {
    day.hasLog = false;
    day.clockIn = null;
    day.clockOut = null;
    day.totalHours = 0;
    day.extraHours = 0;
    day.eventType = 'regular';
}

function adjustDayDuration(day: TimesheetDayData, deltaHours: number, userId: string) {
    if (!day.clockIn || !day.clockOut) {
        const shift = buildShiftTimes(day.date, userId, Math.max(MIN_SHIFT_HOURS, day.totalHours + deltaHours));
        applyShiftToDay(day, shift);
        return;
    }

    let inMin = parseHm(day.clockIn);
    let outMin = parseHm(day.clockOut);
    let deltaMin = Math.round(deltaHours * 60);
    const minDuration = MIN_SHIFT_HOURS * 60;
    const maxOut = 22 * 60;
    const minIn = 7 * 60 + 30;

    if (deltaMin < 0) {
        let toRemove = -deltaMin;
        const canTrimExit = Math.max(0, outMin - inMin - minDuration);
        const exitTrim = Math.min(toRemove, canTrimExit);
        outMin -= exitTrim;
        toRemove -= exitTrim;

        if (toRemove > 0) {
            const canDelayIn = Math.max(0, outMin - inMin - minDuration);
            const inDelay = Math.min(toRemove, canDelayIn, inMin - minIn);
            inMin += inDelay;
            toRemove -= inDelay;
        }
    } else {
        const canExtend = Math.min(deltaMin, maxOut - outMin, MAX_SHIFT_HOURS * 60 - (outMin - inMin));
        outMin += canExtend;
        deltaMin -= canExtend;

        if (deltaMin > 0) {
            const canAdvanceIn = Math.min(deltaMin, inMin - minIn, MAX_SHIFT_HOURS * 60 - (outMin - inMin));
            inMin -= canAdvanceIn;
        }
    }

    inMin = snap5(inMin);
    outMin = snap5(Math.max(outMin, inMin + minDuration));

    day.clockIn = minutesToHm(inMin);
    day.clockOut = minutesToHm(outMin);
    day.totalHours = roundHours((outMin - inMin) / 60);
}

/** Variación determinista de entrada/salida basada en el patrón habitual del empleado. */
function buildShiftTimes(
    date: string,
    userId: string,
    baseHours: number,
    pattern?: ShiftPattern,
) {
    const seed = hashString(`${userId}:${date}`);
    const baseStart = pattern?.startMinutes ?? 9 * 60;
    const baseDurationMin = pattern?.durationMinutes ?? Math.round(baseHours * 60);

    const startMinutes = snap5(
        clamp(baseStart + (seed % 31) - 15, 7 * 60 + 30, 11 * 60),
    );
    const durationMinutes = clamp(
        snap5(Math.round(baseHours * 60) + (seed % 23) - 11 + (baseDurationMin - Math.round(baseHours * 60)) / 3),
        MIN_SHIFT_HOURS * 60,
        MAX_SHIFT_HOURS * 60,
    );

    const clockIn = minutesToHm(startMinutes);
    const clockOut = minutesToHm(snap5(clamp(startMinutes + durationMinutes, 12 * 60, 22 * 60)));
    const totalHours = roundHours((parseHm(clockOut) - parseHm(clockIn)) / 60);

    return { clockIn, clockOut, totalHours };
}

function recalcWeekSummary(week: TimesheetWeekData, weeklyTarget: number) {
    const totalHours = sumHours(week.days.filter((d) => d.hasLog));
    week.summary = {
        ...week.summary,
        totalHours,
        weeklyBalance: roundHours(totalHours - weeklyTarget),
        finalBalance: 0,
        startBalance: 0,
        estimatedValue: 0,
    };
}

// ---------------------------------------------------------------------------
// Período de simulación: fecha de alta → mes actual
// ---------------------------------------------------------------------------

function getSimulationBounds(todayYmd: string): { start: string; end: string } {
    const [y, m] = todayYmd.split('-').map(Number);
    const lastDay = new Date(y, m, 0);
    return {
        start: `${y}-01-01`,
        end: ymdMin(formatYmd(lastDay), todayYmd),
    };
}

function getEmployeeSimulationBounds(
    todayYmd: string,
    joiningDate?: string | null,
    endDate?: string | null,
): { start: string; end: string } {
    const base = getSimulationBounds(todayYmd);
    let start = base.start;
    if (joiningDate) {
        start = ymdMax(start, joiningDate.slice(0, 10));
    }
    let end = ymdMin(base.end, todayYmd);
    if (endDate) {
        end = ymdMin(end, endDate.slice(0, 10));
    }
    return { start, end };
}

function resolveWeeklyTarget(week: TimesheetWeekData, defaultTarget: number): number {
    const limit = week.summary.limitHours;
    if (typeof limit === 'number' && limit > 0) return limit;
    return defaultTarget;
}

function clearDaysOutsideBounds(
    weeks: TimesheetWeekData[],
    bounds: { start: string; end: string },
) {
    for (const week of weeks) {
        for (const day of week.days) {
            if (day.date < bounds.start || day.date > bounds.end) {
                if (day.hasLog) clearDay(day);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function cloneWeeks(weeks: TimesheetWeekData[]): TimesheetWeekData[] {
    return weeks.map((week) => ({
        ...week,
        summary: { ...week.summary },
        days: week.days.map((day) => ({ ...day })),
    }));
}

function sumHours(days: TimesheetDayData[]): number {
    return roundHours(days.reduce((acc, d) => acc + (d.totalHours ?? 0), 0));
}

function isWeekend(date: string): boolean {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6;
}

function isInSimulationRange(
    date: string,
    periodStart: string,
    periodEnd: string,
    endDate?: string | null,
): boolean {
    if (date < periodStart) return false;
    if (date > periodEnd) return false;
    if (endDate && date > endDate.slice(0, 10)) return false;
    return true;
}

function parseHm(hm: string): number {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
}

function snap5(minutes: number): number {
    return Math.round(minutes / 5) * 5;
}

function formatYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function ymdMin(a: string, b: string): string {
    return a < b ? a : b;
}

function ymdMax(a: string, b: string): string {
    return a > b ? a : b;
}

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function minutesToHm(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function roundHours(h: number): number {
    return Math.round(h * 100) / 100;
}

/** Expuesto para tests — nombre de día coherente con la RPC. */
export function dayNameForDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

