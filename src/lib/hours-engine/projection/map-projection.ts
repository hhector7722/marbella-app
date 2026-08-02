/**
 * Mapeo puro Hours Engine + Cost Engine → payload de columnas C
 * según PROJECTION CONTRACT v1 §1.
 *
 * No recalcula reglas. Solo proyecta valores ya producidos.
 */

import type { LiquidationResult } from '../types.ts';
import type { CivilDate } from '../types.ts';

/** Tolerancia vs numeric(10,2) en total_cost. */
export const MONEY_EPS = 0.005;

/** Redondeo a céntimos para persistir estimatedValue → total_cost. */
export function roundMoneyCents(value: number): number {
  return Math.round(value * 100) / 100;
}

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
};

/**
 * Proyecta LiquidationResult + estimatedValue del Cost Engine → fila de dominio.
 * El Writer no altera estos valores tras el mapeo (salvo redondeo monetario a céntimos).
 */
export function mapEnginesToProjectionRow(
  liquidation: LiquidationResult,
  estimatedValue: number,
): WeeklyProjectionDomainRow {
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
    total_cost: roundMoneyCents(estimatedValue),
  };
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
  const pairs: [number, number][] = [
    [a.pending_balance, b.pending_balance],
    [a.balance_hours, b.balance_hours],
    [a.final_balance, b.final_balance],
    [a.total_hours, b.total_hours],
    [a.ordinary_hours, b.ordinary_hours],
    [a.extra_hours, b.extra_hours],
    [a.contracted_hours_snapshot, b.contracted_hours_snapshot],
  ];
  for (const [x, y] of pairs) {
    if (Math.abs(x - y) > hoursEps) return false;
  }
  return Math.abs(a.total_cost - b.total_cost) <= moneyEps;
}
