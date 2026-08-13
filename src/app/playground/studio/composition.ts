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

/**
 * Presets cómodos: solo escriben combinaciones de propiedades
 * independientes. Nunca reintroducen el enum `composition`.
 *
 * Cada preset produce dos ámbitos:
 * - host: el COMPONENTE (layout + superficie del contenedor)
 * - iconBox: la CAJA ICONO (hermana del texto)
 */
export type CompositionPresetId = 'together' | 'icon-card-text-out' | 'separated';

export type CompositionPresetPatches = {
    host: VisualOverride;
    iconBox: VisualOverride;
};

const CLEAR_HOST_SURFACE: VisualOverride = {
    tone: undefined,
    backgroundColor: undefined,
    fillColor: undefined,
    borderWidth: undefined,
    borderColor: undefined,
    boxShadow: undefined,
    customPadding: undefined,
};

const CLEAR_ICON_BOX_SURFACE: VisualOverride = {
    tone: undefined,
    backgroundColor: undefined,
    fillColor: undefined,
    borderWidth: undefined,
    borderColor: undefined,
    boxShadow: undefined,
    iconBoxCorner: undefined,
    customPadding: undefined,
    width: undefined,
    height: undefined,
};

export function compositionPresetPatches(id: CompositionPresetId): CompositionPresetPatches {
    const sharedLayout: VisualOverride = {
        showText: true,
        showIcon: true,
        layoutDirection: 'vertical',
        layoutOrder: 'icon-text',
        layoutAlign: 'center',
    };

    if (id === 'together') {
        // Icono + texto dentro de la misma superficie del componente.
        // La caja del icono no pinta card propia.
        return {
            host: {
                ...CLEAR_HOST_SURFACE,
                ...sharedLayout,
            },
            iconBox: {
                ...CLEAR_ICON_BOX_SURFACE,
                iconBoxMode: 'none',
            },
        };
    }

    if (id === 'separated') {
        // Ni el componente ni la caja aportan card: asset y texto flotan.
        return {
            host: {
                ...sharedLayout,
                tone: 'transparent',
                borderWidth: '0px',
                boxShadow: 'none',
                customPadding: '0px',
                backgroundColor: undefined,
                fillColor: undefined,
                borderColor: undefined,
            },
            iconBox: {
                ...CLEAR_ICON_BOX_SURFACE,
                iconBoxMode: 'none',
            },
        };
    }

    // icon-card-text-out — la card es SOLO de la caja; el texto es hermano.
    return {
        host: {
            ...sharedLayout,
            gap: '8px',
            tone: 'transparent',
            borderWidth: '0px',
            boxShadow: 'none',
            customPadding: '0px',
            backgroundColor: undefined,
            fillColor: undefined,
            borderColor: undefined,
        },
        iconBox: {
            iconBoxMode: 'box',
            tone: 'custom',
            backgroundColor: '#ffffff',
            borderWidth: '1px',
            borderColor: '#f3f4f6',
            boxShadow: 'subtle',
            iconBoxCorner: '16px',
            customPadding: '8px',
        },
    };
}

/**
 * Heurística de lectura para resaltar el preset activo.
 * No es una fuente de verdad: el estado real son las propiedades.
 */
export function detectCompositionPreset(
    host: VisualOverride,
    iconBox: VisualOverride,
): CompositionPresetId | null {
    const layoutOk = (host.layoutDirection === 'vertical' || !host.layoutDirection)
        && (host.layoutOrder === 'icon-text' || !host.layoutOrder)
        && host.showText !== false
        && host.showIcon !== false;

    if (!layoutOk) return null;

    const hostTransparent = host.tone === 'transparent';
    const boxMode = iconBox.iconBoxMode;

    if (hostTransparent && (boxMode === 'box' || boxMode === 'square')) {
        return 'icon-card-text-out';
    }
    if (hostTransparent && (boxMode === 'none' || !boxMode)) {
        return 'separated';
    }
    if (!hostTransparent && (boxMode === 'none' || !boxMode)) {
        return 'together';
    }
    return null;
}