import { isMasterDashboardUser } from '@/lib/master-dashboard';

export function canAccessUsageAnalytics(email: string | null | undefined): boolean {
  return isMasterDashboardUser(email);
}

export function isUsageAnalyticsPath(pathname: string): boolean {
  return pathname === '/dashboard/uso' || pathname.startsWith('/dashboard/uso/');
}
