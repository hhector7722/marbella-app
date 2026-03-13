import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
 * Extrae la hora (0-23) de hora_cierre o fecha para alineación con get_hourly_sales.
 * Soporta: ISO (T), espacio (YYYY-MM-DD HH:MM:SS), tiempo plano (HH:MM:SS).
 * Evita desfases por timezone usando solo la parte literal del string.
 */
export function getHourFromTicketTime(horaCierre?: string | null, fecha?: string | null): number {
    const raw = horaCierre ?? fecha;
    if (!raw || typeof raw !== 'string') return 12;
    let part: string;
    if (raw.includes('T')) {
        part = raw.split('T')[1] ?? '';
    } else if (raw.includes(' ')) {
        part = raw.split(' ')[1] ?? '';
    } else {
        part = raw;
    }
    const match = part.replace(/\.\d+/, '').match(/^(\d{1,2})/);
    if (match) return Math.min(23, Math.max(0, parseInt(match[1], 10)));
    return 12;
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
