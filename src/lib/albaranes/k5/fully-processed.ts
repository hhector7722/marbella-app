/** The delivery occurred before the document was ingested.
 * This tests whether its inventory effects have ALL been registered.
 * Technical receipt confirmations are ledger rows, not a second human action.
 */
export function documentStockFullyRegistered(
  lines: readonly { id: string; status: string }[],
  confirmations: readonly { purchase_invoice_line_id: string; stock_movement_id: string | null }[]
): boolean {
  if (!lines.length) return false
  const ids = new Set(lines.map((line) => line.id))
  if (ids.size !== lines.length || lines.some((line) => line.status !== 'mapped')) return false
  const received = new Set(confirmations.filter((item) =>
    ids.has(item.purchase_invoice_line_id) && Boolean(item.stock_movement_id))
    .map((item) => item.purchase_invoice_line_id))
  return received.size === lines.length
}
