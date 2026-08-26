import { STUDIO_ELEMENTS, getStudioElement } from './catalog.ts';
import type { PropertyValues, StudioElement } from './types.ts';
import { humanTitle } from './ux-copy.ts';
import { UX_HEADER_TYPES } from './ux-nav.ts';

export type { StudioScreen } from './ux-styles.ts';
export type StudioSceneId = 'list' | 'detail' | 'form' | 'modal' | 'table';

export type StudioSceneDef = {
    id: StudioSceneId;
    label: string;
    title: string;
    action?: string;
};

export type StudioRegion = {
    id: string;
    elementId: string;
    label: string;
    scenes: readonly StudioSceneId[];
};

export type LookShortcut = {
    id: string;
    elementId: string;
    propertyId: string;
    title: string;
    blurb: string;
};

export const STUDIO_SCENES: readonly StudioSceneDef[] = [
    { id: 'list', label: 'Listado', title: 'Albaranes', action: '+' },
    { id: 'detail', label: 'Detalle', title: 'Trabajador' },
    { id: 'form', label: 'Formulario', title: 'Fichaje' },
    { id: 'modal', label: 'Modal', title: 'Albaranes' },
    { id: 'table', label: 'Tabla', title: 'Nóminas' },
];

export const STUDIO_REGIONS: readonly StudioRegion[] = [
    {
        id: 'page-header',
        elementId: 'page-header',
        label: 'Cabecera de página',
        scenes: ['list', 'detail', 'form', 'table'],
    },
    {
        id: 'block-header',
        elementId: 'block-header',
        label: 'Cabecera de tarjeta',
        scenes: ['detail'],
    },
    {
        id: 'modal-header',
        elementId: 'modal-header',
        label: 'Cabecera de modal',
        scenes: ['modal'],
    },
    {
        id: 'empty',
        elementId: 'empty-state',
        label: 'Estado vacío',
        scenes: ['list'],
    },
    {
        id: 'button',
        elementId: 'button',
        label: 'Botón',
        scenes: ['list', 'detail', 'form', 'modal', 'table'],
    },
    {
        id: 'field',
        elementId: 'field',
        label: 'Campo',
        scenes: ['form', 'modal'],
    },
    {
        id: 'filter',
        elementId: 'radio-segmented',
        label: 'Selector de opciones',
        scenes: ['list', 'table'],
    },
    {
        id: 'notice',
        elementId: 'notice',
        label: 'Aviso',
        scenes: ['detail'],
    },
    {
        id: 'row',
        elementId: 'document-list-row',
        label: 'Fila de listado',
        scenes: ['detail'],
    },
    {
        id: 'table',
        elementId: 'table',
        label: 'Tabla',
        scenes: ['table'],
    },
];

/** Atajo Look: solo properties que ya existen en el catálogo. */
export const LOOK_SHORTCUTS: readonly LookShortcut[] = [
    {
        id: 'button-radius',
        elementId: 'button',
        propertyId: 'radius',
        title: 'Botones',
        blurb: 'Más redondos o más cuadrados.',
    },
    {
        id: 'page-header-height',
        elementId: 'page-header',
        propertyId: 'height',
        title: 'Cabeceras de página',
        blurb: 'Más bajas, hasta la del modal.',
    },
    {
        id: 'segmented-density',
        elementId: 'radio-segmented',
        propertyId: 'density',
        title: 'Selectores',
        blurb: 'Cómodos o compactos.',
    },
    {
        id: 'field-height',
        elementId: 'field',
        propertyId: 'height',
        title: 'Campos',
        blurb: 'Más altos o más bajos.',
    },
];

export const HEADER_CHOICES = UX_HEADER_TYPES;

export function sceneById(id: StudioSceneId): StudioSceneDef {
    const found = STUDIO_SCENES.find((item) => item.id === id);
    if (!found) return STUDIO_SCENES[0]!;
    return found;
}

export function regionsForScene(scene: StudioSceneId): StudioRegion[] {
    return STUDIO_REGIONS.filter((region) => region.scenes.includes(scene));
}

export function regionByElementId(elementId: string): StudioRegion | undefined {
    return STUDIO_REGIONS.find((region) => region.elementId === elementId);
}

export function defaultSceneForElement(elementId: string): StudioSceneId {
    if (elementId === 'table' || elementId === 'table-header') return 'table';
    if (elementId === 'modal' || elementId === 'modal-header' || elementId === 'derived-modal-header') {
        return 'modal';
    }
    if (elementId === 'field' || elementId === 'select' || elementId === 'search') return 'form';
    if (elementId === 'block-header' || elementId === 'notice' || elementId === 'document-list-row') {
        return 'detail';
    }
    const region = regionByElementId(elementId);
    return region?.scenes[0] ?? 'list';
}

export function resolveSceneTarget(elementId: string): string {
    const element = getStudioElement(elementId);
    return element?.redirectTo ?? elementId;
}

/** Piezas que se ofrecen como destino de diseño, no como callejón. */
export function canDesignInPrimaryPath(element: StudioElement): boolean {
    if (element.redirectTo) return false;
    if (element.properties.length === 0) return false;
    if (element.status === 'ESPECIALIZADO' || element.status === 'DEPRECADO') return false;
    if (element.status === 'HEREDADO' || element.inherits) return false;
    if (element.applyKind === 'unavailable') return false;
    return true;
}

export function lockedPrimaryCopy(element: StudioElement): string | null {
    if (canDesignInPrimaryPath(element)) return null;
    if (element.status === 'HEREDADO' || element.inherits) {
        return 'Usa el mismo diseño que otra pieza. No se cambia por separado.';
    }
    if (element.status === 'ESPECIALIZADO') {
        return 'Solo se usa en una pantalla concreta. No es el diseño general.';
    }
    if (element.properties.length === 0 || element.applyKind === 'locked') {
        return 'Este diseño ya es oficial y no se cambia desde aquí.';
    }
    if (element.applyKind === 'unavailable') {
        return 'Esta pieza no se diseña por separado.';
    }
    return 'Esta pieza no se cambia desde la escena.';
}

export function regionMatchesQuery(region: StudioRegion, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const title = humanTitle(region.elementId).toLowerCase();
    return title.includes(q) || region.label.toLowerCase().includes(q);
}

export function valuesEqual(a: PropertyValues, b: PropertyValues): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if ((a[key] ?? '') !== (b[key] ?? '')) return false;
    }
    return true;
}

export function lookShortcutValid(shortcut: LookShortcut): boolean {
    const element = STUDIO_ELEMENTS.find((item) => item.id === shortcut.elementId);
    if (!element) return false;
    return element.properties.some((property) => property.id === shortcut.propertyId);
}
