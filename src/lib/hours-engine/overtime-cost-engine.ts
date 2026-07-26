/**
 * Overtime Cost Engine — productor único del importe económico de horas extra.
 *
 * No modifica horas, carry, bolsa ni balances (eso es Hours Engine).
 *
 * Política (aprobada):
 * 1. Override semanal (`overtime_price_snapshot`) → prioridad absoluta sobre
 *    todo netPayable (OT de la semana + banco liquidado).
 * 2. Sin override:
 *    - Horas cobrables de esta semana (P⁺ post-Carry) → Σ take_i × rate_i
 *      por segmentos de pago, orden cronológico.
 *    - Horas de banco liquidadas = max(0, netPayable − P⁺) → × tarifa
 *      contractual vigente en weekStart (lunes).
 *
 * La separación semana/banco es interna. La API pública solo expone
 * estimatedValue (+ hourlyRate de display).
 *
 * Nunca usa OT bruto del segmento.
 */

import { roundMarbellaHours } from './marbella-round.ts';

const EPS = 1e-9;

/** Segmento ya liquidado + tarifa contractual del tramo (paralelo a SegmentLiquidation). */
export type OvertimeCostSegment = {
  weeklyBalancePart: number;
  bagMode: boolean;
  /** Tarifa del tramo; null solo admisible si no aporta horas cobrables. */
  overtimeRatePerHour: number | null;
};

export type PriceWeekOvertimeInput = {
  /** Horas cobrables post-Carry (netPayable). */
  netPayableHours: number;
  /** Segmentos en orden cronológico (mismo orden que LiquidationResult.segments). */
  segments: readonly OvertimeCostSegment[];
  /**
   * Override semanal (`weekly_snapshots.overtime_price_snapshot`).
   * - `null` / `undefined` → sin override.
   * - número (incl. 0) → prioridad absoluta toda la semana.
   */
  overrideRate?: number | null;
  /**
   * Tarifa contractual vigente al inicio de la semana de liquidación (lunes).
   * Obligatorio si hay horas de banco liquidadas y no hay override.
   */
  settlementRateAtWeekStart?: number | null;
};

export type PriceWeekOvertimeResult = {
  estimatedValue: number;
  /**
   * Tarifa de display:
   * - override si existe
   * - tarifa única si el importe usó una sola rate
   * - si no, efectiva = estimatedValue / netPayable
   */
  hourlyRate: number;
};

/**
 * ¿Hay override semanal activo?
 * Solo `null`/`undefined` significan ausencia; `0` es override válido.
 */
export function hasOvertimeRateOverride(
  overrideRate: number | null | undefined,
): boolean {
  return overrideRate != null && Number.isFinite(overrideRate);
}

/**
 * Valora la semana. Función pura.
 * Un único estimatedValue; la política semana/banco no se expone.
 */
export function priceWeekOvertime(
  input: PriceWeekOvertimeInput,
): PriceWeekOvertimeResult {
  const netPayable = roundMarbellaHours(Math.max(0, input.netPayableHours));

  if (hasOvertimeRateOverride(input.overrideRate)) {
    const rate = Number(input.overrideRate);
    return {
      estimatedValue: netPayable * rate,
      hourlyRate: rate,
    };
  }

  if (netPayable <= EPS) {
    const fallback =
      finiteRate(input.settlementRateAtWeekStart) ??
      firstFiniteRate(input.segments) ??
      0;
    return { estimatedValue: 0, hourlyRate: fallback };
  }

  let remaining = netPayable;
  let value = 0;
  const ratesUsed: number[] = [];

  // 1) OT / crédito de ESTA semana (capacidades P⁺).
  for (const seg of input.segments) {
    if (remaining <= EPS) break;
    if (seg.bagMode) continue;
    const part = roundMarbellaHours(seg.weeklyBalancePart);
    if (part <= EPS) continue;

    const rate = seg.overtimeRatePerHour;
    if (rate == null || !Number.isFinite(rate)) {
      throw new Error(
        'Overtime Cost Engine: segmento cobrable sin overtimeRatePerHour (sin fallback a profiles)',
      );
    }

    const take = roundMarbellaHours(Math.min(remaining, part));
    if (take <= EPS) continue;

    value += take * rate;
    ratesUsed.push(rate);
    remaining = roundMarbellaHours(remaining - take);
  }

  // 2) Banco liquidado (carry): no pertenece a ningún tramo de esta semana.
  //    Política: tarifa contractual vigente en weekStart (lunes).
  if (remaining > EPS) {
    const settlement = finiteRate(input.settlementRateAtWeekStart);
    if (settlement == null) {
      throw new Error(
        `Overtime Cost Engine: ${remaining} h de banco liquidadas sin settlementRateAtWeekStart`,
      );
    }
    value += remaining * settlement;
    ratesUsed.push(settlement);
    remaining = 0;
  }

  const hourlyRate =
    ratesUsed.length === 0
      ? (finiteRate(input.settlementRateAtWeekStart) ??
        firstFiniteRate(input.segments) ??
        0)
      : ratesUsed.every((r) => Math.abs(r - ratesUsed[0]!) < EPS)
        ? ratesUsed[0]!
        : value / netPayable;

  return {
    estimatedValue: value,
    hourlyRate,
  };
}

function finiteRate(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Number(rate);
}

function firstFiniteRate(
  segments: readonly OvertimeCostSegment[],
): number | null {
  for (const s of segments) {
    if (s.overtimeRatePerHour != null && Number.isFinite(s.overtimeRatePerHour)) {
      return Number(s.overtimeRatePerHour);
    }
  }
  return null;
}
