import type { CanonicalDocument } from '../extractors/canonical.ts'
import { validateObservedDocument } from '../pipeline/validate.ts'

type ReviewSource = {
  reviewReasons: readonly string[]
  warnings: readonly string[]
}

const RECHECKABLE_DOCUMENT_REASONS = new Set([
  'subtotal_iva_total_no_reconcilian',
  'lineas_subtotal_no_reconcilian',
  'lineas_total_no_reconcilian',
  'total_documento_no_verificable',
])

/** La evidencia sigue intacta; al leer se descartan avisos aritméticos ya reconciliados. */
export function currentDocumentWarnings(
  stored: readonly string[],
  document: CanonicalDocument | null
): string[] {
  if (!document) return unique(stored)
  const current = new Set(validateObservedDocument(document).reasons)
  return unique(stored.filter((reason) =>
    !RECHECKABLE_DOCUMENT_REASONS.has(reason) || current.has(reason)))
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

/** Avisos que pertenecen al albarán completo y no a un producto concreto. */
export function documentReviewReasons(row: ReviewSource): string[] {
  return unique(row.warnings)
}

/** Bloqueos que dependen de una línea: todo `reviewReasons` no documental. */
export function lineReviewReasons(row: ReviewSource): string[] {
  const documentReasons = new Set(row.warnings)
  return unique(row.reviewReasons.filter((reason) => !documentReasons.has(reason)))
}

/** Una línea queda bloqueada por el documento, pero no necesita editarse sola. */
export function isDocumentOnlyReview(row: ReviewSource): boolean {
  return documentReviewReasons(row).length > 0 && lineReviewReasons(row).length === 0
}

export function collectDocumentReviewReasons(rows: readonly ReviewSource[]): string[] {
  return unique(rows.flatMap((row) => documentReviewReasons(row)))
}
