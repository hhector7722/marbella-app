/**
 * Reglas operativas puntuales de plantilla (simulación / exportación).
 */

export type PlantillaMorningExclusiveRule = {
    /** YYYY-MM-DD */
    date: string;
    /** Minutos desde medianoche (p. ej. 13:00 → 780). */
    untilMinutes: number;
    /** Primer nombre normalizado (sin tildes, minúsculas) de quien puede figurar antes de untilMinutes. */
    allowedFirstNames: readonly string[];
};

/** Hasta las 13:00 solo Pere y Alba en barra. */
export const PLANTILLA_MORNING_EXCLUSIVE_RULES: readonly PlantillaMorningExclusiveRule[] = [
    {
        date: '2026-06-29',
        untilMinutes: 13 * 60,
        allowedFirstNames: ['pere', 'alba'],
    },
];

function normalizeNameToken(value: string): string {
    return value
        .trim()
        .split(/\s+/)[0]
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
}

export function getMorningExclusiveRule(date: string): PlantillaMorningExclusiveRule | null {
    const ymd = date.slice(0, 10);
    return PLANTILLA_MORNING_EXCLUSIVE_RULES.find((rule) => rule.date === ymd) ?? null;
}

export function isMorningExclusiveWorker(fullName: string, rule: PlantillaMorningExclusiveRule): boolean {
    const first = normalizeNameToken(fullName);
    return rule.allowedFirstNames.includes(first);
}
