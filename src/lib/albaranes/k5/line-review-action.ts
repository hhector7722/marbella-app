import type { K5BatchDisposition } from './batch-review.ts'

/** Los avisos documentales se muestran por separado: nunca bloquean el botón. */
type LineReviewActionState = {
  disposition: K5BatchDisposition
  confirmed: boolean
}

export function lineReviewActionLabel(row: LineReviewActionState | null): string | null {
  if (!row) return null
  if (row.confirmed || row.disposition === 'confirmed') return 'Confirmado'
  if (row.disposition === 'ready') return 'Confirmar'
  if (row.disposition === 'needs_mapping') return 'Mapear'
  if (row.disposition === 'order_review') return 'Revisar pedido'
  if (row.disposition === 'needs_review' || row.disposition === 'unavailable') return 'Revisar'
  if (row.disposition === 'excluded') return 'Excluida'
  return 'Revisar'
}

export function isPassiveLineReviewAction(
  row: LineReviewActionState | null,
  expenseOnly: boolean
): boolean {
  return expenseOnly || Boolean(row?.confirmed)
    || row?.disposition === 'confirmed' || row?.disposition === 'excluded'
}
