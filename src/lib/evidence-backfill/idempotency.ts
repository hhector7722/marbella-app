/**
 * Idempotencia Evidence: una extraction por (invoice_id, file_version_hash).
 */

export function shouldSkipBecauseDocumentVersionExists(extractionCountForHash: number): boolean {
  return extractionCountForHash > 0
}

export type IdempotencyDecision =
  | { skip: true; reason: 'ALREADY_HAS_EVIDENCE'; extractionCount: number }
  | { skip: false; extractionCount: number }

export function decideIdempotency(extractionCountForHash: number): IdempotencyDecision {
  if (shouldSkipBecauseDocumentVersionExists(extractionCountForHash)) {
    return { skip: true, reason: 'ALREADY_HAS_EVIDENCE', extractionCount: extractionCountForHash }
  }
  return { skip: false, extractionCount: extractionCountForHash }
}

/** @deprecated Prefer decideIdempotency por hash de documento. Alias del gate por versión. */
export function shouldSkipBecauseExtractionExists(extractionCount: number): boolean {
  return shouldSkipBecauseDocumentVersionExists(extractionCount)
}
