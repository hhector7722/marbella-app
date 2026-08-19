/**
 * Historial de navegación padre→hijo del Modal.
 * Separado de las capas semánticas (modal-layers). Navegación ≠ layer ≠ z-index.
 */

import type { ModalLayer } from './modal-layers.ts';

export type ModalHistorySnapshotEntry = {
    surfaceId: string;
    instance: string | undefined;
    parentInstance: string | undefined;
    layer: ModalLayer;
    parked: boolean;
};

type HistoryEntry = ModalHistorySnapshotEntry & {
    dismiss: () => void;
    restore: () => void;
};

const entries = new Map<string, HistoryEntry>();
const dismissingIds = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function bump(): void {
    version += 1;
    for (const listener of listeners) listener();
}

export function subscribeModalHistory(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getModalHistoryVersion(): number {
    return version;
}

function get(surfaceId: string): HistoryEntry | undefined {
    return entries.get(surfaceId);
}

/**
 * Resuelve el padre por identidad semántica entre entradas vivas.
 * No usa la pila de overlay ni la layer. `system` nunca es padre.
 */
export function resolveModalHistoryParentSurfaceId(
    parentInstance: string | undefined,
    childSurfaceId: string
): string | undefined {
    if (!parentInstance) return undefined;
    const list = [...entries.values()];
    for (let i = list.length - 1; i >= 0; i--) {
        const candidate = list[i]!;
        if (candidate.surfaceId === childSurfaceId) continue;
        if (candidate.layer === 'system') continue;
        if (candidate.instance === parentInstance) return candidate.surfaceId;
    }
    return undefined;
}

function childrenOf(parentSurfaceId: string): HistoryEntry[] {
    return [...entries.values()].filter(
        (entry) => resolveModalHistoryParentSurfaceId(entry.parentInstance, entry.surfaceId) === parentSurfaceId
    );
}

function chainDeepestFirst(rootSurfaceId: string): HistoryEntry[] {
    const result: HistoryEntry[] = [];
    const visit = (id: string) => {
        for (const child of childrenOf(id)) visit(child.surfaceId);
        const entry = get(id);
        if (entry) result.push(entry);
    };
    visit(rootSurfaceId);
    return result;
}

export function hasLiveModalParent(surfaceId: string): boolean {
    const entry = get(surfaceId);
    if (!entry || entry.layer === 'system') return false;
    const parentId = resolveModalHistoryParentSurfaceId(entry.parentInstance, surfaceId);
    if (!parentId) return false;
    return entries.has(parentId);
}

export type RegisterModalHistoryInput = {
    surfaceId: string;
    instance?: string;
    parentInstance?: string;
    layer: ModalLayer;
    dismiss: () => void;
    restore: () => void;
};

/** Upsert. Varias aperturas de la misma `instance` conviven con `surfaceId` distintos. */
export function registerModalHistory(input: RegisterModalHistoryInput): void {
    const existing = entries.get(input.surfaceId);
    if (existing) {
        existing.instance = input.instance;
        existing.parentInstance = input.parentInstance;
        existing.layer = input.layer;
        existing.dismiss = input.dismiss;
        existing.restore = input.restore;
        existing.parked = false;
        bump();
        return;
    }
    entries.set(input.surfaceId, {
        surfaceId: input.surfaceId,
        instance: input.instance,
        parentInstance: input.parentInstance,
        layer: input.layer,
        parked: false,
        dismiss: input.dismiss,
        restore: input.restore,
    });
    bump();
}

export function notifyModalHistoryOpen(surfaceId: string): void {
    const entry = get(surfaceId);
    if (!entry) return;
    entry.parked = false;
    bump();
}

/**
 * Cierre del consumidor (`open=false`) sin desmontar.
 * Si hay hijos vivos, se aparca para poder restaurar la misma instancia.
 */
export function notifyModalHistoryClose(surfaceId: string): void {
    if (dismissingIds.has(surfaceId)) return;
    const entry = get(surfaceId);
    if (!entry) return;
    if (childrenOf(surfaceId).length > 0) {
        entry.parked = true;
        bump();
        return;
    }
    entries.delete(surfaceId);
    bump();
}

/** Desmontaje real: no deja refs a superficies inexistentes. */
export function unregisterModalHistory(surfaceId: string): void {
    if (!entries.has(surfaceId)) return;
    entries.delete(surfaceId);
    bump();
}

function popModalHistory(surfaceId: string): void {
    const entry = get(surfaceId);
    if (!entry) return;
    const parentId = resolveModalHistoryParentSurfaceId(entry.parentInstance, surfaceId);
    dismissingIds.add(surfaceId);
    entry.dismiss();
    entries.delete(surfaceId);
    dismissingIds.delete(surfaceId);
    if (parentId) {
        const parent = get(parentId);
        if (parent?.parked) parent.restore();
    }
    bump();
}

function dismissModalHistoryChain(rootSurfaceId: string): void {
    const chain = chainDeepestFirst(rootSurfaceId);
    for (const entry of chain) dismissingIds.add(entry.surfaceId);
    for (const entry of chain) entry.dismiss();
    for (const entry of chain) {
        entries.delete(entry.surfaceId);
        dismissingIds.delete(entry.surfaceId);
    }
    bump();
}

/**
 * Política de cierre del chrome (←, X, Escape, backdrop).
 * `system` no participa: el overlay lo cierra como cima de pila.
 */
export function requestModalClose(surfaceId: string): boolean {
    const entry = get(surfaceId);
    if (!entry || entry.layer === 'system') return false;
    if (hasLiveModalParent(surfaceId)) {
        popModalHistory(surfaceId);
        return true;
    }
    dismissModalHistoryChain(surfaceId);
    return true;
}

export function getModalHistorySnapshot(): ReadonlyArray<ModalHistorySnapshotEntry> {
    return [...entries.values()].map(({ surfaceId, instance, parentInstance, layer, parked }) => ({
        surfaceId,
        instance,
        parentInstance,
        layer,
        parked,
    }));
}

export function resetModalHistoryForTests(): void {
    entries.clear();
    dismissingIds.clear();
    version += 1;
}
