/**
 * Pie de extras y bolsa efectiva a partir de magnitudes ya calculadas.
 * Sin liquidateWeek. Lo usa el Writer (al mapear) y el Read Model (al pintar).
 */

import { roundMarbellaHours } from './marbella-round.ts';

export function preferStockEffective(
  result: { segments: readonly { bagMode: boolean }[] },
  bagModeOverride?: boolean | null,
): boolean {
  if (bagModeOverride === true) return true;
  if (bagModeOverride === false) return false;
  return result.segments.length > 0 && result.segments.every((s) => s.bagMode);
}

/**
 * Horas cobrables de la semana (modo pago). Bolsa → 0.
 * Si carryOut < 0 queda deuda → 0.
 */
export function netPayableHoursFromProjection(input: {
  preferStock: boolean;
  balanceFinal: number;
  carryOut: number;
}): number {
  if (input.preferStock) return 0;
  return roundMarbellaHours(
    Math.max(0, input.balanceFinal - Math.max(0, input.carryOut)),
  );
}

/** Pie «Extras» (INV-P03). Distinto de extra_hours (OT bruto). */
export function extrasFooterFromProjection(input: {
  preferStock: boolean;
  carryIn: number;
  carryOut: number;
  overtimeHours: number;
  balanceFinal: number;
}): number {
  if (input.carryOut < 0) return 0;
  if (input.preferStock) return roundMarbellaHours(input.overtimeHours);
  const netPayable = netPayableHoursFromProjection(input);
  return roundMarbellaHours(Math.max(0, netPayable - Math.max(0, input.carryIn)));
}
