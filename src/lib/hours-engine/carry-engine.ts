/**
 * Único componente autorizado a calcular el banco (arrastre).
 *
 * Regla operativa: primero se netea la semana completa; después se decide
 * qué crédito permanece. Nunca se cobra un tramo positivo si el neto de la
 * semana (o el banco final) queda en deuda.
 *
 * - Deuda (negativo) permanece siempre.
 * - Pago puro: todo crédito se liquida (carryOut ≤ 0).
 * - Bolsa pura: todo crédito permanece.
 * - Mixto: solo el crédito de tramos bolsa (+ crédito previo) permanece.
 * - Si Pagada: cualquier crédito residual se sella (carryOut no positivo).
 * - Todos los saldos pasan por redondeo Marbella (solo .0 / .5).
 */

import { roundMarbellaSigned } from './marbella-round.ts';

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

export function computeCarry(input: CarryInput): CarryResult {
  const carryIn = roundMarbellaSigned(input.carryIn);
  const parts = input.parts.map((p) => ({
    ...p,
    weeklyBalancePart: roundMarbellaSigned(p.weeklyBalancePart),
  }));

  const weeklyBalance = roundMarbellaSigned(
    parts.reduce((acc, p) => acc + p.weeklyBalancePart, 0),
  );
  const balanceFinal = roundMarbellaSigned(carryIn + weeklyBalance);

  const bagPositive = roundMarbellaSigned(
    parts
      .filter((p) => p.bagMode)
      .reduce((acc, p) => acc + Math.max(0, p.weeklyBalancePart), 0),
  );

  const allBag = parts.length > 0 && parts.every((p) => p.bagMode);
  const allPay = parts.length > 0 && parts.every((p) => !p.bagMode);

  let carryOut: number;

  if (input.isPaid) {
    carryOut = Math.min(0, balanceFinal);
  } else if (balanceFinal <= 0) {
    // Deuda o cero: arrastra; nada cobrable.
    carryOut = balanceFinal;
  } else if (parts.length === 0) {
    // Semana sin tramos: no liquidar crédito entrante.
    carryOut = balanceFinal;
  } else if (allPay) {
    // Pago: liquida TODO el crédito (carryIn positivo + extras de la semana).
    carryOut = 0;
  } else if (allBag) {
    // Bolsa: acumula.
    carryOut = balanceFinal;
  } else {
    // Mixto bolsa/pago: solo permanece crédito bolsa (+ crédito previo de bolsa).
    const priorCredit = Math.max(0, carryIn);
    carryOut = Math.min(balanceFinal, priorCredit + bagPositive);
  }

  return {
    carryIn,
    weeklyBalance,
    balanceFinal,
    carryOut: roundMarbellaSigned(carryOut),
  };
}
