import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { WebAnalyticsDashboard } from '@/components/web-analytics/WebAnalyticsDashboard';
import { canAccessWebAnalytics } from '@/lib/web-analytics/access';
import {
  createEmptyWebAnalyticsDashboardData,
  getWebAnalyticsDashboardData,
  parseWebAnalyticsFilters,
} from '@/lib/web-analytics/queries';
import { createClient } from '@/utils/supabase/server';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { Notice } from '@/components/ui/Notice';
import { DayPeriodFilter, DayPeriodNav } from '@/components/time/DayPeriodChrome';

export const dynamic = 'force-dynamic';

type WebAnalyticsPageProps = {
  searchParams: Promise<{ dia?: string }>;
};

export default async function WebAnalyticsPage({ searchParams }: WebAnalyticsPageProps) {
  const params = await searchParams;
  const filters = parseWebAnalyticsFilters(params);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? '';
  if (!canAccessWebAnalytics(email)) {
    redirect('/dashboard');
  }

  let data = createEmptyWebAnalyticsDashboardData(filters);
  let loadError: string | null = null;

  try {
    data = await getWebAnalyticsDashboardData(filters);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'No se pudieron cargar los datos de analítica web.';
  }

  return (
    <DashboardDetailLayout
      title="Analítica web"
      subtitle="Visitas, navegación y clics en marbella-web"
      showBackButton={false}
      template="list"
      maxWidthClass="max-w-3xl"
      periodSlot={
        <Suspense fallback={null}>
          <DayPeriodNav day={filters.day} basePath="/dashboard/web" />
        </Suspense>
      }
      rightSlot={
        <div className="flex shrink-0 items-center gap-1">
          <Suspense fallback={null}>
            <DayPeriodFilter day={filters.day} basePath="/dashboard/web" instance="web-period-filter" />
          </Suspense>
          <Link
            href="https://marbella-web.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 shrink-0 items-center px-2 text-xs font-semibold text-white"
          >
            Abrir web
          </Link>
        </div>
      }
    >
      {loadError ? (
        <Notice instance="web-analytics-load-error" variant="negative" title="No se pudo cargar la analítica web">
          {loadError}
        </Notice>
      ) : null}
      <WebAnalyticsDashboard data={data} />
    </DashboardDetailLayout>
  );
}
