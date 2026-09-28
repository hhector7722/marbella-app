import type { EvidenceRow, FieldName, SupplierProfile } from '../supplier-profiles/types.ts'

export type K5EvidenceSource = 'docling_table' | 'docling_layout'

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
  source: K5EvidenceSource
  headers: string[]
  rows: Array<{
    index: number
    cells: string[]
    raw: EvidenceRow
  }>
  cells: K5EvidenceCell[]
}

type LayoutTextItem = {
  index: number
  page: number
  text: string
  left: number
  right: number
  bottom: number
  top: number
  origin: string
}

type LayoutHeaderField = {
  field: FieldName
  item: LayoutTextItem
  score: number
  anchorX: number
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
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

export function normalizeEvidenceLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function canonicalHeaderLabel(value: string): string {
  return normalizeEvidenceLabel(value)
    .split(' ')
    .map((token) => {
      if (token === 'preu') return 'precio'
      if (token === 'descripcio') return 'descripcion'
      if (token === 'article') return 'articulo'
      return token
    })
    .join(' ')
}

function aliasMatchScore(header: string, alias: string): number {
  const normalizedHeader = canonicalHeaderLabel(header)
  const normalizedAlias = canonicalHeaderLabel(alias)
  if (!normalizedHeader || !normalizedAlias) return 0
  if (normalizedHeader === normalizedAlias) return 3
  if (normalizedHeader.includes(normalizedAlias)) return 2
  if (normalizedAlias.includes(normalizedHeader)) return 1
  return 0
}

function aliasAnchorX(item: LayoutTextItem, alias: string): number {
  const normalizedHeader = canonicalHeaderLabel(item.text)
  const normalizedAlias = canonicalHeaderLabel(alias)
  if (!normalizedHeader || !normalizedAlias) return centerX(item)
  const index = normalizedHeader.indexOf(normalizedAlias)
  if (index < 0) return centerX(item)
  const fraction = (index + normalizedAlias.length / 2) / normalizedHeader.length
  return item.left + (item.right - item.left) * fraction
}

function fieldWeight(field: FieldName): number {
  if (field === 'product') return 8
  if (field === 'quantity' || field === 'cases') return 4
  if (
    field === 'unit_price'
    || field === 'net_unit_price'
    || field === 'line_amount'
    || field === 'line_amount_tax_included'
    || field === 'price_with_tax'
  ) return 4
  return 1
}

function semanticHeaderScore(
  cells: readonly K5EvidenceCell[],
  row: number,
  profile?: SupplierProfile
): number {
  if (!profile) return 0
  const anchors = cells.filter((cell) => cell.columnHeader && cell.row === row && cell.text)
  let score = 0
  for (const [fieldName, definition] of Object.entries(profile.fields) as Array<[
    FieldName,
    NonNullable<SupplierProfile['fields'][FieldName]>
  ]>) {
    const best = Math.max(
      0,
      ...anchors.flatMap((cell) => definition.aliases.map((alias) => aliasMatchScore(cell.text, alias)))
    )
    if (best > 0) score += fieldWeight(fieldName) * best
  }
  return score
}

function selectExplicitHeaderRow(
  cells: readonly K5EvidenceCell[],
  profile?: SupplierProfile
): number {
  const headerRows = [...new Set(cells.filter((cell) => cell.columnHeader).map((cell) => cell.row))]
  if (headerRows.length === 0) return 0

  let bestRow = headerRows[0]!
  let bestSemantic = -1
  let bestDensity = -1

  for (const row of headerRows) {
    const anchors = cells.filter((cell) => cell.columnHeader && cell.row === row && cell.text)
    const coveredColumns = new Set<number>()
    for (const cell of anchors) {
      for (let offset = 0; offset < cell.columnSpan; offset += 1) coveredColumns.add(cell.column + offset)
    }

    const semantic = semanticHeaderScore(cells, row, profile)
    const density = anchors.length * 100 + coveredColumns.size
    if (
      semantic > bestSemantic
      || (semantic === bestSemantic && density > bestDensity)
      || (semantic === bestSemantic && density === bestDensity && row > bestRow)
    ) {
      bestSemantic = semantic
      bestDensity = density
      bestRow = row
    }
  }

  return bestRow
}

function isHeaderOnlyRow(cells: readonly K5EvidenceCell[], row: number): boolean {
  const anchors = cells.filter((cell) => cell.row === row && cell.text)
  return anchors.length > 0 && anchors.every((cell) => cell.columnHeader)
}

export function extractDoclingTables(
  rawArtifact: unknown,
  profile?: SupplierProfile
): K5EvidenceTable[] {
  const document = doclingDocument(rawArtifact)
  const rawTables = document?.tables
  if (!Array.isArray(rawTables)) return []

  return rawTables.flatMap((table, tableIndex): K5EvidenceTable[] => {
    const cells = tableCells(table)
    if (cells.length === 0) return []

    const maxRow = Math.max(...cells.map((cell) => cell.row + cell.rowSpan - 1))
    const maxColumn = Math.max(...cells.map((cell) => cell.column + cell.columnSpan - 1))
    const grid = Array.from({ length: maxRow + 1 }, () => Array(maxColumn + 1).fill('') as string[])
    const priorities = Array.from(
      { length: maxRow + 1 },
      () => Array(maxColumn + 1).fill(Number.NEGATIVE_INFINITY) as number[]
    )

    for (const cell of cells) {
      const area = cell.rowSpan * cell.columnSpan
      for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < cell.columnSpan; colOffset += 1) {
          const row = cell.row + rowOffset
          const column = cell.column + colOffset
          const isAnchor = rowOffset === 0 && colOffset === 0
          const priority = (isAnchor ? 1_000_000 : 0) - area
          if (priority > priorities[row]![column]!) {
            priorities[row]![column] = priority
            grid[row]![column] = cell.text
          }
        }
      }
    }

    const headerRow = selectExplicitHeaderRow(cells, profile)
    const headers = grid[headerRow].map((value, column) => value.trim() || `column_${column}`)
    const rows = grid
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ rowIndex, row }) =>
        rowIndex > headerRow
        && row.some((value) => value.trim())
        && !isHeaderOnlyRow(cells, rowIndex)
      )
      .map(({ row, rowIndex }) => ({
        index: rowIndex,
        cells: row,
        raw: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
      }))

    return [{ index: tableIndex, source: 'docling_table', headers, rows, cells }]
  })
}

type HeaderResolution = {
  column: number
  matched: boolean
}

function bestHeaderColumn(headers: readonly string[], aliases: readonly string[]): HeaderResolution {
  let bestColumn = -1
  let bestScore = 0
  let tied = false

  headers.forEach((header, column) => {
    const score = Math.max(0, ...aliases.map((alias) => aliasMatchScore(header, alias)))
    if (score > bestScore) {
      bestScore = score
      bestColumn = column
      tied = false
    } else if (score > 0 && score === bestScore) {
      tied = true
    }
  })

  return {
    column: tied ? -1 : bestColumn,
    matched: bestScore > 0,
  }
}

export type ProfileTableMatch = {
  table: K5EvidenceTable
  fieldColumns: Partial<Record<FieldName, number>>
  score: number
}

function profileDefinesAny(profile: SupplierProfile, fields: readonly FieldName[]): boolean {
  return fields.some((field) => Boolean(profile.fields[field]))
}

function fieldColumnsContainAny(
  fieldColumns: Partial<Record<FieldName, number>>,
  fields: readonly FieldName[]
): boolean {
  return fields.some((field) => fieldColumns[field] != null)
}

function hasRequiredStructure(
  profile: SupplierProfile,
  fieldColumns: Partial<Record<FieldName, number>>
): boolean {
  if (fieldColumns.product == null) return false

  const measureFields: FieldName[] = ['quantity', 'cases']
  const economicFields: FieldName[] = [
    'unit_price',
    'net_unit_price',
    'line_amount',
    'line_amount_tax_included',
    'price_with_tax',
  ]

  if (
    profile.interpretation.kind !== 'mixed_measure_review'
    && profileDefinesAny(profile, measureFields)
    && !fieldColumnsContainAny(fieldColumns, measureFields)
  ) {
    return false
  }
  if (profileDefinesAny(profile, economicFields) && !fieldColumnsContainAny(fieldColumns, economicFields)) {
    return false
  }
  return Object.keys(fieldColumns).length >= 2
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
      const resolution = bestHeaderColumn(table.headers, definition.aliases)
      if (resolution.matched) score += fieldWeight(fieldName)
      if (resolution.column >= 0) fieldColumns[fieldName] = resolution.column
    }

    if (!hasRequiredStructure(profile, fieldColumns)) continue
    const candidate = { table, fieldColumns, score }
    if (!best || candidate.score > best.score) best = candidate
  }

  return best && best.score > 0 ? best : null
}

function layoutTextItems(rawArtifact: unknown): LayoutTextItem[] {
  const document = doclingDocument(rawArtifact)
  const rawTexts = document?.texts
  if (!Array.isArray(rawTexts)) return []

  return rawTexts.flatMap((candidate, index): LayoutTextItem[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const row = candidate as Record<string, unknown>
    const text = String(row.text ?? '').trim()
    const prov = Array.isArray(row.prov) ? row.prov[0] : null
    if (!text || !prov || typeof prov !== 'object') return []
    const p = prov as Record<string, unknown>
    const bbox = p.bbox
    if (!bbox || typeof bbox !== 'object') return []
    const box = bbox as Record<string, unknown>
    const left = finiteNumber(box.l)
    const right = finiteNumber(box.r)
    const bottom = finiteNumber(box.b)
    const top = finiteNumber(box.t)
    if (left == null || right == null || bottom == null || top == null) return []
    return [{
      index,
      page: Math.max(1, integer(p.page_no, 1)),
      text,
      left,
      right,
      bottom,
      top,
      origin: String(box.coord_origin ?? 'BOTTOMLEFT').toUpperCase(),
    }]
  })
}

function centerX(item: LayoutTextItem): number {
  return (item.left + item.right) / 2
}

function centerY(item: LayoutTextItem): number {
  return (item.bottom + item.top) / 2
}

function headerFieldCandidates(
  profile: SupplierProfile,
  items: readonly LayoutTextItem[],
  bandCenterY: number
): LayoutHeaderField[] {
  const inBand = items.filter((item) => Math.abs(centerY(item) - bandCenterY) <= 34)
  const chosen: LayoutHeaderField[] = []

  for (const [field, definition] of Object.entries(profile.fields) as Array<[
    FieldName,
    NonNullable<SupplierProfile['fields'][FieldName]>
  ]>) {
    let best: LayoutHeaderField | null = null
    for (const item of inBand) {
      const aliasMatches = definition.aliases
        .map((alias) => ({ alias, score: aliasMatchScore(item.text, alias) }))
        .sort((a, b) => b.score - a.score)
      const strongest = aliasMatches[0]
      const score = strongest?.score ?? 0
      if (score <= 0 || !strongest) continue
      if (
        !best
        || score > best.score
        || (score === best.score && Math.abs(centerY(item) - bandCenterY) < Math.abs(centerY(best.item) - bandCenterY))
      ) {
        best = {
          field,
          item,
          score,
          anchorX: aliasAnchorX(item, strongest.alias),
        }
      }
    }
    if (best) chosen.push(best)
  }

  return chosen
}

function layoutHeaderScore(fields: readonly LayoutHeaderField[]): number {
  return fields.reduce((sum, field) => sum + fieldWeight(field.field) * field.score, 0)
}

function layoutHeaderIsUsable(profile: SupplierProfile, fields: readonly LayoutHeaderField[]): boolean {
  const syntheticColumns: Partial<Record<FieldName, number>> = {}
  fields.forEach((field, index) => {
    syntheticColumns[field.field] = index
  })
  return hasRequiredStructure(profile, syntheticColumns)
}

function downDistance(headerY: number, item: LayoutTextItem, origin: string): number {
  return origin === 'TOPLEFT'
    ? centerY(item) - headerY
    : headerY - centerY(item)
}

function groupLayoutRows(items: readonly LayoutTextItem[]): LayoutTextItem[][] {
  const ordered = [...items].sort((a, b) => centerY(b) - centerY(a) || a.left - b.left)
  const groups: LayoutTextItem[][] = []

  for (const item of ordered) {
    const y = centerY(item)
    const existing = groups.find((group) => {
      const average = group.reduce((sum, member) => sum + centerY(member), 0) / group.length
      return Math.abs(average - y) <= 11
    })
    if (existing) existing.push(item)
    else groups.push([item])
  }

  return groups
}

export function extractDoclingLayoutTables(
  profile: SupplierProfile,
  rawArtifact: unknown,
  startIndex = 0
): K5EvidenceTable[] {
  const items = layoutTextItems(rawArtifact)
  const pages = [...new Set(items.map((item) => item.page))].sort((a, b) => a - b)
  const tables: K5EvidenceTable[] = []

  for (const page of pages) {
    const pageItems = items.filter((item) => item.page === page)
    let bestFields: LayoutHeaderField[] = []
    let bestScore = -1

    for (const anchor of pageItems) {
      const fields = headerFieldCandidates(profile, pageItems, centerY(anchor))
      if (!layoutHeaderIsUsable(profile, fields)) continue
      const score = layoutHeaderScore(fields)
      if (score > bestScore) {
        bestScore = score
        bestFields = fields
      }
    }

    if (bestFields.length === 0) continue

    const orderedFields = [...bestFields].sort((a, b) => a.anchorX - b.anchorX)
    const headerY = orderedFields.reduce((sum, field) => sum + centerY(field.item), 0) / orderedFields.length
    const origin = orderedFields[0]!.item.origin
    const centers = orderedFields.map((field) => field.anchorX)
    const leftBound = centers[0]! - 140
    const rightBound = centers[centers.length - 1]! + 140

    const dataItems = pageItems.filter((item) => {
      const distance = downDistance(headerY, item, origin)
      const x = centerX(item)
      return distance > 5 && x >= leftBound && x <= rightBound
    })

    const rowGroups = groupLayoutRows(dataItems)
    const headers = orderedFields.map((field) =>
      profile.fields[field.field]?.aliases[0] ?? field.field
    )
    const fieldByColumn = orderedFields.map((field) => field.field)
    const rows: K5EvidenceTable['rows'] = []

    for (const group of rowGroups) {
      const cells = Array.from({ length: orderedFields.length }, () => '')
      const sortedGroup = [...group].sort((a, b) => a.left - b.left)
      for (const item of sortedGroup) {
        const x = centerX(item)
        let bestColumn = 0
        let bestDistance = Number.POSITIVE_INFINITY
        centers.forEach((center, column) => {
          const distance = Math.abs(center - x)
          if (distance < bestDistance) {
            bestDistance = distance
            bestColumn = column
          }
        })
        cells[bestColumn] = [cells[bestColumn], item.text].filter(Boolean).join(' ').trim()
      }

      const semantic: Partial<Record<FieldName, string>> = {}
      fieldByColumn.forEach((field, column) => {
        semantic[field] = cells[column] ?? ''
      })
      const product = semantic.product?.trim() ?? ''
      const hasMeasureOrEconomics = [
        semantic.quantity,
        semantic.cases,
        semantic.unit_price,
        semantic.net_unit_price,
        semantic.line_amount,
        semantic.line_amount_tax_included,
        semantic.price_with_tax,
      ].some((value) => Boolean(value?.trim()))

      if (!product || !hasMeasureOrEconomics) continue
      const stableIndex = Math.min(...group.map((item) => item.index))
      rows.push({
        index: stableIndex,
        cells,
        raw: Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ''])),
      })
    }

    if (rows.length === 0) continue

    const cells: K5EvidenceCell[] = [
      ...headers.map((header, column) => ({
        row: 0,
        column,
        rowSpan: 1,
        columnSpan: 1,
        text: header,
        columnHeader: true,
      })),
      ...rows.flatMap((row, rowIndex) =>
        row.cells.map((cell, column) => ({
          row: rowIndex + 1,
          column,
          rowSpan: 1,
          columnSpan: 1,
          text: cell,
          columnHeader: false,
        }))
      ),
    ]

    tables.push({
      index: startIndex + tables.length,
      source: 'docling_layout',
      headers,
      rows,
      cells,
    })
  }

  return tables
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
