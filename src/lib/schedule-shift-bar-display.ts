/** Umbral % del timeline: por debajo, las etiquetas HH:mm se solapan en la barra verde. */
const COMPACT_WIDTH_THRESHOLD_PCT = 14;

function timeToPercent(timeStr: string, startHour: number, totalHours: number): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return ((hours - startHour) + (minutes / 60)) / totalHours * 100;
}

export function getShiftBarWidthPercent(
    start: string,
    end: string,
    startHour = 7,
    totalHours = 16,
): number {
    return Math.max(timeToPercent(end, startHour, totalHours) - timeToPercent(start, startHour, totalHours), 0);
}

export function shouldShowMinutesOnShiftBar(
    start: string,
    end: string,
    startHour = 7,
    totalHours = 16,
): boolean {
    return getShiftBarWidthPercent(start, end, startHour, totalHours) >= COMPACT_WIDTH_THRESHOLD_PCT;
}

export function formatShiftBarTimeLabel(time: string, showMinutes: boolean): string {
    if (!time) return '';
    if (showMinutes) return time;
    const [hours] = time.split(':');
    return hours ?? time;
}
