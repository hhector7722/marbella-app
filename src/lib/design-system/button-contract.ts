/**
 * Contrato oficial de Button.
 * Variantes, layout, identidad y receta. El aspecto lo bloquea CSS
 * (`[data-component='Button']`); este módulo no acepta props visuales.
 */

export const BUTTON_COMPONENT_ID = 'Button' as const;

export const BUTTON_VARIANTS = [
    'primary',
    'secondary',
    'tertiary',
    'destructive',
] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_LAYOUTS = ['hug', 'fill'] as const;

export type ButtonLayout = (typeof BUTTON_LAYOUTS)[number];

/** Variantes rechazadas de forma explícita. No existen en el contrato. */
export const BUTTON_FORBIDDEN_VARIANTS = [
    'success',
    'positive',
    'emerald',
    'purple',
    'ghost',
    'danger',
    'warning',
    'info',
] as const;

const LAYOUT_CLASS_RE =
    /^(?:sm:|md:|lg:|xl:|2xl:)?(?:flex-1|flex-none|flex-auto|flex-\[\d+\]|grow|grow-0|shrink-0|shrink|w-full|self-(?:auto|start|end|center|stretch|baseline)|justify-self-(?:auto|start|end|center|stretch)|col-span-(?:\d+|full)|row-span-(?:\d+|full)|order-(?:none|first|last|\d+)|relative|absolute|static|sticky|z-(?:\d+|auto)|ml-auto|mr-auto|mx-auto|ms-auto|me-auto|mt-auto|mb-auto)$/;

/**
 * Solo permite clases de composición/layout externo.
 * Altura, radio, color, tipo, estados y el resto se descartan.
 */
export function pickButtonLayoutClassName(className: string | undefined): string {
    if (!className) return '';
    return className
        .split(/\s+/)
        .filter((token) => token.length > 0 && LAYOUT_CLASS_RE.test(token))
        .join(' ');
}

export function isButtonVariant(value: string): value is ButtonVariant {
    return (BUTTON_VARIANTS as readonly string[]).includes(value);
}

export function isButtonLayout(value: string): value is ButtonLayout {
    return (BUTTON_LAYOUTS as readonly string[]).includes(value);
}

export function hasVisibleButtonLabel(children: unknown): boolean {
    if (children === null || children === undefined || children === false) return false;
    if (typeof children === 'string' || typeof children === 'number') {
        return String(children).trim().length > 0;
    }
    return true;
}

export type ButtonNameResolution =
    | { ok: true; iconOnly: boolean }
    | { ok: false; reason: 'icon-only-requires-aria-label' | 'empty-requires-name' };

export function resolveButtonAccessibleName(args: {
    hasLabel: boolean;
    hasIcon: boolean;
    ariaLabel?: string | undefined;
}): ButtonNameResolution {
    const named = typeof args.ariaLabel === 'string' && args.ariaLabel.trim().length > 0;
    if (args.hasLabel) {
        return { ok: true, iconOnly: false };
    }
    if (args.hasIcon) {
        if (!named) return { ok: false, reason: 'icon-only-requires-aria-label' };
        return { ok: true, iconOnly: true };
    }
    if (!named) return { ok: false, reason: 'empty-requires-name' };
    return { ok: true, iconOnly: false };
}

export const BUTTON_CONTRACT = {
    /** Alto mínimo táctil = `tactil.minimo`. El ancho por defecto es hug. */
    height: '48px',
    /**
     * Radio contractual del Button = `espacio.2` (8px).
     * No usa `radio.superficie` (16px, Modal) ni `radio.control` (12px):
     * ambos son ≥ o cercanos a la mitad de 28px y producen píldora.
     * 8px < 14px (mitad del alto visual): deja tramo recto.
     */
    radius: '8px',
    /**
     * Alto del fondo compacto (`::before`), no del host táctil.
     * 12px de tipo + `espacio.2` arriba y abajo = 28px.
     * El radio contractual debe ser estrictamente menor que la mitad
     * de este alto para no producir cápsula.
     */
    visualHeight: '28px',
    /** Padding-block del fondo compacto (`espacio.2`). */
    visualPaddingBlock: '8px',
    /** Padding horizontal compacto (`espacio.2`); el fondo visual se ajusta al contenido. */
    paddingInline: '8px',
    fontSize: '12px',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    iconSlot: 'start',
    /** Default de layout: hug. `fill` solo si el consumidor lo declara. */
    defaultLayout: 'hug',
} as const;
