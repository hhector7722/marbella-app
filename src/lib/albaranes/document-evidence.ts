/**
 * Lectura y vinculación manual de evidencia documental (provenance).
 * Independiente del mapeo de producto / qty / precio operativo.
 *
 * Schema real (purchase_line_provenance):
 * - NOT NULL: invoice_line_id, document_row_id
 * - Nullable: supersedes_id, linked_by, confidence_score
 * - UNIQUE (invoice_line_id, document_row_id) → idempotencia del mismo vínculo
 * - NO hay UNIQUE en document_row_id solo → una fila OCR puede vincularse a varias líneas
 * - Append-only (triggers bloquean UPDATE/DELETE)
 */

import type { GeminiDocumentTable } from './gemini-extract-albaran.ts'
import { nameSimilarity } from '../evidence-backfill/matcher.ts'
import {
  findColumnIndices,
  isGarbageDocumentDescription,
  parseEuropeanNumber,
} from './evidence-column-heuristics.ts'

export const MANUAL_PROVENANCE_LINKED_BY = 'manual-review'

/**
 * Umbral SOLO para listar candidatas en revisión manual de Evidence (UI/lectura).
 * No modifica MATCHER_THRESHOLDS ni el backfill.
 *
 * Por qué 0.4 (y no 0.85 del matcher):
 * - El matcher escribe provenance automática y exige nombre muy fuerte.
 * - Aquí solo se filtra ruido: filas OCR irrelevantes del mismo albarán
 *   (p. ej. AGUA/APEROL frente a FRANKFURT → score 0).
 * - 0.4 deja pasar similitudes parciales razonables (p. ej. Jaccard ≥ ~2/5)
 *   para que AMBIGUOUS siga siendo seleccionable a mano.
 */
export const MANUAL_EVIDENCE_CANDIDATE_NAME_THRESHOLD = 0.4

export type StoredEvidenceColumn = {
  id: string
  col_index: number
  original_name: string | null
}

export type StoredEvidenceCell = {
  column_id: string
  raw_value: string | null
}

export type StoredEvidenceRow = {
  id: string
  row_index: number
  cells: StoredEvidenceCell[]
}

export type StoredEvidenceTable = {
  id: string
  table_index: number
  columns: StoredEvidenceColumn[]
  rows: StoredEvidenceRow[]
}

export type ProvenanceRecord = {
  id: string
  invoice_line_id: string
  document_row_id: string
  supersedes_id: string | null
  linked_by: string | null
  confidence_score?: number | null
  created_at: string
}

export type DocumentRowOccupancy = {
  document_row_id: string
  invoice_line_id: string
  original_name: string | null
}

export type DocumentRowSummary = {
  document_row_id: string
  table_id: string
  table_index: number
  row_index: number
  description: string | null
  quantity: number | null
  unit_price: number | null
  amount: number | null
  /** true si la heurística documental la considera fila de artículo usable. */
  isHeuristicCandidate: boolean
  /** Otras líneas ya vinculadas a esta fila (schema permite N:1 fila→líneas). */
  linkedOtherLines: DocumentRowOccupancy[]
}

export function resolveActiveProvenance(
  chain: ProvenanceRecord[]
): ProvenanceRecord | null {
  if (!chain.length) return null
  const supersededIds = new Set(
    chain.map((p) => p.supersedes_id).filter((id): id is string => Boolean(id))
  )
  return chain.find((p) => !supersededIds.has(p.id)) || chain[0] || null
}

/** Convierte tablas persistidas al formato que consumen las heurísticas de columnas. */
export function storedTablesToGemini(tables: StoredEvidenceTable[]): GeminiDocumentTable[] {
  return tables.map((table) => {
    const colById = new Map(table.columns.map((c) => [c.id, c.col_index]))
    return {
      index: table.table_index,
      columns: table.columns.map((c) => ({
        index: c.col_index,
        name: c.original_name,
      })),
      rows: table.rows.map((row) => ({
        index: row.row_index,
        cells: row.cells.map((cell) => ({
          column_index: colById.get(cell.column_id) ?? -1,
          raw_value: cell.raw_value,
        })).filter((c) => c.column_index >= 0),
      })),
    }
  })
}

function cleanDescription(raw: string): string {
  return String(raw)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

/**
 * Resumen compacto de TODAS las filas OCR de las tablas.
 * No filtra por similitud con la línea: eso lo hace `selectDocumentRowsForEvidenceReview`.
 * Solo usa heurística de columnas existente + ocupación por otras líneas.
 */
export function buildDocumentRowSummaries(
  tables: StoredEvidenceTable[],
  occupancy: DocumentRowOccupancy[],
  currentInvoiceLineId: string
): DocumentRowSummary[] {
  const occupancyByRow = new Map<string, DocumentRowOccupancy[]>()
  for (const occ of occupancy) {
    if (occ.invoice_line_id === currentInvoiceLineId) continue
    const list = occupancyByRow.get(occ.document_row_id) || []
    list.push(occ)
    occupancyByRow.set(occ.document_row_id, list)
  }

  const gemini = storedTablesToGemini(tables)
  const out: DocumentRowSummary[] = []

  for (let ti = 0; ti < tables.length; ti++) {
    const table = tables[ti]!
    const geminiTable = gemini[ti]!
    const cols = findColumnIndices(geminiTable)

    for (const row of table.rows) {
      const geminiRow = geminiTable.rows.find((r) => r.index === row.row_index)
      let description: string | null = null
      let quantity: number | null = null
      let unitPrice: number | null = null
      let amount: number | null = null

      if (geminiRow) {
        for (const cell of geminiRow.cells) {
          if (cell.column_index === cols.descColIndex) {
            description = cleanDescription(cell.raw_value || '') || null
          }
          if (cell.column_index === cols.qtyColIndex) {
            quantity = parseEuropeanNumber(cell.raw_value)
          }
          if (cell.column_index === cols.priceColIndex) {
            unitPrice = parseEuropeanNumber(cell.raw_value)
          }
          if (cell.column_index === cols.amountColIndex) {
            amount = parseEuropeanNumber(cell.raw_value)
          }
        }
      }

      // Fallback: primera celda no vacía como descripción si no hay columna resuelta
      if (!description) {
        const firstText = (geminiRow?.cells || [])
          .map((c) => cleanDescription(c.raw_value || ''))
          .find((t) => t.length > 0)
        description = firstText || null
      }

      const isHeuristicCandidate =
        cols.descSource !== 'none' &&
        Boolean(description) &&
        !isGarbageDocumentDescription(description)

      out.push({
        document_row_id: row.id,
        table_id: table.id,
        table_index: table.table_index,
        row_index: row.row_index,
        description,
        quantity,
        unit_price: unitPrice,
        amount,
        isHeuristicCandidate,
        linkedOtherLines: occupancyByRow.get(row.id) || [],
      })
    }
  }

  return out.sort(
    (a, b) => a.table_index - b.table_index || a.row_index - b.row_index
  )
}

/** Similitud de nombre línea↔fila OCR reutilizando nameSimilarity del matcher. */
export function scoreDocumentRowNameForLine(
  rowDescription: string | null,
  lineOriginalName: string | null,
  lineIngredientName?: string | null
): number {
  return Math.max(
    nameSimilarity(rowDescription ?? '', lineOriginalName ?? ''),
    nameSimilarity(rowDescription ?? '', lineIngredientName ?? '')
  )
}

/**
 * Filas OCR a mostrar en Evidence para UNA purchase_invoice_line.
 *
 * - Con provenance activa (MATCH): solo la fila vinculada.
 * - Sin provenance: candidatas con nombre ≥ MANUAL_EVIDENCE_CANDIDATE_NAME_THRESHOLD
 *   y heurística de artículo; ordenadas por score desc.
 * - Filas ya vinculadas a otra línea pueden aparecer si pasan el umbral
 *   (schema permite N:1); el UI las diferencia vía linkedOtherLines.
 * - 0 candidatas → lista vacía (el UI dice «Sin coincidencia automática»).
 */
export function selectDocumentRowsForEvidenceReview(params: {
  rows: DocumentRowSummary[]
  lineOriginalName: string | null
  lineIngredientName?: string | null
  activeDocumentRowId: string | null
}): DocumentRowSummary[] {
  const {
    rows,
    lineOriginalName,
    lineIngredientName = null,
    activeDocumentRowId,
  } = params

  if (activeDocumentRowId) {
    return rows.filter((r) => r.document_row_id === activeDocumentRowId)
  }

  return rows
    .map((row) => ({
      row,
      score: scoreDocumentRowNameForLine(
        row.description,
        lineOriginalName,
        lineIngredientName
      ),
    }))
    .filter(
      ({ row, score }) =>
        row.isHeuristicCandidate &&
        score >= MANUAL_EVIDENCE_CANDIDATE_NAME_THRESHOLD
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.row.table_index - b.row.table_index ||
        a.row.row_index - b.row.row_index
    )
    .map(({ row }) => row)
}

export type ManualProvenanceDecision =
  | { ok: true; mode: 'insert' }
  | { ok: true; mode: 'idempotent'; existingId: string }
  | { ok: false; code: 'ALREADY_LINKED_OTHER_ROW'; message: string }
  | { ok: false; code: 'INVOICE_MISMATCH'; message: string }
  | { ok: false; code: 'MISSING'; message: string }

/**
 * Decide si se puede crear provenance manual sin inventar supersede.
 * Si ya hay vínculo activo a OTRA fila → rechazo (no redefine arquitectura append-only).
 * Si el mismo par ya existe → idempotente.
 */
export function decideManualProvenanceInsert(params: {
  lineInvoiceId: string
  extractionInvoiceId: string
  activeProvenance: ProvenanceRecord | null
  requestedDocumentRowId: string
}): ManualProvenanceDecision {
  if (params.lineInvoiceId !== params.extractionInvoiceId) {
    return {
      ok: false,
      code: 'INVOICE_MISMATCH',
      message: 'La fila documental no pertenece al mismo albarán que la línea.',
    }
  }

  const active = params.activeProvenance
  if (!active) {
    return { ok: true, mode: 'insert' }
  }

  if (active.document_row_id === params.requestedDocumentRowId) {
    return { ok: true, mode: 'idempotent', existingId: active.id }
  }

  return {
    ok: false,
    code: 'ALREADY_LINKED_OTHER_ROW',
    message:
      'Esta línea ya tiene evidencia documental vinculada. Sustituir el vínculo (supersede) no forma parte de esta revisión manual.',
  }
}

export function isUniqueViolationError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key|unique constraint/i.test(String(error.message ?? ''))
}
