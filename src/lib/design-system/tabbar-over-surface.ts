/**
 * Contraste adaptativo de la TabBar: cristal de widgets sobre fondo oscuro,
 * cristal del envolvente cuando debajo hay papel claro.
 */

export type TabBarOverSurface = 'dark' | 'light';

export type CssRgba = { r: number; g: number; b: number; a: number };

/** Umbral de luminancia relativa WCAG: por encima se trata como papel claro. */
export const TABBAR_LIGHT_LUMINANCE = 0.72;

/** Alpha mínimo para considerar un fondo “pintado” (no solo tinte). */
export const TABBAR_OPAQUE_ALPHA = 0.55;

export function parseCssRgba(input: string): CssRgba | null {
    const value = input.trim().toLowerCase();
    if (!value || value === 'transparent') return null;

    const rgb = value.match(
        /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
    );
    if (rgb) {
        const aRaw = rgb[4];
        let a = 1;
        if (aRaw != null) {
            a = aRaw.endsWith('%') ? Number.parseFloat(aRaw) / 100 : Number.parseFloat(aRaw);
        }
        return {
            r: Number.parseFloat(rgb[1]),
            g: Number.parseFloat(rgb[2]),
            b: Number.parseFloat(rgb[3]),
            a: Number.isFinite(a) ? a : 1,
        };
    }

    return null;
}

export function relativeLuminance({ r, g, b }: Pick<CssRgba, 'r' | 'g' | 'b'>): number {
    const channel = (v: number) => {
        const c = Math.min(255, Math.max(0, v)) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const R = channel(r);
    const G = channel(g);
    const B = channel(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function isLightSurfaceColor(
    color: CssRgba,
    luminanceThreshold = TABBAR_LIGHT_LUMINANCE,
    opaqueAlpha = TABBAR_OPAQUE_ALPHA
): boolean {
    if (color.a < opaqueAlpha) return false;
    return relativeLuminance(color) >= luminanceThreshold;
}

/**
 * Sube el árbol desde `start` hasta encontrar un fondo suficientemente opaco.
 * Omite el propio TabBar y sus hijos.
 */
export function resolvePaintedBackground(
    start: Element | null,
    skipRoot: Element
): CssRgba | null {
    let node: Element | null = start;
    while (node && node !== document.documentElement) {
        if (!skipRoot.contains(node)) {
            const bg = getComputedStyle(node).backgroundColor;
            const parsed = parseCssRgba(bg);
            if (parsed && parsed.a >= TABBAR_OPAQUE_ALPHA) {
                return parsed;
            }
        }
        node = node.parentElement;
    }
    return null;
}

export function sampleTabBarOverSurface(nav: HTMLElement): TabBarOverSurface {
    const rect = nav.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return 'dark';

    const points: Array<[number, number]> = [
        [rect.left + rect.width * 0.2, rect.top + rect.height * 0.55],
        [rect.left + rect.width * 0.5, rect.top + rect.height * 0.55],
        [rect.left + rect.width * 0.8, rect.top + rect.height * 0.55],
    ];

    let lightVotes = 0;
    let paintedVotes = 0;

    for (const [x, y] of points) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;

        const stack = document.elementsFromPoint(x, y);
        let hit: Element | null = null;
        for (const el of stack) {
            if (el === nav || nav.contains(el)) continue;
            hit = el;
            break;
        }
        if (!hit) continue;

        const painted = resolvePaintedBackground(hit, nav);
        if (!painted) continue;
        paintedVotes += 1;
        if (isLightSurfaceColor(painted)) lightVotes += 1;
    }

    if (paintedVotes === 0) return 'dark';
    // Mayoría de muestras claras → papel bajo la cápsula.
    return lightVotes * 2 >= paintedVotes + 1 ? 'light' : 'dark';
}
