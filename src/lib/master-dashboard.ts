import { MASTER_DASHBOARD_EMAIL, isMasterDashboardUser } from './staff/simulation-identity';

export { MASTER_DASHBOARD_EMAIL, isMasterDashboardUser };

export function getHomeHrefForUser(email: string | null | undefined, role?: string | null): string {
    if (isMasterDashboardUser(email)) return '/master/dashboard';
    if (role === 'manager' || role === 'supervisor') return '/dashboard';
    return '/staff/dashboard';
}
