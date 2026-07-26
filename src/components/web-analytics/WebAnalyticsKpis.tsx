import { formatDurationMs, formatNumber } from '@/lib/web-analytics/labels'
import type { WebAnalyticsDashboardData } from '@/lib/web-analytics/types'
import { Metric, Section } from '@/components/mds'

type WebAnalyticsKpisProps = {
  totals: WebAnalyticsDashboardData['totals']
}

export function WebAnalyticsKpis({ totals }: WebAnalyticsKpisProps) {
  return (
    <Section id="web-kpis" title="Resumen" description="Totales del periodo filtrado.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          title="Visitantes"
          value={formatNumber(totals.visitors)}
          empty={totals.visitors === 0}
        />
        <Metric
          title="Sesiones"
          value={formatNumber(totals.sessions)}
          empty={totals.sessions === 0}
        />
        <Metric
          title="Páginas"
          value={formatNumber(totals.pageViews)}
          empty={totals.pageViews === 0}
        />
        <Metric
          title="Clics"
          value={formatNumber(totals.clicks)}
          empty={totals.clicks === 0}
        />
        <Metric
          title="Acciones"
          value={formatNumber(totals.actions)}
          empty={totals.actions === 0}
        />
        <Metric
          title="Tiempo medio"
          value={formatDurationMs(totals.avgSessionMs)}
          empty={!totals.avgSessionMs || totals.avgSessionMs < 1000}
        />
      </div>
    </Section>
  )
}
