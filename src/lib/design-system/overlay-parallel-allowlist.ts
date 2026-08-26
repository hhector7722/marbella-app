/**
 * Huéspedes oficiales del overlay de sistema y legado que aún pinta
 * `fixed inset-0` paralelo. No migrar estos consumidores en esta fase.
 *
 * Un fichero nuevo que dispare la huella y no esté aquí falla
 * `overlay-parallel.test.ts`.
 */

/** Implementaciones que poseen portal, capas, Escape y backdrop. */
export const OFFICIAL_OVERLAY_HOSTS = [
    'src/components/ui/modal.tsx',
    'src/components/ui/ConsumptionBottomSheet.tsx',
] as const;

/**
 * Overlays paralelos existentes el 2026-08-16.
 * Quitar una ruta de aquí solo cuando el fichero deje de disparar la huella.
 */
export const LEGACY_PARALLEL_OVERLAY_ALLOWLIST = [
    'src/app/error.tsx',
    'src/app/ingredients/page.tsx',
    'src/app/loading.tsx',
    'src/app/not-found.tsx',
    'src/app/playground/studio/components/ValidationPanel.tsx',
    'src/app/playground/studio/page.tsx',
    'src/app/staff/history/page.tsx',
    'src/components/dashboards/StaffDashboardView.tsx',
    'src/components/kds/KDSView.tsx',
    'src/components/modals/StaffScheduleModal.tsx',
    'src/components/ui/QuickCalculatorModal.tsx',
] as const;
