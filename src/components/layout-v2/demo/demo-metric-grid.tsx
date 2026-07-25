import { cn } from '@/lib/utils'
import { demoMetrics, type DemoMetric } from './page-data'

function toneClass(tone: DemoMetric['tone']) {
  switch (tone) {
    case 'success':
      return 'text-mds-success'
    case 'warning':
      return 'text-mds-warning'
    case 'danger':
      return 'text-mds-danger'
    default:
      return 'text-mds-muted'
  }
}

export function DemoMetricGrid() {
  return (
    <section
      aria-label="Métricas"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {demoMetrics.map((metric) => (
        <div
          key={metric.id}
          className="rounded-xl border border-mds-border bg-mds-surface p-4 shadow-sm"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-mds-muted">
            {metric.label}
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums text-mds-foreground">
            {metric.value}
          </p>
          <p className={cn('mt-1 text-xs font-bold', toneClass(metric.tone))}>
            {metric.delta}
          </p>
        </div>
      ))}
    </section>
  )
}
