import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatInTimeZone } from 'date-fns-tz';
import { parseDBDate, parseRadiografiaTimestamp, parseTPVDate } from '@/utils/date-utils';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Formatea un valor numérico o string para visualización.
 * Si el valor es 0 o "0", devuelve un espacio en blanco " ".
 * Cumple con la REGLA ZERO-DISPLAY del protocolo.
 */
export function formatDisplayValue(value: string | number): string | number {
    if (value === 0 || value === "0") return " ";
    if (typeof value === 'number' && Math.abs(value) < 0.1) return " ";
    return value;
}

/**
 * Aplica la lógica de redondeo de horas corporativa de Marbella.
 * Regla: 
 * - Si minutes <= 20 -> 0.0
 * - Si minutes <= 50 -> 0.5
 * - Si minutes > 50  -> 1.0
 */
/**
 * Hora civil (0-23) en Europe/Madrid desde instante UTC almacenado en hora_cierre/fecha.
 */
export function getHourFromTicketTime(horaCierre?: string | null, fecha?: string | null): number {
    const raw = horaCierre ?? fecha;
    if (!raw || typeof raw !== 'string') return 12;
    const plainTimeMatch = raw.match(/^\d{2}:\d{2}(?::\d{2})?$/);
    if (plainTimeMatch) {
        const h = parseInt(raw.slice(0, 2), 10);
        return Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 12;
    }
    let d = parseRadiografiaTimestamp(raw) ?? parseDBDate(raw);
    if (Number.isNaN(d.getTime())) d = parseTPVDate(raw);
    if (Number.isNaN(d.getTime())) return 12;
    const h = formatInTimeZone(d, 'Europe/Madrid', 'H');
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? Math.min(23, Math.max(0, n)) : 12;
}

/** KPIs / gráficas: hora según TPV (`hora_cierre` / `fecha`), alineado con `get_hourly_sales`. */
export function getBusinessHourFromTicket(ticket: {
    hora_cierre?: string | null;
    fecha?: string | null;
}): number {
    return getHourFromTicketTime(ticket.hora_cierre, ticket.fecha);
}

export function calculateRoundedHours(hours: number): number {
    const integerPart = Math.floor(hours);
    const decimalPart = hours - integerPart;
    const minutes = decimalPart * 60;

    let fraction = 0;
    if (minutes <= 20) {
        fraction = 0;
    } else if (minutes <= 50) {
        fraction = 0.5;
    } else {
        fraction = 1.0;
    }

    return integerPart + fraction;
}
