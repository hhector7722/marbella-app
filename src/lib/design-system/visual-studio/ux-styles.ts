import { getStudioElement } from './catalog.ts';
import type { PropertyDef, StudioElement } from './types.ts';

export type StudioScreen = 'home' | 'edit' | 'essays' | 'confirm' | 'done';

export type StylePreviewKind = 'page' | 'modal';

export type ButtonRole = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export type StyleType = {
    id: string;
    title: string;
    blurb: string;
    elementId: string;
    preview: StylePreviewKind;
    propertyIds: readonly string[];
    buttonVariant?: ButtonRole;
    ripple: string;
    decided?: boolean;
    decidedCopy?: string;
    shapeShared?: boolean;
};

export const BUTTON_SHAPE_PROPERTY_IDS = ['height', 'radius', 'px'] as const;

export const STYLE_TYPES: readonly StyleType[] = [
    {
        id: 'page-header',
        title: 'Cabecera de pantalla',
        blurb: 'La franja de título de las pantallas de gestión.',
        elementId: 'page-header',
        preview: 'page',
        propertyIds: ['height', 'px', 'py', 'align-x', 'align-y', 'title-size'],
        ripple: 'Esto cambia todas las pantallas que usan la plantilla.',
    },
    {
        id: 'modal-header',
        title: 'Cabecera de ventana',
        blurb: 'La franja de título de los modales. No es la de las pantallas.',
        elementId: 'modal-header',
        preview: 'modal',
        propertyIds: ['height', 'inset', 'align-x'],
        ripple: 'Esto cambia todos los modales de Marbella.',
    },
    {
        id: 'button-save',
        title: 'Botón de guardar',
        blurb: 'Guardar, confirmar, crear, aplicar.',
        elementId: 'button',
        preview: 'page',
        propertyIds: ['height', 'radius', 'px', 'fill-primary'],
        buttonVariant: 'primary',
        ripple: 'Esto cambia todos los botones de guardar de Marbella.',
        shapeShared: true,
    },
    {
        id: 'button-cancel',
        title: 'Botón de cancelar',
        blurb: 'Cancelar, volver, cerrar.',
        elementId: 'button',
        preview: 'page',
        propertyIds: ['height', 'radius', 'px', 'fill-secondary'],
        buttonVariant: 'secondary',
        ripple: 'Esto cambia todos los botones de cancelar de Marbella.',
        shapeShared: true,
    },
    {
        id: 'button-filter',
        title: 'Botón de filtro',
        blurb: 'Filtro y acciones de menor jerarquía. No es el selector de opciones.',
        elementId: 'button',
        preview: 'page',
        propertyIds: ['height', 'radius', 'px', 'fill-tertiary'],
        buttonVariant: 'tertiary',
        ripple: 'Esto cambia todos los botones de filtro de Marbella.',
        shapeShared: true,
    },
    {
        id: 'button-destroy',
        title: 'Botón de eliminar',
        blurb: 'Eliminar y acciones destructivas.',
        elementId: 'button',
        preview: 'page',
        propertyIds: ['height', 'radius', 'px', 'fill-destructive'],
        buttonVariant: 'destructive',
        ripple: 'Esto cambia todos los botones de eliminar de Marbella.',
        shapeShared: true,
    },
    {
        id: 'field',
        title: 'Campos',
        blurb: 'Textos, números y listas de un formulario.',
        elementId: 'field',
        preview: 'page',
        propertyIds: ['height', 'radius', 'px', 'focus', 'label-gap'],
        ripple: 'Esto cambia todos los campos de Marbella.',
    },
    {
        id: 'selector',
        title: 'Selectores',
        blurb: 'Elegir una opción entre pocas. No es un botón.',
        elementId: 'petroleum-segmented',
        preview: 'page',
        propertyIds: [],
        decided: true,
        decidedCopy:
            'Este diseño ya es oficial y no se cambia desde aquí. No es un botón de filtro.',
        ripple: 'Los selectores no se cambian desde aquí.',
    },
];

export function styleTypeById(id: string): StyleType {
    return STYLE_TYPES.find((item) => item.id === id) ?? STYLE_TYPES[0]!;
}

export function styleTypeForParam(id: string): StyleType {
    const direct = STYLE_TYPES.find((item) => item.id === id);
    if (direct) return direct;
    const byElement = STYLE_TYPES.find((item) => item.elementId === id);
    if (byElement) return byElement;
    if (id === 'button') return styleTypeById('button-save');
    if (id === 'modal') return styleTypeById('modal-header');
    if (id === 'pagescreen') return styleTypeById('page-header');
    if (id === 'radio-segmented' || id === 'timefilter-chrome') return styleTypeById('selector');
    return STYLE_TYPES[0]!;
}

export function propertiesForStyle(element: StudioElement, style: StyleType): PropertyDef[] {
    if (style.decided) return [];
    return element.properties.filter((property) => style.propertyIds.includes(property.id));
}

export function styleTypeValid(style: StyleType): boolean {
    const element = getStudioElement(style.elementId);
    if (!element) return false;
    if (style.decided) return true;
    return style.propertyIds.every((id) => element.properties.some((property) => property.id === id));
}
