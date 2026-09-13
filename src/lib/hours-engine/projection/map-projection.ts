/**
 * Mapeo puro Hours Engine + Cost Engine → payload de columnas C
 * según PROJECTION CONTRACT v2.
 *
 * No recalcula reglas. Solo proyecta valores ya producidos.
 */

import { allocateWeekCostToDays } from '../allocate-week-cost-to-days.ts';
import { preferStockEffective } from '../extras-footer.ts';
import type { LiquidationResult } from '../types.ts';
import type { CivilDate } from '../types.ts';

/** Tolerancia vs numeric(10,2) en total_cost. */
export const MONEY_EPS = 0.005;

/** Redondeo a céntimos para persistir estimatedValue → total_cost. */
export function roundMoneyCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ProjectionPricingInput = {
  estimatedValue: number | null;
  hourlyRate?: number | null;
  hasMissingRate?: boolean;
  bagModeOverride?: boolean | null;
};

/**
 * Columnas A (identidad de periodo) + C (resultados) que el Writer puede escribir.
 * Explicitamente excluye B (overrides) y D (metadata física aún no materializada).
 */
export type WeeklyProjectionDomainRow = {
  user_id: string;
  week_start: CivilDate;
  week_end: CivilDate;
  pending_balance: number;
  balance_hours: number;
  final_balance: number;
  total_hours: number;
  ordinary_hours: number;
  extra_hours: number;
  contracted_hours_snapshot: number;
  total_cost: number;
  carry_out: number;
  prefer_stock_effective: boolean;
  has_missing_rate: boolean;
  overtime_rate_effective: number | null;
};

export type WeeklyProjectionDayRow = {
  user_id: string;
  week_start: CivilDate;
  day: CivilDate;
  overtime_hours: number;
  overtime_cost: number;
};

function pricingFromArg(
  estimatedValueOrPricing: number | null | ProjectionPricingInput,
): ProjectionPricingInput {
  if (
    estimatedValueOrPricing != null &&
    typeof estimatedValueOrPricing === 'object'
  ) {
    return estimatedValueOrPricing;
  }
  return { estimatedValue: estimatedValueOrPricing };
}

/**
 * Proyecta LiquidationResult + pricing del Cost Engine → fila de dominio.
 * El Writer no altera estos valores tras el mapeo (salvo redondeo monetario a céntimos).
 */
export function mapEnginesToProjectionRow(
  liquidation: LiquidationResult,
  estimatedValueOrPricing: number | null | ProjectionPricingInput,
): WeeklyProjectionDomainRow {
  const pricing = pricingFromArg(estimatedValueOrPricing);
  const hasMissingRate = pricing.hasMissingRate === true;
  return {
    user_id: liquidation.employeeId,
    week_start: liquidation.weekStart as CivilDate,
    week_end: liquidation.weekEnd as CivilDate,
    pending_balance: liquidation.carryIn,
    balance_hours: liquidation.weeklyBalance,
    final_balance: liquidation.balanceFinal,
    total_hours: liquidation.hoursWorked,
    ordinary_hours: liquidation.ordinaryHours,
    extra_hours: liquidation.overtimeHours,
    contracted_hours_snapshot: liquidation.contractedHoursEffective,
    total_cost:
      pricing.estimatedValue != null
        ? roundMoneyCents(pricing.estimatedValue)
        : 0,
    carry_out: liquidation.carryOut,
    prefer_stock_effective: preferStockEffective(
      liquidation,
      pricing.bagModeOverride,
    ),
    has_missing_rate: hasMissingRate,
    overtime_rate_effective:
      pricing.hourlyRate != null && Number.isFinite(pricing.hourlyRate)
        ? roundMoneyCents(pricing.hourlyRate)
        : null,
  };
}

export function mapEnginesToProjectionDays(
  liquidation: LiquidationResult,
  estimatedValue: number | null,
): WeeklyProjectionDayRow[] {
  const extrasByDay: Record<string, number> = {};
  for (const d of liquidation.dailyBreakdown.days) {
    extrasByDay[d.day] = d.overtimeHours;
  }
  const costByDay = allocateWeekCostToDays(
    extrasByDay,
    estimatedValue != null ? roundMoneyCents(estimatedValue) : 0,
    liquidation.weekStart,
    liquidation.weekEnd,
  );
  return liquidation.dailyBreakdown.days.map((d) => ({
    user_id: liquidation.employeeId,
    week_start: liquidation.weekStart as CivilDate,
    day: d.day,
    overtime_hours: d.overtimeHours,
    overtime_cost: costByDay[d.day] ?? 0,
  }));
}

export function assertProjectionDayInvariants(
  row: WeeklyProjectionDomainRow,
  days: readonly WeeklyProjectionDayRow[],
): void {
  if (days.length !== 7) {
    throw new Error(
      `weekly_snapshot_days: se esperaban 7 días, hay ${days.length} @ ${row.week_start}`,
    );
  }
  let hours = 0;
  let cost = 0;
  for (const d of days) {
    if (d.user_id !== row.user_id || d.week_start !== row.week_start) {
      throw new Error(
        `weekly_snapshot_days: identidad distinta a la semana @ ${row.week_start}`,
      );
    }
    hours += d.overtime_hours;
    cost += d.overtime_cost;
  }
  if (Math.abs(hours - row.extra_hours) > MONEY_EPS) {
    throw new Error(
      `Σ overtime_hours=${hours} ≠ extra_hours=${row.extra_hours} @ ${row.week_start}`,
    );
  }
  if (Math.abs(cost - row.total_cost) > MONEY_EPS) {
    throw new Error(
      `Σ overtime_cost=${cost} ≠ total_cost=${row.total_cost} @ ${row.week_start}`,
    );
  }
}

/** Columnas C usadas en UPDATE (nunca toca B ni A salvo week_end coherente). */
export function domainRowToUpdatePayload(
  row: WeeklyProjectionDomainRow,
): {
  week_end: string;
  pending_balance: number;
  balance_hours: number;
  final_balance: number;
  total_hours: number;
  ordinary_hours: number;
  extra_hours: number;
  contracted_hours_snapshot: number;
  total_cost: number;
  carry_out: number;
  prefer_stock_effective: boolean;
  has_missing_rate: boolean;
  overtime_rate_effective: number | null;
} {
  return {
    week_end: row.week_end,
    pending_balance: row.pending_balance,
    balance_hours: row.balance_hours,
    final_balance: row.final_balance,
    total_hours: row.total_hours,
    ordinary_hours: row.ordinary_hours,
    extra_hours: row.extra_hours,
    contracted_hours_snapshot: row.contracted_hours_snapshot,
    total_cost: row.total_cost,
    carry_out: row.carry_out,
    prefer_stock_effective: row.prefer_stock_effective,
    has_missing_rate: row.has_missing_rate,
    overtime_rate_effective: row.overtime_rate_effective,
  };
}

/** INSERT: solo A + C. No incluye overrides B (quedan null / default). */
export function domainRowToInsertPayload(
  row: WeeklyProjectionDomainRow,
): {
  user_id: string;
  week_start: string;
  week_end: string;
  pending_balance: number;
  balance_hours: number;
  final_balance: number;
  total_hours: number;
  ordinary_hours: number;
  extra_hours: number;
  contracted_hours_snapshot: number;
  total_cost: number;
  carry_out: number;
  prefer_stock_effective: boolean;
  has_missing_rate: boolean;
  overtime_rate_effective: number | null;
} {
  return {
    user_id: row.user_id,
    week_start: row.week_start,
    week_end: row.week_end,
    pending_balance: row.pending_balance,
    balance_hours: row.balance_hours,
    final_balance: row.final_balance,
    total_hours: row.total_hours,
    ordinary_hours: row.ordinary_hours,
    extra_hours: row.extra_hours,
    contracted_hours_snapshot: row.contracted_hours_snapshot,
    total_cost: row.total_cost,
    carry_out: row.carry_out,
    prefer_stock_effective: row.prefer_stock_effective,
    has_missing_rate: row.has_missing_rate,
    overtime_rate_effective: row.overtime_rate_effective,
  };
}

/**
 * Comparación de columnas C (+ week_end) para idempotencia / read-back.
 * Las horas también se persisten en numeric(10,2): la tolerancia refleja
 * el redondeo de PostgreSQL (máx. error 0.005), igual que total_cost.
 */
export function projectionDomainEquals(
  a: WeeklyProjectionDomainRow,
  b: WeeklyProjectionDomainRow,
  moneyEps: number = MONEY_EPS,
  hoursEps: number = MONEY_EPS,
): boolean {
  if (a.user_id !== b.user_id) return false;
  if (a.week_start !== b.week_start) return false;
  if (a.week_end !== b.week_end) return false;
  if (a.prefer_stock_effective !== b.prefer_stock_effective) return false;
  if (a.has_missing_rate !== b.has_missing_rate) return false;
  const pairs: [number, number][] = [
    [a.pending_balance, b.pending_balance],
    [a.balance_hours, b.balance_hours],
    [a.final_balance, b.final_balance],
    [a.total_hours, b.total_hours],
    [a.ordinary_hours, b.ordinary_hours],
    [a.extra_hours, b.extra_hours],
    [a.contracted_hours_snapshot, b.contracted_hours_snapshot],
    [a.carry_out, b.carry_out],
  ];
  for (const [x, y] of pairs) {
    if (Math.abs(x - y) > hoursEps) return false;
  }
  if (Math.abs(a.total_cost - b.total_cost) > moneyEps) return false;
  const ar = a.overtime_rate_effective;
  const br = b.overtime_rate_effective;
  if (ar == null && br == null) return true;
  if (ar == null || br == null) return false;
  return Math.abs(ar - br) <= moneyEps;
}
