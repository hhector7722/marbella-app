'use client'

import { useEffect, useMemo, useState } from 'react'
import InsightsClient from '@/app/dashboard/insights/InsightsClient'
import {
  getFinancialSummary,
  getHourlySalesVsLabor,
  getProductMarginRanking,
  getWeekdayAnalysis,
} from '@/app/dashboard/insights/actions'
import type { FinancialSummaryData } from '@/app/dashboard/insights/actions'
import type {
  HourlyProfitabilityRow,
  ProductMarginRow,
  WeekdayAnalysisRow,
} from '@/app/dashboard/insights/schemas'
import { getPreviousInsightsMonth, monthBounds } from '@/app/dashboard/insights/insights-date-utils'

export function RealInsightsView({ sandboxNavigate }: { sandboxNavigate?: (href: string) => void }) {
  const financialMonth = useMemo(() => getPreviousInsightsMonth(), [])
  const { from: dateFrom, to: dateTo } = useMemo(() => monthBounds(financialMonth), [financialMonth])
  const [data, setData] = useState<{
    hourly: HourlyProfitabilityRow[]
    weekday: WeekdayAnalysisRow[]
    products: ProductMarginRow[]
    financial: FinancialSummaryData | null
    errors: Partial<Record<'hourly' | 'weekday' | 'products' | 'financial', string>>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getHourlySalesVsLabor(dateFrom, dateTo),
      getWeekdayAnalysis(dateFrom, dateTo),
      getProductMarginRanking(15, dateFrom, dateTo),
      getFinancialSummary(dateFrom, dateTo),
    ]).then(([hourly, weekday, products, financial]) => {
      if (cancelled) return
      setData({
        hourly: hourly.success ? hourly.data : [],
        weekday: weekday.success ? weekday.data : [],
        products: products.success ? products.data : [],
        financial: financial.success ? financial.data : null,
        errors: {
          hourly: hourly.success ? undefined : hourly.error,
          weekday: weekday.success ? undefined : weekday.error,
          products: products.success ? undefined : products.error,
          financial: financial.success ? undefined : financial.error,
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo])

  if (!data) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-500">Cargando Insights reales…</div>
  }

  return (
    <InsightsClient
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialFinancialMonth={financialMonth}
      initialHourly={data.hourly}
      initialWeekday={data.weekday}
      initialProducts={data.products}
      initialFinancial={data.financial}
      initialErrors={data.errors}
      sandboxNavigate={sandboxNavigate}
    />
  )
}
