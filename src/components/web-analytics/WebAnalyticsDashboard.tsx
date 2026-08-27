import { WebAnalyticsBreakdown } from '@/components/web-analytics/WebAnalyticsBreakdown';
import { WebAnalyticsKpis } from '@/components/web-analytics/WebAnalyticsKpis';
import { WebAnalyticsRecentActivity } from '@/components/web-analytics/WebAnalyticsRecentActivity';
import type { WebAnalyticsDashboardData } from '@/lib/web-analytics/types';

export function WebAnalyticsDashboard({ data }: { data: WebAnalyticsDashboardData }) {
  return (
    <div className="space-y-4">
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
    </div>
  );
}
