/**
 * Variantes estructurales oficiales de Modal.
 * Origen: spike 2026-08-15-modal-design-system-audit + decisión aprobada.
 */

export const MODAL_COMPONENT_ID = 'Modal' as const;

export const MODAL_VARIANTS = [
    'compact',
    'standard',
    'work',
    'day',
    'amplify',
] as const;

export type ModalVariant = (typeof MODAL_VARIANTS)[number];

export type ModalVariantLayout = {
    /** Clase Tailwind de ancho máximo del wrapper. */
    maxWidthClass: string;
    /** El panel tiende a ocupar más alto útil (trabajo / día). */
    preferTall: boolean;
};

export function resolveModalVariant(variant: ModalVariant): ModalVariantLayout {
    switch (variant) {
        case 'compact':
            return { maxWidthClass: 'max-w-sm', preferTall: false };
        case 'standard':
            return { maxWidthClass: 'max-w-md', preferTall: false };
        case 'work':
            return { maxWidthClass: 'max-w-4xl', preferTall: true };
        case 'day':
            return { maxWidthClass: 'max-w-4xl', preferTall: true };
        case 'amplify':
            return { maxWidthClass: 'max-w-2xl', preferTall: false };
        default: {
            const _exhaustive: never = variant;
            return _exhaustive;
        }
    }
}

export function isModalVariant(value: string): value is ModalVariant {
    return (MODAL_VARIANTS as readonly string[]).includes(value);
}
