/**
 * Compensación monetaria de importes de extras abonados por encima del devengo.
 * El adelanto es un hecho B persistido; no altera fichajes, carry de horas ni caja.
 * El Writer llama a esta función en orden cronológico y persiste el resultado.
 */

export type OvertimePaidAdvanceSettlement = {
  estimatedValue: number | null;
  creditOut: number;
  creditUsed: number;
};

function cents(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Anticipo de extras: valor inválido de ' + label);
  }
  return Math.round(value * 100);
}

export function settleOvertimePaidAdvance(input: {
  grossCost: number | null;
  creditIn: number;
  paidAdvance: number;
}): OvertimePaidAdvanceSettlement {
  const available = cents(input.creditIn, 'crédito inicial');
  const newAdvance = cents(input.paidAdvance, 'adelanto pagado');

  if (input.grossCost == null) {
    if (available !== 0 || newAdvance !== 0) {
      throw new Error('Anticipo de extras: no se puede compensar sin tarifa conocida');
    }
    return { estimatedValue: null, creditOut: 0, creditUsed: 0 };
  }

  const gross = cents(input.grossCost, 'coste bruto');
  const consumed = Math.min(available, gross);

  // El exceso abonado en la semana origen es histórico y queda marcado como
  // pagado; pasa al banco monetario para compensar extras de semanas futuras.
  return {
    estimatedValue: (gross - consumed + newAdvance) / 100,
    creditOut: (available - consumed + newAdvance) / 100,
    creditUsed: consumed / 100,
  };
}

/**
 * Equivalencia en horas del crédito monetario AL ABRIR una semana.
 * Se genera en el Writer y queda persistida para la lectura de Asistencia.
 * En la semana de compensación se sigue mostrando: el crédito existía
 * al inicio y se liquida durante esa semana.
 */
export function pendingAdvanceHoursAtWeekStart(
  creditIn: number,
  effectiveOvertimeRate: number | null,
): number {
  const creditCents = cents(creditIn, 'crédito inicial');
  if (creditCents === 0) return 0;
  if (
    effectiveOvertimeRate == null ||
    !Number.isFinite(effectiveOvertimeRate) ||
    effectiveOvertimeRate <= 0
  ) {
    throw new Error('Anticipo de extras: falta tarifa para expresar deuda en horas');
  }
  return Math.round((creditCents / 100 / effectiveOvertimeRate) * 100) / 100;
}
