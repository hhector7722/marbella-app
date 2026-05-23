/** Líneas sin ingrediente (portes, sin cargo, ajustes contables, etc.) */
export const INVOICE_LINE_STATUS_EXCLUDED = 'excluded' as const

export type InvoiceLineStatusLike = {
  status?: string | null
  mapped_ingredient_id?: string | null
  ingredient_id?: string | null
}

export function isInvoiceLineExcluded(line: InvoiceLineStatusLike): boolean {
  return String(line.status ?? '') === INVOICE_LINE_STATUS_EXCLUDED
}

/** Cuenta como resuelta para el tick verde del albarán (mapeada o excluida). */
export function isInvoiceLineResolved(line: InvoiceLineStatusLike): boolean {
  if (isInvoiceLineExcluded(line)) return true
  const ing = line.mapped_ingredient_id ?? line.ingredient_id
  return Boolean(ing) && String(line.status ?? '') === 'mapped'
}

/** Solo las líneas mapeadas a ingrediente requieren movimiento PURCHASE. */
export function invoiceLineRequiresStock(line: InvoiceLineStatusLike): boolean {
  if (isInvoiceLineExcluded(line)) return false
  const ing = line.mapped_ingredient_id ?? line.ingredient_id
  return Boolean(ing) && String(line.status ?? '') === 'mapped'
}
