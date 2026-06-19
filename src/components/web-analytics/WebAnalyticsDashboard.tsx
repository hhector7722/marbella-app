import Link from 'next/link';
import { Suspense } from 'react';
import { WebAnalyticsBreakdown } from '@/components/web-analytics/WebAnalyticsBreakdown';
import { WebAnalyticsFilters } from '@/components/web-analytics/WebAnalyticsFilters';
import { WebAnalyticsKpis } from '@/components/web-analytics/WebAnalyticsKpis';
import { WebAnalyticsRecentActivity } from '@/components/web-analytics/WebAnalyticsRecentActivity';
import type { WebAnalyticsDashboardData } from '@/lib/web-analytics/types';

export function WebAnalyticsDashboard({ data }: { data: WebAnalyticsDashboardData }) {
  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="h-12 rounded-xl border border-zinc-100 bg-white" aria-hidden />
        }
      >
        <WebAnalyticsFilters filters={data.filters} />
      </Suspense>

      <WebAnalyticsKpis totals={data.totals} />
      <WebAnalyticsBreakdown
        topPages={data.topPages}
        topReferrers={data.topReferrers}
        topDevices={data.topDevices}
        topSources={data.topSources}
        topLocales={data.topLocales}
      />

      <WebAnalyticsRecentActivity
        key={data.filters.day ?? 'all'}
        initialEvents={data.recentEvents}
        initialHasMore={data.recentHasMore}
        filters={data.filters}
      />

      <Link href="/master/dashboard" className="inline-block text-xs font-medium text-[#36606F]">
        Volver al hub master
      </Link>
    </div>
  );
}
