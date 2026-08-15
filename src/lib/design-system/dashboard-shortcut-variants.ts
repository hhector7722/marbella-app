/**
 * Variantes estructurales de DashboardShortcut.
 * Cada variante es un paquete de propiedades independientes de composición.
 * No reintroduce el enum legacy `composition: inside | outside | …`.
 */

export const DASHBOARD_SHORTCUT_COMPONENT_ID = 'DashboardShortcut' as const;

export const DASHBOARD_SHORTCUT_VARIANTS = [
    'icon-text',
    'icon-card-text-outside',
    'separated',
    'icon-only',
    'text-only',
] as const;

export type DashboardShortcutVariant = (typeof DASHBOARD_SHORTCUT_VARIANTS)[number];

export type ShortcutComposition = {
    showText: boolean;
    showIcon: boolean;
    layoutDirection: 'vertical' | 'horizontal';
    layoutOrder: 'icon-text' | 'text-icon';
    layoutAlign: 'start' | 'center' | 'end';
    iconBoxMode: 'none' | 'box' | 'square';
    /** Superficie del host (card blanca vs transparente). */
    hostSurface: 'card' | 'transparent';
    /** Superficie de la caja de icono. */
    iconBoxSurface: 'none' | 'card';
};

const SHARED_LAYOUT = {
    layoutDirection: 'vertical' as const,
    layoutOrder: 'icon-text' as const,
    layoutAlign: 'center' as const,
};

/**
 * Traduce una variante nombrada al modelo de composición independiente.
 * Fuente de verdad de la variante en código de producto (no en Studio).
 */
export function resolveDashboardShortcutVariant(
    variant: DashboardShortcutVariant,
): ShortcutComposition {
    switch (variant) {
        case 'icon-text':
            return {
                ...SHARED_LAYOUT,
                showText: true,
                showIcon: true,
                iconBoxMode: 'none',
                hostSurface: 'card',
                iconBoxSurface: 'none',
            };
        case 'icon-card-text-outside':
            return {
                ...SHARED_LAYOUT,
                showText: true,
                showIcon: true,
                iconBoxMode: 'box',
                hostSurface: 'transparent',
                iconBoxSurface: 'card',
            };
        case 'separated':
            return {
                ...SHARED_LAYOUT,
                showText: true,
                showIcon: true,
                iconBoxMode: 'none',
                hostSurface: 'transparent',
                iconBoxSurface: 'none',
            };
        case 'icon-only':
            return {
                ...SHARED_LAYOUT,
                showText: false,
                showIcon: true,
                iconBoxMode: 'none',
                hostSurface: 'card',
                iconBoxSurface: 'none',
            };
        case 'text-only':
            return {
                ...SHARED_LAYOUT,
                showText: true,
                showIcon: false,
                iconBoxMode: 'none',
                hostSurface: 'card',
                iconBoxSurface: 'none',
            };
        default: {
            const _exhaustive: never = variant;
            return _exhaustive;
        }
    }
}

export function isDashboardShortcutVariant(value: string): value is DashboardShortcutVariant {
    return (DASHBOARD_SHORTCUT_VARIANTS as readonly string[]).includes(value);
}
