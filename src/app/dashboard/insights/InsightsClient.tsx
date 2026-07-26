'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, RefreshCw, X } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn, formatDisplayValue } from '@/lib/utils'
import {
  ActionDialog,
  Alert,
  Button,
  EmptyState,
  LoadingBlock,
  Metric,
  Section,
  Surface,
  Text,
} from '@/components/mds'
import {
  getHourlySalesVsLabor,
  getWeekdayAnalysis,
  getProductMarginRanking,
  getFinancialSummary,
} from './actions'
import type { FinancialSummaryData, FinancialStatementLine } from './actions'
import type {
  HourlyProfitabilityRow,
  WeekdayAnalysisRow,
  ProductMarginRow,
} from './schemas'
import {
  InsightsMainDateFilter,
} from './insights-date-filter'
import {
  mondayOfWeekContaining,
  monthBounds,
  type InsightsFilterMode,
  type InsightsMonth,
  weekBoundsFromMonday,
} from './insights-date-utils'

type SectionKey = 'hourly' | 'weekday' | 'products' | 'financial'

type SectionState<T> = {
  data: T
  loading: boolean
  error: string | null
}

type InsightsClientProps = {
  initialDateFrom: string
  initialDateTo: string
  initialFinancialMonth: InsightsMonth
  initialHourly: HourlyProfitabilityRow[]
  initialWeekday: WeekdayAnalysisRow[]
  initialProducts: ProductMarginRow[]
  initialFinancial: FinancialSummaryData | null
  initialFinancialForbidden?: boolean
  initialErrors?: Partial<Record<SectionKey, string>>
}

/** Colores de gráfico alineados a tokens MDS (recharts necesita string). */
const CHART_PRIMARY = 'var(--mds-primary)'
const CHART_LABOR = 'var(--mds-danger)'
const CHART_MARGIN = 'var(--mds-success)'
const CHART_MARGIN_HIGH = 'var(--mds-success)'
const CHART_MARGIN_MID = 'color-mix(in srgb, var(--mds-success) 70%, white)'
const CHART_MARGIN_LOW = 'var(--mds-warning)'
const CHART_UNITS = 'var(--mds-muted)'
const HOURLY_CHART_START = 7
const HOURLY_CHART_END = 23

const BONUS_LABOR_EUR = 1700
const GASTOS_FIJOS_OTROS_EUR = 0

type FinancialModalKind = 'income' | 'expenses' | 'margin' | 'cash'

const EXPENSE_LINE_LABELS: Record<string, string> = {
  purchases_invoices: 'Compras',
  payroll_total: 'Nóminas',
  overtime: 'Horas extras',
  rent_monthly: 'Alquiler',
}

function signedEuroTone(value: number, positiveTone: string, negativeTone: string): string {
  if (value === 0 || Object.is(value, -0)) return 'text-mds-foreground'
  return value > 0 ? positiveTone : negativeTone
}

/** Rentabilidad PyG (% sobre venta neta): &lt;10 rojo, 10–20 naranja, 20–30 ámbar, ≥30 verde. */
function profitabilityTone(pct: number): string {
  if (pct < 10) return 'text-mds-danger'
  if (pct < 20) return 'text-mds-warning'
  if (pct < 30) return 'text-mds-warning'
  return 'text-mds-success'
}

function FinancialKpiChip({
  label,
  value,
  valueClassName,
  badge,
  badgePlain,
  tooltip,
  className,
  onClick,
}: {
  label: string
  value: string
  valueClassName?: string
  badge?: string
  badgePlain?: boolean
  tooltip?: string
  className?: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'min-h-12 w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-mds-primary/30',
        onClick && 'cursor-pointer rounded-xl active:scale-[0.99]',
        className
      )}
      title={tooltip}
    >
      <Metric
        title={label}
        value={
          <span className={cn('tabular-nums', valueClassName ?? 'text-mds-foreground')}>
            {value}
            {badge && badge !== ' ' ? (
              <span
                className={cn(
                  'mt-0.5 block text-xs font-black tabular-nums text-mds-foreground',
                  !badgePlain && 'rounded-md bg-mds-muted-surface px-1.5 py-0.5'
                )}
              >
                {badge}
              </span>
            ) : null}
          </span>
        }
        empty={value === ' '}
        className="h-full"
      />
    </Comp>
  )
}

function FinancialDetailModal({
  open,
  title,
  onClose,
  children,
  footnote,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footnote?: string
}) {
  useModalUsageTracking({
    open,
    usageId: `insights-financial-${title.toLowerCase().replace(/\s+/g, '-')}`,
    usageLabel: title,
  })

  return (
    <ActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={title}
      description={footnote}
    >
      {children}
    </ActionDialog>
  )
}

function FinancialDetailRow({
  label,
  amount,
  amountClassName,
}: {
  label: string
  amount: number
  amountClassName?: string
}) {
  const displayed = formatEuroKpi(amount)
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <Text variant="caption">{label}</Text>
      <span
        className={cn(
          'text-sm font-black tabular-nums whitespace-nowrap',
          amountClassName ?? 'text-mds-foreground'
        )}
      >
        {displayed === ' ' ? ' ' : displayed}
      </span>
    </div>
  )
}

function expenseLineAmount(lines: FinancialStatementLine[], key: string): number {
  return lines.find((l) => l.key === key)?.amount ?? 0
}

function FinancialDetailGroupRow({
  label,
  amount,
  subRows,
}: {
  label: string
  amount: number
  subRows: { label: string; amount: number }[]
}) {
  const [open, setOpen] = useState(false)
  const displayed = formatEuroKpi(amount)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-12 items-baseline justify-between gap-4 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-mds-primary/30 active:bg-mds-muted-surface/80 rounded-lg"
      >
        <span className="flex min-w-0 items-center gap-1">
          <Text variant="caption">{label}</Text>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-mds-muted transition-transform duration-150',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </span>
        <span className="text-sm font-black tabular-nums text-mds-foreground whitespace-nowrap shrink-0">
          {displayed === ' ' ? ' ' : displayed}
        </span>
      </button>
      {open ? (
        <div className="pl-3 pb-1 space-y-0">
          {subRows.map((row) => (
            <FinancialDetailRow key={row.label} label={row.label} amount={row.amount} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ExpensesBreakdownBody({ expenseLines }: { expenseLines: FinancialStatementLine[] }) {
  const purchases = expenseLineAmount(expenseLines, 'purchases_invoices')
  const payroll = expenseLineAmount(expenseLines, 'payroll_total')
  const overtime = expenseLineAmount(expenseLines, 'overtime')
  const rent = expenseLineAmount(expenseLines, 'rent_monthly')
  const laborTotal = payroll + overtime + BONUS_LABOR_EUR
  const fixedTotal = rent + GASTOS_FIJOS_OTROS_EUR

  return (
    <div className="space-y-1">
      <FinancialDetailRow
        label={EXPENSE_LINE_LABELS.purchases_invoices}
        amount={purchases}
      />
      <FinancialDetailGroupRow
        label="Mano de obra"
        amount={laborTotal}
        subRows={[
          { label: EXPENSE_LINE_LABELS.payroll_total, amount: payroll },
          { label: EXPENSE_LINE_LABELS.overtime, amount: overtime },
          { label: 'Bonus', amount: BONUS_LABOR_EUR },
        ]}
      />
      <FinancialDetailGroupRow
        label="Gastos fijos"
        amount={fixedTotal}
        subRows={[
          { label: EXPENSE_LINE_LABELS.rent_monthly, amount: rent },
          { label: 'Otros', amount: GASTOS_FIJOS_OTROS_EUR },
        ]}
      />
    </div>
  )
}

function formatEuroChart(value: number, digits = 2): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatFoodCostPct(recipeCost: number, salePrice: number): string {
  if (salePrice <= 0) return ' '
  const pct = (recipeCost / salePrice) * 100
  const displayed = formatDisplayValue(Number(pct.toFixed(1)))
  if (displayed === ' ') return ' '
  return `${displayed}%`
}

function formatEuroKpi(value: number): string {
  const displayed = formatDisplayValue(
    value === 0 ? 0 : Number(value.toFixed(2))
  )
  if (displayed === ' ') return ' '
  return formatEuroChart(Number(value))
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return <LoadingBlock lines={rows} />
}

function SectionErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Alert
      tone="danger"
      title={message}
      action={
        <Button variant="danger" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
      }
    />
  )
}

/** Escritorio: lg (1024px)+ */
function useIsLgDesktop() {
  const [isLg, setIsLg] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsLg(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isLg
}

function ProductStat({
  label,
  value,
  prominent = false,
  className,
}: {
  label: string
  value: string
  prominent?: boolean
  className?: string
}) {
  const valueEl = (
    <span
      className={cn(
        'block font-black text-mds-foreground tabular-nums leading-tight',
        prominent ? 'text-xs sm:text-sm' : 'mt-0.5 text-[8px] lg:text-[10px]'
      )}
    >
      {value}
    </span>
  )
  const labelEl = (
    <span
      className={cn(
        'block font-bold uppercase tracking-wider text-mds-muted',
        prominent ? 'mt-0.5 text-[8px] sm:text-[9px]' : 'text-[8px] lg:text-[10px]'
      )}
    >
      {label}
    </span>
  )

  return (
    <div
      className={cn(
        'min-w-0 flex flex-col',
        prominent && 'items-center justify-center text-center min-h-[2.25rem]',
        className
      )}
    >
      {prominent ? (
        <>
          {valueEl}
          {labelEl}
        </>
      ) : (
        <>
          {labelEl}
          {valueEl}
        </>
      )}
    </div>
  )
}

function WeekdayDetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center leading-tight">
      <span className="block text-[8px] sm:text-[9px] font-black tabular-nums text-mds-foreground">
        {value}
      </span>
      <span className="mt-1 block text-[6px] sm:text-[7px] font-bold uppercase tracking-wide text-mds-muted">
        {label}
      </span>
    </div>
  )
}

function WeekdayDetailCard({
  day,
  onClose,
}: {
  day: WeekdayAnalysisRow
  onClose: () => void
}) {
  const ticketsValue = day.avg_tickets === 0 ? ' ' : day.avg_tickets.toFixed(1)

  return (
    <Surface
      variant="elevated"
      className="relative flex h-full min-h-0 flex-col overflow-hidden px-1.5 py-1.5 lg:flex-row lg:items-center lg:gap-4 lg:px-4 lg:py-3"
    >
      <Button
        type="button"
        variant="icon"
        onClick={onClose}
        aria-label="Cerrar detalle del día"
        className="absolute right-0 top-0 z-10 size-8 min-h-8 min-w-8 lg:static lg:order-last lg:ml-1"
      >
        <X className="size-3" />
      </Button>
      <div className="flex min-h-0 flex-1 items-center justify-center lg:flex-none lg:shrink-0 lg:min-w-[4.5rem]">
        <p className="w-full px-0.5 text-center text-[9px] sm:text-[10px] font-black leading-tight text-mds-primary line-clamp-2 lg:text-xs">
          {day.weekday_name}
        </p>
      </div>
      <div className="shrink-0 flex flex-col gap-2.5 pb-0.5 lg:flex-1 lg:flex-row lg:items-center lg:justify-around lg:gap-3 lg:pb-0 lg:pt-0">
        <WeekdayDetailStat label="Media ventas" value={formatEuroKpi(day.avg_revenue)} />
        <WeekdayDetailStat label="Media tickets" value={ticketsValue} />
        <WeekdayDetailStat label="Ticket medio" value={formatEuroKpi(day.avg_ticket_value)} />
      </div>
    </Surface>
  )
}

function ProductDetailCard({
  product,
  onClose,
  onOpenRecipe,
}: {
  product: ProductMarginRow
  onClose: () => void
  onOpenRecipe: (recipeId: string | null | undefined, productName: string) => void
}) {
  return (
    <Surface variant="default" className="space-y-2 w-full max-w-full p-3">
      <div className="flex items-start justify-between gap-2">
        {product.recipe_id ? (
          <button
            type="button"
            onClick={() => onOpenRecipe(product.recipe_id, product.product_name)}
            className="min-h-12 text-left text-sm sm:text-base font-black text-mds-primary leading-snug hover:underline active:scale-[0.99]"
          >
            {product.product_name}
          </button>
        ) : (
          <p className="text-sm sm:text-base font-black text-mds-foreground leading-snug">
            {product.product_name}
          </p>
        )}
        <Button
          type="button"
          variant="icon"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="size-9 min-h-9 min-w-9"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 grid-rows-2 gap-x-1.5 gap-y-1">
        <ProductStat
          prominent
          label="Unidades"
          value={product.total_units_sold === 0 ? ' ' : String(product.total_units_sold)}
        />
        <ProductStat prominent label="P. venta" value={formatEuroKpi(product.avg_sale_price)} />
        <ProductStat prominent label="Coste receta" value={formatEuroKpi(product.recipe_cost)} />
        <ProductStat
          prominent
          label="Food cost"
          value={formatFoodCostPct(product.recipe_cost, product.avg_sale_price)}
        />
        <ProductStat prominent label="Margen / ud." value={formatEuroKpi(product.margin_per_unit)} />
        <ProductStat
          prominent
          label="Margen total"
          value={formatEuroKpi(product.total_margin_contribution)}
        />
      </div>
    </Surface>
  )
}

function KpiFloat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-w-0 px-1 py-0.5 text-center w-full">
      <span className="text-[9px] lg:text-sm font-black text-mds-foreground tabular-nums leading-snug line-clamp-2">
        {value}
      </span>
      <span className="mt-1 text-[7px] lg:text-[10px] font-bold uppercase tracking-wider text-mds-muted leading-tight">
        {label}
      </span>
    </div>
  )
}

function WeekdayKpiFloat({
  value,
  dayName,
  conceptLabel,
}: {
  value: string
  dayName: string
  conceptLabel: string
}) {
  return (
    <div className="flex flex-col items-center justify-center min-w-0 px-1 py-0.5 text-center w-full">
      <span className="text-[9px] lg:text-sm font-black text-mds-foreground tabular-nums leading-snug line-clamp-2">
        {value}
      </span>
      <span className="mt-1 text-[8px] lg:text-[11px] font-bold text-mds-primary leading-tight line-clamp-2">
        {dayName}
      </span>
      <span className="mt-1 text-[7px] lg:text-[10px] font-bold uppercase tracking-wider text-mds-muted leading-tight">
        {conceptLabel}
      </span>
    </div>
  )
}

type LegendItem = {
  label: string
  color: string
  variant?: 'bar' | 'line'
  swatchOutline?: boolean
}

function ChartLegend({ legend }: { legend: LegendItem[] }) {
  return (
    <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-wrap">
      {legend.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1 text-[8px] lg:text-[10px] font-bold text-mds-muted whitespace-nowrap"
        >
          {item.variant === 'line' ? (
            <span
              className="w-3 h-0.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
          ) : (
            <span
              className={cn(
                'w-2 h-2 shrink-0 rounded-sm',
                item.swatchOutline && 'ring-1 ring-mds-border'
              )}
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
          )}
          {item.label}
        </span>
      ))}
    </div>
  )
}

function SectionTitleRow({
  title,
  legend,
  actions,
}: {
  title: string
  legend?: LegendItem[]
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between gap-y-2 shrink-0 px-1 py-1">
      <Text as="h2" variant="title" className="text-base lg:text-lg shrink-0">
        {title}
      </Text>
      {(actions || (legend && legend.length > 0)) && (
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-wrap ml-auto">
          {actions}
          {legend ? <ChartLegend legend={legend} /> : null}
        </div>
      )}
    </div>
  )
}

export default function InsightsClient({
  initialDateFrom,
  initialDateTo,
  initialFinancialMonth,
  initialHourly,
  initialWeekday,
  initialProducts,
  initialFinancial,
  initialFinancialForbidden = false,
  initialErrors,
}: InsightsClientProps) {
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [filterMode, setFilterMode] = useState<InsightsFilterMode>('mes')
  const [openPicker, setOpenPicker] = useState<InsightsFilterMode | null>(null)
  const [selectedWeekMonday, setSelectedWeekMonday] = useState(() =>
    mondayOfWeekContaining(initialDateFrom)
  )
  const [selectedMonths, setSelectedMonths] = useState<InsightsMonth[]>([initialFinancialMonth])
  const [selectedDay, setSelectedDay] = useState(initialDateTo)
  const [periodFrom, setPeriodFrom] = useState(initialDateFrom)
  const [periodTo, setPeriodTo] = useState(initialDateTo)

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
  const [financial, setFinancial] = useState<{
    data: FinancialSummaryData | null
    loading: boolean
    error: string | null
    forbidden: boolean
  }>({
    data: initialFinancial,
    loading: false,
    error: initialErrors?.financial ?? null,
    forbidden: initialFinancialForbidden,
  })
  const [selectedProductIdx, setSelectedProductIdx] = useState<number | null>(null)
  const [selectedWeekdayIdx, setSelectedWeekdayIdx] = useState<number | null>(null)
  const isLgDesktop = useIsLgDesktop()
  const [financialModal, setFinancialModal] = useState<FinancialModalKind | null>(null)
  const router = useRouter()

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

  const fetchProducts = useCallback(async (from: string, to: string) => {
    setProducts((s) => ({ ...s, loading: true, error: null }))
    const res = await getProductMarginRanking(15, from, to)
    if (res.success) {
      setProducts({ data: res.data, loading: false, error: null })
    } else {
      setProducts((s) => ({ ...s, loading: false, error: res.error }))
    }
  }, [])

  const fetchFinancial = useCallback(async (from: string, to: string) => {
    setFinancial((s) => ({ ...s, loading: true, error: null, forbidden: false }))
    const res = await getFinancialSummary(from, to)
    if (res.success) {
      setFinancial({ data: res.data, loading: false, error: null, forbidden: false })
    } else {
      setFinancial({
        data: null,
        loading: false,
        error: res.error || 'No se pudo cargar el estado financiero',
        forbidden: false,
      })
    }
  }, [])

  const refetchAnalytics = useCallback(
    (from: string, to: string) => {
      setDateFrom(from)
      setDateTo(to)
      void fetchHourly(from, to)
      void fetchWeekday(from, to)
      void fetchProducts(from, to)
    },
    [fetchHourly, fetchWeekday, fetchProducts]
  )

  const handleOpenPicker = useCallback((m: InsightsFilterMode) => {
    setOpenPicker((prev) => (prev === m ? null : m))
  }, [])

  const handleSelectWeek = useCallback(
    (monday: string) => {
      const { from, to } = weekBoundsFromMonday(monday)
      setSelectedWeekMonday(monday)
      setFilterMode('sem')
      setOpenPicker(null)
      refetchAnalytics(from, to)
    },
    [refetchAnalytics]
  )

  const handleSelectMonths = useCallback(
    (months: InsightsMonth[]) => {
      if (months.length === 0) return
      setSelectedMonths(months)
      setFilterMode('mes')
      setOpenPicker(null)
      const froms = months.map(m => monthBounds(m).from).sort()
      const tos = months.map(m => monthBounds(m).to).sort()
      const from = froms[0]
      const to = tos[tos.length - 1]
      refetchAnalytics(from, to)
      void fetchFinancial(from, to)
    },
    [refetchAnalytics, fetchFinancial]
  )

  const handleSelectDay = useCallback(
    (ymd: string) => {
      setSelectedDay(ymd)
      setFilterMode('dia')
      setOpenPicker(null)
      refetchAnalytics(ymd, ymd)
    },
    [refetchAnalytics]
  )

  const handleApplyPeriod = useCallback(
    (from: string, to: string) => {
      if (!from || !to) return
      const [f, t] = from <= to ? [from, to] : [to, from]
      setPeriodFrom(f)
      setPeriodTo(t)
      setFilterMode('periodo')
      setOpenPicker(null)
      refetchAnalytics(f, t)
    },
    [refetchAnalytics]
  )

  const hourlyChartData = useMemo(() => {
    const byHour = new Map(hourly.data.map((r) => [r.hour, r]))
    const rows: (HourlyProfitabilityRow & { label: string })[] = []
    for (let hour = HOURLY_CHART_START; hour <= HOURLY_CHART_END; hour++) {
      const row = byHour.get(hour)
      rows.push({
        hour,
        total_revenue: row?.total_revenue ?? 0,
        ticket_count: row?.ticket_count ?? 0,
        avg_ticket: row?.avg_ticket ?? 0,
        labor_cost: row?.labor_cost ?? 0,
        margin: row?.margin ?? 0,
        label: `${hour}h`,
      })
    }
    return rows
  }, [hourly.data])

  const hourlyKpis = useMemo(() => {
    const active = hourly.data.filter(
      (r) =>
        r.hour >= HOURLY_CHART_START &&
        r.hour <= HOURLY_CHART_END &&
        (r.total_revenue > 0 || r.labor_cost > 0)
    )
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

    const marginStr = (v: number) => {
      const e = formatEuroKpi(v)
      return e === ' ' ? '' : ` · ${e}`
    }

    return {
      best: `${best.hour}h${marginStr(best.margin)}`,
      worst: `${worst.hour}h${marginStr(worst.margin)}`,
      optimal: optimalLabel,
    }
  }, [hourly.data])

  const weekdayChartData = useMemo(() => {
    return [...weekday.data]
      .sort((a, b) => a.weekday - b.weekday)
      .map((row) => ({
        ...row,
        shortName: row.weekday_name.slice(0, 3),
      }))
  }, [weekday.data])

  const weekdayKpis = useMemo(() => {
    const empty = { value: ' ', dayName: ' ' }
    const withRevenue = weekday.data.filter((d) => d.avg_revenue > 0)
    if (withRevenue.length === 0) {
      return { best: empty, worst: empty }
    }
    const best = withRevenue.reduce((a, b) => (b.avg_revenue > a.avg_revenue ? b : a))
    const worst = withRevenue.reduce((a, b) => (b.avg_revenue < a.avg_revenue ? b : a))

    return {
      best: {
        value: formatEuroKpi(best.avg_revenue),
        dayName: best.weekday_name,
      },
      worst: {
        value: formatEuroKpi(worst.avg_revenue),
        dayName: worst.weekday_name,
      },
    }
  }, [weekday.data])

  const rankedProducts = useMemo(() => products.data.slice(0, 15), [products.data])

  const productChartData = useMemo(() => {
    return rankedProducts.map((p) => {
      const marginPct =
        p.avg_sale_price > 0 ? (p.margin_per_unit / p.avg_sale_price) * 100 : 0
      let fill = CHART_MARGIN_MID
      if (marginPct > 60) fill = CHART_MARGIN_HIGH
      else if (marginPct < 30) fill = CHART_MARGIN_LOW
      return {
        ...p,
        shortName:
          p.product_name.length > 8 ? `${p.product_name.slice(0, 6)}…` : p.product_name,
        fill,
        marginPct,
      }
    })
  }, [rankedProducts])

  const productChartHeight = useMemo(() => {
    if (!isLgDesktop) return 248
    const rowH = 20
    return Math.min(280, Math.max(168, rankedProducts.length * rowH + 8))
  }, [isLgDesktop, rankedProducts.length])

  const productCardAnchorStyle = useMemo((): CSSProperties => {
    if (selectedProductIdx === null || rankedProducts.length === 0) {
      return { left: '50%', transform: 'translateX(-50%)' }
    }
    const pct = ((selectedProductIdx + 0.5) / rankedProducts.length) * 100
    if (pct <= 22) return { left: '0', transform: 'none' }
    if (pct >= 78) return { right: '0', left: 'auto', transform: 'none' }
    return { left: `${pct}%`, transform: 'translateX(-50%)' }
  }, [selectedProductIdx, rankedProducts.length])

  const selectedProduct =
    selectedProductIdx !== null ? (rankedProducts[selectedProductIdx] ?? null) : null

  const selectedWeekday =
    selectedWeekdayIdx !== null ? (weekdayChartData[selectedWeekdayIdx] ?? null) : null

  const handleOpenRecipe = useCallback(
    (recipeId: string | null | undefined, productName: string) => {
      if (!recipeId) return
      const ok = window.confirm(
        `¿Abrir la receta de «${productName}»? Saldrás de Insights.`
      )
      if (ok) router.push(`/recipes/${recipeId}`)
    },
    [router]
  )

  const financialKpis = useMemo(() => {
    if (!financial.data) return null
    const { pyg, cobrosTotales } = financial.data
    const marginPct =
      pyg.income.total > 0 ? (pyg.net / pyg.income.total) * 100 : null
    const marginBadge =
      marginPct === null
        ? ' '
        : formatDisplayValue(Number(marginPct.toFixed(1))) === ' '
          ? ' '
          : `${Number(marginPct.toFixed(1))}%`
    return {
      income: formatEuroKpi(pyg.income.total),
      expenses: formatEuroKpi(pyg.expenses.total),
      pygNet: formatEuroKpi(pyg.net),
      marginBadge,
      rentabilidadTone:
        marginPct === null ? 'text-mds-foreground' : profitabilityTone(marginPct),
      cobrosTotales: formatEuroKpi(cobrosTotales),
      incomeTone: signedEuroTone(pyg.income.total, 'text-mds-success', 'text-mds-danger'),
      expensesTone: 'text-mds-danger',
      pygNetTone: signedEuroTone(pyg.net, 'text-mds-success', 'text-mds-danger'),
      cobrosTone: signedEuroTone(cobrosTotales, 'text-mds-success', 'text-mds-danger'),
    }
  }, [financial.data])

  const marginPctRaw = useMemo(() => {
    if (!financial.data) return null
    const income = financial.data.pyg.income.total
    if (income <= 0) return null
    return (financial.data.pyg.net / income) * 100
  }, [financial.data])

  type FinancialModalContent = {
    title: string
    body: ReactNode
    footnote?: string
  }

  const financialModalContent = useMemo((): FinancialModalContent | null => {
    if (!financial.data || !financialModal) return null
    const {
      pyg,
      expenseLines,
      efectivoEntradas,
      salesGross,
      cardPayments,
      cobrosTotales,
    } = financial.data

    switch (financialModal) {
      case 'income':
        return {
          title: 'Ventas',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow label="Facturación" amount={salesGross} />
              <FinancialDetailRow label="Venta neta" amount={pyg.income.total} />
            </div>
          ),
        }
      case 'expenses':
        return {
          title: 'Gastos totales',
          body: <ExpensesBreakdownBody expenseLines={expenseLines} />,
        }
      case 'margin': {
        const rentabilidadPct =
          marginPctRaw === null
            ? null
            : formatDisplayValue(Number(marginPctRaw.toFixed(1))) === ' '
              ? null
              : Number(marginPctRaw.toFixed(1))
        const rentabilidadDisplayed =
          rentabilidadPct === null ? ' ' : `${rentabilidadPct}%`
        return {
          title: 'Margen PyG',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow
                label="Venta neta"
                amount={pyg.income.total}
                amountClassName="text-mds-success"
              />
              <FinancialDetailRow
                label="Gastos"
                amount={pyg.expenses.total}
                amountClassName="text-mds-danger"
              />
              <FinancialDetailRow label="Margen" amount={pyg.net} />
              <div className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-xs font-semibold text-mds-muted">Rentabilidad</span>
                <span
                  className={cn(
                    'text-sm font-black tabular-nums whitespace-nowrap',
                    rentabilidadPct === null
                      ? 'text-mds-foreground'
                      : profitabilityTone(rentabilidadPct)
                  )}
                >
                  {rentabilidadDisplayed}
                </span>
              </div>
            </div>
          ),
        }
      }
      case 'cash':
        return {
          title: 'Cobros totales',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow label="Efectivo" amount={efectivoEntradas} />
              <FinancialDetailRow label="Tarjeta" amount={cardPayments} />
              <FinancialDetailRow label="Total" amount={cobrosTotales} />
            </div>
          ),
        }
      default:
        return null
    }
  }, [financial.data, financialModal, marginPctRaw])

  useEffect(() => {
    setSelectedProductIdx(null)
  }, [products.data])

  useEffect(() => {
    setSelectedWeekdayIdx(null)
  }, [weekday.data, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-6">
      <Section
        id="insights-filters"
        title="Periodo"
        description="Semana, mes, día o rango personalizado."
      >
        <InsightsMainDateFilter
          mode={filterMode}
          openPicker={openPicker}
          onOpenPicker={handleOpenPicker}
          onClosePicker={() => setOpenPicker(null)}
          selectedWeekMonday={selectedWeekMonday}
          selectedMonths={selectedMonths}
          selectedDay={selectedDay}
          periodFrom={periodFrom}
          periodTo={periodTo}
          onSelectWeek={handleSelectWeek}
          onSelectMonths={handleSelectMonths}
          onSelectDay={handleSelectDay}
          onApplyPeriod={handleApplyPeriod}
        />
      </Section>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 lg:gap-5">
              {/* Sección 1 — Resultado del periodo */}
              <section className={cn(
                'col-span-1 md:col-span-12 rounded-xl border bg-mds-surface shadow-sm overflow-hidden',
                filterMode === 'mes' ? 'border-mds-border' : 'border-mds-border opacity-50'
              )}>
                <SectionTitleRow title="Resultado del periodo" />
                <div className="relative p-2 lg:p-4">
                {financial.error ? (
                  <SectionErrorBanner message={financial.error} onRetry={() => {
                    if (selectedMonths.length > 0) {
                      const froms = selectedMonths.map(m => monthBounds(m).from).sort()
                      const tos = selectedMonths.map(m => monthBounds(m).to).sort()
                      void fetchFinancial(froms[0], tos[tos.length - 1])
                    }
                  }} />
                ) : financial.loading ? (
                  <SectionSkeleton rows={2} />
                ) : !financial.data ? (
                  <SectionErrorBanner
                    message={financial.error ?? 'No se pudo cargar el estado financiero'}
                    onRetry={() => {
                      if (selectedMonths.length > 0) {
                        const froms = selectedMonths.map(m => monthBounds(m).from).sort()
                        const tos = selectedMonths.map(m => monthBounds(m).to).sort()
                        void fetchFinancial(froms[0], tos[tos.length - 1])
                      }
                    }}
                  />
                ) : financialKpis ? (
                  <div className={cn('space-y-2', filterMode !== 'mes' && 'pointer-events-none')}>
                    <div className="grid grid-cols-3 gap-2">
                      <FinancialKpiChip
                        label="Venta neta"
                        value={financialKpis.income}
                        valueClassName={financialKpis.incomeTone}
                        onClick={() => setFinancialModal('income')}
                      />
                      <FinancialKpiChip
                        label="Gastos totales"
                        value={financialKpis.expenses}
                        valueClassName={financialKpis.expensesTone}
                        onClick={() => setFinancialModal('expenses')}
                      />
                      <FinancialKpiChip
                        label="Cobros totales"
                        value={financialKpis.cobrosTotales}
                        valueClassName={financialKpis.cobrosTone}
                        onClick={() => setFinancialModal('cash')}
                      />
                    </div>
                    <div className="flex justify-center">
                      <div className="grid w-full max-w-md grid-cols-2 gap-2">
                        <FinancialKpiChip
                          label="Margen PyG"
                          value={financialKpis.pygNet}
                          valueClassName={financialKpis.pygNetTone}
                          onClick={() => setFinancialModal('margin')}
                        />
                        <FinancialKpiChip
                          label="Rentabilidad"
                          value={financialKpis.marginBadge}
                          valueClassName={financialKpis.rentabilidadTone}
                          onClick={() => setFinancialModal('margin')}
                        />
                      </div>
                    </div>
                    {financialModalContent && (
                      <FinancialDetailModal
                        open={financialModal !== null}
                        title={financialModalContent.title}
                        footnote={financialModalContent.footnote}
                        onClose={() => setFinancialModal(null)}
                      >
                        {financialModalContent.body}
                      </FinancialDetailModal>
                    )}
                  </div>
                ) : null}
                {filterMode !== 'mes' && financial.data && (
                  <div className="absolute inset-0 flex items-center justify-center bg-mds-surface/40 rounded-xl">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-mds-muted bg-mds-surface/80 px-2 py-1 rounded-lg">
                      Solo disponible en vista mensual
                    </span>
                  </div>
                )}
                </div>
              </section>

              {/* Sección 2 — ancho completo, gráfico protagonista */}
              <section className="col-span-1 md:col-span-12 rounded-xl border border-mds-border bg-mds-surface shadow-sm overflow-hidden">
                <SectionTitleRow
                  title="Venta vs. Coste por hora"
                  legend={[
                    { label: 'Ventas', color: CHART_PRIMARY, variant: 'bar', swatchOutline: true },
                    { label: 'M. obra', color: CHART_LABOR, variant: 'bar' },
                    { label: 'Margen', color: CHART_MARGIN, variant: 'line' },
                  ]}
                />
                <div className="p-2 lg:p-4">
                {hourly.error ? (
                  <SectionErrorBanner message={hourly.error} onRetry={() => void fetchHourly(dateFrom, dateTo)} />
                ) : hourly.loading ? (
                  <SectionSkeleton rows={6} />
                ) : (
                  <div className="flex flex-col gap-0">
                    <div className="min-w-0 overflow-x-auto -mx-0.5 px-0.5">
                      <div className="h-[220px] sm:h-[280px] lg:h-[380px] w-full min-w-[280px] lg:min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={hourlyChartData}
                            margin={{ top: 8, right: 8, left: 4, bottom: 16 }}
                            barCategoryGap="8%"
                            barGap={2}
                          >
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 8, fontWeight: 700 }}
                              interval={0}
                              angle={-40}
                              textAnchor="end"
                              height={40}
                            />
                            <YAxis
                              tick={{ fontSize: 9 }}
                              width={40}
                              tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const row = payload[0]?.payload as HourlyProfitabilityRow & { label: string }
                                return (
                                  <div className="rounded-xl border border-mds-border bg-mds-surface px-3 py-2 shadow-lg text-xs">
                                    <p className="font-black text-mds-primary">{row.label}</p>
                                    <p>Ventas: {formatEuroChart(row.total_revenue)}</p>
                                    <p>M. obra: {formatEuroChart(row.labor_cost)}</p>
                                    <p>Margen: {formatEuroChart(row.margin)}</p>
                                    <p>Tickets: {row.ticket_count}</p>
                                    <p>Ticket medio: {formatEuroChart(row.avg_ticket)}</p>
                                  </div>
                                )
                              }}
                            />
                            <Bar
                              dataKey="total_revenue"
                              name="Ventas"
                              fill={CHART_PRIMARY}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={48}
                            />
                            <Bar
                              dataKey="labor_cost"
                              name="M. obra"
                              fill={CHART_LABOR}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={48}
                            />
                            <Line
                              type="monotone"
                              dataKey="margin"
                              name="Margen"
                              stroke={CHART_MARGIN}
                              strokeWidth={2.5}
                              dot={{ r: 3 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-2 lg:mt-3 pt-1">
                      <KpiFloat label="Hora más rentable" value={hourlyKpis.best} />
                      <KpiFloat label="Hora de mayor pérdida" value={hourlyKpis.worst} />
                      <KpiFloat label="Franja más rentable" value={hourlyKpis.optimal} />
                    </div>
                  </div>
                )}
                </div>
              </section>

              {/* Rend. por día + Margen producto: fila compartida solo en escritorio (lg+) */}
              <div className="col-span-1 md:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-5 min-w-0">
              <section className="rounded-xl border border-mds-border bg-mds-surface shadow-sm overflow-hidden min-w-0">
                <SectionTitleRow title="Rend. por día" />
                <div className="p-2 lg:p-3">
                {weekday.error ? (
                  <SectionErrorBanner message={weekday.error} onRetry={() => void fetchWeekday(dateFrom, dateTo)} />
                ) : weekday.loading ? (
                  <SectionSkeleton rows={5} />
                ) : (
                  <div className="flex flex-row lg:flex-col gap-2 lg:gap-3 min-w-0 items-stretch">
                    <div
                      className={cn(
                        'flex-1 min-w-0 w-full',
                        isLgDesktop ? 'h-[200px]' : 'h-[160px] sm:h-[180px]'
                      )}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        {isLgDesktop ? (
                          <BarChart
                            layout="vertical"
                            data={weekdayChartData}
                            margin={{ top: 2, right: 4, left: 0, bottom: 2 }}
                            barCategoryGap="4%"
                            barGap={0}
                          >
                            <XAxis
                              type="number"
                              tick={{ fontSize: 9, fontWeight: 700 }}
                              tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                            />
                            <YAxis
                              type="category"
                              dataKey="shortName"
                              width={34}
                              tick={{ fontSize: 10, fontWeight: 900 }}
                              interval={0}
                            />
                            <Tooltip content={() => null} cursor={false} />
                            <Bar
                              dataKey="avg_revenue"
                              name="Media ventas"
                              fill={CHART_PRIMARY}
                              activeBar={false}
                              radius={[0, 2, 2, 0]}
                              maxBarSize={22}
                              cursor="pointer"
                              onClick={(_data, index) => {
                                if (typeof index === 'number') {
                                  setSelectedWeekdayIdx((prev) =>
                                    prev === index ? null : index
                                  )
                                }
                              }}
                            >
                              {weekdayChartData.map((_, index) => (
                                <Cell
                                  key={`wd-${index}`}
                                  fill={CHART_PRIMARY}
                                  stroke={
                                    selectedWeekdayIdx === index ? CHART_PRIMARY : 'transparent'
                                  }
                                  strokeWidth={selectedWeekdayIdx === index ? 2 : 0}
                                  opacity={selectedWeekdayIdx === index ? 1 : 0.82}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        ) : (
                          <BarChart
                            data={weekdayChartData}
                            margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                            barCategoryGap="4%"
                            barGap={0}
                          >
                            <XAxis
                              dataKey="shortName"
                              tick={{ fontSize: 8, fontWeight: 700 }}
                              interval={0}
                            />
                            <YAxis
                              tick={{ fontSize: 7 }}
                              width={36}
                              tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                            />
                            <Tooltip content={() => null} cursor={false} />
                            <Bar
                              dataKey="avg_revenue"
                              name="Media ventas"
                              fill={CHART_PRIMARY}
                              activeBar={false}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={40}
                              cursor="pointer"
                              onClick={(_data, index) => {
                                if (typeof index === 'number') {
                                  setSelectedWeekdayIdx((prev) =>
                                    prev === index ? null : index
                                  )
                                }
                              }}
                            >
                              {weekdayChartData.map((_, index) => (
                                <Cell
                                  key={`wd-m-${index}`}
                                  fill={CHART_PRIMARY}
                                  stroke={
                                    selectedWeekdayIdx === index ? CHART_PRIMARY : 'transparent'
                                  }
                                  strokeWidth={selectedWeekdayIdx === index ? 2 : 0}
                                  opacity={selectedWeekdayIdx === index ? 1 : 0.82}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                    <div
                      className={cn(
                        'relative shrink-0 w-[6.5rem] sm:w-[8.5rem] border-l border-mds-border pl-2',
                        'lg:w-full lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3 lg:min-h-[4.5rem]',
                        isLgDesktop ? 'lg:h-auto' : 'h-[160px] sm:h-[180px]'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-full flex-col justify-center gap-2',
                          'lg:flex-row lg:justify-center lg:items-center lg:gap-4 lg:h-auto lg:py-1',
                          selectedWeekday && 'invisible pointer-events-none lg:hidden'
                        )}
                        aria-hidden={selectedWeekday ? true : undefined}
                      >
                        <WeekdayKpiFloat
                          conceptLabel="Mejor día"
                          dayName={weekdayKpis.best.dayName}
                          value={weekdayKpis.best.value}
                        />
                        <WeekdayKpiFloat
                          conceptLabel="Día más flojo"
                          dayName={weekdayKpis.worst.dayName}
                          value={weekdayKpis.worst.value}
                        />
                      </div>
                      {selectedWeekday ? (
                        <div
                          className={cn(
                            'absolute inset-0 z-20 min-h-0',
                            'lg:static lg:inset-auto lg:z-auto lg:w-full'
                          )}
                        >
                          <WeekdayDetailCard
                            day={selectedWeekday}
                            onClose={() => setSelectedWeekdayIdx(null)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                </div>
              </section>

              <section className="rounded-xl border border-mds-border bg-mds-surface shadow-sm overflow-hidden min-w-0">
                <SectionTitleRow
                  title="Margen producto"
                  legend={[
                    { label: 'Margen total', color: CHART_MARGIN_MID, variant: 'bar' },
                    { label: 'Unidades', color: CHART_UNITS, variant: 'line' },
                  ]}
                />
                <div className="p-2 lg:p-4">
                {products.error ? (
                  <SectionErrorBanner
                    message={products.error}
                    onRetry={() => void fetchProducts(dateFrom, dateTo)}
                  />
                ) : products.loading ? (
                  <SectionSkeleton rows={5} />
                ) : products.data.length === 0 ? (
                                    <EmptyState
                    variant="compact"
                    title="Sin márgenes de producto"
                    description="Mapea recetas con coste en /recipes"
                    action={
                      <Button variant="primary" asChild>
                        <Link href="/recipes">Ir a recetas</Link>
                      </Button>
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-1 min-w-0">
                    {selectedProduct && selectedProductIdx !== null && (
                      <>
                        <div className="sm:hidden w-full min-w-0 max-w-full">
                          <ProductDetailCard
                            product={selectedProduct}
                            onClose={() => setSelectedProductIdx(null)}
                            onOpenRecipe={handleOpenRecipe}
                          />
                        </div>
                        <div className="hidden sm:block lg:hidden relative w-full min-h-[8.5rem] shrink-0 overflow-hidden">
                          <div
                            className="absolute bottom-0 z-20 w-[min(100%,18rem)] pointer-events-auto"
                            style={productCardAnchorStyle}
                          >
                            <ProductDetailCard
                              product={selectedProduct}
                              onClose={() => setSelectedProductIdx(null)}
                              onOpenRecipe={handleOpenRecipe}
                            />
                          </div>
                        </div>
                        <div className="hidden lg:block w-full min-w-0 max-w-full">
                          <ProductDetailCard
                            product={selectedProduct}
                            onClose={() => setSelectedProductIdx(null)}
                            onOpenRecipe={handleOpenRecipe}
                          />
                        </div>
                      </>
                    )}
                    <div
                      className="relative w-full min-w-0 overflow-hidden"
                      style={{ height: productChartHeight }}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                          {isLgDesktop ? (
                            <ComposedChart
                              data={productChartData}
                              margin={{ top: 8, right: 8, left: 4, bottom: 40 }}
                              barCategoryGap="4%"
                              barGap={0}
                            >
                              <XAxis
                                dataKey="shortName"
                                tick={{ fontSize: 8, fontWeight: 600 }}
                                interval={0}
                                angle={-35}
                                textAnchor="end"
                                height={40}
                              />
                              <YAxis
                                yAxisId="margin"
                                tick={{ fontSize: 8 }}
                                width={40}
                                tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                              />
                              <YAxis yAxisId="units" orientation="right" hide />
                              <Tooltip content={() => null} cursor={false} />
                              <Bar
                                yAxisId="margin"
                                dataKey="total_margin_contribution"
                                name="Margen total"
                                maxBarSize={36}
                                radius={[3, 3, 0, 0]}
                                cursor="pointer"
                                onClick={(_data, index) => {
                                  if (typeof index === 'number') {
                                    setSelectedProductIdx((prev) =>
                                      prev === index ? null : index
                                    )
                                  }
                                }}
                              >
                                {productChartData.map((entry, index) => (
                                  <Cell
                                    key={`prod-${index}`}
                                    fill={entry.fill}
                                    stroke={
                                      selectedProductIdx === index ? CHART_PRIMARY : 'transparent'
                                    }
                                    strokeWidth={selectedProductIdx === index ? 2 : 0}
                                    opacity={selectedProductIdx === index ? 1 : 0.82}
                                  />
                                ))}
                              </Bar>
                              <Line
                                yAxisId="units"
                                type="monotone"
                                dataKey="total_units_sold"
                                name="Unidades"
                                stroke={CHART_UNITS}
                                strokeWidth={1.5}
                                dot={false}
                              />
                            </ComposedChart>
                          ) : (
                            <ComposedChart
                              data={productChartData}
                              margin={{ top: 8, right: 8, left: 4, bottom: 40 }}
                              barCategoryGap="4%"
                              barGap={0}
                            >
                              <XAxis
                                dataKey="shortName"
                                tick={{ fontSize: 8, fontWeight: 600 }}
                                interval={0}
                                angle={-35}
                                textAnchor="end"
                                height={40}
                              />
                              <YAxis
                                yAxisId="margin"
                                tick={{ fontSize: 8 }}
                                width={40}
                                tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                              />
                              <YAxis yAxisId="units" orientation="right" hide />
                              <Tooltip content={() => null} cursor={false} />
                              <Bar
                                yAxisId="margin"
                                dataKey="total_margin_contribution"
                                name="Margen total"
                                maxBarSize={36}
                                radius={[3, 3, 0, 0]}
                                cursor="pointer"
                                onClick={(_data, index) => {
                                  if (typeof index === 'number') {
                                    setSelectedProductIdx((prev) =>
                                      prev === index ? null : index
                                    )
                                  }
                                }}
                              >
                                {productChartData.map((entry, index) => (
                                  <Cell
                                    key={`prod-${index}`}
                                    fill={entry.fill}
                                    stroke={
                                      selectedProductIdx === index ? CHART_PRIMARY : 'transparent'
                                    }
                                    strokeWidth={selectedProductIdx === index ? 2 : 0}
                                    opacity={selectedProductIdx === index ? 1 : 0.82}
                                  />
                                ))}
                              </Bar>
                              <Line
                                yAxisId="units"
                                type="monotone"
                                dataKey="total_units_sold"
                                name="Unidades"
                                stroke={CHART_UNITS}
                                strokeWidth={1.5}
                                dot={false}
                              />
                            </ComposedChart>
                          )}
                        </ResponsiveContainer>
                    </div>
                  </div>
                )}
                </div>
              </section>
            </div>
        </div>

      </div>
    </div>
  )
}
