export const MASTER_DASHBOARD_EMAIL = 'hhector7722@gmail.com';

export function isMasterDashboardUser(email: string | null | undefined): boolean {
    return String(email ?? '').trim().toLowerCase() === MASTER_DASHBOARD_EMAIL;
}

export function getHomeHrefForUser(email: string | null | undefined, role?: string | null): string {
    if (isMasterDashboardUser(email)) return '/master/dashboard';
    if (role === 'manager' || role === 'supervisor') return '/dashboard';
    return '/staff/dashboard';
}
