import type { GeminiDocumentTable } from './gemini-extract-albaran.ts'

export type ColumnIndices = {
  descColIndex: number
  qtyColIndex: number
  priceColIndex: number
  unitColIndex: number
}

export type DocumentRowCandidate = {
  tableIndex: number
  rowIndex: number
  rowMappingKey: string
  description: string
  quantity: number | null
  unitPrice: number | null
  unit: string | null
}

export function findColumnIndices(table: GeminiDocumentTable): ColumnIndices {
  let descColIndex = -1
  let qtyColIndex = -1
  let priceColIndex = -1
  let unitColIndex = -1

  for (const col of table.columns || []) {
    const name = (col.name || '').toLowerCase()
    if (/descripci|art[íi]culo|producto|concepto|nombre/i.test(name)) descColIndex = col.index
    else if (/cant|uds|unidades|emb|cajas|bultos/i.test(name)) qtyColIndex = col.index
    else if (/precio|tarifa/i.test(name)) priceColIndex = col.index
    else if (/unidad|um|unid/i.test(name)) unitColIndex = col.index
  }

  return { descColIndex, qtyColIndex, priceColIndex, unitColIndex }
}

function parseEuropeanNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const val = parseFloat(String(raw).replace(',', '.'))
  return Number.isFinite(val) ? val : null
}

/** Filas documentales con descripción no vacía (candidatas a provenance). */
export function extractDocumentRowCandidates(tables: GeminiDocumentTable[]): DocumentRowCandidate[] {
  const out: DocumentRowCandidate[] = []

  for (const table of tables || []) {
    const cols = findColumnIndices(table)
    if (cols.descColIndex === -1) continue

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

      const description = desc.trim()
      if (!description) continue

      out.push({
        tableIndex: table.index,
        rowIndex: row.index,
        rowMappingKey: `${table.index}_${row.index}`,
        description,
        quantity: qty,
        unitPrice: price,
        unit,
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
