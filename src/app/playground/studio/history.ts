// ============================================================
// HISTORIAL DE EDICIÓN DEL STUDIO
//
// past / present / future con snapshots completos del draft.
// Una pulsación de Deshacer o Rehacer mueve exactamente un paso.
// Una acción nueva tras Deshacer descarta la rama de Rehacer.
// ============================================================

export type EditSnapshot = {
    id: string;
    recipe: Record<string, unknown>;
    overrides: Record<string, unknown>;
    fontFamily?: string;
    globalScale?: string;
    background?: unknown;
};

export type HistoryState<T> = {
    past: T[];
    present: T;
    future: T[];
};

const DEFAULT_LIMIT = 100;

/** Copia profunda para que un snapshot no se mute desde el draft vivo. */
export function cloneSnapshot<T>(value: T): T {
    return structuredClone(value);
}

export function createHistory<T>(present: T): HistoryState<T> {
    return { past: [], present: cloneSnapshot(present), future: [] };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
    return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
    return history.future.length > 0;
}

/**
 * Confirma una acción del usuario. El present actual pasa a past y
 * la rama de rehacer se vacía. Si el nuevo estado es idéntico al
 * presente, no se crea entrada (evita ruido de renders/sync).
 */
export function pushHistory<T>(
    history: HistoryState<T>,
    next: T,
    limit = DEFAULT_LIMIT,
): HistoryState<T> {
    const serializedPresent = JSON.stringify(history.present);
    const serializedNext = JSON.stringify(next);
    if (serializedPresent === serializedNext) return history;

    const past = [...history.past, cloneSnapshot(history.present)];
    while (past.length > limit) past.shift();

    return {
        past,
        present: cloneSnapshot(next),
        future: [],
    };
}

/** Retrocede exactamente una acción. */
export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
    if (history.past.length === 0) return history;
    const past = history.past.slice(0, -1);
    const present = history.past[history.past.length - 1]!;
    return {
        past,
        present: cloneSnapshot(present),
        future: [cloneSnapshot(history.present), ...history.future],
    };
}

/** Avanza exactamente una acción. */
export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
    if (history.future.length === 0) return history;
    const [next, ...future] = history.future;
    return {
        past: [...history.past, cloneSnapshot(history.present)],
        present: cloneSnapshot(next!),
        future,
    };
}

/**
 * Sustituye el presente sin empujar al historial. Sirve al cambiar
 * de estética: el draft se realinea y el historial arranca limpio.
 */
export function resetHistory<T>(present: T): HistoryState<T> {
    return createHistory(present);
}

/** True si el foco está en un campo donde Ctrl/Cmd+Z debe ser nativo. */
export function isNativeTextEditingTarget(target: EventTarget | null): boolean {
    if (!target || typeof target !== 'object') return false;
    const el = target as {
        tagName?: string;
        isContentEditable?: boolean;
        closest?: (selector: string) => unknown;
    };
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (typeof el.closest === 'function') {
        return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
    }
    return false;
}
