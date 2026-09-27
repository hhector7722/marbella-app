/**
 * Borrador del desglose rápido.
 * Vive en el dispositivo: al volver a abrir el desglose se recuperan las
 * últimas cantidades. Solo el botón «Nuevo» las pone a cero.
 */

export const BREAKDOWN_DRAFT_KEY = 'marbella:quick-breakdown-draft';

const MAX_QTY = 9999;

export type BreakdownCounts = Record<number, number>;

export function parseBreakdownCounts(
    raw: unknown,
    denominations: readonly number[],
): BreakdownCounts {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const source = raw as Record<string, unknown>;
    const out: BreakdownCounts = {};
    for (const denom of denominations) {
        const value = source[String(denom)];
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isInteger(n) || n <= 0 || n > MAX_QTY) continue;
        out[denom] = n;
    }
    return out;
}

export function readBreakdownDraft(denominations: readonly number[]): BreakdownCounts {
    if (typeof window === 'undefined') return {};
    try {
        const stored = window.localStorage.getItem(BREAKDOWN_DRAFT_KEY);
        if (!stored) return {};
        return parseBreakdownCounts(JSON.parse(stored), denominations);
    } catch {
        return {};
    }
}

export function writeBreakdownDraft(
    counts: BreakdownCounts,
    denominations: readonly number[],
): void {
    if (typeof window === 'undefined') return;
    try {
        const clean = parseBreakdownCounts(counts, denominations);
        window.localStorage.setItem(BREAKDOWN_DRAFT_KEY, JSON.stringify(clean));
    } catch {
        // Sin persistencia el recuento sigue en pantalla hasta cerrar el panel.
    }
}
