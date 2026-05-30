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
import {
  getEuropeMadridYmdToday,
  subtractDaysFromEuropeMadridYmd,
} from '@/utils/date-utils'

type DatePreset = 'today' | 'yesterday' | 7 | 30

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

function KpiChip({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg lg:rounded-xl border border-zinc-100 bg-zinc-50/80 flex flex-col justify-center',
        compact
          ? 'px-1.5 py-1.5 min-h-0 lg:px-3 lg:py-2 lg:min-h-12'
          : 'px-3 py-2 min-h-12'
      )}
    >
      <span
        className={cn(
          'font-bold uppercase tracking-wider text-zinc-500 leading-tight',
          compact ? 'text-[7px] lg:text-[10px]' : 'text-[10px]'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'font-black text-zinc-800 tabular-nums leading-snug',
          compact ? 'text-[9px] lg:text-sm mt-0.5 lg:mt-0' : 'text-sm'
        )}
      >
        {value}
      </span>
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
  const [activePreset, setActivePreset] = useState<DatePreset | null>('today')

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

  const applyPreset = (preset: Exclude<DatePreset, 'today'>) => {
    const today = getEuropeMadridYmdToday()

    if (preset === 'yesterday') {
      const yesterday = subtractDaysFromEuropeMadridYmd(today, 1)
      setActivePreset('yesterday')
      setDateFrom(yesterday)
      setDateTo(yesterday)
      refetchAll(yesterday, yesterday)
      return
    }

    const from = subtractDaysFromEuropeMadridYmd(today, preset)
    setActivePreset(preset)
    setDateFrom(from)
    setDateTo(today)
    refetchAll(from, today)
  }

  const applyCustomRange = () => {
    const today = getEuropeMadridYmdToday()
    const yesterday = subtractDaysFromEuropeMadridYmd(today, 1)
    if (dateFrom === today && dateTo === today) setActivePreset('today')
    else if (dateFrom === yesterday && dateTo === yesterday) setActivePreset('yesterday')
    else setActivePreset(null)
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
    <div className="min-h-screen bg-[#5B8FB9] p-2 md:p-6 pb-24 text-zinc-900">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-[#36606F] px-3 md:px-5 py-3 flex flex-nowrap items-center gap-2 md:gap-3 overflow-x-auto">
            <h1 className="text-sm md:text-lg font-black text-white uppercase tracking-wider shrink-0">
              Rentabilidad
            </h1>

            <div className="flex items-center gap-1 shrink-0">
              {(
                [
                  { id: 7 as const, label: '7d' },
                  { id: 30 as const, label: '30d' },
                  { id: 'yesterday' as const, label: 'Ayer' },
                ] as const
              ).map((preset) => (
                <button
                  key={String(preset.id)}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={cn(
                    'min-h-12 shrink-0 rounded-xl px-2.5 md:px-3 text-[10px] md:text-[11px] font-black uppercase tracking-wide border active:scale-95 transition-all',
                    activePreset === preset.id
                      ? 'bg-white text-[#36606F] border-white'
                      : 'bg-white/10 text-white border-white/20 hover:bg-white/15'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 md:gap-2 ml-auto shrink-0">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setActivePreset(null)
                  setDateFrom(e.target.value)
                }}
                aria-label="Fecha desde"
                className={cn(
                  'min-h-12 w-[7.25rem] md:w-auto px-2 md:px-3 rounded-xl border border-white/15 bg-white/10 text-white shrink-0',
                  'text-[11px] md:text-[12px] font-black tabular-nums',
                  'focus:outline-none focus:ring-2 focus:ring-white/25'
                )}
              />
              <span className="text-white/50 text-xs font-bold shrink-0" aria-hidden>
                →
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setActivePreset(null)
                  setDateTo(e.target.value)
                }}
                aria-label="Fecha hasta"
                className={cn(
                  'min-h-12 w-[7.25rem] md:w-auto px-2 md:px-3 rounded-xl border border-white/15 bg-white/10 text-white shrink-0',
                  'text-[11px] md:text-[12px] font-black tabular-nums',
                  'focus:outline-none focus:ring-2 focus:ring-white/25'
                )}
              />
              <button
                type="button"
                onClick={applyCustomRange}
                className={cn(
                  'min-h-12 shrink-0 rounded-xl px-3 md:px-4',
                  'bg-white text-[#36606F] hover:bg-white/90',
                  'text-[10px] md:text-[11px] font-black uppercase tracking-widest',
                  'active:scale-[0.99] transition-transform'
                )}
              >
                Aplicar
              </button>
            </div>
          </div>

          <div className="p-2 md:p-6 space-y-2 md:space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:gap-4">
              {/* Sección 1 — móvil: gráfico | KPIs; desktop: fila superior izquierda */}
              <section className="col-span-2 lg:col-span-1 rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-4">
                <h2 className="text-[10px] lg:text-sm font-black uppercase tracking-wider text-[#36606F] mb-2 lg:mb-3">
                  Venta vs. Coste por hora
                </h2>
                {hourly.error ? (
                  <SectionErrorBanner message={hourly.error} onRetry={() => void fetchHourly(dateFrom, dateTo)} />
                ) : hourly.loading ? (
                  <SectionSkeleton rows={6} />
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 lg:gap-0">
                    <div className="min-w-0 overflow-x-auto -mx-0.5 px-0.5">
                      <div className="h-[150px] lg:h-[280px] w-full min-w-[140px] lg:min-w-[520px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={hourlyChartData}
                            margin={{ top: 4, right: 2, left: -18, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 8, fontWeight: 700 }} />
                            <YAxis
                              tick={{ fontSize: 7 }}
                              width={32}
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
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="total_revenue" name="Ventas" fill={PETROLEO} radius={[2, 2, 0, 0]} />
                            <Bar dataKey="labor_cost" name="M. obra" fill={LABOR_RED} radius={[2, 2, 0, 0]} />
                            <Line
                              type="monotone"
                              dataKey="margin"
                              name="Margen"
                              stroke={MARGIN_GREEN}
                              strokeWidth={2}
                              dot={{ r: 2 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 lg:grid lg:grid-cols-3 lg:gap-2 lg:mt-3">
                      <KpiChip compact label="Hora más rentable" value={hourlyKpis.best} />
                      <KpiChip compact label="Hora de mayor pérdida" value={hourlyKpis.worst} />
                      <KpiChip compact label="Franja óptima de apertura" value={hourlyKpis.optimal} />
                    </div>
                  </div>
                )}
              </section>

              {/* Sección 2 — móvil: mitad izquierda; desktop: fila superior derecha */}
              <section className="col-span-1 rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-4 min-w-0">
                <h2 className="text-[9px] lg:text-sm font-black uppercase tracking-wider text-[#36606F] mb-2 lg:mb-3 leading-tight">
                  Rend. por día
                </h2>
                {weekday.error ? (
                  <SectionErrorBanner message={weekday.error} onRetry={() => void fetchWeekday(dateFrom, dateTo)} />
                ) : weekday.loading ? (
                  <SectionSkeleton rows={5} />
                ) : (
                  <>
                    <div className="h-[180px] lg:h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={weekdayChartData}
                          margin={{ top: 2, right: 4, left: 0, bottom: 2 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 7 }}
                            tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                          />
                          <YAxis
                            type="category"
                            dataKey="shortName"
                            width={28}
                            tick={{ fontSize: 8, fontWeight: 700 }}
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
                          <Bar dataKey="avg_revenue" name="Media ventas" radius={[0, 3, 3, 0]}>
                            {weekdayChartData.map((entry, index) => (
                              <Cell key={`weekday-${index}`} fill={entry.barColor} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 hidden lg:flex flex-wrap gap-2">
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
                    <div className="mt-2 hidden lg:block">
                      <KpiChip label="Impacto polideportivo" value={weekdayKpi} />
                    </div>
                    <p className="mt-1.5 lg:hidden text-[8px] font-semibold text-zinc-600 leading-tight line-clamp-3">
                      {weekdayKpi}
                    </p>
                  </>
                )}
              </section>

              {/* Sección 3 — móvil: mitad derecha; desktop: fila inferior ancho completo */}
              <section className="col-span-1 lg:col-span-2 rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-4 min-w-0">
                <h2 className="text-[9px] lg:text-sm font-black uppercase tracking-wider text-[#36606F] mb-2 lg:mb-3 leading-tight">
                  Margen producto
                </h2>
                {products.error ? (
                  <SectionErrorBanner message={products.error} onRetry={() => void fetchProducts()} />
                ) : products.loading ? (
                  <SectionSkeleton rows={5} />
                ) : products.data.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3 lg:p-6 text-center space-y-3">
                    <p className="text-[10px] lg:text-sm font-semibold text-zinc-600 leading-tight">
                      Mapea recetas con coste en /recipes
                    </p>
                    <Link
                      href="/recipes"
                      className="inline-flex min-h-10 lg:min-h-12 items-center justify-center rounded-xl bg-[#36606F] px-4 lg:px-6 text-[10px] lg:text-sm font-black uppercase tracking-wide text-white active:scale-95"
                    >
                      Ir a recetas
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-0.5 px-0.5">
                    <div className="h-[180px] lg:h-[420px] w-full min-w-0 lg:min-w-[640px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          layout="vertical"
                          data={productChartData}
                          margin={{ top: 2, right: 8, left: 0, bottom: 2 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                          <XAxis
                            type="number"
                            xAxisId="margin"
                            tick={{ fontSize: 7 }}
                            tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                          />
                          <XAxis type="number" xAxisId="units" orientation="top" hide />
                          <YAxis
                            type="category"
                            dataKey="shortName"
                            width={52}
                            tick={{ fontSize: 7, fontWeight: 600 }}
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
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar
                            xAxisId="margin"
                            dataKey="total_margin_contribution"
                            name="Margen total"
                            radius={[0, 3, 3, 0]}
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
                            strokeWidth={1.5}
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
        </div>
      </div>
    </div>
  )
}
