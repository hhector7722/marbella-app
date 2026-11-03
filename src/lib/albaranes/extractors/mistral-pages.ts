import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  canonicalDocumentSchema,
  type CanonicalDocument,
} from './canonical.ts'
import {
  extractWithMistral,
  fileSha256,
  MISTRAL_EXTRACTOR_VERSION,
  MISTRAL_OCR_MODEL,
  type DocumentExtraction,
} from './mistral.ts'

const MAX_PARALLEL_PAGES = 3

/**
 * Document annotation is global for a single Mistral request. When a PDF
 * times out with all pages, request the original PDF per page and combine
 * independent observations, without changing the source SHA.
 */
export function mergePageObservations(
  parts: DocumentExtraction[],
  sourceSha: string,
): DocumentExtraction {
  if (!parts.length || parts.length > MAX_PARALLEL_PAGES) {
    throw new Error('unexpected_ocr_page_count')
  }
  for (const part of parts) {
    if (part.fileSha256 !== sourceSha || part.pageCount !== 1 ||
      !part.rawResponse || typeof part.rawResponse !== 'object' ||
      !Array.isArray((part.rawResponse as { pages?: unknown }).pages) ||
      ((part.rawResponse as { pages: unknown[] }).pages.length !== 1)) {
      throw new Error('mistral_page_identity_or_response_invalid')
    }
  }

  const firstValues = (field: keyof Omit<CanonicalDocument, 'lines'>): string | null => {
    const values = parts
      .map(p => p.canonical[field])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(v => v.trim())
    if (new Set(values).size > 1) {
      throw new Error('conflicting_mistral_page_identity_' + field)
    }
    return values[0] ?? null
  }
  const lastFinancial = (field: 'subtotal_raw' | 'tax_raw' | 'total_raw') =>
    [...parts].reverse().map(p => p.canonical[field])
      .find(v => typeof v === 'string' && v.trim().length > 0) ?? null

  const lines = parts.flatMap((part, pageIndex) =>
    part.canonical.lines.map(line => ({ ...line, page_index: pageIndex })))
  if (!lines.length || lines.length > 250) throw new Error('mistral_page_lines_out_of_range')

  const canonical = canonicalDocumentSchema.parse({
    supplier_name_raw: firstValues('supplier_name_raw'),
    document_number_raw: firstValues('document_number_raw'),
    document_date_raw: firstValues('document_date_raw'),
    currency_raw: firstValues('currency_raw'),
    subtotal_raw: lastFinancial('subtotal_raw'),
    tax_raw: lastFinancial('tax_raw'),
    total_raw: lastFinancial('total_raw'),
    lines,
  })

  const pages = parts.map((part, index) => {
    const page = (part.rawResponse as {pages: Record<string, unknown>[]}).pages[0]
    return { ...page, index }
  })
  return {
    extractor: 'mistral',
    extractorVersion: MISTRAL_EXTRACTOR_VERSION,
    schemaVersion: parts[0].schemaVersion,
    model: MISTRAL_OCR_MODEL,
    fileSha256: sourceSha,
    canonical,
    rawResponse: {
      model: MISTRAL_OCR_MODEL,
      pages,
      document_annotation: canonical,
      usage_info: { mode: 'verified_individual_pages', page_count: parts.length },
    },
    pageCount: pages.length,
    elapsedMs: Math.max(...parts.map(x => x.elapsedMs)),
    usageInfo: { mode: 'verified_individual_pages', page_count: parts.length },
  }
}

/**
 * pdfjs checks the actual PDF page count, which the invoice's expected_pages
 * metadata may not represent. Never trust the latter to limit extraction.
 */
export async function extractWithMistralPageBounded(params: {
  bytes: Uint8Array
  mimeType: string
  apiKey: string
  signal?: AbortSignal
}): Promise<DocumentExtraction> {
  if (params.mimeType !== 'application/pdf') return extractWithMistral(params)
  const sourceHash = fileSha256(params.bytes)
  const loading = getDocument({
    data: Uint8Array.from(params.bytes),
    disableFontFace: true,
    useSystemFonts: false,
  })
  let pageCount: number
  try {
    const pdf = await loading.promise
    pageCount = pdf.numPages
  } finally {
    await loading.destroy()
  }
  if (pageCount < 1 || pageCount > 50) throw new Error('invalid_pdf_page_count')
  if (pageCount === 1 || pageCount > MAX_PARALLEL_PAGES) {
    return extractWithMistral(params)
  }
  const started = Date.now()
  const results = await Promise.all(Array.from({ length: pageCount }, (_, i) =>
    extractWithMistral({
      ...params,
      pages: [i],
      signal: params.signal ?? AbortSignal.timeout(90_000),
    }),
  ))
  const merged = mergePageObservations(results, sourceHash)
  return { ...merged, elapsedMs: Date.now() - started }
}
