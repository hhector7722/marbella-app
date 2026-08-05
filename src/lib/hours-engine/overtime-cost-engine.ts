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

export class MissingOvertimeRateError extends Error {
  readonly code = 'MISSING_OVERTIME_RATE' as const;
  constructor(message?: string) {
    super(message ?? 'Overtime Cost Engine: falta tarifa de horas extra');
    this.name = 'MissingOvertimeRateError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Segmento ya liquidado + tarifa contractual del tramo (paralelo a SegmentLiquidation). */


export type PriceWeekOvertimeInput = {
  /** Horas cobrables post-Carry (netPayable). */
  netPayableHours: number;
  /** Effective overtime rate resolved before calling the engine (override or contractual rate). */
  effectiveOvertimeRate?: number | null;
};

export type PriceWeekOvertimeResult = {
  estimatedValue: number | null;
  hourlyRate: number | null;
  hasMissingRate?: boolean;
};

function finiteRate(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Number(rate);
}

/**
 * Valora la semana. Función pura.
 * Recibe únicamente horas cobrables (netPayableHours) y la tarifa efectiva ya resuelta (effectiveOvertimeRate).
 */
export function priceWeekOvertime(
  input: PriceWeekOvertimeInput,
): PriceWeekOvertimeResult {
  const netPayable = roundMarbellaHours(Math.max(0, input.netPayableHours));
  const rate = finiteRate(input.effectiveOvertimeRate);

  if (netPayable <= EPS) {
    // No payable hours – return zero value and rate (or 0) for display
    return { estimatedValue: 0, hourlyRate: rate ?? 0 };
  }

  if (rate == null) {
    throw new MissingOvertimeRateError(
      'Overtime Cost Engine: falta tarifa de horas extra para semana con horas cobrables',
    );
  }

  const estimatedValue = netPayable * rate;
  return { estimatedValue, hourlyRate: rate };
}

