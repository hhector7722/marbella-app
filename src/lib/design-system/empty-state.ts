/**
 * Contrato EmptyState — las tres variantes de EXPERIENCIA §7.
 */

export const EMPTY_STATE_COMPONENT_ID = 'EmptyState' as const;

export const EMPTY_STATE_VARIANTS = ['none', 'mismatch', 'error'] as const;

export type EmptyStateVariant = (typeof EMPTY_STATE_VARIANTS)[number];

export function isEmptyStateVariant(value: string): value is EmptyStateVariant {
    return (EMPTY_STATE_VARIANTS as readonly string[]).includes(value);
}
