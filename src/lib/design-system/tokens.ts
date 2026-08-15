/**
 * Tokens mínimos del Design System de pantalla — piloto DashboardShortcut.
 *
 * Valores canónicos: marbella-os/2-diseno/TOKENS.md
 * No inventa tokens nuevos: solo materializa los que el piloto necesita.
 */

export const DS_SCREEN_TOKENS = {
    /** TOKENS `color.superficie` */
    colorSuperficie: '#FFFFFF',
    /** TOKENS `color.borde` */
    colorBorde: '#F4F4F5',
    /** TOKENS `color.texto.fuerte` */
    colorTextoFuerte: '#27272A',
    /** TOKENS `radio.superficie` — 16px */
    radioSuperficie: '16px',
    /** TOKENS `radio.control` — 12px */
    radioControl: '12px',
    /** TOKENS `espacio.1` — 4px */
    espacio1: '4px',
    /** TOKENS `espacio.2` — 8px */
    espacio2: '8px',
    /** TOKENS `tactil.minimo` — 48px */
    tactilMinimo: '48px',
    /**
     * Elevación mínima de superficie (TOKENS `elevacion.superficie`).
     * Equivale a Tailwind `shadow-sm`.
     */
    elevacionSuperficie: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
} as const;

/** Nombres de variables CSS emitidas en `:root`. */
export const DS_CSS_VARS = {
    colorSuperficie: '--color-superficie',
    colorBorde: '--color-borde',
    colorTextoFuerte: '--color-texto-fuerte',
    radioSuperficie: '--radio-superficie',
    radioControl: '--radio-control',
    espacio1: '--espacio-1',
    espacio2: '--espacio-2',
    tactilMinimo: '--tactil-minimo',
    elevacionSuperficie: '--elevacion-superficie',
} as const;
