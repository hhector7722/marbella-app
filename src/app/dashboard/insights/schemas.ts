import { z } from 'zod'

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
  total_units_sold: z.coerce.number(),
  avg_sale_price: z.coerce.number(),
  recipe_cost: z.coerce.number(),
  margin_per_unit: z.coerce.number(),
  total_margin_contribution: z.coerce.number(),
})

export type HourlyProfitabilityRow = z.infer<typeof hourlyProfitabilityRowSchema>
export type WeekdayAnalysisRow = z.infer<typeof weekdayAnalysisRowSchema>
export type ProductMarginRow = z.infer<typeof productMarginRowSchema>
