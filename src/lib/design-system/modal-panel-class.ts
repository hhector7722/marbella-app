/**
 * Filtra className del panel Modal.
 * El radio del panel lo fija el contrato (`radio.superficie`); no se admite override.
 */

const ROUNDED_CLASS_RE = /^(?:sm:|md:|lg:|xl:|2xl:)?rounded(?:-|$)/;

/**
 * Conserva composición externa del panel y descarta cualquier `rounded-*`.
 */
export function pickModalPanelClassName(className: string | undefined): string {
    if (!className) return '';
    return className
        .split(/\s+/)
        .filter((token) => token.length > 0 && !ROUNDED_CLASS_RE.test(token))
        .join(' ');
}
