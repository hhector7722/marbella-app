import { Suspense } from 'react'
import { WebAnalyticsBreakdown } from '@/components/web-analytics/WebAnalyticsBreakdown'
import { WebAnalyticsFilters } from '@/components/web-analytics/WebAnalyticsFilters'
import { WebAnalyticsKpis } from '@/components/web-analytics/WebAnalyticsKpis'
import { WebAnalyticsRecentActivity } from '@/components/web-analytics/WebAnalyticsRecentActivity'
import { LoadingBlock, Section } from '@/components/mds'
import type { WebAnalyticsDashboardData } from '@/lib/web-analytics/types'

export function WebAnalyticsDashboard({
  data,
}: {
  data: WebAnalyticsDashboardData
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section
        id="web-filters"
        title="Filtros"
        description="Día a consultar en marbella-web."
      >
        <Suspense fallback={<LoadingBlock lines={1} className="min-h-12" />}>
          <WebAnalyticsFilters filters={data.filters} />
        </Suspense>
      </Section>

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
  )
}
