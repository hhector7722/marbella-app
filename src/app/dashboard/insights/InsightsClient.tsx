'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn, formatDisplayValue } from '@/lib/utils'
import {
  getHourlySalesVsLabor,
  getWeekdayAnalysis,
  getProductMarginRanking,
} from './actions'
import type {
  HourlyProfitabilityRow,
  WeekdayAnalysisRow,
  ProductMarginRow,
} from './schemas'

type PresetDays = 7 | 30 | 90

type SectionKey = 'hourly' | 'weekday' | 'products'

type SectionState<T> = {
  data: T
  loading: boolean
  error: string | null
}

type InsightsClientProps = {
  initialDateFrom: string
  initialDateTo: string
  initialHourly: HourlyProfitabilityRow[]
  initialWeekday: WeekdayAnalysisRow[]
  initialProducts: ProductMarginRow[]
  initialErrors?: Partial<Record<SectionKey, string>>
}

const PETROLEO = '#36606F'
const LABOR_RED = '#E07070'
const MARGIN_GREEN = '#4CAF50'
const WEEKDAY_GREEN = '#2E7D32'
const WEEKDAY_BLUE = '#5B8FB9'
const WEEKDAY_ORANGE = '#FFA726'
const MARGIN_BAR_HIGH = '#2E7D32'
const MARGIN_BAR_MID = '#66BB6A'
const MARGIN_BAR_LOW = '#FFA726'

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMadridYmdToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function subtractDaysFromYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return formatLocalYmd(new Date(y, m - 1, d - days))
}

function formatEuroChart(value: number, digits = 2): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatEuroKpi(value: number): string {
  const displayed = formatDisplayValue(
    value === 0 ? 0 : Number(value.toFixed(2))
  )
  if (displayed === ' ') return ' '
  return formatEuroChart(Number(value))
}

function formatPctKpi(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return ' '
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse p-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-xl bg-zinc-100" />
      ))}
    </div>
  )
}

function SectionErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm font-semibold text-rose-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-12 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black uppercase tracking-wide text-white active:scale-95"
      >
        <RefreshCw className="h-4 w-4" />
        Reintentar
      </button>
    </div>
  )
}

function KpiChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 min-h-12 flex flex-col justify-center">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-sm font-black text-zinc-800 tabular-nums">{value}</span>
    </div>
  )
}

export default function InsightsClient({
  initialDateFrom,
  initialDateTo,
  initialHourly,
  initialWeekday,
  initialProducts,
  initialErrors,
}: InsightsClientProps) {
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [activePreset, setActivePreset] = useState<PresetDays | null>(30)

  const [hourly, setHourly] = useState<SectionState<HourlyProfitabilityRow[]>>({
    data: initialHourly,
    loading: false,
    error: initialErrors?.hourly ?? null,
  })
  const [weekday, setWeekday] = useState<SectionState<WeekdayAnalysisRow[]>>({
    data: initialWeekday,
    loading: false,
    error: initialErrors?.weekday ?? null,
  })
  const [products, setProducts] = useState<SectionState<ProductMarginRow[]>>({
    data: initialProducts,
    loading: false,
    error: initialErrors?.products ?? null,
  })

  const fetchHourly = useCallback(async (from: string, to: string) => {
    setHourly((s) => ({ ...s, loading: true, error: null }))
    const res = await getHourlySalesVsLabor(from, to)
    if (res.success) {
      setHourly({ data: res.data, loading: false, error: null })
    } else {
      setHourly((s) => ({ ...s, loading: false, error: res.error }))
    }
  }, [])

  const fetchWeekday = useCallback(async (from: string, to: string) => {
    setWeekday((s) => ({ ...s, loading: true, error: null }))
    const res = await getWeekdayAnalysis(from, to)
    if (res.success) {
      setWeekday({ data: res.data, loading: false, error: null })
    } else {
      setWeekday((s) => ({ ...s, loading: false, error: res.error }))
    }
  }, [])

  const fetchProducts = useCallback(async () => {
    setProducts((s) => ({ ...s, loading: true, error: null }))
    const res = await getProductMarginRanking(15)
    if (res.success) {
      setProducts({ data: res.data, loading: false, error: null })
    } else {
      setProducts((s) => ({ ...s, loading: false, error: res.error }))
    }
  }, [])

  const refetchAll = useCallback(
    (from: string, to: string) => {
      void fetchHourly(from, to)
      void fetchWeekday(from, to)
      void fetchProducts()
    },
    [fetchHourly, fetchWeekday, fetchProducts]
  )

  const applyPreset = (days: PresetDays) => {
    const to = getMadridYmdToday()
    const from = subtractDaysFromYmd(to, days)
    setActivePreset(days)
    setDateFrom(from)
    setDateTo(to)
    refetchAll(from, to)
  }

  const applyCustomRange = () => {
    setActivePreset(null)
    refetchAll(dateFrom, dateTo)
  }

  const hourlyChartData = useMemo(() => {
    return hourly.data
      .filter((r) => r.total_revenue > 0 || r.labor_cost > 0)
      .map((r) => ({
        ...r,
        label: `${r.hour}h`,
      }))
  }, [hourly.data])

  const hourlyKpis = useMemo(() => {
    const active = hourly.data.filter((r) => r.total_revenue > 0 || r.labor_cost > 0)
    if (active.length === 0) {
      return {
        best: ' ',
        worst: ' ',
        optimal: ' ',
      }
    }
    const best = active.reduce((a, b) => (b.margin > a.margin ? b : a))
    const worst = active.reduce((a, b) => (b.margin < a.margin ? b : a))

    let bestWindow = { start: active[0].hour, sum: -Infinity }
    const sorted = [...active].sort((a, b) => a.hour - b.hour)
    for (let i = 0; i < sorted.length; i++) {
      let sum = 0
      const start = sorted[i].hour
      for (let j = i; j < sorted.length && sorted[j].hour <= start + 2; j++) {
        sum += sorted[j].margin
      }
      if (sum > bestWindow.sum) {
        bestWindow = { start, sum }
      }
    }
    const optimalLabel =
      bestWindow.sum === -Infinity ? ' ' : `${bestWindow.start}h–${bestWindow.start + 2}h`

    return {
      best: `${best.hour}h (${formatEuroKpi(best.margin)})`,
      worst: `${worst.hour}h (${formatEuroKpi(worst.margin)})`,
      optimal: optimalLabel,
    }
  }, [hourly.data])

  const weekdayChartData = useMemo(() => {
    return [...weekday.data]
      .sort((a, b) => a.weekday - b.weekday)
      .map((row) => {
        const base = row.avg_revenue_without_event
        const withEv = row.avg_revenue_with_event
        let barColor = WEEKDAY_BLUE
        if (row.days_with_events > 0 && base > 0) {
          const lift = (withEv - base) / base
          if (withEv > base * 1.2) barColor = WEEKDAY_GREEN
          else if (withEv <= base || lift < 0) barColor = WEEKDAY_ORANGE
          else if (Math.abs(lift) < 0.2) barColor = WEEKDAY_BLUE
        }
        const eventPct =
          row.days_with_events > 0 && base > 0
            ? ((withEv - base) / base) * 100
            : null
        return {
          ...row,
          barColor,
          eventPct,
          shortName: row.weekday_name.slice(0, 3),
        }
      })
  }, [weekday.data])

  const weekdayKpi = useMemo(() => {
    const withEvents = weekday.data.filter((d) => d.days_with_events > 0 && d.avg_revenue_without_event > 0)
    if (withEvents.length === 0) {
      return 'Los eventos no impactan significativamente'
    }
    let best: WeekdayAnalysisRow | null = null
    let bestLift = -Infinity
    for (const d of withEvents) {
      const lift = ((d.avg_revenue_with_event - d.avg_revenue_without_event) / d.avg_revenue_without_event) * 100
      if (lift > bestLift) {
        bestLift = lift
        best = d
      }
    }
    if (!best || bestLift < 5) {
      return 'Los eventos no impactan significativamente'
    }
    return `El polideportivo sube el ticket un ${bestLift.toFixed(1)}% los ${best.weekday_name}`
  }, [weekday.data])

  const productChartData = useMemo(() => {
    return products.data.slice(0, 15).map((p) => {
      const marginPct =
        p.avg_sale_price > 0 ? (p.margin_per_unit / p.avg_sale_price) * 100 : 0
      let fill = MARGIN_BAR_MID
      if (marginPct > 60) fill = MARGIN_BAR_HIGH
      else if (marginPct < 30) fill = MARGIN_BAR_LOW
      return {
        ...p,
        shortName: p.product_name.length > 28 ? `${p.product_name.slice(0, 26)}…` : p.product_name,
        fill,
        marginPct,
      }
    })
  }, [products.data])

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 space-y-3">
          <h1 className="text-xl font-black tracking-tight text-[#36606F]">Rentabilidad</h1>
          <div className="flex flex-wrap gap-2">
            {([7, 30, 90] as PresetDays[]).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => applyPreset(days)}
                className={cn(
                  'min-h-12 shrink-0 rounded-xl px-4 text-sm font-black uppercase tracking-wide border active:scale-95 transition-all',
                  activePreset === days
                    ? 'bg-[#36606F] text-white border-[#36606F]'
                    : 'bg-white text-zinc-700 border-zinc-200'
                )}
              >
                {days} días
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <label className="flex-1 text-xs font-bold text-zinc-500">
              Desde
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setActivePreset(null)
                  setDateFrom(e.target.value)
                }}
                className="mt-1 block w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-800"
              />
            </label>
            <label className="flex-1 text-xs font-bold text-zinc-500">
              Hasta
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setActivePreset(null)
                  setDateTo(e.target.value)
                }}
                className="mt-1 block w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-800"
              />
            </label>
            <button
              type="button"
              onClick={applyCustomRange}
              className="min-h-12 shrink-0 rounded-xl bg-[#36606F] px-5 text-sm font-black uppercase tracking-wide text-white active:scale-95"
            >
              Aplicar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sección 1 */}
          <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#36606F] mb-3">
              Venta vs. Coste por hora
            </h2>
            {hourly.error ? (
              <SectionErrorBanner message={hourly.error} onRetry={() => void fetchHourly(dateFrom, dateTo)} />
            ) : hourly.loading ? (
              <SectionSkeleton rows={6} />
            ) : (
              <>
                <div className="overflow-x-auto -mx-1 px-1 pb-2">
                  <div className="min-w-[520px] h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={hourlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload as HourlyProfitabilityRow & { label: string }
                            return (
                              <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 shadow-lg text-xs">
                                <p className="font-black text-[#36606F]">{row.label}</p>
                                <p>Ventas: {formatEuroChart(row.total_revenue)}</p>
                                <p>M. obra: {formatEuroChart(row.labor_cost)}</p>
                                <p>Margen: {formatEuroChart(row.margin)}</p>
                                <p>Tickets: {row.ticket_count}</p>
                                <p>Ticket medio: {formatEuroChart(row.avg_ticket)}</p>
                              </div>
                            )
                          }}
                        />
                        <Legend />
                        <Bar dataKey="total_revenue" name="Ventas" fill={PETROLEO} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="labor_cost" name="M. obra" fill={LABOR_RED} radius={[4, 4, 0, 0]} />
                        <Line
                          type="monotone"
                          dataKey="margin"
                          name="Margen"
                          stroke={MARGIN_GREEN}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                  <KpiChip label="Hora más rentable" value={hourlyKpis.best} />
                  <KpiChip label="Hora de mayor pérdida" value={hourlyKpis.worst} />
                  <KpiChip label="Franja óptima de apertura" value={hourlyKpis.optimal} />
                </div>
              </>
            )}
          </section>

          {/* Sección 2 */}
          <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#36606F] mb-3">
              Rendimiento por día de semana
            </h2>
            {weekday.error ? (
              <SectionErrorBanner message={weekday.error} onRetry={() => void fetchWeekday(dateFrom, dateTo)} />
            ) : weekday.loading ? (
              <SectionSkeleton rows={7} />
            ) : (
              <>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={weekdayChartData}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                      />
                      <YAxis
                        type="category"
                        dataKey="weekday_name"
                        width={88}
                        tick={{ fontSize: 11, fontWeight: 700 }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0]?.payload as WeekdayAnalysisRow & {
                            eventPct: number | null
                          }
                          return (
                            <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 shadow-lg text-xs space-y-1">
                              <p className="font-black text-[#36606F]">{row.weekday_name}</p>
                              <p>Media ventas: {formatEuroChart(row.avg_revenue)}</p>
                              <p>Media tickets: {row.avg_tickets.toFixed(1)}</p>
                              <p>Ticket medio: {formatEuroChart(row.avg_ticket_value)}</p>
                              {row.days_with_events > 0 ? (
                                <>
                                  <p>Con evento: {formatEuroChart(row.avg_revenue_with_event)}</p>
                                  <p>Sin evento: {formatEuroChart(row.avg_revenue_without_event)}</p>
                                </>
                              ) : null}
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="avg_revenue" name="Media ventas" radius={[0, 4, 4, 0]}>
                        {weekdayChartData.map((entry, index) => (
                          <Cell key={`weekday-${index}`} fill={entry.barColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {weekdayChartData
                    .filter((d) => d.days_with_events > 0 && d.eventPct !== null)
                    .map((d) => (
                      <span
                        key={d.weekday}
                        className="inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-[10px] font-bold text-zinc-700"
                      >
                        {d.weekday_name}: Con evento: {formatPctKpi(d.eventPct!)}
                      </span>
                    ))}
                </div>
                <div className="mt-3">
                  <KpiChip label="Impacto polideportivo" value={weekdayKpi} />
                </div>
              </>
            )}
          </section>
        </div>

        {/* Sección 3 */}
        <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-[#36606F] mb-3">
            Margen por producto
          </h2>
          {products.error ? (
            <SectionErrorBanner message={products.error} onRetry={() => void fetchProducts()} />
          ) : products.loading ? (
            <SectionSkeleton rows={8} />
          ) : products.data.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center space-y-4">
              <p className="text-sm font-semibold text-zinc-600">
                Para ver esta sección, mapea recetas con coste en /recipes
              </p>
              <Link
                href="/recipes"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#36606F] px-6 text-sm font-black uppercase tracking-wide text-white active:scale-95"
              >
                Ir a recetas
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="min-w-[640px] h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    layout="vertical"
                    data={productChartData}
                    margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis
                      type="number"
                      xAxisId="margin"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                    />
                    <XAxis type="number" xAxisId="units" orientation="top" hide />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={120}
                      tick={{ fontSize: 10, fontWeight: 600 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload as ProductMarginRow & { marginPct: number }
                        return (
                          <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 shadow-lg text-xs space-y-1 max-w-xs">
                            <p className="font-black text-[#36606F]">{row.product_name}</p>
                            <p>Unidades: {row.total_units_sold}</p>
                            <p>Precio venta: {formatEuroChart(row.avg_sale_price)}</p>
                            <p>Coste receta: {formatEuroChart(row.recipe_cost)}</p>
                            <p>Margen unitario: {formatEuroChart(row.margin_per_unit)}</p>
                            <p>Margen total: {formatEuroChart(row.total_margin_contribution)}</p>
                          </div>
                        )
                      }}
                    />
                    <Legend />
                    <Bar
                      xAxisId="margin"
                      dataKey="total_margin_contribution"
                      name="Margen total"
                      radius={[0, 4, 4, 0]}
                    >
                      {productChartData.map((entry, index) => (
                        <Cell key={`prod-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                    <Line
                      xAxisId="units"
                      type="monotone"
                      dataKey="total_units_sold"
                      name="Unidades"
                      stroke="#9CA3AF"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
