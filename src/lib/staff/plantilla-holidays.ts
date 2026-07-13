/**
 * Festivos de cierre del Bar La Marbella (Barcelona / ámbito operativo).
 * En simulación de plantilla no se generan turnos regulares estos días.
 */

/** YYYY-MM-DD — año 2026 (validado con operativa real). */
export const PLANTILLA_CLOSED_HOLIDAYS_2026 = new Set([
    '2026-01-01', // Año Nuevo
    '2026-01-06', // Reyes
    '2026-04-03', // Viernes Santo
    '2026-04-06', // Lunes de Pascua (Cataluña)
    '2026-05-01', // Día del Trabajador
    '2026-05-25', // Festivo local (según calendario operativo)
    '2026-06-24', // Sant Joan
]);

/** Vísperas de festivo con cierre anticipado (~16:00). */
export const PLANTILLA_SHORT_CLOSE_EVE_DATES = new Set([
    '2026-01-05', // víspera Reyes
    '2026-06-23', // víspera Sant Joan
]);

export function isPlantillaClosedHoliday(date: string): boolean {
    const ymd = date.slice(0, 10);
    if (PLANTILLA_CLOSED_HOLIDAYS_2026.has(ymd)) return true;
    // Soporte genérico si se amplía el calendario por año
    return false;
}

/** Minutos desde medianoche para apertura habitual (~8:00, con jitter determinista). */
export function getPlantillaDayOpeningMinutes(date: string): number {
    const ymd = date.slice(0, 10);
    let hash = 0;
    for (let i = 0; i < ymd.length; i++) {
        hash = (hash * 31 + ymd.charCodeAt(i)) | 0;
    }
    const jitter = (Math.abs(hash) % 11) - 5; // -5 … +5 min → ~7:55–8:05
    return 8 * 60 + jitter;
}

/**
 * Cierre operativo del día (minutos desde medianoche).
 * Dom y vísperas de festivo: ~16:00. Lun–sáb: ~21:00.
 */
export function getPlantillaDayClosingMinutes(date: string): number {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const ymd = date.slice(0, 10);
    if (dow === 0) return 16 * 60;
    if (PLANTILLA_SHORT_CLOSE_EVE_DATES.has(ymd)) return 16 * 60;
    return 21 * 60;
}

/** Jitter determinista de cierre (±4 min). */
export function getPlantillaDayClosingMinutesOrganic(date: string, salt = 'close'): number {
    const base = getPlantillaDayClosingMinutes(date);
    let hash = 0;
    const key = `${date}:${salt}`;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    const jitter = (Math.abs(hash) % 9) - 4;
    return base + jitter;
}
