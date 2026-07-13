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

export function isPlantillaClosedHoliday(date: string): boolean {
    const ymd = date.slice(0, 10);
    if (PLANTILLA_CLOSED_HOLIDAYS_2026.has(ymd)) return true;
    // Soporte genérico si se amplía el calendario por año
    return false;
}
