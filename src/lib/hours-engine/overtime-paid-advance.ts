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
