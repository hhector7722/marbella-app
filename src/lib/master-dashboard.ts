export const MASTER_DASHBOARD_EMAIL = 'hhector7722@gmail.com';

export function isMasterDashboardUser(email: string | null | undefined): boolean {
    return String(email ?? '').trim().toLowerCase() === MASTER_DASHBOARD_EMAIL;
}
