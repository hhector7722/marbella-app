/**
 * Único componente autorizado a calcular el banco (arrastre).
 *
 * Bolsa/pago se resuelve por tramo: cada contribución semanal parcial
 * aplica su propio modo. El arrastre saliente se obtiene por waterfall
 * cronológico sobre (carryIn + partes), extrayendo del banco solo los
 * créditos de tramos en modo pago.
 */

export type CarrySegmentPart = {
  /** Balance parcial del tramo/segmento (puede ser +/−). */
  weeklyBalancePart: number;
  /** Modo bolsa del tramo que originó esta parte. */
  bagMode: boolean;
};

export type CarryInput = {
  carryIn: number;
  parts: readonly CarrySegmentPart[];
  isPaid: boolean;
};

export type CarryResult = {
  carryIn: number;
  weeklyBalance: number;
  balanceFinal: number;
  carryOut: number;
};

/**
 * Waterfall cronológico:
 * - Deuda (negativo) permanece en el banco.
 * - Crédito de tramo bolsa permanece en el banco (si la semana no está pagada).
 * - Crédito de tramo pago se extrae del banco (no arrastra).
 * - Si Pagada: cualquier crédito residual del banco se sella (carryOut no positivo).
 */
export function computeCarry(input: CarryInput): CarryResult {
  const weeklyBalance = input.parts.reduce((acc, p) => acc + p.weeklyBalancePart, 0);
  const balanceFinal = input.carryIn + weeklyBalance;

  let bank = input.carryIn;

  for (const part of input.parts) {
    bank += part.weeklyBalancePart;
    if (part.weeklyBalancePart > 0 && !part.bagMode) {
      // Crédito en modo pago: no permanece en el banco.
      const extract = Math.min(part.weeklyBalancePart, Math.max(0, bank));
      bank -= extract;
    }
  }

  if (input.isPaid && bank > 0) {
    bank = 0;
  }

  return {
    carryIn: input.carryIn,
    weeklyBalance,
    balanceFinal,
    carryOut: bank,
  };
}
