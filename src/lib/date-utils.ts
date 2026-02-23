import { startOfISOWeek, endOfISOWeek, format } from 'date-fns';

/**
 * Retorna el inicio de la semana ISO (Lunes) en formato YYYY-MM-DD,
 * asegurando que la fecha se trata como UTC para evitar desfases.
 */
export function getISOWeekStartUTC(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Forzamos a que sea el inicio del día en UTC para evitar que startOfISOWeek
    // lo mueva a la semana anterior si estamos en un locale negativo.
    const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return format(startOfISOWeek(utcDate), 'yyyy-MM-dd');
}

/**
 * Retorna el fin de la semana ISO (Domingo) en formato YYYY-MM-DD.
 */
export function getISOWeekEndUTC(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return format(endOfISOWeek(utcDate), 'yyyy-MM-dd');
}

/**
 * Convierte cualquier fecha a string ISO YYYY-MM-DD asegurando que se usa el día UTC.
 */
export function toUTCDateString(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
}
