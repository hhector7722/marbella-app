/**
 * Filtra className del panel Modal.
 * El shell contractual posee: max-width (variante), max-height, radio,
 * padding/margin del panel, sombra, fondo y z-index.
 * Solo se admite composición externa (flex, tipografía de tono, overflow…).
 */

const PANEL_LAYOUT_CLASS_RE =
    /^(?:sm:|md:|lg:|xl:|2xl:)?(?:flex|flex-1|flex-none|flex-auto|flex-col|flex-row|flex-wrap|flex-nowrap|flex-\[.+\]|grow|grow-0|shrink-0|shrink|items-(?:start|end|center|baseline|stretch)|justify-(?:start|end|center|between|around|evenly)|gap-(?:\d+|\[.+\]|ds-\S+)|w-full|w-fit|w-auto|min-w-0|max-w-full|h-full|h-auto|min-h-0|max-h-full|relative|absolute|static|sticky|overflow-(?:auto|hidden|x-hidden|y-auto|y-hidden|clip)|overscroll-\S+|text-(?:left|center|right|white|black|ds-\S+|zinc-\d+|gray-\d+|rose-\d+|emerald-\d+|white\/\d+)|font-(?:\S+)|uppercase|lowercase|tracking-\S+|leading-\S+|truncate|whitespace-\S+|tabular-nums|italic|border(?:-\S+)?|outline-none|opacity-\S+|pointer-events-(?:none|auto)|select-\S+|cursor-\S+|transition\S*|duration-\S*|animate-\S+|self-\S+|col-span-\S+|row-span-\S+|order-\S+|min-h-ds-\S+|min-w-ds-\S+|h-ds-\S+|gap-ds-\S+|text-ds-\S+|border-ds-\S+|from-\S+|via-\S+|to-\S+|bg-gradient-\S+|divide-\S+|space-[xy]-\S+|hover:\S+|active:\S+|disabled:\S+|focus:\S+|focus-visible:\S+|group|peer|\[&.+\]\S*)$/;

/**
 * Conserva composición externa del panel.
 * Descarta max-w/max-h contractuales, padding, margin, radio, sombra, fondo y z-index.
 */
export function pickModalPanelClassName(className: string | undefined): string {
    if (!className) return '';
    return className
        .split(/\s+/)
        .filter((token) => token.length > 0 && PANEL_LAYOUT_CLASS_RE.test(token))
        .join(' ');
}

/** Tokens que el shell posee y el consumidor no puede pintar en `className` del panel. */
export function isForbiddenModalPanelClassToken(token: string): boolean {
    if (!token) return false;
    return !PANEL_LAYOUT_CLASS_RE.test(token);
}
