/**
 * Tokens mínimos del Design System de pantalla.
 *
 * Valores canónicos: marbella-os/2-diseno/TOKENS.md
 * No inventa tokens nuevos: materializa los que los pilotos necesitan.
 */

export const DS_SCREEN_TOKENS = {
    /** TOKENS `color.superficie` */
    colorSuperficie: '#FFFFFF',
    /** TOKENS `color.borde` */
    colorBorde: '#F4F4F5',
    /** TOKENS `color.texto.fuerte` */
    colorTextoFuerte: '#27272A',
    /** TOKENS `color.marca` */
    colorMarca: '#36606F',
    /** TOKENS `radio.superficie` — 16px */
    radioSuperficie: '16px',
    /** TOKENS `radio.control` — 12px */
    radioControl: '12px',
    /** TOKENS `espacio.1` — 4px */
    espacio1: '4px',
    /** TOKENS `espacio.2` — 8px */
    espacio2: '8px',
    /** TOKENS `espacio.3` — 12px */
    espacio3: '12px',
    /** TOKENS `espacio.4` — 16px */
    espacio4: '16px',
    /** TOKENS `tactil.minimo` — 48px */
    tactilMinimo: '48px',
    /**
     * Elevación mínima de superficie (TOKENS `elevacion.superficie`).
     * Equivale a Tailwind `shadow-sm`.
     */
    elevacionSuperficie: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    /**
     * Elevación de modal (TOKENS `elevacion.modal`).
     * Equivale a Tailwind `shadow-2xl`.
     */
    elevacionModal: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    /**
     * Tope de alto de modal (TOKENS `estructura.alto-modal` ≈ 94% visible − safe-area).
     */
    modalMaxHeight:
        'min(94svh, calc(100svh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem))',
    /** Overlay de modal (backdrop). */
    modalOverlay: 'rgb(0 0 0 / 0.4)',
    /** Capas semánticas (ADR-0007). */
    zModalBase: '200',
    zModalDerived: '210',
    zModalSystem: '220',
    zModalSheet: '205',
} as const;

/** Nombres de variables CSS emitidas en `:root`. */
export const DS_CSS_VARS = {
    colorSuperficie: '--color-superficie',
    colorBorde: '--color-borde',
    colorTextoFuerte: '--color-texto-fuerte',
    colorMarca: '--color-marca',
    radioSuperficie: '--radio-superficie',
    radioControl: '--radio-control',
    espacio1: '--espacio-1',
    espacio2: '--espacio-2',
    espacio3: '--espacio-3',
    espacio4: '--espacio-4',
    tactilMinimo: '--tactil-minimo',
    elevacionSuperficie: '--elevacion-superficie',
    elevacionModal: '--elevacion-modal',
    modalMaxHeight: '--modal-max-height',
    modalOverlay: '--modal-overlay',
    zModalBase: '--z-modal-base',
    zModalDerived: '--z-modal-derived',
    zModalSystem: '--z-modal-system',
    zModalSheet: '--z-modal-sheet',
} as const;
