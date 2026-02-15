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
