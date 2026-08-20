/**
 * Contrato de PetroleumSegmented — control segmentado de borde petróleo.
 *
 * Familia: WasteClient, recipes/[id], SubNavVentas.
 * No es Tab, Chip, Button ni segmented track zinc.
 */

export const PETROLEUM_SEGMENTED_COMPONENT_ID = 'PetroleumSegmented' as const;

export const PETROLEUM_SEGMENTED_DENSITIES = ['comfortable', 'compact'] as const;

export type PetroleumSegmentedDensity = (typeof PETROLEUM_SEGMENTED_DENSITIES)[number];

export function isPetroleumSegmentedDensity(
    value: string
): value is PetroleumSegmentedDensity {
    return (PETROLEUM_SEGMENTED_DENSITIES as readonly string[]).includes(value);
}

/**
 * Huella del shell ad hoc previo al componente oficial.
 * Si reaparece fuera del host, es regresión o deuda nueva.
 */
export const PETROLEUM_SEGMENTED_LEGACY_FINGERPRINT =
    'inline-flex rounded-lg overflow-hidden border border-[#36606F]';
