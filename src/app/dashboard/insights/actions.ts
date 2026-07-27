'use server'

import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { buildLaborCostPeriodFromSsot } from '@/lib/hours-engine'
import { getBusinessHourFromTicket } from '@/lib/utils'
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
  /** Entradas brutas de caja (treasury_log IN + CLOSE_ENTRY), sin restar salidas. */
  efectivoEntradas: number
  salesGross: number
  /** Tarjeta del periodo (get_period_card_payments). */
  cardPayments: number
  /** efectivoEntradas + cardPayments */
  cobrosTotales: number
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
  const allowed = role === 'manager' || role === 'admin'
  if (!allowed) return { ok: false, error: 'Sin permiso (solo manager o admin)' }

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

  const { dateFrom: from, dateTo: to } = parsed.data

  // Ventas por ticket (hora Madrid) + coste laboral HE (SSOT) prorrateado por € de venta.
  // No usa get_hourly_sales_vs_labor / fn_labor_* / fn_worker_hourly_rate.
  const [ticketsRes, labor] = await Promise.all([
    gate.supabase
      .from('tickets_marbella')
      .select('total_documento, fecha, hora_cierre, fecha_real')
      .gte('fecha', from)
      .lte('fecha', to),
    buildLaborCostPeriodFromSsot(gate.supabase, {
      startDate: from,
      endDate: to,
    }),
  ])

  if (ticketsRes.error) {
    console.error('[insights] tickets_marbella error:', ticketsRes.error.message)
    return { success: false, error: ticketsRes.error.message }
  }

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total_revenue: 0,
    ticket_count: 0,
  }))

  for (const t of ticketsRes.data ?? []) {
    const h = getBusinessHourFromTicket({
      fecha: t.fecha != null ? String(t.fecha) : undefined,
      hora_cierre: t.hora_cierre ?? undefined,
    })
    if (!Number.isFinite(h) || h < 0 || h > 23) continue
    byHour[h]!.total_revenue += Number(t.total_documento) || 0
    byHour[h]!.ticket_count += 1
  }

  const totalRevenue = byHour.reduce((s, r) => s + r.total_revenue, 0)
  const totalLabor = labor.totalCost

  const rows: HourlyProfitabilityRow[] = byHour.map((r) => {
    const share = totalRevenue > 0 ? r.total_revenue / totalRevenue : 0
    const labor_cost = Math.round(totalLabor * share * 100) / 100
    const avg_ticket =
      r.ticket_count > 0 ? r.total_revenue / r.ticket_count : 0
    return {
      hour: r.hour,
      total_revenue: Math.round(r.total_revenue * 100) / 100,
      ticket_count: r.ticket_count,
      avg_ticket: Math.round(avg_ticket * 100) / 100,
      labor_cost,
      margin: Math.round((r.total_revenue - labor_cost) * 100) / 100,
    }
  })

  const validated = parseRpcRows(hourlyProfitabilityRowSchema, rows, 'hourly_ssot')
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

/** Cobros tarjeta del periodo: RPC get_closing_sales_breakdown por día o fallback tickets. */
async function getPeriodCardPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dateFrom: string,
  dateTo: string
): Promise<number> {
  const { data, error } = await supabase.rpc('get_period_card_payments', {
    p_start: dateFrom,
    p_end: dateTo,
  })

  if (error) {
    console.error('[insights] get_period_card_payments RPC error:', error.message)
    return 0
  }

  return roundMoney(Math.max(0, Number(data) || 0))
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
  const efectivoEntradas = row.cashFlow.inflows.total
  const cardPayments = await getPeriodCardPayments(
    supabase,
    parsed.data.dateFrom,
    parsed.data.dateTo
  )
  const cobrosTotales = roundMoney(efectivoEntradas + cardPayments)

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
      efectivoEntradas,
      salesGross: row.pyg.income.gross_net,
      cardPayments,
      cobrosTotales,
    },
  }
}
