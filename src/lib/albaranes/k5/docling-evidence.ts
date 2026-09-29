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

export type K5ReviewFallbackRow = {
  sourceTableIndex: number
  sourceRowIndex: number
  source: K5EvidenceSource
  product: string
  quantity: string | null
  unitPrice: string | null
  lineTotal: string | null
  rawCells: string[]
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
    .replace(/%\s+/g, '%')
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
  const anchors = cells.filter((cell) => cell.row === row && cell.text)
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
  const allRows = [...new Set(cells.map((cell) => cell.row))].sort((a, b) => a - b)
  let semanticRow = allRows[0] ?? 0
  let bestSemantic = 0
  let bestSemanticDensity = -1

  for (const row of allRows) {
    const anchors = cells.filter((cell) => cell.row === row && cell.text)
    const semantic = semanticHeaderScore(cells, row, profile)
    const density = anchors.length
    if (
      semantic > bestSemantic
      || (semantic === bestSemantic && semantic > 0 && density > bestSemanticDensity)
    ) {
      bestSemantic = semantic
      bestSemanticDensity = density
      semanticRow = row
    }
  }

  if (bestSemantic > 0) return semanticRow

  const headerRows = [...new Set(cells.filter((cell) => cell.columnHeader).map((cell) => cell.row))]
  if (headerRows.length === 0) return 0

  let bestRow = headerRows[0]!
  let bestDensity = -1
  for (const row of headerRows) {
    const anchors = cells.filter((cell) => cell.columnHeader && cell.row === row && cell.text)
    const coveredColumns = new Set<number>()
    for (const cell of anchors) {
      for (let offset = 0; offset < cell.columnSpan; offset += 1) coveredColumns.add(cell.column + offset)
    }
    const density = anchors.length * 100 + coveredColumns.size
    if (density > bestDensity || (density === bestDensity && row > bestRow)) {
      bestDensity = density
      bestRow = row
    }
  }

  return bestRow
}

const QUANTITY_UNIT_TOKEN = /^(?:KG|G|L|ML|CL|PZ|BU|CJ|UD|UND|UN|UNI|BOL|CAJA|CAJAS)$/i

function observedQuantityScore(value: string): number {
  const compact = value.trim().replace(/\s+/g, '')
  if (!compact) return 0
  if (QUANTITY_UNIT_TOKEN.test(compact)) return 1
  return /^[+-]?\d+(?:[.,]\d+)?(?:KG|G|L|ML|CL|PZ|BU|CJ|UD|UND|UN|UNI|BOL|CAJA|CAJAS)$/i.test(compact)
    ? 3
    : 0
}

function bestHeaderColumnForAliases(headers: readonly string[], aliases: readonly string[]): number {
  let bestColumn = -1
  let bestScore = 0
  for (let column = 0; column < headers.length; column += 1) {
    const score = Math.max(0, ...aliases.map((alias) => aliasMatchScore(headers[column] ?? '', alias)))
    if (score > bestScore) {
      bestScore = score
      bestColumn = column
    }
  }
  return bestColumn
}

function recoverMergedQuantityHeader(
  profile: SupplierProfile | undefined,
  headers: string[],
  grid: readonly string[][],
  headerRow: number
): void {
  const productAliases = profile?.fields.product?.aliases ?? []
  const quantityAliases = profile?.fields.quantity?.aliases ?? []
  if (productAliases.length === 0 || quantityAliases.length === 0) return

  const productColumn = bestHeaderColumnForAliases(headers, productAliases)
  const quantityColumn = bestHeaderColumnForAliases(headers, quantityAliases)
  if (productColumn < 0 || quantityColumn !== productColumn) return

  let bestColumn = -1
  let bestScore = 0
  for (let column = 0; column < headers.length; column += 1) {
    if (column === productColumn) continue
    const score = grid
      .slice(headerRow + 1)
      .reduce((sum, row) => sum + observedQuantityScore(row[column] ?? ''), 0)
    if (score > bestScore) {
      bestScore = score
      bestColumn = column
    }
  }

  if (bestColumn >= 0 && bestScore >= 3) {
    headers[bestColumn] = quantityAliases[0]!
  }
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
    recoverMergedQuantityHeader(profile, headers, grid, headerRow)
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

const GENERIC_REVIEW_ALIASES = {
  product: ['Descripción', 'Descripció', 'Producto', 'Producte', 'Artículo', 'Article', 'Item', 'Concepto'],
  quantity: ['Cantidad', 'Quantitat', 'Qty', 'Unidades', 'Unitats', 'Uds', 'Cajas', 'Caixes'],
  unitPrice: ['P.UN', 'P.U.', 'Precio', 'Preu', 'Precio unitario', 'Precio por unidad', 'Unit price'],
  lineTotal: ['Importe', 'Import', 'Total línea', 'Total linea', 'Line total', 'Amount'],
} as const

const FALLBACK_MEASURE = /[+-]?\d+(?:[.,]\d+)?\s*(?:KG|G|L|ML|CL|PZ|BU|CJ|UD|UND|UN|UNI|BOL|CAJA|CAJAS|CAN)\b/i

function reviewColumnForFields(
  table: K5EvidenceTable,
  profile: SupplierProfile,
  fields: readonly FieldName[],
  genericAliases: readonly string[]
): number | null {
  for (const field of fields) {
    const aliases = profile.fields[field]?.aliases ?? []
    if (aliases.length === 0) continue
    const resolution = bestHeaderColumn(table.headers, aliases)
    if (resolution.column >= 0) return resolution.column
  }
  const generic = bestHeaderColumn(table.headers, genericAliases)
  return generic.column >= 0 ? generic.column : null
}

function fallbackProductLooksPlausible(profile: SupplierProfile, value: string): boolean {
  const normalized = normalizeEvidenceLabel(value)
  if (normalized.length < 4 || !/[a-z]{3}/.test(normalized)) return false

  const supplierLabels = [
    profile.supplier.canonical_name,
    ...profile.supplier.aliases,
    ...profile.supplier.observed_document_identities,
  ].map(normalizeEvidenceLabel)
  if (supplierLabels.includes(normalized)) return false

  return !/^(?:total(?:\s|$)|total bases|total iva|base imponible|bases iva|bruto(?:\s|$)|imp bruto|mp bruto|descuentos?(?:\s|$)|fecha(?:\s|$)|factura(?:\s|$)|cod cliente|codigo cliente|cliente(?:\s|$)|pagina(?:\s|$)|pag(?:\s|$)|ruta(?:\s|$)|observaciones?(?:\s|$)|forma de pago|recibo(?:\s|$)|persona que|portes?(?:\s|$)|firma cliente|nif(?:\s|$)|cif(?:\s|$)|albaran(?:\s|$)|pedido(?:\s|$)|tancat(?:\s|$)|no hi ha|no acceptat|mal estat|unitat x caixa|errada producte|no carregat|car rep|tip fac|dom tip|neto(?:\s|$)|iva(?:\s|$))/.test(normalized)
}

function inferredFallbackProductColumn(
  profile: SupplierProfile,
  table: K5EvidenceTable,
  blockedColumns: ReadonlySet<number>
): number | null {
  const maxColumns = Math.max(table.headers.length, ...table.rows.map((row) => row.cells.length), 0)
  let bestColumn: number | null = null
  let bestScore = 0

  for (let column = 0; column < maxColumns; column += 1) {
    if (blockedColumns.has(column)) continue
    let score = 0
    for (const row of table.rows) {
      const value = (row.cells[column] ?? '').trim()
      if (!fallbackProductLooksPlausible(profile, value)) continue
      score += Math.min(20, 4 + Math.floor(normalizeEvidenceLabel(value).length / 6))
    }
    if (score > bestScore) {
      bestScore = score
      bestColumn = column
    }
  }

  return bestScore >= 6 ? bestColumn : null
}

function fallbackMeasureCell(cells: readonly string[], excluded: ReadonlySet<number>): string | null {
  const match = cells
    .map((text, column) => ({ text: text.trim(), column }))
    .find(({ text, column }) => !excluded.has(column) && FALLBACK_MEASURE.test(text))
  return match?.text ?? null
}

function nativeReviewFallbackRows(
  profile: SupplierProfile,
  tables: readonly K5EvidenceTable[]
): K5ReviewFallbackRow[] {
  const rows: K5ReviewFallbackRow[] = []

  for (const table of tables) {
    const quantityColumn = reviewColumnForFields(table, profile, ['quantity', 'cases'], GENERIC_REVIEW_ALIASES.quantity)
    const unitPriceColumn = reviewColumnForFields(
      table,
      profile,
      ['net_unit_price', 'unit_price', 'price_with_tax'],
      GENERIC_REVIEW_ALIASES.unitPrice
    )
    const lineTotalColumn = reviewColumnForFields(
      table,
      profile,
      ['line_amount', 'line_amount_tax_included'],
      GENERIC_REVIEW_ALIASES.lineTotal
    )
    const explicitProductColumn = reviewColumnForFields(table, profile, ['product'], GENERIC_REVIEW_ALIASES.product)
    const blocked = new Set(
      [quantityColumn, unitPriceColumn, lineTotalColumn].filter((column): column is number => column != null)
    )
    const productColumn = explicitProductColumn ?? inferredFallbackProductColumn(profile, table, blocked)
    if (productColumn == null) continue

    for (const row of table.rows) {
      let product = (row.cells[productColumn] ?? '').trim()
      if (!fallbackProductLooksPlausible(profile, product)) {
        product = row.cells
          .map((text) => text.trim())
          .filter((text) => fallbackProductLooksPlausible(profile, text))
          .sort((a, b) => b.length - a.length)[0] ?? ''
      }
      if (!fallbackProductLooksPlausible(profile, product)) continue

      const excluded = new Set<number>([productColumn])
      const quantityText = quantityColumn == null ? '' : (row.cells[quantityColumn] ?? '').trim()
      const quantity = /\d/.test(quantityText)
        ? quantityText
        : fallbackMeasureCell(row.cells, excluded)
      const unitPrice = unitPriceColumn == null ? null : ((row.cells[unitPriceColumn] ?? '').trim() || null)
      const lineTotal = lineTotalColumn == null ? null : ((row.cells[lineTotalColumn] ?? '').trim() || null)
      const nonEmptyCells = row.cells.filter((cell) => cell.trim()).length
      if (!quantity && !unitPrice && !lineTotal && nonEmptyCells < 2 && product.length < 8) continue

      rows.push({
        sourceTableIndex: table.index,
        sourceRowIndex: row.index,
        source: table.source,
        product,
        quantity,
        unitPrice,
        lineTotal,
        rawCells: [...row.cells],
      })
    }
  }

  return rows
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

function looseLayoutReviewFallbackRows(
  profile: SupplierProfile,
  rawArtifact: unknown,
  startIndex: number
): K5ReviewFallbackRow[] {
  const items = layoutTextItems(rawArtifact)
  const pages = [...new Set(items.map((item) => item.page))].sort((a, b) => a - b)
  const rows: K5ReviewFallbackRow[] = []
  let tableOffset = 0

  for (const page of pages) {
    const pageItems = items.filter((item) => item.page === page)
    let bestFields: LayoutHeaderField[] = []
    let bestScore = -1

    for (const anchor of pageItems) {
      const fields = headerFieldCandidates(profile, pageItems, centerY(anchor))
      const hasProduct = fields.some((field) => field.field === 'product')
      if (!hasProduct || fields.length < 2) continue
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
    const leftBound = centers[0]! - 160
    const rightBound = centers[centers.length - 1]! + 160
    const productColumn = orderedFields.findIndex((field) => field.field === 'product')
    const quantityColumn = orderedFields.findIndex((field) => field.field === 'quantity' || field.field === 'cases')
    const unitPriceColumn = orderedFields.findIndex(
      (field) => field.field === 'net_unit_price' || field.field === 'unit_price' || field.field === 'price_with_tax'
    )
    const lineTotalColumn = orderedFields.findIndex(
      (field) => field.field === 'line_amount' || field.field === 'line_amount_tax_included'
    )

    const dataItems = pageItems.filter((item) => {
      const distance = downDistance(headerY, item, origin)
      const x = centerX(item)
      return distance > 5 && x >= leftBound && x <= rightBound
    })

    for (const group of groupLayoutRows(dataItems)) {
      const cells = Array.from({ length: orderedFields.length }, () => '')
      for (const item of [...group].sort((a, b) => a.left - b.left)) {
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

      const product = productColumn < 0 ? '' : (cells[productColumn] ?? '').trim()
      if (!fallbackProductLooksPlausible(profile, product)) continue
      const excluded = new Set<number>(productColumn >= 0 ? [productColumn] : [])
      const quantityText = quantityColumn < 0 ? '' : (cells[quantityColumn] ?? '').trim()
      const quantity = /\d/.test(quantityText) ? quantityText : fallbackMeasureCell(cells, excluded)
      const unitPrice = unitPriceColumn < 0 ? null : ((cells[unitPriceColumn] ?? '').trim() || null)
      const lineTotal = lineTotalColumn < 0 ? null : ((cells[lineTotalColumn] ?? '').trim() || null)
      const nonEmptyCells = cells.filter((cell) => cell.trim()).length
      if (!quantity && !unitPrice && !lineTotal && nonEmptyCells < 2 && product.length < 8) continue

      rows.push({
        sourceTableIndex: startIndex + tableOffset,
        sourceRowIndex: Math.min(...group.map((item) => item.index)),
        source: 'docling_layout',
        product,
        quantity,
        unitPrice,
        lineTotal,
        rawCells: cells,
      })
    }

    tableOffset += 1
  }

  return rows
}

function dedupeReviewFallbackRows(rows: readonly K5ReviewFallbackRow[]): K5ReviewFallbackRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = [
      row.sourceTableIndex,
      row.sourceRowIndex,
      normalizeEvidenceLabel(row.product),
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractDoclingReviewFallbackRows(
  profile: SupplierProfile,
  rawArtifact: unknown,
  nativeTables?: readonly K5EvidenceTable[]
): K5ReviewFallbackRow[] {
  const tables = nativeTables ?? extractDoclingTables(rawArtifact, profile)
  const native = dedupeReviewFallbackRows(nativeReviewFallbackRows(profile, tables))
  if (native.length > 0) return native

  return dedupeReviewFallbackRows(
    looseLayoutReviewFallbackRows(profile, rawArtifact, tables.length)
  )
}

function firstEconomicColumn(match: ProfileTableMatch, fallback: number): number {
  const columns = ([
    'unit_price',
    'net_unit_price',
    'line_amount',
    'line_amount_tax_included',
    'price_with_tax',
  ] as FieldName[])
    .map((field) => match.fieldColumns[field])
    .filter((column): column is number => column != null)
  return columns.length > 0 ? Math.min(...columns) : fallback
}

function recoverProductText(
  match: ProfileTableMatch,
  row: K5EvidenceTable['rows'][number],
  productColumn: number
): string {
  const primary = (row.cells[productColumn] ?? '').trim()
  if (/[A-Za-zÀ-ÿ]{3,}/u.test(primary)) return primary

  const boundary = firstEconomicColumn(match, row.cells.length)
  const blocked = new Set<number>([
    productColumn,
    match.fieldColumns.quantity,
    match.fieldColumns.cases,
  ].filter((column): column is number => column != null))

  const candidate = row.cells
    .map((text, column) => ({ text: text.trim(), column }))
    .filter(({ text, column }) =>
      column < boundary
      && !blocked.has(column)
      && /[A-Za-zÀ-ÿ]{3,}/u.test(text)
    )
    .sort((a, b) => b.text.length - a.text.length)[0]

  return candidate?.text ?? primary
}

function recoverQuantityText(
  match: ProfileTableMatch,
  row: K5EvidenceTable['rows'][number],
  quantityColumn: number
): string {
  const primary = (row.cells[quantityColumn] ?? '').trim()
  if (/\d/.test(primary) || !QUANTITY_UNIT_TOKEN.test(primary.replace(/\s+/g, ''))) return primary

  const boundary = firstEconomicColumn(match, row.cells.length)
  const numeric = row.cells
    .map((text, column) => ({ text: text.trim(), column }))
    .find(({ text, column }) =>
      column < boundary
      && column !== quantityColumn
      && column !== match.fieldColumns.product
      && /^[+-]?\d+(?:[.,]\d+)?$/.test(text)
    )

  return numeric ? `${numeric.text} ${primary}`.trim() : primary
}

export function rowByProfileFields(
  match: ProfileTableMatch,
  row: K5EvidenceTable['rows'][number]
): EvidenceRow {
  const result: EvidenceRow = {}
  for (const [fieldName, column] of Object.entries(match.fieldColumns) as Array<[FieldName, number]>) {
    if (fieldName === 'product') {
      result[fieldName] = recoverProductText(match, row, column)
    } else if (fieldName === 'quantity') {
      result[fieldName] = recoverQuantityText(match, row, column)
    } else {
      result[fieldName] = row.cells[column] ?? ''
    }
  }
  return result
}
