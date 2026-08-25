/**
 * Contrato Surface — superficie de trabajo canónica.
 *
 * Variantes cerradas: page (sobre el envolvente) / block (dentro de una page).
 * No es Card universal. No conoce negocio.
 */

export const SURFACE_COMPONENT_ID = 'Surface' as const;

export const SURFACE_VARIANTS = ['page', 'block'] as const;

export type SurfaceVariant = (typeof SURFACE_VARIANTS)[number];

const LAYOUT_CLASS_RE =
    /^(?:sm:|md:|lg:|xl:|2xl:)?(?:flex|flex-1|flex-none|flex-col|flex-row|flex-wrap|grow|grow-0|shrink-0|shrink|items-\S+|justify-\S+|gap-(?:\d+|\[.+\]|ds-\S+)|w-full|w-fit|min-w-0|max-w-full|max-w-\S+|h-full|h-auto|min-h-0|min-h-\S+|overflow-\S+|relative|absolute|static|col-span-\S+|row-span-\S+|self-\S+|basis-\S+|transition\S*|duration-\S*|animate-\S+|aspect-\S+|month-cal-\S+|p-\S+|px-\S+|py-\S+|pt-\S+|pb-\S+|pl-\S+|pr-\S+|text-(?:left|center|right))$/;

export function pickSurfaceLayoutClassName(className: string | undefined): string {
    if (!className) return '';
    return className
        .split(/\s+/)
        .filter((token) => token.length > 0 && LAYOUT_CLASS_RE.test(token))
        .join(' ');
}

export function isSurfaceVariant(value: string): value is SurfaceVariant {
    return (SURFACE_VARIANTS as readonly string[]).includes(value);
}
