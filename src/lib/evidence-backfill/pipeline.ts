import { createHash } from 'node:crypto'
import {
  countTableMetrics,
  extractDocumentRowCandidates,
} from '../albaranes/evidence-column-heuristics.ts'
import {
  extractAlbaranWithGemini,
  GEMINI_ALBARAN_EXTRACTOR_VERSION,
  parseOcrDate,
  toFiniteNumber,
  type GeminiAlbaranData,
} from '../albaranes/gemini-extract-albaran.ts'
import { decideIdempotency } from './idempotency.ts'
import {
  matchHistoricalRows,
  provenanceCandidatesFromMatcher,
  type DocumentRowForMatch,
  type OperativeLineForMatch,
} from './matcher.ts'
import type { BackfillMode, HeaderComparison, InvoiceHeaderSnapshot, PilotInvoiceResult } from './types.ts'
import {
  createGuardedEvidenceClient,
  EvidenceOnlyWriter,
  type EvidenceWriteClient,
  type ProvenanceInsertRow,
} from './writer.ts'

export type StorageDownloadResult =
  | { ok: true; mimeType: string; buffer: Buffer; rawBase64: string }
  | { ok: false; message: string }

export type BackfillDeps = {
  mode: BackfillMode
  /** Requerido solo en mode=write; dry-run NUNCA debe recibirlo. */
  writer?: EvidenceOnlyWriter
  /** Cuenta extractions para (invoice_id, file_version_hash). */
  countExtractionsForDocument: (invoiceId: string, fileVersionHash: string) => Promise<number>
  loadInvoice: (invoiceId: string) => Promise<InvoiceHeaderSnapshot | null>
  loadLines: (invoiceId: string) => Promise<OperativeLineForMatch[]>
  downloadFile: (filePath: string) => Promise<StorageDownloadResult>
  extractGemini?: typeof extractAlbaranWithGemini
}

function emptyResult(invoiceId: string, mode: BackfillMode): PilotInvoiceResult {
  return {
    invoice_id: invoiceId,
    outcome: 'OK',
    mode,
    invoice_date: null,
    supplier: null,
    source: null,
    status: null,
    file_path: null,
    mime: null,
    size_bytes: null,
    ext: null,
    content_sha256_db: null,
    content_sha256_computed: null,
    sha_source: null,
    ocr_ok: false,
    ocr_error: null,
    header_comparison: null,
    table_metrics: null,
    operative_line_count: 0,
    matcher: null,
    provenance_would_create: [],
    writes: [],
    errors: [],
    extraction_status: null,
    notes: [],
  }
}

function extOf(path: string | null): string | null {
  if (!path) return null
  const m = path.match(/\.([^.]+)$/)
  return m ? m[1].toLowerCase() : null
}

function buildHeaderComparison(
  ocr: GeminiAlbaranData,
  inv: InvoiceHeaderSnapshot
): HeaderComparison {
  const fechaOcr = parseOcrDate(ocr.fecha)
  const numeroOcr = String(ocr.numero_factura ?? '').trim() || null
  const totalOcr = toFiniteNumber(ocr.total)
  const fechaBd = inv.invoice_date
  const numeroBd = inv.invoice_number
  const totalBd = inv.total_amount

  return {
    fecha_ocr: fechaOcr,
    fecha_bd: fechaBd,
    fecha_equal: fechaOcr != null && fechaBd != null ? fechaOcr === fechaBd : null,
    numero_ocr: numeroOcr,
    numero_bd: numeroBd,
    numero_equal:
      numeroOcr != null && numeroBd != null
        ? numeroOcr.trim() === String(numeroBd).trim()
        : null,
    total_ocr: totalOcr,
    total_bd: totalBd,
    total_equal:
      totalOcr != null && totalBd != null ? Math.abs(totalOcr - Number(totalBd)) < 0.02 : null,
  }
}

/**
 * Protección explícita: en dry-run el writer no puede existir ni ejecutarse.
 */
export function assertDryRunCannotUseWriter(mode: BackfillMode, writer: EvidenceOnlyWriter | undefined) {
  if (mode === 'dry-run' && writer) {
    throw new Error('SEGURIDAD: dry-run no puede recibir EvidenceOnlyWriter')
  }
}

export async function processInvoiceEvidenceOnly(
  invoiceId: string,
  deps: BackfillDeps
): Promise<PilotInvoiceResult> {
  const { mode } = deps
  assertDryRunCannotUseWriter(mode, deps.writer)

  const result = emptyResult(invoiceId, mode)
  const extract = deps.extractGemini ?? extractAlbaranWithGemini

  const inv = await deps.loadInvoice(invoiceId)
  if (!inv) {
    result.outcome = 'FAIL_NO_FILE'
    result.errors.push('invoice_not_found')
    return result
  }

  result.invoice_date = inv.invoice_date
  result.supplier = inv.supplier_name
  result.source = inv.source
  result.status = inv.status
  result.file_path = inv.file_path
  result.content_sha256_db = inv.content_sha256
  result.ext = extOf(inv.file_path)

  const filePath = String(inv.file_path ?? '').trim()
  if (!filePath) {
    result.outcome = 'FAIL_NO_FILE'
    result.errors.push('empty_file_path')
    return result
  }

  // Early skip si BD ya tiene SHA y existe extraction para esa versión
  const dbShaEarly = String(inv.content_sha256 ?? '').trim()
  if (dbShaEarly) {
    const earlyCount = await deps.countExtractionsForDocument(invoiceId, dbShaEarly)
    const earlyIdem = decideIdempotency(earlyCount)
    if (earlyIdem.skip) {
      result.outcome = 'SKIP_ALREADY_HAS_EVIDENCE'
      result.notes.push(`extractions_for_hash=${earlyIdem.extractionCount}`)
      result.sha_source = 'db'
      result.content_sha256_computed = dbShaEarly
      return result
    }
  }

  const downloaded = await deps.downloadFile(filePath)
  if (!downloaded.ok) {
    result.outcome = 'FAIL_STORAGE'
    result.errors.push(downloaded.message)
    result.ocr_error = downloaded.message
    return result
  }

  result.mime = downloaded.mimeType
  result.size_bytes = downloaded.buffer.byteLength
  const computedSha = createHash('sha256').update(downloaded.buffer).digest('hex')
  result.content_sha256_computed = computedSha

  const dbSha = String(inv.content_sha256 ?? '').trim()
  if (!dbSha) {
    result.sha_source = 'computed_only'
    result.notes.push('content_sha256 ausente en BD; hash solo en memoria')
  } else if (dbSha === computedSha) {
    result.sha_source = 'db'
  } else {
    result.sha_source = 'mismatch'
    result.outcome = 'FAIL_HASH_MISMATCH'
    result.errors.push('content_sha256_db != sha_computed')
    return result
  }

  const fileVersionHash = computedSha

  // Gate por versión documental (clave de idempotencia)
  const hashCount = await deps.countExtractionsForDocument(invoiceId, fileVersionHash)
  const idem = decideIdempotency(hashCount)
  if (idem.skip) {
    result.outcome = 'SKIP_ALREADY_HAS_EVIDENCE'
    result.notes.push(`extractions_for_hash=${idem.extractionCount}`)
    return result
  }

  const gemini = await extract(downloaded.mimeType, downloaded.rawBase64)
  if (!gemini.ok) {
    result.ocr_ok = false
    result.ocr_error = gemini.message
    const isPdf = result.ext === 'pdf' || (result.mime ?? '').includes('pdf')
    result.outcome = isPdf ? 'PDF_UNSUPPORTED' : 'FAIL_OCR'
    result.errors.push(gemini.message)
    return result
  }

  result.ocr_ok = true
  const aiData = gemini.data
  result.header_comparison = buildHeaderComparison(aiData, inv)

  const hasTables = Array.isArray(aiData.tables) && aiData.tables.length > 0
  result.table_metrics = countTableMetrics(aiData.tables)
  result.extraction_status = hasTables ? 'success' : 'no_table'

  const lines = await deps.loadLines(invoiceId)
  result.operative_line_count = lines.length

  if (hasTables) {
    const candidates = extractDocumentRowCandidates(aiData.tables!)
    const docRows: DocumentRowForMatch[] = candidates.map((c, i) => ({
      rowMappingKey: c.rowMappingKey,
      description: c.description,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      unit: c.unit,
      orderIndex: i,
    }))
    const matcher = matchHistoricalRows(docRows, lines)
    result.matcher = matcher
    result.provenance_would_create = provenanceCandidatesFromMatcher(matcher)
  } else {
    result.outcome = 'NO_TABLE'
    result.notes.push('OCR sin tablas')
  }

  // dry-run: writes siempre []
  if (mode === 'dry-run') {
    result.writes = []
    if (result.errors.length === 0) {
      result.outcome = hasTables ? 'OK' : 'NO_TABLE'
    }
    return result
  }

  if (!deps.writer) {
    result.outcome = 'FAIL_WRITE'
    result.errors.push('writer_missing')
    return result
  }

  // Re-check inmediatamente antes del write
  const hashCount2 = await deps.countExtractionsForDocument(invoiceId, fileVersionHash)
  if (decideIdempotency(hashCount2).skip) {
    result.outcome = 'SKIP_ALREADY_HAS_EVIDENCE'
    result.notes.push('recheck_before_write_skip')
    result.writes = []
    return result
  }

  try {
    const persist = await deps.writer.persistDocumentEvidence({
      invoiceId,
      fileVersionHash,
      extractorVersion: GEMINI_ALBARAN_EXTRACTOR_VERSION,
      rawJsonArtifact: gemini.rawJson,
      status: hasTables ? 'success' : 'no_table',
      tables: hasTables ? aiData.tables : null,
    })

    if (!persist.inserted) {
      // Carrera o existencia concurrente: no duplicar Evidence
      result.outcome = 'SKIP_ALREADY_HAS_EVIDENCE'
      result.notes.push('rpc_inserted_false')
      result.writes = []
      // Reparación segura: intentar provenance faltante con mapping existente
      if (hasTables && result.provenance_would_create.length > 0) {
        const rows: ProvenanceInsertRow[] = []
        for (const cand of result.provenance_would_create) {
          const docRowId = persist.row_mapping[cand.row_mapping_key]
          if (!docRowId) continue
          rows.push({
            invoice_line_id: cand.invoice_line_id,
            document_row_id: docRowId,
            linked_by: cand.linked_by,
            confidence_score: cand.confidence_score,
          })
        }
        if (rows.length > 0) {
          const prov = await deps.writer.insertProvenance(rows)
          if (prov.inserted > 0) {
            result.writes.push({ type: 'purchase_line_provenance', count: prov.inserted, skipped: prov.skipped })
            result.notes.push('provenance_repaired_after_race')
          }
        }
      }
      return result
    }

    result.writes.push({
      type: 'persist_document_evidence',
      extraction_id: persist.extraction_id,
      inserted: true,
    })

    if (hasTables && result.provenance_would_create.length > 0) {
      const rows: ProvenanceInsertRow[] = []
      for (const cand of result.provenance_would_create) {
        const docRowId = persist.row_mapping[cand.row_mapping_key]
        if (!docRowId) {
          result.notes.push(`missing_row_mapping:${cand.row_mapping_key}`)
          continue
        }
        rows.push({
          invoice_line_id: cand.invoice_line_id,
          document_row_id: docRowId,
          linked_by: cand.linked_by,
          confidence_score: cand.confidence_score,
        })
      }
      if (rows.length > 0) {
        const prov = await deps.writer.insertProvenance(rows)
        result.writes.push({
          type: 'purchase_line_provenance',
          count: prov.inserted,
          skipped: prov.skipped,
        })
      }
    }

    result.outcome = hasTables ? 'OK' : 'NO_TABLE'
  } catch (e) {
    result.outcome = 'FAIL_WRITE'
    result.errors.push(e instanceof Error ? e.message : String(e))
  }

  return result
}

export function createWriteDepsWriter(
  underlying: EvidenceWriteClient,
  opts: { iUnderstandEvidenceOnly: boolean }
): EvidenceOnlyWriter {
  if (!opts.iUnderstandEvidenceOnly) {
    throw new Error('--write requiere --i-understand-evidence-only')
  }
  const guarded = createGuardedEvidenceClient(underlying, { allowWrite: true })
  return new EvidenceOnlyWriter(guarded, { allowWrite: true })
}
