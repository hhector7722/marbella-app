import type { GeminiDocumentTable, GeminiDocumentRow } from './gemini-extract-albaran.ts'

export type ColumnIndices = {
  descColIndex: number
  qtyColIndex: number
  priceColIndex: number
  unitColIndex: number
  /** Columna de importe de línea (no se usa como precio unitario). */
  amountColIndex: number
  /** Cómo se resolvió la columna de descripción. */
  descSource: 'header' | 'inferred' | 'none'
  /** 0..1; solo relevante si descSource !== 'none'. */
  descConfidence: number
  /** Motivo legible de la resolución de descripción. */
  descReason: string | null
}

export type DocumentRowCandidate = {
  tableIndex: number
  rowIndex: number
  rowMappingKey: string
  description: string
  quantity: number | null
  unitPrice: number | null
  unit: string | null
  /** Metadatos de heurística (auditoría / dry-run). */
  descColumnIndex: number
  descSource: 'header' | 'inferred'
  descConfidence: number
  descReason: string
}

/**
 * Headers de descripción: substring conservador (como v1) + variantes CA/ES/EN.
 * Incluye plurales (artículos/productos) y catalán (descripció sin 'n' final).
 */
const DESC_HEADER_TOKEN =
  /descripci[oó]n?s?|art[ií]culos?|articulos?|productos?|productes?|articles?|conceptos?|nombres?/i
const QTY_HEADER =
  /^(cantidad|cant\.?|quantitat|unitats|unidades|uds\.?|quilos|kilos|kg|qty|quantity|emb\.?|cajas|bultos)$/i
const PRICE_HEADER = /^(precio|preu|price|p\.?\s*u\.?|pu|tarifa)$/i
const UNIT_HEADER = /^(unidad|um|unitat|unit)$/i
const AMOUNT_HEADER = /^(importe|import|total|a\s*cobrar|cobrar)$/i
/** Headers que nunca son descripción (código, lote, impuestos…). */
const NON_DESC_HEADER =
  /^(cod|c[oó]digo|code|sku|ref|referencia|lot|lote|iva|%|%dto|%iva|dto|descuento|base|subtotal|r\.?equiv|lliurament|pes\s*total|paquets|neto|portes)/i

const GARBAGE_DESCRIPTION =
  /^(null|n\/a|na|-+|\.+)$|contiene\s+sulfitos|cont[eé]sulfit|^\s*sub\s*totals?\s*$|^\s*totals?\s*$|^\s*neto\s*:?\s*$|^\s*portes\s*:?\s*$|base\s*imponible|^\s*iva\s*$|^\s*%?\s*iva\s*$|descuento\s*comercial|observaciones|condiciones\s+generales|forma\s+de\s+pago|domicilio\s+fiscal|nif\s*:|cif\s*:|página\s+\d|pagina\s+\d|hoja\s+\d|^\s*descripci[oó]n?\s*$|^\s*articles?\s*$|^\s*productos?\s*$|^\s*productes?\s*$/i

/** Etiquetas contables cortas: no sirven como descripción de producto. */
const ACCOUNTING_LABEL =
  /^(neto|portes|porte|transporte|base|cuota|recargo|retenci[oó]n|pagare|vencimiento)$/i

const UNIT_VALUE = /^(ud|uds|u|kg|g|l|lt|lts|ml|cj|caja|cajas|pak|pack|packs|bulto|bultos|bolsa|bandeja|unid\.?|unitats?)$/i
/** Solo celdas que SON fecha/lote/cad — no nombres de producto con "Lote:" en una 2ª línea. */
const DATE_VALUE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/i
const LOTE_OR_CAD_ONLY = /^(cad|lote)\s*:/i
const PERCENT_VALUE = /^%?\d+([.,]\d+)?\s*%?$/
const CODE_VALUE = /^[A-Z0-9][A-Z0-9._/-]{2,20}$/i
const MOSTLY_DIGITS = /^[\d\s.,€$¢-]+$/

function looksLoteOrCadCell(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  if (DATE_VALUE.test(t)) return true
  // Una sola línea "Lote:Xxx" / "Cad:.." o la celda completa es solo eso
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 1 && LOTE_OR_CAD_ONLY.test(lines[0]!)) return true
  if (lines.length > 0 && lines.every((l) => LOTE_OR_CAD_ONLY.test(l) || DATE_VALUE.test(l))) {
    return true
  }
  return false
}

export function parseEuropeanNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const cleaned = String(raw)
    .trim()
    .replace(/\s*(€|eur|\$)\s*/gi, '')
    .replace(/\s+/g, '')
  if (!cleaned) return null
  // "1,00 CJ" → take leading number
  const m = cleaned.match(/^[-+]?\d+(?:[.,]\d+)?/)
  if (!m) return null
  const val = parseFloat(m[0]!.replace(',', '.'))
  return Number.isFinite(val) ? val : null
}

function normalizeHeader(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function cellText(row: GeminiDocumentRow, colIndex: number): string {
  const cell = (row.cells || []).find((c) => c.column_index === colIndex)
  return String(cell?.raw_value ?? '').trim()
}

function looksNumericCell(raw: string): boolean {
  if (!raw) return false
  if (parseEuropeanNumber(raw) != null && MOSTLY_DIGITS.test(raw.replace(/[a-zA-Z]{1,3}\.?$/g, '').trim())) {
    return true
  }
  return MOSTLY_DIGITS.test(raw) && /\d/.test(raw)
}

function looksCodeCell(raw: string): boolean {
  if (!raw || raw.length < 3) return false
  if (/\s/.test(raw) && /[a-záéíóúñ]/i.test(raw) && raw.length > 12) return false
  const compact = raw.replace(/\s/g, '')
  if (/^\d{4,}$/.test(compact)) return true
  if (CODE_VALUE.test(compact) && !/[aeiouáéíóú]{2}/i.test(compact) && /\d/.test(compact)) return true
  return false
}

function looksDescriptiveProductText(raw: string): boolean {
  if (!raw || raw.length < 2) return false
  if (isGarbageDocumentDescription(raw)) return false
  if (looksNumericCell(raw) && raw.length < 12) return false
  if (PERCENT_VALUE.test(raw.trim())) return false
  if (UNIT_VALUE.test(raw.trim())) return false
  if (looksLoteOrCadCell(raw) && raw.length < 24) return false
  if (looksCodeCell(raw) && !/[a-záéíóúñ]{3,}/i.test(raw)) return false
  if (ACCOUNTING_LABEL.test(raw.trim())) return false
  // Requiere letras reales (producto/concepto) y cierta longitud
  // Si hay "Lote:"/"Cad:" embebidos, evaluar solo la parte de producto
  const productPart = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !LOTE_OR_CAD_ONLY.test(l) && !DATE_VALUE.test(l))
    .join(' ')
    .trim()
  const text = productPart || raw.trim()
  const letters = (text.match(/[a-záéíóúñ]/gi) || []).length
  if (letters < 3) return false
  if (text.length < 4) return false
  return true
}

/**
 * Filas OCR que no representan artículos de albarán.
 * Conservador: no elimina solo por descripción corta.
 */
export function isGarbageDocumentDescription(description: string | null | undefined): boolean {
  const d = String(description ?? '').trim()
  if (!d) return true
  if (GARBAGE_DESCRIPTION.test(d)) return true
  if (ACCOUNTING_LABEL.test(d)) return true
  if (/^[\d\s.,€%/-]+$/.test(d)) return true
  // Texto legal / pie típico
  if (
    /protecci[oó]n de datos|responsable del tratamiento|inscrit[oa] en el registro|www\.|http/i.test(
      d
    )
  ) {
    return true
  }
  return false
}

type HeaderHits = {
  desc: number[]
  qty: number[]
  price: number[]
  unit: number[]
  amount: number[]
  blocked: Set<number>
}

/**
 * Prioridad cuando hay varias columnas que matchean descripción.
 * Ametller/Sanilec/Panabad: "Artículo" (código) + "Descripción" (nombre) → preferir descripción.
 * Abril/Santa Teresa/Videla: solo ARTICLE/Artículo como nombre → usarlo.
 */
function descHeaderRank(normalizedName: string): number {
  if (/descripci/.test(normalizedName)) return 100
  if (/productes?|productos?/.test(normalizedName)) return 90
  if (/^articles?$|\barticles?\b/.test(normalizedName)) return 85
  if (/conceptos?/.test(normalizedName)) return 70
  if (/nombres?/.test(normalizedName)) return 65
  // "artículo/articulo" suele ser SKU cuando coexiste con Descripción
  if (/art[ií]culos?|articulos?/.test(normalizedName)) return 40
  return 10
}

function classifyHeaders(table: GeminiDocumentTable): HeaderHits {
  const hits: HeaderHits = {
    desc: [],
    qty: [],
    price: [],
    unit: [],
    amount: [],
    blocked: new Set(),
  }

  for (const col of table.columns || []) {
    const raw = normalizeHeader(col.name)
    if (!raw) continue
    const idx = col.index

    if (NON_DESC_HEADER.test(raw) || raw === '%') {
      hits.blocked.add(idx)
    }

    // Orden: qty antes que unit (unidades vs unidad); amount antes que ruido
    if (
      QTY_HEADER.test(raw) ||
      /^(cant|quantitat|quilos|kilos|unitats|unidades|unds?\.?|qty|quantity)\b/.test(raw)
    ) {
      hits.qty.push(idx)
      continue
    }
    if (AMOUNT_HEADER.test(raw) || /^a\s*cobrar$/.test(raw)) {
      hits.amount.push(idx)
      continue
    }
    if (PRICE_HEADER.test(raw) || /^(precio|preu|price|tarifa)\b/.test(raw) || /^p\.?\s*u\.?n?\.?$/.test(raw)) {
      hits.price.push(idx)
      continue
    }
    if (UNIT_HEADER.test(raw)) {
      hits.unit.push(idx)
      continue
    }
    // Descripción: token en cualquier parte del header (compat v1), sin columnas bloqueadas
    if (!hits.blocked.has(idx) && DESC_HEADER_TOKEN.test(raw)) {
      hits.desc.push(idx)
      continue
    }
  }

  // Preferir mejor header de descripción (no el primero en orden de columnas)
  if (hits.desc.length > 1) {
    hits.desc.sort((a, b) => {
      const na = normalizeHeader(table.columns?.find((c) => c.index === a)?.name)
      const nb = normalizeHeader(table.columns?.find((c) => c.index === b)?.name)
      const rankDiff = descHeaderRank(nb) - descHeaderRank(na)
      if (rankDiff !== 0) return rankDiff
      // Empate: comportamiento v1 (gana la última columna)
      return b - a
    })
  }

  return hits
}

type InferredDesc = {
  index: number
  confidence: number
  reason: string
}

/**
 * Infieren descripción solo por contenido cuando no hay header usable.
 * Si hay 2+ columnas plausibles → null (no forzar).
 */
export function inferDescriptionColumnByContent(
  table: GeminiDocumentTable,
  reserved: Set<number>
): InferredDesc | null {
  const rows = table.rows || []
  if (rows.length === 0) return null

  const colIndexes = new Set<number>()
  for (const col of table.columns || []) colIndexes.add(col.index)
  for (const row of rows) {
    for (const cell of row.cells || []) colIndexes.add(cell.column_index)
  }

  const candidates: InferredDesc[] = []

  for (const idx of [...colIndexes].sort((a, b) => a - b)) {
    if (reserved.has(idx)) continue

    const values = rows.map((r) => cellText(r, idx)).filter((v) => v.length > 0)
    if (values.length === 0) continue

    let descriptive = 0
    let numeric = 0
    let code = 0
    let percent = 0
    let unitish = 0
    let dateish = 0
    let garbage = 0

    for (const v of values) {
      if (isGarbageDocumentDescription(v)) {
        garbage += 1
        continue
      }
      if (PERCENT_VALUE.test(v.trim()) || v.trim().startsWith('%')) {
        percent += 1
        continue
      }
      if (UNIT_VALUE.test(v.trim())) {
        unitish += 1
        continue
      }
      if (looksLoteOrCadCell(v)) {
        dateish += 1
        continue
      }
      if (looksCodeCell(v) && !looksDescriptiveProductText(v)) {
        code += 1
        continue
      }
      if (looksNumericCell(v) && !looksDescriptiveProductText(v)) {
        numeric += 1
        continue
      }
      if (looksDescriptiveProductText(v)) {
        descriptive += 1
        continue
      }
    }

    const n = values.length
    const descriptiveRatio = descriptive / n
    const badRatio = (numeric + code + percent + unitish + dateish + garbage) / n
    const avgLen =
      values.reduce((s, v) => s + v.length, 0) / Math.max(1, values.length)

    // Umbrales conservadores (más estrictos que v1 de inferencia)
    const minDescriptive = Math.max(2, Math.ceil(rows.length * 0.5))
    if (descriptive < minDescriptive) continue
    if (descriptiveRatio < 0.55) continue
    if (badRatio > 0.3) continue
    if (numeric / n >= 0.35) continue
    if (code / n >= 0.35) continue
    // Evita columnas de etiquetas cortas (Neto/PORTES) en tablas satélite
    if (avgLen < 8) continue
    if (rows.length <= 2 && avgLen < 12) continue

    const confidence = Math.min(
      1,
      0.55 + descriptiveRatio * 0.35 - badRatio * 0.25 + Math.min(descriptive, 6) * 0.02
    )

    if (confidence < 0.75) continue

    candidates.push({
      index: idx,
      confidence,
      reason: `contenido_descriptivo_${descriptive}/${n}_filas_ratio_${descriptiveRatio.toFixed(2)}_avgLen_${avgLen.toFixed(0)}`,
    })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.confidence - a.confidence || a.index - b.index)

  // Empate o segunda columna también plausible → no decidir
  if (candidates.length >= 2) {
    const gap = candidates[0]!.confidence - candidates[1]!.confidence
    if (gap < 0.1) return null
  }

  return candidates[0]!
}

export function findColumnIndices(table: GeminiDocumentTable): ColumnIndices {
  const hits = classifyHeaders(table)

  const qtyColIndex = hits.qty[0] ?? -1
  const priceColIndex = hits.price[0] ?? -1
  const unitColIndex = hits.unit[0] ?? -1
  const amountColIndex = hits.amount[0] ?? -1

  let descColIndex = hits.desc[0] ?? -1
  let descSource: ColumnIndices['descSource'] = descColIndex >= 0 ? 'header' : 'none'
  let descConfidence = descColIndex >= 0 ? 1 : 0
  let descReason: string | null =
    descColIndex >= 0
      ? `header:${normalizeHeader(table.columns?.find((c) => c.index === descColIndex)?.name ?? '')}`
      : null

  if (descColIndex === -1) {
    const reserved = new Set<number>([
      ...hits.blocked,
      ...hits.qty,
      ...hits.price,
      ...hits.unit,
      ...hits.amount,
    ])
    const inferred = inferDescriptionColumnByContent(table, reserved)
    if (inferred) {
      descColIndex = inferred.index
      descSource = 'inferred'
      descConfidence = inferred.confidence
      descReason = inferred.reason
    }
  }

  return {
    descColIndex,
    qtyColIndex,
    priceColIndex,
    unitColIndex,
    amountColIndex,
    descSource,
    descConfidence,
    descReason,
  }
}

function cleanProductDescription(raw: string): string {
  const lines = String(raw)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !LOTE_OR_CAD_ONLY.test(l) && !DATE_VALUE.test(l))
  return (lines.length > 0 ? lines.join(' ') : String(raw).trim()).trim()
}

/** Filas documentales con descripción no vacía (candidatas a provenance). */
export function extractDocumentRowCandidates(tables: GeminiDocumentTable[]): DocumentRowCandidate[] {
  const out: DocumentRowCandidate[] = []

  for (const table of tables || []) {
    const cols = findColumnIndices(table)
    if (cols.descColIndex === -1 || cols.descSource === 'none') continue

    for (const row of table.rows || []) {
      let desc = ''
      let qty: number | null = null
      let price: number | null = null
      let unit: string | null = null

      for (const cell of row.cells || []) {
        if (cell.column_index === cols.descColIndex) desc = cell.raw_value || ''
        if (cell.column_index === cols.qtyColIndex) qty = parseEuropeanNumber(cell.raw_value)
        if (cell.column_index === cols.priceColIndex) price = parseEuropeanNumber(cell.raw_value)
        if (cell.column_index === cols.unitColIndex) unit = cell.raw_value || null
      }

      const description = cleanProductDescription(desc)
      if (!description) continue
      if (isGarbageDocumentDescription(description)) continue

      out.push({
        tableIndex: table.index,
        rowIndex: row.index,
        rowMappingKey: `${table.index}_${row.index}`,
        description,
        quantity: qty,
        unitPrice: price,
        unit,
        descColumnIndex: cols.descColIndex,
        descSource: cols.descSource === 'inferred' ? 'inferred' : 'header',
        descConfidence: cols.descConfidence,
        descReason: cols.descReason ?? cols.descSource,
      })
    }
  }

  return out
}

export function countTableMetrics(tables: GeminiDocumentTable[] | undefined | null): {
  tables: number
  rows: number
  cells: number
} {
  const list = tables || []
  let rows = 0
  let cells = 0
  for (const t of list) {
    for (const r of t.rows || []) {
      rows += 1
      cells += (r.cells || []).length
    }
  }
  return { tables: list.length, rows, cells }
}
