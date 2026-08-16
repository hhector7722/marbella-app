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
    'src/app/dashboard/consumo-personal/page.tsx',
    'src/app/dashboard/eventos/EventosAdminClient.tsx',
    'src/app/dashboard/history/page.tsx',
    'src/app/dashboard/insights/InsightsClient.tsx',
    'src/app/dashboard/insights/insights-date-filter.tsx',
    'src/app/dashboard/labor/page.tsx',
    'src/app/dashboard/overtime/page.tsx',
    'src/app/dashboard/recetas-tpv/MappingClient.tsx',
    'src/app/dashboard/scanner/ScannerClient.tsx',
    'src/app/dashboard/ventas/page.tsx',
    'src/app/error.tsx',
    'src/app/eventos/[slug]/EventEncargoCartaClient.tsx',
    'src/app/ingredients/page.tsx',
    'src/app/loading.tsx',
    'src/app/not-found.tsx',
    'src/app/playground/studio/components/ValidationPanel.tsx',
    'src/app/playground/studio/page.tsx',
    'src/app/recipes/[id]/page.tsx',
    'src/app/recipes/page.tsx',
    'src/app/reporte/page.tsx',
    'src/app/staff/ConsumptionModal.tsx',
    'src/app/staff/actividades/gestion/page.tsx',
    'src/app/staff/history/WeekCard.tsx',
    'src/app/staff/history/page.tsx',
    'src/app/staff/reservas/ReservasClient.tsx',
    'src/app/suppliers/page.tsx',
    'src/components/CreateIngredientModal.tsx',
    'src/components/CreateRecipeModal.tsx',
    'src/components/PushNotificationsPrompt.tsx',
    'src/components/WorkerWeeklyHistoryModal.tsx',
    'src/components/carta/MenuCategoryEditModal.tsx',
    'src/components/carta/MenuItemEditModal.tsx',
    'src/components/chat/ChatMarbella.tsx',
    'src/components/consumo-personal/ConsumptionRecipeOrderModal.tsx',
    'src/components/dashboards/AdminDashboardView.tsx',
    'src/components/dashboards/DashboardVentasSection.tsx',
    'src/components/dashboards/StaffDashboardView.tsx',
    'src/components/ingredients/IngredientEditModal.tsx',
    'src/components/kds/KDSView.tsx',
    'src/components/kds/NotesModal.tsx',
    'src/components/modals/AttendanceDetailModal.tsx',
    'src/components/modals/StaffScheduleModal.tsx',
    'src/components/orders/OrderProductCard.tsx',
    'src/components/orders/OrderSuccessModal.tsx',
    'src/components/pavilion/PavilionActivityPdfModal.tsx',
    'src/components/pavilion/PavilionDayModal.tsx',
    'src/components/reservas/DayAgendaModal.tsx',
    'src/components/reservas/EncargoOrderViewModal.tsx',
    'src/components/reservas/EncargoProductEditor.tsx',
    'src/components/reservas/PedidoClientEditModals.tsx',
    'src/components/schedule/ScheduleDayEditor.tsx',
    'src/components/staff/MenuAccordion.tsx',
    'src/components/staff/StaffCartaEditor.tsx',
    'src/components/ui/ImageLightbox.tsx',
    'src/components/ui/QuickCalculatorModal.tsx',
] as const;
