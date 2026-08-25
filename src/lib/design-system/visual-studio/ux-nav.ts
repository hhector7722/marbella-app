import {
    HEADER_SPECIALIZED_IDS,
    STUDIO_ELEMENTS,
} from './catalog.ts';
import type { StudioElement } from './types.ts';

export type UxFamilyId =
    | 'buttons'
    | 'fields'
    | 'headers'
    | 'modals'
    | 'surfaces'
    | 'tables'
    | 'filters'
    | 'spacing'
    | 'typography'
    | 'colors'
    | 'selectors'
    | 'notices'
    | 'empty'
    | 'loading'
    | 'lists'
    | 'radius'
    | 'elevation'
    | 'touch'
    | 'focus'
    | 'screens'
    | 'calendar'
    | 'alignment';

export type UxFamily = {
    id: UxFamilyId;
    label: string;
    blurb: string;
    /** Atajos de la pantalla de entrada. */
    home: boolean;
    elementIds: readonly string[];
    /** Piezas que no son un tipo de decisión (p. ej. cabeceras de una sola pantalla). */
    otherIds?: readonly string[];
};

export type UxHeaderType = {
    id: string;
    label: string;
    blurb: string;
    /** Si apunta a otro elemento del catálogo (cabecera de tabla → tabla). */
    targetId?: string;
};

/**
 * Un elemento heredado no es un tipo que el usuario elija.
 * Se explica junto al padre.
 */
export const UX_COVERED_BY: Record<string, string> = {
    'derived-modal-header': 'modal-header',
};

export const UX_HEADER_TYPES: readonly UxHeaderType[] = [
    {
        id: 'page-header',
        label: 'Página',
        blurb: 'Cabecera principal de una pantalla.',
    },
    {
        id: 'block-header',
        label: 'Tarjeta / bloque',
        blurb: 'Cabecera de una superficie dentro de una página.',
    },
    {
        id: 'modal-header',
        label: 'Modal',
        blurb: 'Cabecera de ventanas y diálogos.',
    },
    {
        id: 'table-header',
        label: 'Tabla',
        blurb: 'Cabecera de columnas.',
        targetId: 'table',
    },
];

export const UX_FAMILIES: readonly UxFamily[] = [
    {
        id: 'buttons',
        label: 'Botones',
        blurb: 'Acciones que se pulsan.',
        home: true,
        elementIds: ['button'],
    },
    {
        id: 'fields',
        label: 'Campos',
        blurb: 'Textos, búsqueda y cantidades.',
        home: true,
        elementIds: ['field', 'search', 'quantity-stepper'],
    },
    {
        id: 'headers',
        label: 'Cabeceras',
        blurb: 'Títulos de pantalla, bloque, ventana y tabla.',
        home: true,
        elementIds: UX_HEADER_TYPES.map((item) => item.id),
        otherIds: HEADER_SPECIALIZED_IDS,
    },
    {
        id: 'modals',
        label: 'Modales',
        blurb: 'Ventanas y diálogos.',
        home: true,
        elementIds: ['modal'],
    },
    {
        id: 'surfaces',
        label: 'Tarjetas / bloques',
        blurb: 'Superficies dentro de una pantalla.',
        home: true,
        elementIds: ['surface'],
    },
    {
        id: 'tables',
        label: 'Tablas',
        blurb: 'Filas, columnas e importes.',
        home: true,
        elementIds: ['table'],
    },
    {
        id: 'filters',
        label: 'Filtros',
        blurb: 'Periodos y grupos de opciones.',
        home: true,
        elementIds: ['timefilter-chrome', 'petroleum-segmented'],
    },
    {
        id: 'spacing',
        label: 'Espaciado',
        blurb: 'Separación entre elementos.',
        home: true,
        elementIds: ['spacing'],
    },
    {
        id: 'typography',
        label: 'Tipografía',
        blurb: 'Títulos, textos y cifras.',
        home: true,
        elementIds: ['typography'],
    },
    {
        id: 'colors',
        label: 'Colores',
        blurb: 'Marca, avisos y fondos.',
        home: true,
        elementIds: ['color'],
    },
    {
        id: 'selectors',
        label: 'Selectores',
        blurb: 'Listas desplegables, opciones y casillas.',
        home: false,
        elementIds: ['select', 'radio-segmented', 'checkbox'],
    },
    {
        id: 'notices',
        label: 'Avisos',
        blurb: 'Mensajes que permanecen en la pantalla.',
        home: false,
        elementIds: ['notice'],
    },
    {
        id: 'empty',
        label: 'Estados vacíos',
        blurb: 'Cuando todavía no hay nada que mostrar.',
        home: false,
        elementIds: ['empty-state'],
    },
    {
        id: 'loading',
        label: 'Cargas',
        blurb: 'Espera visible mientras llegan los datos.',
        home: false,
        elementIds: ['loading-spinner'],
    },
    {
        id: 'lists',
        label: 'Listados',
        blurb: 'Filas de documentos y registros.',
        home: false,
        elementIds: ['document-list-row'],
    },
    {
        id: 'radius',
        label: 'Radios',
        blurb: 'Esquinas de botones y superficies.',
        home: false,
        elementIds: ['radius'],
    },
    {
        id: 'elevation',
        label: 'Sombras',
        blurb: 'Relieve de página y de bloque.',
        home: false,
        elementIds: ['elevation'],
    },
    {
        id: 'touch',
        label: 'Táctil',
        blurb: 'Tamaño mínimo de lo que se pulsa.',
        home: false,
        elementIds: ['touch-target'],
    },
    {
        id: 'focus',
        label: 'Foco',
        blurb: 'Anillo al enfocar un control.',
        home: false,
        elementIds: ['focus-ring'],
    },
    {
        id: 'screens',
        label: 'Pantallas',
        blurb: 'Plantilla de listado, detalle y formulario.',
        home: false,
        elementIds: ['pagescreen'],
    },
    {
        id: 'calendar',
        label: 'Calendario',
        blurb: 'Cuadrante de días.',
        home: false,
        elementIds: ['calendar'],
    },
    {
        id: 'alignment',
        label: 'Alineación',
        blurb: 'Izquierda, centro o extremos.',
        home: false,
        elementIds: ['layout-alignment'],
    },
];

export const UX_HOME_FAMILIES = UX_FAMILIES.filter((family) => family.home);
export const UX_MORE_FAMILIES = UX_FAMILIES.filter((family) => !family.home);

export type UxContextScene = {
    id: string;
    label: string;
};

const HEADER_SCENES: readonly UxContextScene[] = [
    { id: 'page', label: 'Página' },
    { id: 'list', label: 'Listado' },
    { id: 'detail', label: 'Detalle' },
    { id: 'form', label: 'Formulario' },
];

const BUTTON_SCENES: readonly UxContextScene[] = [
    { id: 'modal', label: 'Modal' },
    { id: 'form', label: 'Formulario' },
    { id: 'list', label: 'Listado' },
    { id: 'table', label: 'Tabla' },
];

export function contextScenesFor(elementId: string): readonly UxContextScene[] {
    if (
        elementId === 'page-header' ||
        elementId === 'pagescreen' ||
        elementId === 'block-header' ||
        elementId === 'surface'
    ) {
        return HEADER_SCENES;
    }
    if (elementId === 'button') return BUTTON_SCENES;
    if (elementId === 'modal' || elementId === 'modal-header' || elementId === 'derived-modal-header') {
        return [
            { id: 'modal', label: 'Ventana' },
            { id: 'form', label: 'Formulario' },
        ];
    }
    if (elementId === 'field' || elementId === 'select' || elementId === 'search') {
        return [
            { id: 'form', label: 'Formulario' },
            { id: 'modal', label: 'Modal' },
        ];
    }
    if (elementId === 'table' || elementId === 'table-header') {
        return [{ id: 'table', label: 'Tabla' }];
    }
    if (elementId === 'empty-state' || elementId === 'document-list-row') {
        return [{ id: 'list', label: 'Listado' }];
    }
    return [];
}

export function familyById(id: UxFamilyId): UxFamily | undefined {
    return UX_FAMILIES.find((family) => family.id === id);
}

export function familiesForElement(elementId: string): UxFamily[] {
    const covered = UX_COVERED_BY[elementId];
    const id = covered ?? elementId;
    return UX_FAMILIES.filter(
        (family) => family.elementIds.includes(id) || family.otherIds?.includes(elementId)
    );
}

export function primaryFamilyFor(elementId: string): UxFamily | undefined {
    const matches = familiesForElement(elementId);
    return matches.find((family) => family.home) ?? matches[0];
}

export function resolveStudioTarget(element: StudioElement): string {
    return element.redirectTo ?? element.id;
}

export function catalogIdsCoveredByUx(): string[] {
    const ids = new Set<string>();
    for (const family of UX_FAMILIES) {
        for (const id of family.elementIds) ids.add(id);
        for (const id of family.otherIds ?? []) ids.add(id);
    }
    for (const id of Object.keys(UX_COVERED_BY)) ids.add(id);
    return [...ids];
}

export function unmappedCatalogIds(): string[] {
    const covered = new Set(catalogIdsCoveredByUx());
    return STUDIO_ELEMENTS.map((item) => item.id).filter((id) => !covered.has(id));
}
