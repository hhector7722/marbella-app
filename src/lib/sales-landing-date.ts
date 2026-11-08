/** Solo gobierna la fecha inicial de /dashboard/ventas; no cambia los filtros manuales. */
export type SalesLandingPolicy = 'last-closing' | 'today-if-sales' | 'existing';

export function salesLandingPolicy(email: string | null | undefined): SalesLandingPolicy {
    switch (email?.trim().toLowerCase()) {
        case 'fogotorrat@gmail.com':
        case 'sergioferrercervero@gmail.com':
            return 'last-closing';
        case 'hhector7722@gmail.com':
            return 'today-if-sales';
        default:
            return 'existing';
    }
}

/** Sin cierre disponible, conservar el día de hoy en lugar de inventar una fecha. */
export function salesLandingDate(
    policy: Exclude<SalesLandingPolicy, 'existing'>,
    today: string,
    latestClosing: string | null,
    hasSalesToday: boolean,
): string {
    if (policy === 'today-if-sales' && hasSalesToday) return today;
    return latestClosing ?? today;
}
