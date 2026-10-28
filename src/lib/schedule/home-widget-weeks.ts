/**
 * El calendario compacto de Horarios nunca muestra más de cinco semanas.
 * Si el mes ocupa seis filas (lunes-domingo), se omite la sexta entera.
 * Los días omitidos siguen accesibles desde las vistas completas de horarios.
 */
export const HOME_SCHEDULE_MAX_WEEKS = 5;

export function getHomeScheduleWeeks(days: readonly Date[]): Date[][] {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length && weeks.length < HOME_SCHEDULE_MAX_WEEKS; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }
    return weeks;
}
