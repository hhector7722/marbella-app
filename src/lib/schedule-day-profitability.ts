/** Cálculo de rentabilidad del día para el editor de horarios (solo uso interno Hector). */

export const SCHEDULE_LABOR_SS_MULTIPLIER = 1.3;
export const SCHEDULE_LABOR_TARGET_RATIO = 0.35;
export const SCHEDULE_LABOR_FALLBACK_RATE_EUR = 10;

export type ScheduleShiftForCost = {
    employeeId: string;
    start: string;
    end: string;
    active?: boolean;
};

/** Duración en horas entre dos horas locales "HH:mm". */
export function shiftDurationHours(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
    let startM = sh * 60 + sm;
    let endM = eh * 60 + em;
    if (endM < startM) endM += 24 * 60;
    return Math.max(0, (endM - startM) / 60);
}

export function resolveLaborRateEur(
    rateByUserId: Record<string, number | undefined>,
    employeeId: string,
): number {
    const r = rateByUserId[employeeId];
    return r != null && r > 0 ? r : SCHEDULE_LABOR_FALLBACK_RATE_EUR;
}

export function computeScheduleDayLaborCost(
    shifts: ScheduleShiftForCost[],
    rateByUserId: Record<string, number | undefined>,
): number {
    let total = 0;
    for (const s of shifts) {
        if (s.active === false || !s.start || !s.end) continue;
        const hours = shiftDurationHours(s.start, s.end);
        const rate = resolveLaborRateEur(rateByUserId, s.employeeId);
        total += hours * rate * SCHEDULE_LABOR_SS_MULTIPLIER;
    }
    return total;
}

export function computeRequiredBilling(laborCost: number): number {
    if (laborCost <= 0) return 0;
    return laborCost / SCHEDULE_LABOR_TARGET_RATIO;
}

export function formatScheduleEuro(value: number): string {
    const rounded = Math.round(value);
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(rounded)} €`;
}
