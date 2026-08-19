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
    /** TOKENS `color.marca.intenso` — hover/pressed de marca */
    colorMarcaIntenso: '#2F5D6A',
    /** TOKENS `color.superficie.inactiva` — secondary en reposo */
    colorSuperficieInactiva: '#F4F4F5',
    /** TOKENS `color.texto.invertido` — texto sobre marca, positivo o negativo */
    colorTextoInvertido: '#FFFFFF',
    /** TOKENS `color.positivo` — Button primary (acción afirmativa) */
    colorPositivo: '#059669',
    /** TOKENS `color.negativo` */
    colorNegativo: '#E11D48',
    /** TOKENS `color.negativo.fondo` */
    colorNegativoFondo: '#FFF1F2',
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
     * Cabecera fija de Modal — norma global.
     * TOKENS `estructura.cabecera-modal`.
     */
    modalHeaderHeight: '36px',
    /**
     * Inset horizontal único de cabecera Modal (ref. Albaranes).
     * Valor = TOKENS `espacio.4`.
     */
    modalHeaderInset: '16px',
    /**
     * Separación contractual Header → Body (ref. detalle Albaranes).
     * Valor = TOKENS `espacio.3`. Solo padding-top del Body; no inset completo.
     */
    modalBodyStartGap: '12px',
    /**
     * Tope de alto de Modal — referencia Albaranes detalle:
     * `min(68dvh, calc(100dvh − safe-areas − 2.5rem))`.
     * TOKENS `estructura.alto-modal` (contrato Modal; supersede el 94svh genérico en esta superficie).
     */
    modalMaxHeight:
        'min(68dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2.5rem))',
    /** Backdrop nivel base (ADR-0008). */
    modalOverlayBase: 'rgba(0, 0, 0, 0.32)',
    modalOverlayBaseFilter: 'blur(8px) saturate(65%)',
    /** Backdrop capas superiores: solo oscurecimiento. */
    modalOverlayElevated: 'rgba(0, 0, 0, 0.28)',
    /** @deprecated Usar modalOverlayBase. Conservado por lecturas antiguas. */
    modalOverlay: 'rgba(0, 0, 0, 0.32)',
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
    colorMarcaIntenso: '--color-marca-intenso',
    colorSuperficieInactiva: '--color-superficie-inactiva',
    colorTextoInvertido: '--color-texto-invertido',
    colorPositivo: '--color-positivo',
    colorNegativo: '--color-negativo',
    colorNegativoFondo: '--color-negativo-fondo',
    radioSuperficie: '--radio-superficie',
    radioControl: '--radio-control',
    espacio1: '--espacio-1',
    espacio2: '--espacio-2',
    espacio3: '--espacio-3',
    espacio4: '--espacio-4',
    tactilMinimo: '--tactil-minimo',
    elevacionSuperficie: '--elevacion-superficie',
    elevacionModal: '--elevacion-modal',
    modalHeaderHeight: '--modal-header-height',
    /** Alias estructural: apunta a `--espacio-4` (16px). */
    modalHeaderInset: '--modal-header-inset',
    modalContentInsetStart: '--modal-content-inset-start',
    modalContentInsetEnd: '--modal-content-inset-end',
    modalSubordinateBlur: '--modal-subordinate-blur',
    modalSubordinateOpacity: '--modal-subordinate-opacity',
    /** Alias estructural: apunta a `--espacio-3` (12px). */
    modalBodyStartGap: '--modal-body-start-gap',
    modalMaxHeight: '--modal-max-height',
    modalOverlayBase: '--modal-overlay-base',
    modalOverlayBaseFilter: '--modal-overlay-base-filter',
    modalOverlayElevated: '--modal-overlay-elevated',
    modalOverlay: '--modal-overlay',
    zModalBase: '--z-modal-base',
    zModalDerived: '--z-modal-derived',
    zModalSystem: '--z-modal-system',
    zModalSheet: '--z-modal-sheet',
} as const;
