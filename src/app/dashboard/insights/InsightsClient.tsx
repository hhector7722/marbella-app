'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RefreshCw, X } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  FinancialMonthSelector,
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

const PETROLEO = '#36606F'
const LABOR_RED = '#E07070'
const MARGIN_GREEN = '#4CAF50'
const MARGIN_BAR_HIGH = '#2E7D32'
const MARGIN_BAR_MID = '#66BB6A'
const MARGIN_BAR_LOW = '#FFA726'
const DELTA_TOOLTIP =
  'Margen PyG menos cobros totales (efectivo + tarjeta). Positivo = devengo por encima de cobros.'

const HOURLY_CHART_START = 7
const HOURLY_CHART_END = 23

const BONUS_LABOR_EUR = 1700
const GASTOS_FIJOS_OTROS_EUR = 0

type FinancialModalKind = 'income' | 'expenses' | 'margin' | 'cash' | 'delta'

const INCOME_LINE_LABELS: Record<string, string> = {
  sales_positive: 'Venta neta',
}

const EXPENSE_LINE_LABELS: Record<string, string> = {
  purchases_invoices: 'Compras',
  payroll_total: 'Nóminas',
  overtime: 'Horas extras',
  rent_monthly: 'Alquiler',
}

function deltaChipTone(delta: number): string {
  if (Math.abs(delta) < 50) return 'text-emerald-600'
  if (delta > 0) return 'text-amber-600'
  return 'text-rose-600'
}

function signedEuroTone(value: number, positiveTone: string, negativeTone: string): string {
  if (value === 0 || Object.is(value, -0)) return 'text-zinc-800'
  return value > 0 ? positiveTone : negativeTone
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
  /** Sin fondo en el chip de porcentaje (Margen PyG). */
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
        'min-h-12 flex flex-col items-center justify-center min-w-0 text-center w-full px-1 py-2',
        onClick &&
          'cursor-pointer transition-shadow hover:ring-2 hover:ring-[#36606F]/30 active:scale-[0.99] rounded-xl',
        className
      )}
      title={tooltip}
    >
      <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-wider text-zinc-500 leading-tight">
        {label}
      </span>
      <div className="flex items-center justify-center gap-1.5 mt-0.5 min-w-0 w-full">
        <span
          className={cn(
            'text-sm lg:text-base font-black tabular-nums truncate',
            valueClassName ?? 'text-zinc-800'
          )}
        >
          {value}
        </span>
        {badge && badge !== ' ' && (
          <span
            className={cn(
              'shrink-0 text-[9px] lg:text-[10px] font-black tabular-nums text-zinc-700',
              !badgePlain && 'rounded-md bg-zinc-200/80 px-1.5 py-0.5'
            )}
          >
            {badge}
          </span>
        )}
      </div>
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/40 p-4 transition-opacity duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="financial-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-sm bg-white shadow-xl flex flex-col max-h-[85vh] overflow-hidden p-6 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 shrink-0 mb-4">
          <h3
            id="financial-detail-title"
            className="text-sm font-black uppercase tracking-wider text-[#36606F] leading-tight pr-2"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-10 min-w-10 shrink-0 inline-flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footnote ? (
          <p className="mt-4 text-[10px] leading-snug text-zinc-500 font-medium shrink-0">{footnote}</p>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

function FinancialDetailRow({ label, amount }: { label: string; amount: number }) {
  const displayed = formatEuroKpi(amount)
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs font-semibold text-zinc-600">{label}</span>
      <span className="text-sm font-black tabular-nums text-zinc-800 whitespace-nowrap">
        {displayed === ' ' ? ' ' : displayed}
      </span>
    </div>
  )
}

function FinancialDetailBlock({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs font-semibold text-zinc-600">{label}</span>
      <span className="text-sm font-black tabular-nums text-zinc-800 text-right">{children}</span>
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
    <div className="border-b border-zinc-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-12 items-baseline justify-between gap-4 py-2 text-left active:bg-zinc-50 rounded-lg"
      >
        <span className="text-xs font-semibold text-zinc-600">{label}</span>
        <span className="text-sm font-black tabular-nums text-zinc-800 whitespace-nowrap">
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
  return (
    <div
      className={cn(
        'min-w-0 flex flex-col',
        prominent && 'items-center justify-center text-center min-h-[2.75rem]',
        className
      )}
    >
      <span
        className={cn(
          'block font-bold uppercase tracking-wider text-zinc-500',
          prominent ? 'text-[10px] sm:text-xs' : 'text-[8px] lg:text-[10px]'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'block font-black text-zinc-800 tabular-nums mt-1',
          prominent ? 'text-sm sm:text-base lg:text-lg leading-tight' : 'mt-0.5'
        )}
      >
        {value}
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
  return (
    <div className="relative flex h-full min-h-0 flex-col rounded-xl border border-zinc-200 bg-white p-2.5 shadow-lg">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar detalle del día"
        className="absolute right-1 top-1 z-10 min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-9 text-sm font-black leading-snug text-[#36606F]">{day.weekday_name}</p>
      <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
        <ProductStat label="Media ventas" value={formatEuroKpi(day.avg_revenue)} prominent />
        <ProductStat
          label="Media tickets"
          value={day.avg_tickets === 0 ? ' ' : day.avg_tickets.toFixed(1)}
          prominent
        />
        <ProductStat label="Ticket medio" value={formatEuroKpi(day.avg_ticket_value)} prominent />
      </div>
    </div>
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
    <div className="space-y-3 w-full max-w-full py-1">
      <div className="flex items-start justify-between gap-2">
        {product.recipe_id ? (
          <button
            type="button"
            onClick={() => onOpenRecipe(product.recipe_id, product.product_name)}
            className="min-h-9 text-left text-sm sm:text-base font-black text-[#36606F] leading-snug hover:underline active:scale-[0.99]"
          >
            {product.product_name}
          </button>
        ) : (
          <p className="text-sm sm:text-base font-black text-zinc-800 leading-snug">
            {product.product_name}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="min-h-9 min-w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
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
    </div>
  )
}

/** KPI sin marco ni relleno — flota sobre el fondo de la sección */
function KpiFloat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-w-0 px-1 py-0.5 text-center w-full">
      <span className="text-[7px] lg:text-[10px] font-bold uppercase tracking-wider text-zinc-500 leading-tight">
        {label}
      </span>
      <span className="text-[9px] lg:text-sm font-black text-zinc-800 tabular-nums leading-snug mt-0.5 line-clamp-2">
        {value}
      </span>
    </div>
  )
}

type LegendItem = {
  label: string
  color: string
  variant?: 'bar' | 'line'
  /** Contorno fino en cabecera petróleo cuando el color coincide con el fondo */
  swatchOutline?: boolean
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
    <div className="bg-[#36606F] px-3 md:px-4 py-2.5 flex items-center justify-between gap-2 min-h-10 shrink-0">
      <h2 className="text-[10px] lg:text-sm font-black uppercase tracking-wider text-white leading-tight shrink-0">
        {title}
      </h2>
      {(actions || (legend && legend.length > 0)) && (
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-nowrap ml-auto">
          {actions}
          {legend?.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1 text-[8px] lg:text-[10px] font-bold text-white/90 whitespace-nowrap"
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
                    item.swatchOutline &&
                      'shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.9)]'
                  )}
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
              )}
              {item.label}
            </span>
          ))}
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
  const [selectedMonth, setSelectedMonth] = useState<InsightsMonth>(initialFinancialMonth)
  const [selectedDay, setSelectedDay] = useState(initialDateTo)
  const [periodFrom, setPeriodFrom] = useState(initialDateFrom)
  const [periodTo, setPeriodTo] = useState(initialDateTo)
  const [financialMonth, setFinancialMonth] = useState<InsightsMonth>(initialFinancialMonth)

  const financialRange = useMemo(() => monthBounds(financialMonth), [financialMonth])

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

  const handleSelectMonth = useCallback(
    (fm: InsightsMonth) => {
      const { from, to } = monthBounds(fm)
      setSelectedMonth(fm)
      setFilterMode('mes')
      setOpenPicker(null)
      refetchAnalytics(from, to)
    },
    [refetchAnalytics]
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

  const handleFinancialMonthChange = useCallback(
    (fm: InsightsMonth) => {
      setFinancialMonth(fm)
      const { from, to } = monthBounds(fm)
      void fetchFinancial(from, to)
    },
    [fetchFinancial]
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
    const withRevenue = weekday.data.filter((d) => d.avg_revenue > 0)
    if (withRevenue.length === 0) {
      return { best: ' ', worst: ' ' }
    }
    const best = withRevenue.reduce((a, b) => (b.avg_revenue > a.avg_revenue ? b : a))
    const worst = withRevenue.reduce((a, b) => (b.avg_revenue < a.avg_revenue ? b : a))
    const revStr = (v: number) => {
      const e = formatEuroKpi(v)
      return e === ' ' ? '' : ` · ${e}`
    }

    return {
      best: `${best.weekday_name}${revStr(best.avg_revenue)}`,
      worst: `${worst.weekday_name}${revStr(worst.avg_revenue)}`,
    }
  }, [weekday.data])

  const rankedProducts = useMemo(() => products.data.slice(0, 15), [products.data])

  const productChartData = useMemo(() => {
    return rankedProducts.map((p) => {
      const marginPct =
        p.avg_sale_price > 0 ? (p.margin_per_unit / p.avg_sale_price) * 100 : 0
      let fill = MARGIN_BAR_MID
      if (marginPct > 60) fill = MARGIN_BAR_HIGH
      else if (marginPct < 30) fill = MARGIN_BAR_LOW
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
    if (!isLgDesktop) return 260
    const rowH = 20
    return Math.min(300, Math.max(180, rankedProducts.length * rowH + 24))
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
    const { pyg, cobrosTotales, deltaPygCobros } = financial.data
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
      cobrosTotales: formatEuroKpi(cobrosTotales),
      delta: formatEuroKpi(deltaPygCobros),
      incomeTone: signedEuroTone(pyg.income.total, 'text-emerald-600', 'text-rose-600'),
      expensesTone: 'text-rose-600',
      pygNetTone: signedEuroTone(pyg.net, 'text-emerald-600', 'text-rose-600'),
      cobrosTone: signedEuroTone(cobrosTotales, 'text-emerald-600', 'text-rose-600'),
      deltaTone: deltaChipTone(deltaPygCobros),
    }
  }, [financial.data])

  const marginPctRaw = useMemo(() => {
    if (!financial.data) return null
    const income = financial.data.pyg.income.total
    if (income <= 0) return null
    return (financial.data.pyg.net / income) * 100
  }, [financial.data])

  const financialModalContent = useMemo(() => {
    if (!financial.data || !financialModal) return null
    const {
      pyg,
      incomeLines,
      expenseLines,
      cashIn,
      cashOut,
      salesGross,
      cardPayments,
      cobrosTotales,
      deltaPygCobros,
    } = financial.data

    const ventaNetaAmount =
      incomeLines.find((l) => l.key === 'sales_positive')?.amount ?? pyg.income.total

    switch (financialModal) {
      case 'income':
        return {
          title: 'Ventas',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow label="Facturación" amount={salesGross} />
              <FinancialDetailRow label="Venta neta" amount={ventaNetaAmount} />
            </div>
          ),
        }
      case 'expenses':
        return {
          title: 'Gastos totales',
          body: <ExpensesBreakdownBody expenseLines={expenseLines} />,
        }
      case 'margin': {
        const marginPctLabel =
          marginPctRaw === null
            ? ' '
            : formatDisplayValue(Number(marginPctRaw.toFixed(1))) === ' '
              ? ' '
              : `${Number(marginPctRaw.toFixed(1))}%`
        return {
          title: 'Margen PyG',
          footnote: 'Resultado contable del periodo. No refleja cobros reales en caja.',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow label="Ventas" amount={pyg.income.total} />
              <FinancialDetailRow label="Gastos" amount={pyg.expenses.total} />
              <FinancialDetailBlock label="Margen">
                {formatEuroKpi(pyg.net) === ' ' ? (
                  ' '
                ) : (
                  <>
                    {formatEuroKpi(pyg.net)}
                    {marginPctLabel !== ' ' ? ` · ${marginPctLabel}` : ''}
                  </>
                )}
              </FinancialDetailBlock>
            </div>
          ),
        }
      }
      case 'cash':
        return {
          title: 'Cobros totales',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow label="Entradas" amount={cashIn} />
              <FinancialDetailRow label="Salidas" amount={cashOut} />
              <FinancialDetailRow label="Tarjeta" amount={cardPayments} />
              <FinancialDetailRow label="Cobros totales" amount={cobrosTotales} />
            </div>
          ),
        }
      case 'delta':
        return {
          title: 'Delta PyG-Cobros',
          body: (
            <div className="space-y-1">
              <FinancialDetailRow label="Margen PyG" amount={pyg.net} />
              <FinancialDetailRow label="Cobros totales" amount={cobrosTotales} />
              <FinancialDetailRow label="Diferencia" amount={deltaPygCobros} />
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
    <div className="min-h-screen bg-[#5B8FB9] p-2 md:p-6 pb-24 text-zinc-900">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="sticky top-0 z-20 shadow-sm">
            <div className="bg-[#36606F] px-3 md:px-5 py-3">
              <h1 className="text-sm md:text-lg font-black text-white uppercase tracking-wider">
                Rentabilidad
              </h1>
            </div>
            <div className="bg-white border-b border-zinc-100 px-3 md:px-5 py-2 overflow-x-auto">
              <InsightsMainDateFilter
                mode={filterMode}
                openPicker={openPicker}
                onOpenPicker={handleOpenPicker}
                onClosePicker={() => setOpenPicker(null)}
                selectedWeekMonday={selectedWeekMonday}
                selectedMonth={selectedMonth}
                selectedDay={selectedDay}
                periodFrom={periodFrom}
                periodTo={periodTo}
                onSelectWeek={handleSelectWeek}
                onSelectMonth={handleSelectMonth}
                onSelectDay={handleSelectDay}
                onApplyPeriod={handleApplyPeriod}
              />
            </div>
          </div>

          <div className="p-2 md:p-6 space-y-3 md:space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 lg:gap-5">
              {/* Sección 1 — ancho completo, gráfico protagonista */}
              <section className="col-span-1 md:col-span-12 rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden">
                <SectionTitleRow
                  title="Venta vs. Coste por hora"
                  legend={[
                    { label: 'Ventas', color: PETROLEO, variant: 'bar', swatchOutline: true },
                    { label: 'M. obra', color: LABOR_RED, variant: 'bar' },
                    { label: 'Margen', color: MARGIN_GREEN, variant: 'line' },
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
                            margin={{ top: 8, right: 8, left: 4, bottom: 20 }}
                            barCategoryGap="8%"
                            barGap={2}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 8, fontWeight: 700 }}
                              interval={0}
                              angle={-40}
                              textAnchor="end"
                              height={48}
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
                            <Bar
                              dataKey="total_revenue"
                              name="Ventas"
                              fill={PETROLEO}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={48}
                            />
                            <Bar
                              dataKey="labor_cost"
                              name="M. obra"
                              fill={LABOR_RED}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={48}
                            />
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
                    <div className="grid grid-cols-3 gap-1 -mt-3 lg:-mt-4 pt-0">
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
              <section className="rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden min-w-0">
                <SectionTitleRow title="Rend. por día" />
                <div className="p-2 lg:p-3">
                {weekday.error ? (
                  <SectionErrorBanner message={weekday.error} onRetry={() => void fetchWeekday(dateFrom, dateTo)} />
                ) : weekday.loading ? (
                  <SectionSkeleton rows={5} />
                ) : (
                  <div className="flex flex-row gap-2 lg:gap-3 min-w-0 items-stretch">
                    <div
                      className={cn(
                        'flex-1 min-w-0',
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
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
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
                              fill={PETROLEO}
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
                                  fill={PETROLEO}
                                  stroke={
                                    selectedWeekdayIdx === index ? PETROLEO : 'transparent'
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
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
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
                              fill={PETROLEO}
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
                                  fill={PETROLEO}
                                  stroke={
                                    selectedWeekdayIdx === index ? PETROLEO : 'transparent'
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
                        'relative shrink-0 w-[6.5rem] sm:w-[8.5rem] lg:w-[8rem] border-l border-zinc-100 pl-2',
                        isLgDesktop ? 'h-[200px]' : 'h-[160px] sm:h-[180px]'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-full flex-col justify-center gap-2',
                          selectedWeekday && 'invisible pointer-events-none'
                        )}
                        aria-hidden={selectedWeekday ? true : undefined}
                      >
                        <KpiFloat label="Mejor día" value={weekdayKpis.best} />
                        <KpiFloat label="Día más flojo" value={weekdayKpis.worst} />
                      </div>
                      {selectedWeekday ? (
                        <div className="absolute inset-0 z-20 min-h-0">
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

              <section className="rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden min-w-0">
                <SectionTitleRow
                  title="Margen producto"
                  legend={[
                    { label: 'Margen total', color: MARGIN_BAR_MID, variant: 'bar' },
                    { label: 'Unidades', color: '#9CA3AF', variant: 'line' },
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
                  <div className="flex flex-col gap-2 min-w-0">
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
                              margin={{ top: 8, right: 8, left: 4, bottom: 56 }}
                              barCategoryGap="4%"
                              barGap={0}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                              <XAxis
                                dataKey="shortName"
                                tick={{ fontSize: 8, fontWeight: 600 }}
                                interval={0}
                                angle={-35}
                                textAnchor="end"
                                height={56}
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
                                      selectedProductIdx === index ? PETROLEO : 'transparent'
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
                                stroke="#9CA3AF"
                                strokeWidth={1.5}
                                dot={false}
                              />
                            </ComposedChart>
                          ) : (
                            <ComposedChart
                              data={productChartData}
                              margin={{ top: 8, right: 8, left: 4, bottom: 52 }}
                              barCategoryGap="4%"
                              barGap={0}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                              <XAxis
                                dataKey="shortName"
                                tick={{ fontSize: 8, fontWeight: 600 }}
                                interval={0}
                                angle={-35}
                                textAnchor="end"
                                height={52}
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
                                      selectedProductIdx === index ? PETROLEO : 'transparent'
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
                                stroke="#9CA3AF"
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

            {/* Sección 4 — Resultado del periodo (ancho completo) */}
            <section className="rounded-xl border border-zinc-200 bg-white shadow-md overflow-hidden">
              <SectionTitleRow
                title="Resultado del periodo"
                actions={
                  <FinancialMonthSelector
                    month={financialMonth}
                    onChange={handleFinancialMonthChange}
                    tone="onDark"
                  />
                }
              />
              <div className="p-2 lg:p-4">
              {financial.error ? (
                <SectionErrorBanner
                  message={financial.error}
                  onRetry={() => void fetchFinancial(financialRange.from, financialRange.to)}
                />
              ) : financial.loading ? (
                <SectionSkeleton rows={2} />
              ) : !financial.data ? (
                <SectionErrorBanner
                  message={financial.error ?? 'No se pudo cargar el estado financiero'}
                  onRetry={() => void fetchFinancial(financialRange.from, financialRange.to)}
                />
              ) : financialKpis ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
                    <FinancialKpiChip
                      label="Delta PyG-Cobros"
                      value={financialKpis.delta}
                      valueClassName={financialKpis.deltaTone}
                      tooltip={DELTA_TOOLTIP}
                      onClick={() => setFinancialModal('delta')}
                    />
                    <FinancialKpiChip
                      label="Margen PyG"
                      value={financialKpis.pygNet}
                      valueClassName={financialKpis.pygNetTone}
                      badge={financialKpis.marginBadge}
                      badgePlain
                      className="col-span-2 max-w-[50%] justify-self-center md:col-span-1 md:max-w-none md:justify-self-stretch"
                      onClick={() => setFinancialModal('margin')}
                    />
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
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
