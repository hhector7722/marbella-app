type ReviewSource = {
  reviewReasons: readonly string[]
  warnings: readonly string[]
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

/** Avisos que pertenecen al albarán completo y no a un producto concreto. */
export function documentReviewReasons(row: ReviewSource): string[] {
  const warnings = new Set(row.warnings)
  return unique(row.reviewReasons.filter((reason) => warnings.has(reason)))
}

/** Una línea queda bloqueada por el documento, pero no necesita editarse sola. */
export function isDocumentOnlyReview(row: ReviewSource): boolean {
  const documentReasons = documentReviewReasons(row)
  return documentReasons.length > 0 && documentReasons.length === unique(row.reviewReasons).length
}

export function collectDocumentReviewReasons(rows: readonly ReviewSource[]): string[] {
  return unique(rows.flatMap((row) => documentReviewReasons(row)))
}
