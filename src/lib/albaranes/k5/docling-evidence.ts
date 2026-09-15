import type { EvidenceRow, FieldName, SupplierProfile } from '../supplier-profiles/types.ts'

export type K5EvidenceCell = {
  row: number
  column: number
  rowSpan: number
  columnSpan: number
  text: string
  columnHeader: boolean
}

export type K5EvidenceTable = {
  index: number
  headers: string[]
  rows: Array<{
    index: number
    cells: string[]
    raw: EvidenceRow
  }>
  cells: K5EvidenceCell[]
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function doclingDocument(rawArtifact: unknown): Record<string, unknown> | null {
  if (!rawArtifact || typeof rawArtifact !== 'object') return null
  const raw = rawArtifact as Record<string, unknown>
  const document = raw.document
  if (!document || typeof document !== 'object') return null
  const jsonContent = (document as Record<string, unknown>).json_content
  if (!jsonContent || typeof jsonContent !== 'object') return null
  return jsonContent as Record<string, unknown>
}

function tableCells(table: unknown): K5EvidenceCell[] {
  if (!table || typeof table !== 'object') return []
  const data = (table as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return []
  const cells = (data as Record<string, unknown>).table_cells
  if (!Array.isArray(cells)) return []

  return cells.flatMap((candidate): K5EvidenceCell[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const cell = candidate as Record<string, unknown>
    return [{
      row: integer(cell.start_row_offset_idx, 0),
      column: integer(cell.start_col_offset_idx, 0),
      rowSpan: Math.max(1, integer(cell.row_span, 1)),
      columnSpan: Math.max(1, integer(cell.col_span, 1)),
      text: String(cell.text ?? '').trim(),
      columnHeader: cell.column_header === true,
    }]
  })
}

export function extractDoclingTables(rawArtifact: unknown): K5EvidenceTable[] {
  const document = doclingDocument(rawArtifact)
  const rawTables = document?.tables
  if (!Array.isArray(rawTables)) return []

  return rawTables.flatMap((table, tableIndex): K5EvidenceTable[] => {
    const cells = tableCells(table)
    if (cells.length === 0) return []

    const maxRow = Math.max(...cells.map((cell) => cell.row + cell.rowSpan - 1))
    const maxColumn = Math.max(...cells.map((cell) => cell.column + cell.columnSpan - 1))
    const grid = Array.from({ length: maxRow + 1 }, () => Array(maxColumn + 1).fill('') as string[])

    for (const cell of cells) {
      for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < cell.columnSpan; colOffset += 1) {
          const row = cell.row + rowOffset
          const column = cell.column + colOffset
          if (!grid[row][column]) grid[row][column] = cell.text
        }
      }
    }

    const explicitHeaderRows = new Set(cells.filter((cell) => cell.columnHeader).map((cell) => cell.row))
    const headerRow = explicitHeaderRows.size > 0 ? Math.min(...explicitHeaderRows) : 0
    const headers = grid[headerRow].map((value, column) => value.trim() || `column_${column}`)
    const rows = grid
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ rowIndex, row }) => rowIndex > headerRow && row.some((value) => value.trim()))
      .map(({ row, rowIndex }) => ({
        index: rowIndex,
        cells: row,
        raw: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
      }))

    return [{ index: tableIndex, headers, rows, cells }]
  })
}

export function normalizeEvidenceLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function aliasMatches(header: string, alias: string): boolean {
  const normalizedHeader = normalizeEvidenceLabel(header)
  const normalizedAlias = normalizeEvidenceLabel(alias)
  if (!normalizedHeader || !normalizedAlias) return false
  return normalizedHeader === normalizedAlias
    || normalizedHeader.includes(normalizedAlias)
    || normalizedAlias.includes(normalizedHeader)
}

export type ProfileTableMatch = {
  table: K5EvidenceTable
  fieldColumns: Partial<Record<FieldName, number>>
  score: number
}

export function matchProfileTable(
  profile: SupplierProfile,
  tables: readonly K5EvidenceTable[]
): ProfileTableMatch | null {
  let best: ProfileTableMatch | null = null

  for (const table of tables) {
    const fieldColumns: Partial<Record<FieldName, number>> = {}
    let score = 0

    for (const [fieldName, definition] of Object.entries(profile.fields) as Array<[
      FieldName,
      NonNullable<SupplierProfile['fields'][FieldName]>
    ]>) {
      const column = table.headers.findIndex((header) =>
        definition.aliases.some((alias) => aliasMatches(header, alias))
      )
      if (column >= 0) {
        fieldColumns[fieldName] = column
        score += fieldName === 'product' ? 3 : 1
      }
    }

    const candidate = { table, fieldColumns, score }
    if (!best || candidate.score > best.score) best = candidate
  }

  return best && best.score > 0 ? best : null
}

export function rowByProfileFields(
  match: ProfileTableMatch,
  row: K5EvidenceTable['rows'][number]
): EvidenceRow {
  const result: EvidenceRow = {}
  for (const [fieldName, column] of Object.entries(match.fieldColumns) as Array<[FieldName, number]>) {
    result[fieldName] = row.cells[column] ?? ''
  }
  return result
}
