/** Un saldo nulo, positivo o visualmente cero no ocupa espacio en el horario. */
export function formatNegativeScheduleBalance(value: number | null | undefined): string | null {
    if (value == null || !Number.isFinite(value)) return null;
    const rounded = Math.round(value * 100) / 100;
    if (rounded >= 0) return null;
    return new Intl.NumberFormat('es-ES', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
    }).format(rounded) + ' h';
}
