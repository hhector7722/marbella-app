import { z } from 'zod'

/** El RPC puede devolver null. z.coerce.number() convertiría ese null en 0. */
const nullableRankingMoney = z.union([z.null(), z.coerce.number()])

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
})

export const productMarginRowSchema = z.object({
  product_name: z.string(),
  recipe_id: z.string().uuid().nullable(),
  total_units_sold: z.coerce.number(),
  avg_sale_price: z.coerce.number(),
  recipe_cost: nullableRankingMoney,
  margin_per_unit: nullableRankingMoney,
  total_margin_contribution: nullableRankingMoney,
})

export type HourlyProfitabilityRow = z.infer<typeof hourlyProfitabilityRowSchema>
export type WeekdayAnalysisRow = z.infer<typeof weekdayAnalysisRowSchema>
export type ProductMarginRow = z.infer<typeof productMarginRowSchema>
