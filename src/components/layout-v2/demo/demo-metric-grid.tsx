import { AlertTriangle, Check, Clock } from 'lucide-react'
import { Metric } from '@/components/mds'
import { demoMetrics, type DemoMetric } from './page-data'

function trendFromMetric(metric: DemoMetric) {
  return {
    label: metric.delta,
    tone: metric.tone === 'neutral' ? ('muted' as const) : metric.tone,
  }
}

const icons = {
  sales: Check,
  tickets: Clock,
  labor: Check,
  stock: AlertTriangle,
} as const

export function DemoMetricGrid() {
  return (
    <section
      aria-label="Métricas"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {demoMetrics.map((metric) => {
        const Icon = icons[metric.id as keyof typeof icons]
        return (
          <Metric
            key={metric.id}
            title={metric.label}
            value={metric.value}
            trend={trendFromMetric(metric)}
            icon={Icon}
          />
        )
      })}
    </section>
  )
}
