import type { EvidenceRow, FieldName, SupplierProfile } from '../supplier-profiles/types.ts'

export type K5EvidenceSource = 'native_table' | 'layout_fallback'

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
    observedCells?: string[]
  }>
  cells: K5EvidenceCell[]
  source: K5EvidenceSource
  page: number | null
}

type LayoutSpan = {
  page: number
  text: string
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
  source: 'text' | 'table_cell'
}

type LayoutHeader = {
  page: number
  centerY: number
  bottom: number
  anchors: Partial<Record<FieldName, number>>
  score: number
}

type LayoutColumn = {
  centerX: number
  samples: string[]
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function doclingDocument(rawArtifact: unknown): Record<string, unknown> | null {
  const raw = record(rawArtifact)
  const document = record(raw?.document)
  const jsonContent = record(document?.json_content)
  return jsonContent
}

function pageDimensions(
  document: Record<string, unknown>,
  page: number
): { width: number | null; height: number | null } {
  const pages = record(document.pages)
  const pageRecord = record(pages?.[String(page)])
  const size = record(pageRecord?.size)
  return {
    width: finite(size?.width),
    height: finite(size?.height),
  }
}

function normalizedBox(
  bboxValue: unknown,
  pageHeight: number | null
): { left: number; right: number; top: number; bottom: number } | null {
  const bbox = record(bboxValue)
  if (!bbox) return null
  const leftRaw = finite(bbox.l)
  const rightRaw = finite(bbox.r)
  const bRaw = finite(bbox.b)
  const tRaw = finite(bbox.t)
  if (leftRaw == null || rightRaw == null || bRaw == null || tRaw == null) return null

  const left = Math.min(leftRaw, rightRaw)
  const right = Math.max(leftRaw, rightRaw)
  const low = Math.min(bRaw, tRaw)
  const high = Math.max(bRaw, tRaw)
  const origin = String(bbox.coord_origin ?? '').toUpperCase()

  if (origin === 'BOTTOMLEFT' && pageHeight != null) {
    return {
      left,
      right,
      top: pageHeight - high,
      bottom: pageHeight - low,
    }
  }

  return { left, right, top: low, bottom: high }
}

function tableCells(table: unknown): K5EvidenceCell[] {
  const tableRecord = record(table)
  const data = record(tableRecord?.data)
  const cells = array(data?.table_cells)

  return cells.flatMap((candidate): K5EvidenceCell[] => {
    const cell = record(candidate)
    if (!cell) return []
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

function selectExplicitHeaderRow(cells: readonly K5EvidenceCell[]): number {
  const headerRows = [...new Set(cells.filter((cell) => cell.columnHeader).map((cell) => cell.row))]
  if (headerRows.length === 0) return 0

  let bestRow = headerRows[0]!
  let bestScore = -1

  for (const row of headerRows) {
    const anchors = cells.filter((cell) => cell.columnHeader && cell.row === row && cell.text)
    const coveredColumns = new Set<number>()
    for (const cell of anchors) {
      for (let offset = 0; offset < cell.columnSpan; offset += 1) coveredColumns.add(cell.column + offset)
    }
    const score = anchors.length * 100 + coveredColumns.size
    if (score > bestScore || (score === bestScore && row > bestRow)) {
      bestScore = score
      bestRow = row
    }
  }

  return bestRow
}

function isHeaderOnlyRow(cells: readonly K5EvidenceCell[], row: number): boolean {
  const anchors = cells.filter((cell) => cell.row === row && cell.text)
  return anchors.length > 0 && anchors.every((cell) => cell.columnHeader)
}

export function extractDoclingTables(rawArtifact: unknown): K5EvidenceTable[] {
  const document = doclingDocument(rawArtifact)
  const rawTables = array(document?.tables)

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

    const headerRow = selectExplicitHeaderRow(cells)
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
        observedCells: row.filter((value) => value.trim()),
      }))

    return [{
      index: tableIndex,
      headers,
      rows,
      cells,
      source: 'native_table',
      page: null,
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

function aliasMatchScore(header: string, alias: string): number {
  const normalizedHeader = normalizeEvidenceLabel(header)
  const normalizedAlias = normalizeEvidenceLabel(alias)
  if (!normalizedHeader || !normalizedAlias) return 0
  if (normalizedHeader === normalizedAlias) return 3
  if (normalizedHeader.includes(normalizedAlias)) return 2
  if (normalizedAlias.includes(normalizedHeader)) return 1
  return 0
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

function looksNumericOrMeasured(value: string): boolean {
  const compact = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!compact) return true
  if (/^[-+]?\d+(?:[.,]\d+)?(?:kg|g|l|ml|cl|ud|uds|uni|cj|pz|bu|%)?$/.test(compact)) {
    return true
  }
  const normalized = normalizeEvidenceLabel(value)
  return !/[a-z]{2,}/.test(normalized)
}

function inferProductColumn(
  profile: SupplierProfile,
  table: K5EvidenceTable,
  usedColumns: ReadonlySet<number>
): number | null {
  if (profile.fields.code) return null
  const width = Math.max(table.headers.length, ...table.rows.map((row) => row.cells.length))
  let best: { column: number; score: number } | null = null

  for (let column = 0; column < width; column += 1) {
    if (usedColumns.has(column)) continue
    const values = table.rows.map((row) => String(row.cells[column] ?? '').trim()).filter(Boolean)
    if (values.length === 0) continue
    const textLike = values.filter((value) => !looksNumericOrMeasured(value)).length
    const score = textLike / values.length
    if (score < 0.6) continue
    if (!best || score > best.score) best = { column, score }
    else if (score === best.score) best = null
  }

  return best?.column ?? null
}

function hasReviewableStructure(
  profile: SupplierProfile,
  fields: ReadonlySet<FieldName>,
  allowPartialWithoutProduct = false
): boolean {
  const hasProduct = fields.has('product')
  const hasQuantity = fields.has('quantity') || fields.has('cases')
  const economicFields: FieldName[] = [
    'unit_price',
    'net_unit_price',
    'line_amount',
    'line_amount_tax_included',
    'price_with_tax',
  ]
  const economicCount = economicFields.filter((field) => fields.has(field)).length

  if (hasProduct && hasQuantity) {
    return economicCount > 0 || profile.interpretation.kind === 'internal_water'
  }

  // Una tabla de líneas puede conservar evidencia útil aunque el producto
  // haya perdido su cabecera (caso Videla). Exigimos cantidad y al menos dos
  // magnitudes económicas para no confundirla con una tabla de bases/IVA.
  return allowPartialWithoutProduct && !hasProduct && hasQuantity && economicCount >= 2
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
    const matchedFields = new Set<FieldName>()
    let score = 0

    for (const [fieldName, definition] of Object.entries(profile.fields) as Array<[
      FieldName,
      NonNullable<SupplierProfile['fields'][FieldName]>
    ]>) {
      const resolution = bestHeaderColumn(table.headers, definition.aliases)
      if (resolution.matched) {
        matchedFields.add(fieldName)
        score += fieldName === 'product' ? 4 : 1
      }
      if (resolution.column >= 0) fieldColumns[fieldName] = resolution.column
    }

    if (fieldColumns.product == null && profile.fields.product) {
      const inferred = inferProductColumn(profile, table, new Set(Object.values(fieldColumns)))
      if (inferred != null) {
        fieldColumns.product = inferred
        matchedFields.add('product')
        score += 2
      }
    }

    if (!hasReviewableStructure(profile, matchedFields, true)) continue
    const candidate = { table, fieldColumns, score }
    if (!best || candidate.score > best.score) best = candidate
  }

  return best
}

function textLayoutSpans(document: Record<string, unknown>): LayoutSpan[] {
  return array(document.texts).flatMap((candidate): LayoutSpan[] => {
    const textRecord = record(candidate)
    const text = String(textRecord?.text ?? textRecord?.orig ?? '').trim()
    if (!text) return []

    return array(textRecord?.prov).flatMap((provValue): LayoutSpan[] => {
      const prov = record(provValue)
      const page = integer(prov?.page_no, 1)
      const { height } = pageDimensions(document, page)
      const box = normalizedBox(prov?.bbox, height)
      if (!box) return []
      return [{
        page,
        text,
        ...box,
        centerX: (box.left + box.right) / 2,
        centerY: (box.top + box.bottom) / 2,
        source: 'text',
      }]
    })
  })
}

function tableLayoutSpans(document: Record<string, unknown>): LayoutSpan[] {
  return array(document.tables).flatMap((tableValue): LayoutSpan[] => {
    const table = record(tableValue)
    const tableProv = record(array(table?.prov)[0])
    const defaultPage = integer(tableProv?.page_no, 1)
    const data = record(table?.data)

    return array(data?.table_cells).flatMap((cellValue): LayoutSpan[] => {
      const cell = record(cellValue)
      const text = String(cell?.text ?? '').trim()
      if (!text) return []
      const page = defaultPage
      const { height } = pageDimensions(document, page)
      const box = normalizedBox(cell?.bbox, height)
      if (!box) return []
      return [{
        page,
        text,
        ...box,
        centerX: (box.left + box.right) / 2,
        centerY: (box.top + box.bottom) / 2,
        source: 'table_cell',
      }]
    })
  })
}

function dedupeSpans(spans: readonly LayoutSpan[]): LayoutSpan[] {
  const seen = new Set<string>()
  const result: LayoutSpan[] = []

  for (const span of spans) {
    const key = [
      span.page,
      normalizeEvidenceLabel(span.text),
      Math.round(span.centerX / 4),
      Math.round(span.centerY / 4),
    ].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(span)
  }
  return result
}

function aliasAnchorX(span: LayoutSpan, alias: string): number {
  const haystack = normalizeEvidenceLabel(span.text)
  const needle = normalizeEvidenceLabel(alias)
  const index = haystack.indexOf(needle)
  if (index < 0 || !haystack.length) return span.centerX
  const centerRatio = (index + needle.length / 2) / haystack.length
  return span.left + (span.right - span.left) * centerRatio
}

function bestAliasForText(
  text: string,
  aliases: readonly string[]
): { alias: string; score: number } | null {
  let best: { alias: string; score: number } | null = null
  for (const alias of aliases) {
    const score = aliasMatchScore(text, alias)
    if (score > 0 && (!best || score > best.score)) best = { alias, score }
  }
  return best
}

function headerWeight(field: FieldName): number {
  if (field === 'product') return 4
  if (field === 'quantity' || field === 'cases') return 2
  return 1
}

function findLayoutHeader(profile: SupplierProfile, document: Record<string, unknown>, spans: readonly LayoutSpan[]): LayoutHeader | null {
  const matches = spans.flatMap((span) =>
    (Object.entries(profile.fields) as Array<[FieldName, NonNullable<SupplierProfile['fields'][FieldName]>]>)
      .flatMap(([field, definition]) => {
        const matched = bestAliasForText(span.text, definition.aliases)
        return matched ? [{ span, field, ...matched }] : []
      })
  )
  if (matches.length === 0) return null

  const pages = [...new Set(matches.map((match) => match.span.page))]
  let best: LayoutHeader | null = null

  for (const page of pages) {
    const { height } = pageDimensions(document, page)
    const tolerance = Math.max(18, (height ?? 1600) * 0.016)
    const pageMatches = matches.filter((match) => match.span.page === page).sort((a, b) => a.span.centerY - b.span.centerY)
    const clusters: typeof pageMatches[] = []

    for (const match of pageMatches) {
      const cluster = clusters.find((items) =>
        Math.abs(items.reduce((sum, item) => sum + item.span.centerY, 0) / items.length - match.span.centerY) <= tolerance
      )
      if (cluster) cluster.push(match)
      else clusters.push([match])
    }

    for (const cluster of clusters) {
      const anchors: Partial<Record<FieldName, number>> = {}
      const strengths = new Map<FieldName, number>()
      let bottom = 0

      for (const match of cluster) {
        bottom = Math.max(bottom, match.span.bottom)
        const existing = strengths.get(match.field) ?? 0
        if (match.score > existing) {
          strengths.set(match.field, match.score)
          anchors[match.field] = aliasAnchorX(match.span, match.alias)
        }
      }

      const anchoredFields = new Set(Object.keys(anchors) as FieldName[])
      if (!hasReviewableStructure(profile, anchoredFields)) continue

      const score = [...strengths.entries()].reduce(
        (sum, [field, strength]) => sum + headerWeight(field) * strength,
        0
      )
      const centerY = cluster.reduce((sum, item) => sum + item.span.centerY, 0) / cluster.length
      const candidate = { page, centerY, bottom, anchors, score }
      if (!best || candidate.score > best.score) best = candidate
    }
  }

  return best
}

function clusterRows(spans: readonly LayoutSpan[], tolerance: number): LayoutSpan[][] {
  const sorted = [...spans].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX)
  const rows: LayoutSpan[][] = []

  for (const span of sorted) {
    const row = rows.find((items) => {
      const center = items.reduce((sum, item) => sum + item.centerY, 0) / items.length
      return Math.abs(center - span.centerY) <= tolerance
    })
    if (row) row.push(span)
    else rows.push([span])
  }

  return rows.map((row) => row.sort((a, b) => a.centerX - b.centerX))
}

function clusterColumns(spans: readonly LayoutSpan[], tolerance: number): LayoutColumn[] {
  const sorted = [...spans].sort((a, b) => a.centerX - b.centerX)
  const columns: Array<{ centers: number[]; samples: string[] }> = []

  for (const span of sorted) {
    const column = columns.find((candidate) => {
      const center = candidate.centers.reduce((sum, value) => sum + value, 0) / candidate.centers.length
      return Math.abs(center - span.centerX) <= tolerance
    })
    if (column) {
      column.centers.push(span.centerX)
      column.samples.push(span.text)
    } else {
      columns.push({ centers: [span.centerX], samples: [span.text] })
    }
  }

  return columns.map((column) => ({
    centerX: column.centers.reduce((sum, value) => sum + value, 0) / column.centers.length,
    samples: column.samples,
  }))
}

function normalizedUnitToken(value: string): boolean {
  const token = normalizeEvidenceLabel(value).replace(/\s+/g, '')
  return /^(?:kg|g|l|ml|cl|uni|un|ud|uds|cj|caja|bol|bolsa|pz|bu|man|ban|inn|ca|pak|pack)$/.test(token)
}

function unitOnlyColumn(column: LayoutColumn): boolean {
  const samples = column.samples.filter((sample) => normalizeEvidenceLabel(sample))
  return samples.length > 0 && samples.filter(normalizedUnitToken).length / samples.length >= 0.6
}

function nearestColumn(
  columns: readonly LayoutColumn[],
  anchorX: number,
  field: FieldName
): number | null {
  const candidates = columns
    .map((column, index) => ({ index, distance: Math.abs(column.centerX - anchorX), unitOnly: unitOnlyColumn(column) }))
    .filter((candidate) =>
      field === 'unit_type'
      || field === 'quantity'
      || field === 'cases'
      || !candidate.unitOnly
    )
    .sort((a, b) => a.distance - b.distance)

  return candidates[0]?.index ?? null
}

function resolveLayoutFieldColumns(
  profile: SupplierProfile,
  header: LayoutHeader,
  columns: readonly LayoutColumn[]
): Partial<Record<FieldName, number>> {
  const order = Object.keys(profile.fields) as FieldName[]
  const rawAssignments = new Map<FieldName, number>()

  for (const field of order) {
    const anchor = header.anchors[field]
    if (anchor == null) continue
    const column = nearestColumn(columns, anchor, field)
    if (column != null) rawAssignments.set(field, column)
  }

  const byColumn = new Map<number, FieldName[]>()
  for (const [field, column] of rawAssignments) {
    const list = byColumn.get(column) ?? []
    list.push(field)
    byColumn.set(column, list)
  }

  const result: Partial<Record<FieldName, number>> = {}
  const occupied = new Set<number>()

  for (const [column, fields] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    fields.sort((left, right) => order.indexOf(left) - order.indexOf(right))
    if (fields.length === 1) {
      result[fields[0]!] = column
      occupied.add(column)
      continue
    }

    let cursor = column
    for (const field of fields) {
      while (
        cursor < columns.length
        && (
          occupied.has(cursor)
          || (
            unitOnlyColumn(columns[cursor]!)
            && field !== 'unit_type'
            && field !== 'quantity'
            && field !== 'cases'
          )
        )
      ) {
        cursor += 1
      }
      if (cursor >= columns.length) break
      result[field] = cursor
      occupied.add(cursor)
      cursor += 1
    }
  }

  return result
}

function valueForColumn(row: readonly LayoutSpan[], columns: readonly LayoutColumn[], columnIndex: number): string {
  const target = columns[columnIndex]
  if (!target) return ''

  const previous = columns[columnIndex - 1]
  const next = columns[columnIndex + 1]
  const leftBoundary = previous
    ? (previous.centerX + target.centerX) / 2
    : Number.NEGATIVE_INFINITY
  const rightBoundary = next
    ? (target.centerX + next.centerX) / 2
    : Number.POSITIVE_INFINITY

  return row
    .filter((span) => span.centerX > leftBoundary && span.centerX <= rightBoundary)
    .sort((a, b) => a.centerX - b.centerX)
    .map((span) => span.text.trim())
    .filter(Boolean)
    .join(' ')
}

function adjacentUnitValue(
  row: readonly LayoutSpan[],
  columns: readonly LayoutColumn[],
  quantityColumn: number,
  mappedColumns: ReadonlySet<number>
): string {
  const next = quantityColumn + 1
  if (next >= columns.length || mappedColumns.has(next) || !unitOnlyColumn(columns[next]!)) return ''
  return valueForColumn(row, columns, next)
}

function layoutTableForPage(
  profile: SupplierProfile,
  document: Record<string, unknown>,
  spans: readonly LayoutSpan[],
  header: LayoutHeader
): K5EvidenceTable | null {
  const { width, height } = pageDimensions(document, header.page)
  const rowTolerance = Math.max(12, (height ?? 1600) * 0.012)
  const columnTolerance = Math.max(18, (width ?? 1200) * 0.025)
  const lowerBound = header.bottom + rowTolerance * 0.35
  const upperBound = header.centerY + (height ?? 1600) * 0.48
  const dataSpans = spans.filter((span) =>
    span.page === header.page
    && span.centerY > lowerBound
    && span.centerY <= upperBound
  )
  if (dataSpans.length === 0) return null

  const rowGroups = clusterRows(dataSpans, rowTolerance)
    .filter((row) => row.length >= 2)
  if (rowGroups.length === 0) return null

  const columnSource = rowGroups.flat()
  const columns = clusterColumns(columnSource, columnTolerance)
  if (columns.length < 2) return null

  const fieldColumns = resolveLayoutFieldColumns(profile, header, columns)
  const fields = (Object.keys(profile.fields) as FieldName[])
    .filter((field) => fieldColumns[field] != null)
  if (!hasReviewableStructure(profile, new Set(fields))) return null
  const headers = fields.map((field) => profile.fields[field]!.aliases[0] ?? field)
  const mappedColumnIndexes = new Set(fields.map((field) => fieldColumns[field]!))

  const rows = rowGroups.flatMap((row, rowIndex) => {
    const values = fields.map((field) => {
      const columnIndex = fieldColumns[field]!
      let value = valueForColumn(row, columns, columnIndex)
      if (field === 'quantity' || field === 'cases') {
        const unit = adjacentUnitValue(row, columns, columnIndex, mappedColumnIndexes)
        if (unit && !normalizedUnitToken(value.split(/\s+/).at(-1) ?? '')) value = `${value} ${unit}`.trim()
      }
      return value
    })

    const productIndex = fields.indexOf('product')
    const quantityIndex = fields.findIndex((field) => field === 'quantity' || field === 'cases')
    const product = productIndex >= 0 ? values[productIndex]!.trim() : ''
    const quantity = quantityIndex >= 0 ? values[quantityIndex]!.trim() : ''

    if (!product || !/[A-Za-zÀ-ÿ]/.test(product) || !quantity) return []
    if (Object.values(profile.fields).some((definition) =>
      definition?.aliases.some((alias) => normalizeEvidenceLabel(product) === normalizeEvidenceLabel(alias))
    )) return []

    return [{
      index: rowIndex,
      cells: values,
      raw: Object.fromEntries(headers.map((headerName, index) => [headerName, values[index] ?? ''])),
      observedCells: row.map((span) => span.text).filter(Boolean),
    }]
  })

  if (rows.length === 0) return null

  return {
    index: 1_000_000 + header.page,
    headers,
    rows,
    cells: [],
    source: 'layout_fallback',
    page: header.page,
  }
}

export function extractDoclingLayoutTables(
  profile: SupplierProfile,
  rawArtifact: unknown
): K5EvidenceTable[] {
  const document = doclingDocument(rawArtifact)
  if (!document) return []

  const spans = dedupeSpans([
    ...textLayoutSpans(document),
    ...tableLayoutSpans(document),
  ])
  const header = findLayoutHeader(profile, document, spans)
  if (!header) return []

  const table = layoutTableForPage(profile, document, spans, header)
  return table ? [table] : []
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
