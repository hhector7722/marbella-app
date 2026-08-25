/**
 * Contrato PageScreen — plantilla de pantalla de gestión (T2 / T3 / T4).
 * Implementación: src/components/dashboard/DashboardDetailLayout.tsx
 */

export const PAGE_SCREEN_COMPONENT_ID = 'PageScreen' as const;

export const PAGE_SCREEN_TEMPLATES = ['list', 'detail', 'form'] as const;

export type PageScreenTemplate = (typeof PAGE_SCREEN_TEMPLATES)[number];

export const PAGE_SCREEN_FORBIDDEN_RADIUS = 'rounded-[2.5rem]' as const;
