/**
 * Precio anterior = última recepción económica confirmada en OTRO albarán.
 * Nunca se toma old_price, ya que puede proceder de un alta/corrección manual.
 * Los eventos legados sin origen tampoco son una compra acreditada.
 */
export type ReceiptPriceRow = {
  id: string
  ingredient_id: string
  new_price: string | number | null
  changed_at: string | null
  source: string | null
  purchase_invoice_id: string | null
}

export type ReceiptPriceVariation = {
  receipt: ReceiptPriceRow
  previousPrice: number
  currentPrice: number
  variation: number
}

export function verifiedReceiptPriceVariations(
  rows: ReceiptPriceRow[],
  since: string,
): ReceiptPriceVariation[] {
  const last = new Map<string, { invoiceId: string; price: number }>()
  const result: ReceiptPriceVariation[] = []

  const chronological = [...rows].sort(
    (a, b) => String(a.changed_at).localeCompare(String(b.changed_at)) || a.id.localeCompare(b.id),
  )
  for (const receipt of chronological) {
    // La corrección manual invalida el último precio observado: pudo subsanar un error.
    // Se requieren dos compras confirmadas nuevas para volver a calcular variaciones.
    if (receipt.source === 'manual') {
      last.delete(receipt.ingredient_id)
      continue
    }
    if (receipt.source !== 'receipt_confirmation' || !receipt.purchase_invoice_id) continue
    const price = receipt.new_price == null ? NaN : Number(receipt.new_price)
    if (!Number.isFinite(price) || price < 0) continue

    const previous = last.get(receipt.ingredient_id)
    if (previous && previous.invoiceId !== receipt.purchase_invoice_id &&
      String(receipt.changed_at ?? '').slice(0, 10) >= since && previous.price > 0) {
      result.push({
        receipt, previousPrice: previous.price, currentPrice: price,
        variation: (price / previous.price - 1) * 100,
      })
    }
    last.set(receipt.ingredient_id, { invoiceId: receipt.purchase_invoice_id, price })
  }

  return result.sort((a, b) =>
    String(b.receipt.changed_at).localeCompare(String(a.receipt.changed_at)) ||
    b.receipt.id.localeCompare(a.receipt.id))
}
