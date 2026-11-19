/** Aviso puntual del uso de notas para los horarios del 21 y 22 de noviembre de 2026.
 * Los IDs corresponden a las cuentas reales de los trabajadores (no a los tramos laborales).
 */
const GUIDANCE_DATES: ReadonlySet<string> = new Set(['2026-11-21', '2026-11-22']);

const GUIDANCE_STAFF: Readonly<Record<string, string>> = Object.freeze({
    'c5aed5dd-aa3c-4c21-8eaf-4393ca118dc4': 'Bali',
    '40f95fbc-9466-441a-aaea-3fc28044e8d3': 'Martí',
    '22cfb522-15db-4933-972d-08d581e038f3': 'Pau',
});

export function isScheduleGuidanceDate(date: string | null | undefined): boolean {
    return typeof date === 'string' && GUIDANCE_DATES.has(date);
}

export function scheduleGuidanceStaffName(userId: string | null | undefined): string | null {
    return userId && Object.hasOwn(GUIDANCE_STAFF, userId) ? GUIDANCE_STAFF[userId] : null;
}
