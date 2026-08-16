/**
 * Política de backdrop por capa (ADR-0008).
 * Base/sheet: blur + saturate + oscurecimiento.
 * Derived/system: solo oscurecimiento (sin blur/saturate acumulado).
 */

import type { ModalLayer } from './modal-layers';

export type ModalBackdropKind = 'base' | 'elevated';

/** Valores canónicos del contrato (no inventar blur/saturate distintos). */
export const MODAL_BACKDROP_BASE = {
    blurPx: 8,
    saturatePercent: 65,
    background: 'rgba(0, 0, 0, 0.32)',
    filter: 'blur(8px) saturate(65%)',
} as const;

/** Oscurecimiento adicional sin filtros (capas superiores). */
export const MODAL_BACKDROP_ELEVATED = {
    background: 'rgba(0, 0, 0, 0.28)',
    filter: 'none',
} as const;

export function resolveModalBackdropKind(layer: ModalLayer): ModalBackdropKind {
    switch (layer) {
        case 'base':
        case 'sheet':
            return 'base';
        case 'derived':
        case 'system':
            return 'elevated';
        default: {
            const _exhaustive: never = layer;
            return _exhaustive;
        }
    }
}

/** Atributo `data-modal-backdrop` consumido por CSS global. */
export function modalBackdropDataAttr(layer: ModalLayer): ModalBackdropKind {
    return resolveModalBackdropKind(layer);
}
