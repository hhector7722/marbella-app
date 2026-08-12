// ============================================================
// MODELO DE COMPOSICIÓN DEL STUDIO
//
// Un componente con icono y texto se describe con propiedades
// independientes, no con modos cerrados. Cada propiedad hace una
// sola cosa: ninguna decide fondo, borde, sombra ni tamaño.
//
//   COMPONENTE → CAJA DE ICONO → ASSET
//   TEXTO (pieza independiente)
//
// Módulo puro: no toca el DOM, por eso es verificable con tests.
// ============================================================

import type { VisualOverride } from './types';

/** Atributos de datos que el DOM recibe para resolver la composición por CSS. */
export type CompositionAttributes = {
    layout?: 'vertical' | 'horizontal';
    order?: 'icon-text' | 'text-icon';
    align?: 'start' | 'center' | 'end';
    hideText?: true;
    hideIcon?: true;
    iconBox?: 'none' | 'box' | 'square';
};

/**
 * Los modos cerrados antiguos se leen como lo que realmente significaban:
 * una combinación de propiedades independientes. Así las estéticas ya
 * guardadas conservan su aspecto y el modelo deja de tener modos.
 * El Studio nunca vuelve a escribir `composition`.
 */
export function expandLegacyComposition(override: VisualOverride): VisualOverride {
    if (!override.composition) return override;

    const expanded: VisualOverride = {
        layoutDirection: 'vertical',
        layoutOrder: 'icon-text',
        layoutAlign: 'center',
    };
    if (override.composition === 'icon-only') expanded.showText = false;
    if (override.composition === 'text-only') expanded.showIcon = false;
    if (override.composition === 'outside') {
        // El modo antiguo vaciaba la superficie del componente para que la
        // caja del icono fuese la única pieza con fondo.
        expanded.tone = 'transparent';
        expanded.borderWidth = '0px';
        expanded.boxShadow = 'none';
    }

    // Lo escrito explícitamente por el usuario siempre gana.
    return { ...expanded, ...override };
}

/**
 * Traduce el override a atributos de composición. Solo lee las propiedades
 * de composición: nunca deriva ni modifica color, tamaño o espaciado.
 */
export function compositionAttributes(override: VisualOverride): CompositionAttributes {
    const attributes: CompositionAttributes = {};
    if (override.layoutDirection) attributes.layout = override.layoutDirection;
    if (override.layoutOrder) attributes.order = override.layoutOrder;
    if (override.layoutAlign) attributes.align = override.layoutAlign;
    if (override.showText === false) attributes.hideText = true;
    if (override.showIcon === false) attributes.hideIcon = true;
    if (override.iconBoxMode) attributes.iconBox = override.iconBoxMode;
    return attributes;
}

/** Propiedades que pertenecen a la composición y a nadie más. */
export const COMPOSITION_KEYS = [
    'showText',
    'showIcon',
    'layoutDirection',
    'layoutOrder',
    'layoutAlign',
] as const satisfies readonly (keyof VisualOverride)[];
