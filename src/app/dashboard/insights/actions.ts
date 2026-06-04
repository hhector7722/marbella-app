'use server'

import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { enumerateYmdRange } from './insights-date-utils'
import {
  hourlyProfitabilityRowSchema,
  weekdayAnalysisRowSchema,
  productMarginRowSchema,
  type HourlyProfitabilityRow,
  type WeekdayAnalysisRow,
  type ProductMarginRow,
} from './schemas'

const madridDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .superRefine((value, ctx) => {
    const parts = value.split('-')
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    const parsed = new Date(year, month - 1, day)
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      ctx.addIssue({ code: 'custom', message: 'Fecha calendario inválida' })
    }
  })

const dateRangeSchema = z
  .object({
    dateFrom: madridDateSchema,
    dateTo: madridDateSchema,
  })
  .superRefine(({ dateFrom, dateTo }, ctx) => {
    const [y1, m1, d1] = dateFrom.split('-').map(Number)
    const [y2, m2, d2] = dateTo.split('-').map(Number)
    const from = new Date(y1, m1 - 1, d1).getTime()
    const to = new Date(y2, m2 - 1, d2).getTime()
    if (from > to) {
      ctx.addIssue({
        code: 'custom',
        message: 'dateFrom no puede ser posterior a dateTo',
        path: ['dateFrom'],
      })
    }
  })

const limitSchema = z.coerce.number().int().min(1).max(500).optional()

type ActionSuccess<T> = { success: true; data: T }
type ActionFailure = { success: false; error: string }

export type FinancialStatementLine = {
  key: string
  label: string
  amount: number
}

export type FinancialSummaryData = {
  pyg: {
    income: { total: number }
    expenses: { total: number }
    net: number
  }
  cashFlow: { net: number }
  reconciliation: { delta: number }
  incomeLines: FinancialStatementLine[]
  expenseLines: FinancialStatementLine[]
  cashIn: number
  cashOut: number
  salesGross: number
  /** Cobros tarjeta del periodo (RPC cierre o SUM tickets). */
  cardPayments: number
  /** entradas_efectivo + cardPayments */
  cobrosTotales: number
  /** Margen PyG − cobrosTotales */
  deltaPygCobros: number
}

type FinancialActionFailure = { success: false; error: string; forbidden?: boolean }

const financialStatementLineSchema = z.object({
  key: z.string(),
  label: z.string(),
  amount: z.coerce.number(),
})

const financialStatementExtractSchema = z.object({
  pyg: z.object({
    income: z.object({
      total: z.coerce.number(),
      gross_total: z.coerce.number(),
      gross_net: z.coerce.number(),
      lines: z.array(financialStatementLineSchema),
    }),
    expenses: z.object({
      total: z.coerce.number(),
      lines: z.array(financialStatementLineSchema),
    }),
    net: z.coerce.number(),
  }),
  cashFlow: z.object({
    net: z.coerce.number(),
    inflows: z.object({ total: z.coerce.number() }),
    outflows: z.object({ total: z.coerce.number() }),
  }),
  reconciliation: z.object({
    delta: z.coerce.number(),
  }),
})

type GateResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }

async function gateManager(): Promise<GateResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    console.error('[insights] auth error:', authError.message)
    return { ok: false, error: authError.message }
  }
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[insights] profile error:', profileError.message)
    return { ok: false, error: profileError.message }
  }

  const role = (profile as { role?: string | null } | null)?.role ?? null
  const allowed = role === 'manager' || role === 'admin' || role === 'supervisor'
  if (!allowed) return { ok: false, error: 'Sin permiso (solo gestión)' }

  return { ok: true, supabase }
}

function parseRpcRows<T>(
  schema: z.ZodType<T>,
  rows: unknown,
  label: string
): { ok: true; data: T[] } | { ok: false; error: string } {
  if (!Array.isArray(rows)) {
    console.error(`[insights] ${label}: respuesta RPC no es array`, rows)
    return { ok: false, error: `Respuesta inválida de ${label}` }
  }

  const parsed = z.array(schema).safeParse(rows)
  if (!parsed.success) {
    console.error(`[insights] ${label}: validación zod fallida`, parsed.error.flatten())
    return { ok: false, error: `Datos de ${label} no válidos` }
  }

  return { ok: true, data: parsed.data }
}

export async function getHourlySalesVsLabor(
  dateFrom: string,
  dateTo: string
): Promise<ActionSuccess<HourlyProfitabilityRow[]> | ActionFailure> {
  const parsed = dateRangeSchema.safeParse({ dateFrom, dateTo })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Rango de fechas inválido' }
  }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data, error } = await gate.supabase.rpc('get_hourly_sales_vs_labor', {
    p_date_from: parsed.data.dateFrom,
    p_date_to: parsed.data.dateTo,
  })

  if (error) {
    console.error('[insights] get_hourly_sales_vs_labor RPC error:', error.message)
    return { success: false, error: error.message }
  }

  const validated = parseRpcRows(hourlyProfitabilityRowSchema, data, 'get_hourly_sales_vs_labor')
  if (!validated.ok) return { success: false, error: validated.error }

  return { success: true, data: validated.data }
}

export async function getWeekdayAnalysis(
  dateFrom: string,
  dateTo: string
): Promise<ActionSuccess<WeekdayAnalysisRow[]> | ActionFailure> {
  const parsed = dateRangeSchema.safeParse({ dateFrom, dateTo })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Rango de fechas inválido' }
  }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data, error } = await gate.supabase.rpc('get_weekday_ticket_analysis', {
    p_date_from: parsed.data.dateFrom,
    p_date_to: parsed.data.dateTo,
  })

  if (error) {
    console.error('[insights] get_weekday_ticket_analysis RPC error:', error.message)
    return { success: false, error: error.message }
  }

  const validated = parseRpcRows(weekdayAnalysisRowSchema, data, 'get_weekday_ticket_analysis')
  if (!validated.ok) return { success: false, error: validated.error }

  return { success: true, data: validated.data }
}

export async function getProductMarginRanking(
  limit?: number,
  dateFrom?: string,
  dateTo?: string
): Promise<ActionSuccess<ProductMarginRow[]> | ActionFailure> {
  const parsedLimit = limitSchema.safeParse(limit ?? 20)
  if (!parsedLimit.success) {
    return { success: false, error: 'Límite inválido (1–500)' }
  }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const rpcArgs: {
    p_limit: number
    p_date_from?: string
    p_date_to?: string
  } = {
    p_limit: parsedLimit.data ?? 20,
  }

  if (dateFrom !== undefined && dateTo !== undefined) {
    const parsedRange = dateRangeSchema.safeParse({ dateFrom, dateTo })
    if (!parsedRange.success) {
      return {
        success: false,
        error: parsedRange.error.issues[0]?.message ?? 'Rango de fechas inválido',
      }
    }
    rpcArgs.p_date_from = parsedRange.data.dateFrom
    rpcArgs.p_date_to = parsedRange.data.dateTo
  }

  const { data, error } = await gate.supabase.rpc('get_product_margin_ranking', rpcArgs)

  if (error) {
    console.error('[insights] get_product_margin_ranking RPC error:', error.message)
    return { success: false, error: error.message }
  }

  const validated = parseRpcRows(productMarginRowSchema, data, 'get_product_margin_ranking')
  if (!validated.ok) return { success: false, error: validated.error }

  return { success: true, data: validated.data }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

const closingBreakdownSchema = z.object({
  total_tarjeta: z.coerce.number().optional(),
})

async function fetchPeriodCardPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dateFrom: string,
  dateTo: string
): Promise<number> {
  const days = enumerateYmdRange(dateFrom, dateTo)
  if (days.length === 0) return 0

  const rpcResults = await Promise.all(
    days.map((p_date) =>
      supabase.rpc('get_closing_sales_breakdown', { p_date }).then(({ data, error }) => ({
        data,
        error,
      }))
    )
  )

  const rpcFailed = rpcResults.some((r) => r.error)
  if (!rpcFailed) {
    let total = 0
    for (const r of rpcResults) {
      const parsed = closingBreakdownSchema.safeParse(r.data ?? {})
      if (parsed.success) {
        total += Math.max(0, Number(parsed.data.total_tarjeta) || 0)
      }
    }
    return roundMoney(total)
  }

  console.warn(
    '[insights] get_closing_sales_breakdown falló; fallback tickets_marbella.cobro_tarjeta'
  )
  const { data, error } = await supabase
    .from('tickets_marbella')
    .select('cobro_tarjeta')
    .gte('fecha', dateFrom)
    .lte('fecha', dateTo)

  if (error) {
    console.error('[insights] tickets_marbella cobro_tarjeta:', error.message)
    return 0
  }

  const sum = (data ?? []).reduce(
    (acc, row) => acc + Math.max(0, Number((row as { cobro_tarjeta?: number }).cobro_tarjeta) || 0),
    0
  )
  return roundMoney(sum)
}

export async function getFinancialSummary(
  dateFrom: string,
  dateTo: string
): Promise<ActionSuccess<FinancialSummaryData> | FinancialActionFailure> {
  const parsed = dateRangeSchema.safeParse({ dateFrom, dateTo })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Rango de fechas inválido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_financial_statement', {
    p_start_date: parsed.data.dateFrom,
    p_end_date: parsed.data.dateTo,
  })

  if (error) {
    const forbidden = error.message.toLowerCase().includes('forbidden')
    console.error('[insights] get_financial_statement RPC error:', error.message)
    return { success: false, error: error.message, forbidden }
  }

  const extracted = financialStatementExtractSchema.safeParse(data)
  if (!extracted.success) {
    console.error(
      '[insights] get_financial_statement: validación zod fallida',
      extracted.error.flatten()
    )
    return { success: false, error: 'Datos de estado financiero no válidos' }
  }

  const row = extracted.data
  const cashIn = row.cashFlow.inflows.total
  const cardPayments = await fetchPeriodCardPayments(supabase, parsed.data.dateFrom, parsed.data.dateTo)
  const cobrosTotales = roundMoney(cashIn + cardPayments)
  const deltaPygCobros = roundMoney(row.pyg.net - cobrosTotales)

  return {
    success: true,
    data: {
      pyg: {
        income: { total: row.pyg.income.total },
        expenses: { total: row.pyg.expenses.total },
        net: row.pyg.net,
      },
      cashFlow: { net: row.cashFlow.net },
      reconciliation: { delta: row.reconciliation.delta },
      incomeLines: row.pyg.income.lines,
      expenseLines: row.pyg.expenses.lines,
      cashIn,
      cashOut: row.cashFlow.outflows.total,
      salesGross: row.pyg.income.gross_net,
      cardPayments,
      cobrosTotales,
      deltaPygCobros,
    },
  }
}
