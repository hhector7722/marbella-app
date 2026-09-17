/**
 * Productor del esperado y del descuadre de un cierre de caja.
 * Las magnitudes de entrada las produce `get_closing_sales_breakdown`;
 * esta función no vuelve a leer tickets.
 */

export function roundClosingMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type ClosingBalanceInputs = {
  ventas: number
  pendiente: number
  cobros: number
  tarjeta: number
  efectivoContado: number
}

export type ClosingBalance = {
  esperado: number
  descuadre: number
}

/**
 * Esperado = Ventas − Pendiente + Cobros − Tarjeta.
 * Descuadre = efectivo contado − esperado.
 *
 * Tarjeta es todo lo cobrado con datáfono hoy, incluidos cobros de otra fecha.
 * Por eso un cobro grande pagado con tarjeta sube Tarjeta y no infla el efectivo esperado.
 */
export function computeCashClosingBalance(input: ClosingBalanceInputs): ClosingBalance {
  const ventas = roundClosingMoney(input.ventas)
  const pendiente = roundClosingMoney(input.pendiente)
  const cobros = roundClosingMoney(input.cobros)
  const tarjeta = roundClosingMoney(input.tarjeta)
  const efectivoContado = roundClosingMoney(input.efectivoContado)

  const esperado = roundClosingMoney(ventas - pendiente + cobros - tarjeta)
  const descuadre = roundClosingMoney(efectivoContado - esperado)

  return { esperado, descuadre }
}

export type ClosingBreakdownRow = {
  total_bruto?: number
  total_tarjeta?: number
  total_pendiente?: number
  total_cobros?: number
  total_cobros_deuda?: number
  recuento_tickets?: number
}

/** Traduce el JSON del RPC a las cuatro magnitudes editables del paso 1. */
export function closingMagnitudesFromBreakdown(row: ClosingBreakdownRow): {
  ventas: number
  tarjeta: number
  pendiente: number
  cobros: number
  tickets: number
} {
  const ventas = Math.max(0, roundClosingMoney(Number(row.total_bruto) || 0))
  const tarjeta = Math.max(0, roundClosingMoney(Number(row.total_tarjeta) || 0))
  const pendiente = Math.max(0, roundClosingMoney(Number(row.total_pendiente) || 0))
  const cobrosRpc = Number(row.total_cobros)
  const cobros =
    Number.isFinite(cobrosRpc)
      ? Math.max(0, roundClosingMoney(cobrosRpc))
      : Math.max(0, roundClosingMoney(Number(row.total_cobros_deuda) || 0))
  const tickets = Math.max(0, Number(row.recuento_tickets) || 0)

  return { ventas, tarjeta, pendiente, cobros, tickets }
}
