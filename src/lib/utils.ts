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
