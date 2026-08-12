import type { MatcherResult, ProvenanceCandidate } from './matcher'

export type BackfillMode = 'dry-run' | 'write'

export type InvoiceHeaderSnapshot = {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  file_path: string | null
  content_sha256: string | null
  source: string | null
  status: string | null
  supplier_name: string | null
}

export type HeaderComparison = {
  fecha_ocr: string | null
  fecha_bd: string | null
  fecha_equal: boolean | null
  numero_ocr: string | null
  numero_bd: string | null
  numero_equal: boolean | null
  total_ocr: number | null
  total_bd: number | null
  total_equal: boolean | null
}

export type PilotInvoiceResult = {
  invoice_id: string
  outcome:
    | 'OK'
    | 'SKIP_ALREADY_HAS_EVIDENCE'
    | 'FAIL_NO_FILE'
    | 'FAIL_STORAGE'
    | 'FAIL_HASH_MISMATCH'
    | 'FAIL_OCR'
    | 'PDF_UNSUPPORTED'
    | 'FAIL_WRITE'
    | 'NO_TABLE'
  mode: BackfillMode
  invoice_date: string | null
  supplier: string | null
  source: string | null
  status: string | null
  file_path: string | null
  mime: string | null
  size_bytes: number | null
  ext: string | null
  content_sha256_db: string | null
  content_sha256_computed: string | null
  sha_source: 'db' | 'computed_only' | 'mismatch' | 'none' | null
  ocr_ok: boolean
  ocr_error: string | null
  header_comparison: HeaderComparison | null
  table_metrics: { tables: number; rows: number; cells: number } | null
  operative_line_count: number
  matcher: MatcherResult | null
  provenance_would_create: ProvenanceCandidate[]
  writes: unknown[]
  errors: string[]
  extraction_status: 'success' | 'failed' | 'no_table' | null
  notes: string[]
}
