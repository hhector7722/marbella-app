'use client'

import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Notice } from '@/components/ui/Notice'
import {
  buildSparklineGeometry,
  formatActivityDayMonth,
  formatActivityPercent,
  formatActivityQuantity,
  formatActivityUnitPrice,
  isSignificantVariation,
  type IngredientActivity,
  type IngredientActivityPoint,
} from '@/lib/ingredient-activity'
import { IngredientFact } from './IngredientPanel'

function purchaseCountLabel(purchases: number): string {
  if (purchases <= 0) return ''
  return purchases === 1 ? '1 compra' : `${purchases} compras`
}

function PriceSparkline({ points, unit }: { points: IngredientActivityPoint[]; unit: string }) {
  const width = 100
  const height = 28
  const geometry = buildSparklineGeometry(points, width, height, 3)
  const first = points[0] ?? null
  const last = points[points.length - 1] ?? null
  const hasLine = geometry.path.includes('L')

  return (
    <div className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-9 w-full select-none text-ds-marca"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {geometry.path ? (
          <path
            d={geometry.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {!hasLine && geometry.first ? (
          <circle cx={geometry.first.x} cy={geometry.first.y} r={2} fill="currentColor" />
        ) : null}
      </svg>
      {points.length >= 2 && first && last ? (
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold tabular-nums text-zinc-400">
          <span className="truncate">
            {formatActivityDayMonth(first.date)} · {formatActivityUnitPrice(first.price, '')}
          </span>
          <span className="truncate">
            {formatActivityDayMonth(last.date)} · {formatActivityUnitPrice(last.price, unit)}
          </span>
        </div>
      ) : last ? (
        <div className="text-center text-[10px] font-bold tabular-nums text-zinc-400">
          {formatActivityUnitPrice(last.price, unit)}
        </div>
      ) : null}
    </div>
  )
}

function ActivityAlert({ activity }: { activity: IngredientActivity }) {
  const variation = activity.variationPercent
  if (!isSignificantVariation(variation)) return null
  if (activity.previousAvgPrice == null || activity.currentPrice == null) return null

  const rising = (variation ?? 0) > 0
  const percent = formatActivityPercent(variation)
  return (
    <Notice
      instance="ingredient-activity-alert"
      variant={rising ? 'warning' : 'positive'}
      title={`Precio ${percent} en ${activity.periodDays} días`}
    >
      <span className="tabular-nums">
        {formatActivityUnitPrice(activity.previousAvgPrice, '')} →{' '}
        {formatActivityUnitPrice(activity.currentPrice, activity.purchaseUnit)}
      </span>
    </Notice>
  )
}

export function IngredientActivitySummary({
  activity,
  loading,
  onOpenHistory,
}: {
  activity: IngredientActivity | null
  loading: boolean
  onOpenHistory: () => void
}) {
  const historyButton = (
    <div className="flex justify-end border-t border-zinc-100 pt-3">
      <Button variant="tertiary" instance="ingredient-activity-history" onClick={onOpenHistory}>
        Ver historial →
      </Button>
    </div>
  )

  if (loading) {
    return (
      <div className="flex min-h-24 items-center justify-center">
        <LoadingSpinner size="sm" />
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="flex flex-col gap-4">
        <p className="py-6 text-center text-xs font-semibold text-zinc-400">
          No se ha podido cargar la actividad.
        </p>
        {historyButton}
      </div>
    )
  }

  if (activity.purchases === 0 && activity.points.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="py-6 text-center text-xs font-semibold text-zinc-400">
          Sin compras en los últimos {activity.periodDays} días.
        </p>
        {historyButton}
      </div>
    )
  }

  const variation = activity.variationPercent
  const variationClassName =
    variation == null || Math.abs(variation) < 0.05
      ? ''
      : variation > 0
        ? 'text-rose-600'
        : 'text-emerald-600'

  const lastPurchase = activity.lastPurchase

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <IngredientFact label="Compras">
          {purchaseCountLabel(activity.purchases)}
        </IngredientFact>
        <IngredientFact label="Cantidad comprada">
          {formatActivityQuantity(activity.totalQuantity, activity.purchaseUnit)}
        </IngredientFact>
        <IngredientFact label="Precio medio">
          {formatActivityUnitPrice(activity.avgPrice, activity.purchaseUnit)}
        </IngredientFact>
        <IngredientFact label="Variación">
          <span className={variationClassName}>{formatActivityPercent(variation)}</span>
        </IngredientFact>
      </div>

      {activity.points.length > 0 ? (
        <PriceSparkline points={activity.points} unit={activity.purchaseUnit} />
      ) : (
        <p className="py-2 text-center text-[11px] font-semibold text-zinc-400">
          Sin datos de precio en el periodo.
        </p>
      )}

      {lastPurchase ? (
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-[11px] font-bold text-zinc-400">Última compra</span>
          <span className="min-w-0 truncate text-right text-xs font-black tabular-nums text-zinc-800">
            {formatActivityDayMonth(lastPurchase.date)}
            {lastPurchase.supplier ? ` · ${lastPurchase.supplier}` : ''}
            {' · '}
            {formatActivityUnitPrice(lastPurchase.unitPrice, activity.purchaseUnit)}
          </span>
        </div>
      ) : null}

      <ActivityAlert activity={activity} />

      {historyButton}
    </div>
  )
}
