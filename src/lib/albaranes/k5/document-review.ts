type ReviewSource = {
  reviewReasons: readonly string[]
  warnings: readonly string[]
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
