/**
 * Contrato PageScreen — plantilla de pantalla de gestión (T2 / T3 / T4).
 * Implementación: src/components/dashboard/DashboardDetailLayout.tsx
 */

export const PAGE_SCREEN_COMPONENT_ID = 'PageScreen' as const;

export const PAGE_SCREEN_TEMPLATES = ['list', 'detail', 'form'] as const;

export type PageScreenTemplate = (typeof PAGE_SCREEN_TEMPLATES)[number];

/** Qué es el protagonista. Calendario y tabla conservan su pieza blanca con el canto de widget; PageScreen no envuelve otra ficha. Catálogo y formulario van en papel. */
export const PAGE_SCREEN_WORK = ['calendar', 'table', 'catalog', 'form'] as const;

export type PageScreenWork = (typeof PAGE_SCREEN_WORK)[number];

/** Inter por defecto. `display` = EA Sports 15 en Ingredientes, Recetas y Proveedores. */
export const PAGE_SCREEN_TITLE_FACES = ['product', 'display'] as const;

export type PageScreenTitleFace = (typeof PAGE_SCREEN_TITLE_FACES)[number];

export const PAGE_SCREEN_TITLE_ALIGNS = ['start', 'center'] as const;

export type PageScreenTitleAlign = (typeof PAGE_SCREEN_TITLE_ALIGNS)[number];

export const PAGE_SCREEN_FORBIDDEN_RADIUS = 'rounded-[2.5rem]' as const;
