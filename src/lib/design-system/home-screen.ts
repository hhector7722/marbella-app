/**
 * Rejilla de inicio (T1). Una página de Springboard: 4 columnas × 6 filas.
 * Cada pista = squircle + nombre de un atajo (una línea). Entre pistas, solo --home-row-gap.
 */

export const HOME_SCREEN_COMPONENT_ID = 'HomeScreen' as const;

export const HOME_SCREEN_COLUMNS = 4;
export const HOME_SCREEN_ROWS = 6;

export const HOME_SCREEN_SLOT_SIZES = ['icon', 'small', 'medium', 'large', 'wide', 'half', 'panel', 'tile'] as const;

export type HomeScreenSlotSize = (typeof HOME_SCREEN_SLOT_SIZES)[number];

/** Mosaicos con áreas fijas. `ops-admin`: Cambio 1/2 son widgets 1×1. `staff`: semana 4×1. `master`: semana y horarios. */
export const HOME_SCREEN_LAYOUTS = ['ops-admin', 'staff', 'master'] as const;

export type HomeScreenLayout = (typeof HOME_SCREEN_LAYOUTS)[number];

/** Huecos de icono (columnas × filas) que ocupa cada tamaño. */
export const HOME_SCREEN_SLOT_SPAN: Record<HomeScreenSlotSize, { cols: number; rows: number }> = {
    icon: { cols: 1, rows: 1 },
    small: { cols: 2, rows: 2 },
    medium: { cols: 4, rows: 2 },
    large: { cols: 4, rows: 4 },
    wide: { cols: 4, rows: 1 },
    half: { cols: 2, rows: 1 },
    panel: { cols: 3, rows: 2 },
    tile: { cols: 1, rows: 1 },
};

export function isHomeScreenSlotSize(value: string): value is HomeScreenSlotSize {
    return (HOME_SCREEN_SLOT_SIZES as readonly string[]).includes(value);
}

export type HomeWidgetScheme = 'light' | 'dark';

/** Umbral iOS-like: el cielo `#5B8FB9` queda en claro; el envolvente `#15345C` en oscuro. */
export const HOME_WIDGET_DARK_LUMINANCE = 0.22;

export function parseCssColor(input: string): { r: number; g: number; b: number } | null {
    const s = input.trim().toLowerCase();
    const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (hex) {
        const h = hex[1];
        if (h.length === 3) {
            return {
                r: parseInt(h[0] + h[0], 16),
                g: parseInt(h[1] + h[1], 16),
                b: parseInt(h[2] + h[2], 16),
            };
        }
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }
    const rgb = s.match(/^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)/);
    if (rgb) {
        return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    }
    return null;
}

export function relativeLuminance(color: string): number {
    const rgb = parseCssColor(color);
    if (!rgb) return 0.5;
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/**
 * Cristal claro u oscuro. Sigue el wallpaper; el modo oscuro del sistema
 * solo cuenta si se pide (la app vive en `html.light`).
 */
export function resolveHomeWidgetScheme(
    wallpaper: string,
    options?: { prefersDark?: boolean },
): HomeWidgetScheme {
    if (relativeLuminance(wallpaper) < HOME_WIDGET_DARK_LUMINANCE) return 'dark';
    if (options?.prefersDark) return 'dark';
    return 'light';
}
