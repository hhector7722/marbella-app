'use server'

import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

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

export const hourlyProfitabilityRowSchema = z.object({
  hour: z.coerce.number().int().min(0).max(23),
  total_revenue: z.coerce.number(),
  ticket_count: z.coerce.number().int(),
  avg_ticket: z.coerce.number(),
  labor_cost: z.coerce.number(),
  margin: z.coerce.number(),
})

export const weekdayAnalysisRowSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  weekday_name: z.string(),
  avg_revenue: z.coerce.number(),
  avg_tickets: z.coerce.number(),
  avg_ticket_value: z.coerce.number(),
  days_with_events: z.coerce.number().int(),
  avg_revenue_with_event: z.coerce.number(),
  avg_revenue_without_event: z.coerce.number(),
})

export const productMarginRowSchema = z.object({
  product_name: z.string(),
  total_units_sold: z.coerce.number(),
  avg_sale_price: z.coerce.number(),
  recipe_cost: z.coerce.number(),
  margin_per_unit: z.coerce.number(),
  total_margin_contribution: z.coerce.number(),
})

export type HourlyProfitabilityRow = z.infer<typeof hourlyProfitabilityRowSchema>
export type WeekdayAnalysisRow = z.infer<typeof weekdayAnalysisRowSchema>
export type ProductMarginRow = z.infer<typeof productMarginRowSchema>

type ActionSuccess<T> = { success: true; data: T }
type ActionFailure = { success: false; error: string }

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
  limit?: number
): Promise<ActionSuccess<ProductMarginRow[]> | ActionFailure> {
  const parsedLimit = limitSchema.safeParse(limit ?? 20)
  if (!parsedLimit.success) {
    return { success: false, error: 'Límite inválido (1–500)' }
  }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const { data, error } = await gate.supabase.rpc('get_product_margin_ranking', {
    p_limit: parsedLimit.data ?? 20,
  })

  if (error) {
    console.error('[insights] get_product_margin_ranking RPC error:', error.message)
    return { success: false, error: error.message }
  }

  const validated = parseRpcRows(productMarginRowSchema, data, 'get_product_margin_ranking')
  if (!validated.ok) return { success: false, error: validated.error }

  return { success: true, data: validated.data }
}
