/**
 * Capas semánticas de overlay y pila de Escape.
 * ADR-0007: máximo una superficie `derived` sobre un `base`.
 */

export const MODAL_LAYERS = ['base', 'derived', 'system', 'sheet'] as const;

export type ModalLayer = (typeof MODAL_LAYERS)[number];

/** Clases z-index alineadas con `--z-modal-*` en globals.css. */
export const MODAL_LAYER_Z_CLASS: Record<ModalLayer, string> = {
    base: 'z-[var(--z-modal-base)]',
    derived: 'z-[var(--z-modal-derived)]',
    system: 'z-[var(--z-modal-system)]',
    sheet: 'z-[var(--z-modal-sheet)]',
};

type StackEntry = {
    id: string;
    layer: ModalLayer;
    onEscape: () => void;
};

const stack: StackEntry[] = [];
let escapeListenerBound = false;
let stackVersion = 0;
const stackListeners = new Set<() => void>();

function emitStackChange() {
    stackVersion += 1;
    for (const listener of stackListeners) {
        listener();
    }
}

/** Suscripción para re-render cuando cambia la pila (p. ej. subordinación visual). */
export function subscribeModalSurfaceStack(onStoreChange: () => void): () => void {
    stackListeners.add(onStoreChange);
    return () => {
        stackListeners.delete(onStoreChange);
    };
}

export function getModalSurfaceStackVersion(): number {
    return stackVersion;
}

/** Superficie cubierta por otra capa → pierde protagonismo visual. */
export function isModalSurfaceSubordinate(surfaceId: string): boolean {
    const idx = stack.findIndex((e) => e.id === surfaceId);
    if (idx < 0) return false;
    return idx < stack.length - 1;
}

function onDocumentEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (!top) return;
    event.preventDefault();
    event.stopPropagation();
    top.onEscape();
}

function bindEscapeListener() {
    if (escapeListenerBound || typeof document === 'undefined') return;
    document.addEventListener('keydown', onDocumentEscape, true);
    escapeListenerBound = true;
}

function unbindEscapeListenerIfEmpty() {
    if (stack.length > 0 || !escapeListenerBound || typeof document === 'undefined') return;
    document.removeEventListener('keydown', onDocumentEscape, true);
    escapeListenerBound = false;
}

export type RegisterModalSurfaceResult =
    | { ok: true; unregister: () => void }
    | { ok: false; reason: 'derived-already-open' | 'derived-without-base' };

/**
 * Registra una superficie en la pila.
 * `derived` exige un `base` previo y rechaza una segunda `derived` (ADR-0007).
 */
export function registerModalSurface(entry: StackEntry): RegisterModalSurfaceResult {
    if (entry.layer === 'derived') {
        if (!stack.some((e) => e.layer === 'base')) {
            return { ok: false, reason: 'derived-without-base' };
        }
        if (stack.some((e) => e.layer === 'derived')) {
            return { ok: false, reason: 'derived-already-open' };
        }
    }

    stack.push(entry);
    bindEscapeListener();
    emitStackChange();

    return {
        ok: true,
        unregister: () => {
            const idx = stack.findIndex((e) => e.id === entry.id);
            if (idx >= 0) stack.splice(idx, 1);
            unbindEscapeListenerIfEmpty();
            emitStackChange();
        },
    };
}

/** Solo tests: dispara Escape sobre la cima de la pila. */
export function dispatchModalEscapeForTests(): void {
    const top = stack[stack.length - 1];
    top?.onEscape();
}

/** Solo tests / depuración. */
export function getModalSurfaceStackSnapshot(): ReadonlyArray<{ id: string; layer: ModalLayer }> {
    return stack.map(({ id, layer }) => ({ id, layer }));
}

/** Solo tests. */
export function resetModalSurfaceStackForTests(): void {
    stack.length = 0;
    if (escapeListenerBound && typeof document !== 'undefined') {
        document.removeEventListener('keydown', onDocumentEscape, true);
    }
    escapeListenerBound = false;
    emitStackChange();
}

export function hasDerivedModalSurface(): boolean {
    return stack.some((e) => e.layer === 'derived');
}
