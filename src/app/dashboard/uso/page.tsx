import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Globe, Smartphone } from 'lucide-react';
import { UsageDashboard } from '@/components/usage/UsageDashboard';
import { canAccessUsageAnalytics } from '@/lib/usage/access';
import { getUsageDashboardData, parseUsageDashboardFilters } from '@/lib/usage/queries';
import { createClient } from '@/utils/supabase/server';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import {
  DayPeriodChromeProvider,
  DayPeriodFilter,
  DayPeriodNav,
} from '@/components/time/DayPeriodChrome';

export const dynamic = 'force-dynamic';

type UsoPageProps = {
  searchParams: Promise<{ dia?: string; usuario?: string; usuarios?: string }>;
};

export default async function UsoPage({ searchParams }: UsoPageProps) {
  const params = await searchParams;
  const filters = parseUsageDashboardFilters(params);

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
  if (!canAccessUsageAnalytics(email)) {
    redirect('/dashboard');
  }

  const data = await getUsageDashboardData(filters);

  return (
    <Suspense fallback={null}>
      <DayPeriodChromeProvider day={filters.day} basePath="/dashboard/uso" instance="uso-period-filter">
        <DashboardDetailLayout
          title="Uso de la app"
          showBackButton={false}
          template="list"
          maxWidthClass="max-w-3xl"
          periodSlot={<DayPeriodNav day={filters.day} basePath="/dashboard/uso" />}
          rightSlot={
            <div className="flex shrink-0 items-center gap-1">
              <DayPeriodFilter day={filters.day} basePath="/dashboard/uso" instance="uso-period-filter" />
              <Link
                href="/dashboard/web"
                aria-label="Uso web"
                className="flex size-12 shrink-0 items-center justify-center text-ds-texto"
              >
                <Globe className="size-6" strokeWidth={1.5} aria-hidden />
              </Link>
              <Link
                href="/dashboard/instalacion-app"
                aria-label="Instalación de la app"
                className="flex size-12 shrink-0 items-center justify-center text-ds-texto"
              >
                <Smartphone className="size-6" strokeWidth={1.5} aria-hidden />
              </Link>
            </div>
          }
        >
          <UsageDashboard data={data} />
        </DashboardDetailLayout>
      </DayPeriodChromeProvider>
    </Suspense>
  );
}
