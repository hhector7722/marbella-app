/** Coordenadas aprobadas sobre el plano 2048 × 1084. */
export const CASH_BOX_PLAN = {
    tpv1: { x: 58.5, y: 71.7, width: 8.8, image: '/images/cash-change/tpv.avif', imageWidth: 591, imageHeight: 600, label: 'TPV 1' },
    tpv2: { x: 58.5, y: 36.5, width: 8.8, image: '/images/cash-change/tpv.avif', imageWidth: 591, imageHeight: 600, label: 'TPV 2' },
    cambio1: { x: 10.4, y: 24.1, width: 6.5, image: '/images/cash-change/cambio1.avif', imageWidth: 550, imageHeight: 492, label: 'Cambio 1' },
    cambio2: { x: 33, y: 15.4, width: 8, image: '/images/cash-change/cambio2.avif', imageWidth: 535, imageHeight: 550, label: 'Cambio 2' },
    inicial: { x: 21, y: 15.4, width: 5.8, image: '/images/cash-change/inicial.avif', imageWidth: 550, imageHeight: 529, label: 'Inicial' },
};

export type CashBoxPlanKey = keyof typeof CASH_BOX_PLAN;
