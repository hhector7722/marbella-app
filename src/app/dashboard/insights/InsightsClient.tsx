'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ChevronDown, RefreshCw, X } from 'lucide-react'
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
  'Positivo = rentabilidad contable sin entrar en caja. Negativo = cobros de deuda anterior o ajustes.'

type FinancialModalKind = 'income' | 'expenses' | 'margin' | 'cash' | 'delta'

const INCOME_LINE_LABELS: Record<string, string> = {
  sales_positive: 'Ventas positivas',
  refunds: 'Devoluciones',
}

const EXPENSE_LINE_LABELS: Record<string, string> = {
  purchases_invoices: 'Compras (albaranes)',
  payroll_total: 'Nóminas (PDF)',
  overtime: 'Horas extras',
  rent_monthly: 'Alquiler',
}

const EXPENSE_LINE_ORDER = [
  'purchases_invoices',
  'payroll_total',
  'overtime',
  'rent_monthly',
] as const

function deltaInterpretation(delta: number): string {
  if (delta > 50) {
    return 'Rentabilidad contable superior a caja: puede haber ventas pendientes de cobro o gastos no reflejados en caja.'
  }
  if (delta < -50) {
    return 'Caja superior al PyG: posibles cobros de periodos anteriores o ajustes manuales.'
  }
  return 'PyG y caja están alineados.'
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
  tooltip,
  className,
  onClick,
}: {
  label: string
  value: string
  valueClassName?: string
  badge?: string
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
        'rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 min-h-12 flex flex-col justify-center min-w-0 text-left w-full',
        onClick &&
          'cursor-pointer transition-shadow hover:ring-2 hover:ring-[#36606F]/30 active:scale-[0.99]',
        className
      )}
      title={tooltip}
    >
      <span className="text-[8px] lg:text-[10px] font-bold uppercase tracking-wider text-zinc-500 leading-tight">
        {label}
      </span>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        <span
          className={cn(
            'text-sm lg:text-base font-black tabular-nums truncate',
            valueClassName ?? 'text-zinc-800'
          )}
        >
          {value}
        </span>
        {badge && badge !== ' ' && (
          <span className="shrink-0 rounded-md bg-zinc-200/80 px-1.5 py-0.5 text-[9px] lg:text-[10px] font-black tabular-nums text-zinc-700">
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
  footnote: string
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
      className="fixed inset-0 z-[10070] flex items-end sm:items-center justify-center bg-black/40 p-3 sm:p-4 transition-opacity duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="financial-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          'w-full max-w-sm bg-white shadow-xl flex flex-col max-h-[85vh] overflow-hidden p-6',
          'rounded-t-2xl sm:rounded-2xl',
          'mx-0 sm:mx-auto'
        )}
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
        <p className="mt-4 text-[10px] leading-snug text-zinc-500 font-medium shrink-0">{footnote}</p>
      </div>
    </div>,
    document.body
  )
}

function FinancialDetailRow({ label, amount }: { label: string; amount: number }) {
  const displayed = formatEuroKpi(amount)
  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="py-2.5 pr-3 text-xs font-semibold text-zinc-700">{label}</td>
      <td className="py-2.5 text-right text-sm font-black tabular-nums text-zinc-800 whitespace-nowrap">
        {displayed === ' ' ? ' ' : `${displayed}`}
      </td>
    </tr>
  )
}

function sortExpenseLines(lines: FinancialStatementLine[]): FinancialStatementLine[] {
  const orderIndex = new Map(EXPENSE_LINE_ORDER.map((k, i) => [k, i]))
  return [...lines].sort((a, b) => {
    const ai = orderIndex.get(a.key as (typeof EXPENSE_LINE_ORDER)[number]) ?? 99
    const bi = orderIndex.get(b.key as (typeof EXPENSE_LINE_ORDER)[number]) ?? 99
    return ai - bi
  })
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

function ProductStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[8px] lg:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="block font-black text-zinc-800 tabular-nums mt-0.5">{value}</span>
    </div>
  )
}

/** KPI sin marco ni relleno — flota sobre el fondo de la sección */
function KpiFloat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center min-w-0 px-0 py-1">
      <span className="text-[7px] lg:text-[10px] font-bold uppercase tracking-wider text-zinc-500 leading-tight">
        {label}
      </span>
      <span className="text-[9px] lg:text-sm font-black text-zinc-800 tabular-nums leading-snug mt-0.5 truncate">
        {value}
      </span>
    </div>
  )
}

type LegendItem = {
  label: string
  color: string
  variant?: 'bar' | 'line'
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
    <div className="flex items-center justify-between gap-2 mb-2 lg:mb-3 min-h-8">
      <h2 className="text-[10px] lg:text-sm font-black uppercase tracking-wider text-[#36606F] leading-tight shrink-0">
        {title}
      </h2>
      {(actions || (legend && legend.length > 0)) && (
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-nowrap ml-auto">
          {actions}
          {legend?.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1 text-[8px] lg:text-[10px] font-bold text-zinc-600 whitespace-nowrap"
            >
              {item.variant === 'line' ? (
                <span
                  className="w-3 h-0.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
              ) : (
                <span
                  className="w-2 h-2 shrink-0 rounded-sm"
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
  const [selectedProductIdx, setSelectedProductIdx] = useState(0)
  const [financialModal, setFinancialModal] = useState<FinancialModalKind | null>(null)

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
    return {
      best: `${best.weekday_name} (${formatEuroKpi(best.avg_revenue)})`,
      worst: `${worst.weekday_name} (${formatEuroKpi(worst.avg_revenue)})`,
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
        shortName: p.product_name.length > 28 ? `${p.product_name.slice(0, 26)}…` : p.product_name,
        fill,
        marginPct,
      }
    })
  }, [rankedProducts])

  const bestProductIdx = useMemo(() => {
    if (rankedProducts.length === 0) return 0
    return rankedProducts.reduce(
      (bestI, p, i, arr) =>
        p.total_margin_contribution > arr[bestI].total_margin_contribution ? i : bestI,
      0,
    )
  }, [rankedProducts])

  const selectedProduct = rankedProducts[selectedProductIdx] ?? null

  const financialKpis = useMemo(() => {
    if (!financial.data) return null
    const { pyg, cashFlow, reconciliation } = financial.data
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
      cashFlowNet: formatEuroKpi(cashFlow.net),
      delta: formatEuroKpi(reconciliation.delta),
      incomeTone: signedEuroTone(pyg.income.total, 'text-emerald-600', 'text-rose-600'),
      expensesTone: 'text-rose-600',
      pygNetTone: signedEuroTone(pyg.net, 'text-emerald-600', 'text-rose-600'),
      cashFlowTone: signedEuroTone(cashFlow.net, 'text-emerald-600', 'text-rose-600'),
      deltaTone: deltaChipTone(reconciliation.delta),
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
    const { pyg, reconciliation, incomeLines, expenseLines, cashIn, cashOut, salesGross } = financial.data

    switch (financialModal) {
      case 'income':
        return {
          title: 'Ventas (s/IVA)',
          footnote: 'Base imponible (IVA 10% descontado). Coincide con el PyG de devengo.',
          body: (
            <table className="w-full">
              <tbody>
                {incomeLines.map((line) => (
                  <FinancialDetailRow
                    key={line.key}
                    label={INCOME_LINE_LABELS[line.key] ?? line.label}
                    amount={line.amount}
                  />
                ))}
                <FinancialDetailRow
                  label="TPV bruto (c/IVA)"
                  amount={salesGross}
                />
              </tbody>
            </table>
          ),
        }
      case 'expenses':
        return {
          title: 'Gastos totales',
          footnote:
            'Solo albaranes en estado mapeado/completado. Alquiler: meses completos en el rango.',
          body: (
            <table className="w-full">
              <tbody>
                {sortExpenseLines(expenseLines).map((line) => (
                  <FinancialDetailRow
                    key={line.key}
                    label={EXPENSE_LINE_LABELS[line.key] ?? line.label}
                    amount={line.amount}
                  />
                ))}
              </tbody>
            </table>
          ),
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
            <table className="w-full">
              <tbody>
                <FinancialDetailRow label="Ventas" amount={pyg.income.total} />
                <FinancialDetailRow label="Gastos" amount={pyg.expenses.total} />
                <tr className="border-b border-zinc-100 last:border-0">
                  <td className="py-2.5 pr-3 text-xs font-semibold text-zinc-700">Margen</td>
                  <td className="py-2.5 text-right text-sm font-black tabular-nums text-zinc-800 whitespace-nowrap">
                    {formatEuroKpi(pyg.net) === ' ' ? (
                      ' '
                    ) : (
                      <>
                        {formatEuroKpi(pyg.net)}
                        {marginPctLabel !== ' ' ? ` (${marginPctLabel})` : ''}
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          ),
        }
      }
      case 'cash':
        return {
          title: 'Caja neta',
          footnote: 'Solo efectivo físico. Los cobros con tarjeta no pasan por tesorería.',
          body: (
            <table className="w-full">
              <tbody>
                <FinancialDetailRow label="Entradas (efectivo + cierres)" amount={cashIn} />
                <FinancialDetailRow label="Salidas (efectivo)" amount={cashOut} />
                <FinancialDetailRow label="Neto" amount={financial.data.cashFlow.net} />
              </tbody>
            </table>
          ),
        }
      case 'delta':
        return {
          title: 'Delta devengo−caja',
          footnote: deltaInterpretation(reconciliation.delta),
          body: (
            <table className="w-full">
              <tbody>
                <FinancialDetailRow label="Margen PyG" amount={pyg.net} />
                <FinancialDetailRow label="Caja neta" amount={financial.data.cashFlow.net} />
                <FinancialDetailRow label="Diferencia" amount={reconciliation.delta} />
              </tbody>
            </table>
          ),
        }
      default:
        return null
    }
  }, [financial.data, financialModal, marginPctRaw])

  const syncSelectedProductToBest = useCallback(() => {
    setSelectedProductIdx(bestProductIdx)
  }, [bestProductIdx])

  // Al recargar ranking, volver al producto con mejor margen
  useEffect(() => {
    syncSelectedProductToBest()
  }, [products.data, syncSelectedProductToBest])

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

          <div className="p-2 md:p-6 space-y-2 md:space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 lg:gap-4">
              {/* Sección 1 — ancho completo, gráfico protagonista */}
              <section className="col-span-1 md:col-span-12 rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-4">
                <SectionTitleRow
                  title="Venta vs. Coste por hora"
                  legend={[
                    { label: 'Ventas', color: PETROLEO, variant: 'bar' },
                    { label: 'M. obra', color: LABOR_RED, variant: 'bar' },
                    { label: 'Margen', color: MARGIN_GREEN, variant: 'line' },
                  ]}
                />
                {hourly.error ? (
                  <SectionErrorBanner message={hourly.error} onRetry={() => void fetchHourly(dateFrom, dateTo)} />
                ) : hourly.loading ? (
                  <SectionSkeleton rows={6} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="min-w-0 overflow-x-auto -mx-0.5 px-0.5">
                      <div className="h-[220px] sm:h-[280px] lg:h-[380px] w-full min-w-[280px] lg:min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={hourlyChartData}
                            margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
                            barCategoryGap="18%"
                            barGap={4}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 10, fontWeight: 700 }}
                              interval={0}
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
                              maxBarSize={28}
                            />
                            <Bar
                              dataKey="labor_cost"
                              name="M. obra"
                              fill={LABOR_RED}
                              radius={[3, 3, 0, 0]}
                              maxBarSize={28}
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
                    <div className="grid grid-cols-3 gap-1 lg:gap-3">
                      <KpiFloat label="Hora más rentable" value={hourlyKpis.best} />
                      <KpiFloat label="Hora de mayor pérdida" value={hourlyKpis.worst} />
                      <KpiFloat label="Franja óptima de apertura" value={hourlyKpis.optimal} />
                    </div>
                  </div>
                )}
              </section>

              {/* Sección 2 — columna estrecha */}
              <section className="col-span-1 md:col-span-3 lg:col-span-3 rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-3 min-w-0">
                <SectionTitleRow title="Rend. por día" />
                {weekday.error ? (
                  <SectionErrorBanner message={weekday.error} onRetry={() => void fetchWeekday(dateFrom, dateTo)} />
                ) : weekday.loading ? (
                  <SectionSkeleton rows={5} />
                ) : (
                  <>
                    <div className="h-[160px] lg:h-[240px]">
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
                              const row = payload[0]?.payload as WeekdayAnalysisRow
                              return (
                                <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 shadow-lg text-xs space-y-1">
                                  <p className="font-black text-[#36606F]">{row.weekday_name}</p>
                                  <p>Media ventas: {formatEuroChart(row.avg_revenue)}</p>
                                  <p>Media tickets: {row.avg_tickets.toFixed(1)}</p>
                                  <p>Ticket medio: {formatEuroChart(row.avg_ticket_value)}</p>
                                </div>
                              )
                            }}
                          />
                          <Bar dataKey="avg_revenue" name="Media ventas" fill={PETROLEO} radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      <KpiFloat label="Mejor día" value={weekdayKpis.best} />
                      <KpiFloat label="Día más flojo" value={weekdayKpis.worst} />
                    </div>
                  </>
                )}
              </section>

              {/* Sección 3 — columna ancha */}
              <section className="col-span-1 md:col-span-9 lg:col-span-9 rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-4 min-w-0">
                <SectionTitleRow
                  title="Margen producto"
                  legend={[
                    { label: 'Margen total', color: MARGIN_BAR_MID, variant: 'bar' },
                    { label: 'Unidades', color: '#9CA3AF', variant: 'line' },
                  ]}
                />
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
                  <div className="flex flex-col gap-2">
                    <div className="overflow-x-auto -mx-0.5 px-0.5">
                      <div className="h-[200px] lg:h-[340px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            layout="vertical"
                            data={productChartData}
                            margin={{ top: 2, right: 12, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                            <XAxis
                              type="number"
                              xAxisId="margin"
                              tick={{ fontSize: 8 }}
                              tickFormatter={(v) => formatEuroChart(Number(v), 0)}
                            />
                            <XAxis type="number" xAxisId="units" orientation="top" hide />
                            <YAxis
                              type="category"
                              dataKey="shortName"
                              width={72}
                              tick={{ fontSize: 8, fontWeight: 600 }}
                            />
                            <Tooltip content={() => null} cursor={false} />
                            <Bar
                              xAxisId="margin"
                              dataKey="total_margin_contribution"
                              name="Margen total"
                              radius={[0, 4, 4, 0]}
                              cursor="pointer"
                              onClick={(_data, index) => {
                                if (typeof index === 'number') setSelectedProductIdx(index)
                              }}
                            >
                              {productChartData.map((entry, index) => (
                                <Cell
                                  key={`prod-${index}`}
                                  fill={entry.fill}
                                  stroke={index === selectedProductIdx ? PETROLEO : 'transparent'}
                                  strokeWidth={index === selectedProductIdx ? 2 : 0}
                                  opacity={index === selectedProductIdx ? 1 : 0.82}
                                />
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

                    {selectedProduct && (
                      <div className="pt-1 space-y-2">
                        <label className="relative flex items-center gap-1 min-h-10 min-w-0 max-w-full cursor-pointer group">
                          <span className="text-[9px] lg:text-[10px] font-bold text-zinc-700 leading-tight truncate flex-1 min-w-0">
                            {selectedProduct.product_name}
                          </span>
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 text-[#36606F] group-hover:text-[#2a4a56]"
                            aria-hidden
                          />
                          <select
                            value={selectedProductIdx}
                            onChange={(e) => setSelectedProductIdx(Number(e.target.value))}
                            aria-label="Seleccionar producto"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          >
                            {rankedProducts.map((p, i) => (
                              <option key={`${p.product_name}-${i}`} value={i}>
                                {p.product_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-1.5 text-[10px] lg:text-xs">
                          <ProductStat
                            label="Unidades"
                            value={
                              selectedProduct.total_units_sold === 0
                                ? ' '
                                : String(selectedProduct.total_units_sold)
                            }
                          />
                          <ProductStat
                            label="P. venta"
                            value={formatEuroKpi(selectedProduct.avg_sale_price)}
                          />
                          <ProductStat
                            label="Coste receta"
                            value={formatEuroKpi(selectedProduct.recipe_cost)}
                          />
                          <ProductStat
                            label="Margen / ud."
                            value={formatEuroKpi(selectedProduct.margin_per_unit)}
                          />
                          <ProductStat
                            label="Margen total"
                            value={formatEuroKpi(selectedProduct.total_margin_contribution)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* Sección 4 — Resultado del periodo (ancho completo) */}
            <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-2 lg:p-4">
              <SectionTitleRow
                title="Resultado del periodo"
                actions={
                  <FinancialMonthSelector
                    month={financialMonth}
                    onChange={handleFinancialMonthChange}
                  />
                }
              />
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
                      label="Ventas (s/IVA)"
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
                      label="Margen PyG"
                      value={financialKpis.pygNet}
                      valueClassName={financialKpis.pygNetTone}
                      badge={financialKpis.marginBadge}
                      onClick={() => setFinancialModal('margin')}
                    />
                    <FinancialKpiChip
                      label="Caja neta"
                      value={financialKpis.cashFlowNet}
                      valueClassName={financialKpis.cashFlowTone}
                      onClick={() => setFinancialModal('cash')}
                    />
                    <FinancialKpiChip
                      label="Delta devengo−caja"
                      value={financialKpis.delta}
                      valueClassName={financialKpis.deltaTone}
                      tooltip={DELTA_TOOLTIP}
                      className="col-span-2 max-w-[50%] justify-self-center md:col-span-1 md:max-w-none md:justify-self-stretch"
                      onClick={() => setFinancialModal('delta')}
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
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
