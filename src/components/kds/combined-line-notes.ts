/** Texto TPV + texto cocina para mostrar en tarjetas y pie resumen (sin tocar la clave de delta). */
export function combinedLineNotesForDisplay(
    notas: string | null | undefined,
    notas_cocina: string | null | undefined
): string | null {
    const a = (notas ?? '').trim();
    const b = (notas_cocina ?? '').trim();
    if (!a && !b) return null;
    if (!a) return b || null;
    if (!b) return a || null;
    return `${a}\n${b}`;
}
