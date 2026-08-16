/**
 * Huella objetiva de un overlay de modal paralelo.
 * No prohíbe `fixed`, `createPortal` ni `z-*` por separado.
 */

const FIXED_FULLSCREEN = /fixed\s+inset-0/;
const CENTER_OR_SHEET = /items-center|items-end|justify-center/;
const MANUAL_LAYER = /z-\[|backdrop-blur|bg-black\/|bg-gray-900\//;

export function hasParallelOverlayFingerprint(source: string): boolean {
    return (
        FIXED_FULLSCREEN.test(source) &&
        CENTER_OR_SHEET.test(source) &&
        MANUAL_LAYER.test(source)
    );
}

export function usesOfficialOverlayImport(source: string): boolean {
    return (
        /from\s+['"]@\/components\/ui\/modal['"]/.test(source) ||
        /from\s+['"]@\/components\/ui\/ConsumptionBottomSheet['"]/.test(source)
    );
}
