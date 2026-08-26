/**
 * Allowlists temporales de deuda Modal (Block 0 — enforcement).
 * Cada ruta debe existir y seguir disparando la regla.
 * Quitar una ruta solo cuando el fichero deje de incumplir.
 * No ampliar para ocultar fallos nuevos.
 */

/** Footers de Modal que aún montan `<button>` nativo en `footer=`. */
export const LEGACY_MODAL_FOOTER_NATIVE_BUTTON_ALLOWLIST = [] as const;

/**
 * Consumidores que aún pasan tokens de shell en `className` del panel Modal.
 * El runtime ya los filtra; la allowlist evita exigir migración en Block 0.
 */
export const LEGACY_MODAL_PANEL_CLASSNAME_ALLOWLIST = [] as const;

/**
 * Hijo raíz del Body con padding ≥ espacio.4 que duplica el inset del shell.
 * Snapshot de deuda; no migrar en Block 0.
 */
export const LEGACY_MODAL_ROOT_PADDING_ALLOWLIST = [] as const;

/**
 * `backdropClassName` — escape hatch. Solo excepciones legítimas (p. ej. lightbox).
 * Motivo por ruta en SISTEMA-DE-COMPONENTES / DEUDA.
 */
export const LEGACY_MODAL_BACKDROP_CLASSNAME_ALLOWLIST = [
    'src/components/carta/CartaImageLightbox.tsx', // lightbox: oscurecido > overlay base
    'src/components/ui/ImageLightbox.tsx', // lightbox: oscurecido > overlay base
] as const;

/**
 * `zIndexClass` — deprecated. Allowlist vacía: ningún consumidor nuevo ni legacy
 * puede usarlo. El prop permanece en la API solo para no romper tipos externos.
 */
export const LEGACY_MODAL_ZINDEX_CLASS_ALLOWLIST = [] as const;
