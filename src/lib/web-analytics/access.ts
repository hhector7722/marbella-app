import { canAccessUsageAnalytics } from '@/lib/usage/access';

export function canAccessWebAnalytics(email: string | null | undefined): boolean {
  return canAccessUsageAnalytics(email);
}

export function isWebAnalyticsPath(pathname: string): boolean {
  return pathname === '/dashboard/web' || pathname.startsWith('/dashboard/web/');
}
