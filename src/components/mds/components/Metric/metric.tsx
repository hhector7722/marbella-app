import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Surface } from '../Surface'
import { Text } from '../Typography'

type MetricTrendTone = 'success' | 'warning' | 'danger' | 'muted'

type MetricTrend = {
  label: string
  tone?: MetricTrendTone
}

type MetricProps = {
  title: string
  value?: React.ReactNode
  description?: string
  trend?: MetricTrend
  icon?: LucideIcon
  loading?: boolean
  /** Vista vacía (sin valor). Muestra espacio ZERO-DISPLAY. */
  empty?: boolean
  className?: string
}

const trendToneClass: Record<MetricTrendTone, string> = {
  success: 'text-mds-success',
  warning: 'text-mds-warning',
  danger: 'text-mds-danger',
  muted: 'text-mds-muted',
}

/**
 * Métrica limpia. Sin color de fondo decorativo.
 */
function Metric({
  title,
  value,
  description,
  trend,
  icon: Icon,
  loading = false,
  empty = false,
  className,
}: MetricProps) {
  return (
    <Surface
      variant="default"
      data-slot="mds-metric"
      className={cn('flex flex-col gap-2 p-4', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <Text variant="caption">{title}</Text>
        {Icon ? (
          <Icon
            className="size-4 shrink-0 text-mds-muted"
            aria-hidden
          />
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando métrica">
          <Skeleton className="h-8 w-24 rounded-md bg-mds-muted-surface" />
          <Skeleton className="h-3 w-16 rounded-md bg-mds-muted-surface" />
        </div>
      ) : empty ? (
        <p
          className="text-2xl font-black tabular-nums text-mds-foreground"
          aria-label={`${title}: sin datos`}
        >
          {' '}
        </p>
      ) : (
        <p className="text-2xl font-black tabular-nums text-mds-foreground">
          {value}
        </p>
      )}

      {!loading && description ? (
        <Text variant="body" muted className="text-xs">
          {description}
        </Text>
      ) : null}

      {!loading && trend ? (
        <p
          className={cn(
            'text-xs font-bold',
            trendToneClass[trend.tone ?? 'muted']
          )}
        >
          {trend.label}
        </p>
      ) : null}
    </Surface>
  )
}

export { Metric }
export type { MetricProps, MetricTrend, MetricTrendTone }
