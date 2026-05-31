import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import InsightsClient from './InsightsClient'
import {
  getHourlySalesVsLabor,
  getWeekdayAnalysis,
  getProductMarginRanking,
  getFinancialSummary,
} from './actions'
import type { FinancialSummaryData } from './actions'
import type {
  HourlyProfitabilityRow,
  WeekdayAnalysisRow,
  ProductMarginRow,
} from './schemas'
import {
  getEuropeMadridYmdToday,
} from '@/utils/date-utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Insights — Bar La Marbella',
}

async function ssrWithTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export default async function InsightsPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = (profile?.role as string | null) ?? null
  if (role !== 'manager' && role !== 'admin') {
    redirect('/dashboard')
  }

  const today = getEuropeMadridYmdToday()
  const dateFrom = today
  const dateTo = today

  const timeoutMsg = 'Tiempo de espera agotado. Pulsa Reintentar en la sección afectada.'

  const [hourlyRes, weekdayRes, productsRes, financialRes] = await Promise.all([
    ssrWithTimeout(getHourlySalesVsLabor(dateFrom, dateTo), 8000, {
      success: false as const,
      error: timeoutMsg,
    }),
    ssrWithTimeout(getWeekdayAnalysis(dateFrom, dateTo), 8000, {
      success: false as const,
      error: timeoutMsg,
    }),
    ssrWithTimeout(getProductMarginRanking(15, dateFrom, dateTo), 8000, {
      success: false as const,
      error: timeoutMsg,
    }),
    ssrWithTimeout(getFinancialSummary(dateFrom, dateTo), 8000, {
      success: false as const,
      error: timeoutMsg,
    }),
  ])

  return (
    <InsightsClient
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialHourly={hourlyRes.success ? hourlyRes.data : ([] as HourlyProfitabilityRow[])}
      initialWeekday={weekdayRes.success ? weekdayRes.data : ([] as WeekdayAnalysisRow[])}
      initialProducts={productsRes.success ? productsRes.data : ([] as ProductMarginRow[])}
      initialFinancial={
        financialRes.success ? financialRes.data : (null as FinancialSummaryData | null)
      }
      initialFinancialForbidden={
        !financialRes.success && 'forbidden' in financialRes && financialRes.forbidden === true
      }
      initialErrors={{
        hourly: hourlyRes.success ? undefined : hourlyRes.error,
        weekday: weekdayRes.success ? undefined : weekdayRes.error,
        products: productsRes.success ? undefined : productsRes.error,
        financial: financialRes.success ? undefined : financialRes.error,
      }}
    />
  )
}
