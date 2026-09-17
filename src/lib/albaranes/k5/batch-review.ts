export type K5BatchDisposition =
  | 'ready'
  | 'confirmed'
  | 'needs_mapping'
  | 'needs_review'
  | 'order_review'
  | 'excluded'
  | 'unavailable'

export type K5BatchCandidateInput = {
  status: string
  mappingVersionId: string | null
  ingredientId: string | null
  lineId: string | null
  confirmed: boolean
  pendingOrderCount: number
}

/**
 * K2 empezó a registrar conciliaciones económicas fiables a partir de esta
 * migración. Los pedidos heredados anteriores pueden seguir apareciendo como
 * pendientes porque no tenían recepciones K2 con las que cerrarse.
 */
export const K2_RECONCILIATION_TRUST_START = '2026-09-13T22:55:26.000Z'

export type K5EvidenceIdentityInput = {
  documentExtractionId: unknown
  sourceTableIndex: unknown
  sourceRowIndex: unknown
}

/**
 * Identidad física de una fila extraída. Sirve para reconocer una recepción ya
 * confirmada aunque una recalculación posterior haya creado otra línea de
 * purchase_invoice_lines para la misma evidencia Docling.
 */
export function k5EvidenceIdentity(input: K5EvidenceIdentityInput): string | null {
  const extractionId = String(input.documentExtractionId ?? '').trim()
  if (input.sourceTableIndex == null || input.sourceTableIndex === '' || input.sourceRowIndex == null || input.sourceRowIndex === '') {
    return null
  }
  const tableIndex = Number(input.sourceTableIndex)
  const rowIndex = Number(input.sourceRowIndex)
  if (!extractionId || !Number.isInteger(tableIndex) || tableIndex < 0 || !Number.isInteger(rowIndex) || rowIndex < 0) {
    return null
  }
  return `${extractionId}:${tableIndex}:${rowIndex}`
}

export function classifyK5BatchCandidate(input: K5BatchCandidateInput): K5BatchDisposition {
  if (input.confirmed) return 'confirmed'
  if (input.status === 'excluded') return 'excluded'
  if (input.status === 'needs_mapping') return 'needs_mapping'
  if (input.status === 'needs_review') return 'needs_review'
  if (input.status !== 'ready_for_review') return 'unavailable'
  if (!input.mappingVersionId || !input.ingredientId || !input.lineId) return 'unavailable'
  if (input.pendingOrderCount > 0) return 'order_review'
  return 'ready'
}
