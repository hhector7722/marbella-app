export type MatchDecision = 'MATCH' | 'AMBIGUOUS' | 'NO_MATCH'

export type OperativeLineForMatch = {
  id: string
  original_name: string | null
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  line_unit: string | null
  status: string | null
  ingredient_name?: string | null
  /** Posición relativa 0..n-1 entre líneas del albarán (orden de lectura). */
  orderIndex: number
}

export type DocumentRowForMatch = {
  rowMappingKey: string
  description: string
  quantity: number | null
  unitPrice: number | null
  unit: string | null
  /** Índice relativo 0..n-1 entre filas candidatas. */
  orderIndex: number
}

export type RowMatchResult = {
  rowMappingKey: string
  decision: MatchDecision
  invoiceLineId: string | null
  confidence: number
  bestScore: number
  secondScore: number
  reason: string
}

export type MatcherResult = {
  rows: RowMatchResult[]
  matches: RowMatchResult[]
  ambiguous: RowMatchResult[]
  noMatch: RowMatchResult[]
  unmatchedLineIds: string[]
}

export type ProvenanceCandidate = {
  invoice_line_id: string
  row_mapping_key: string
  linked_by: 'backfill-matcher-v1'
  confidence_score: number
}

/** Umbrales conservadores: preferir NO_MATCH / AMBIGUOUS a forzar. */
export const MATCHER_THRESHOLDS = {
  minNameScoreForMatch: 0.85,
  minMarginOverSecond: 0.08,
  orderBonusMax: 0.03,
  numericBonusMax: 0.02,
} as const

export function normalizeMatchText(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(' ').filter(Boolean))
}

/** Similitud de nombre 0..1 (exacto / inclusión / Jaccard de tokens). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeMatchText(a)
  const nb = normalizeMatchText(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.92

  const ta = tokenSet(na)
  const tb = tokenSet(nb)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

function nearEqual(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9)
  return Math.abs(a - b) / denom <= 0.01 || Math.abs(a - b) < 1e-6
}

function scorePair(
  row: DocumentRowForMatch,
  line: OperativeLineForMatch,
  rowCount: number,
  lineCount: number
): { score: number; nameScore: number } {
  const nameVsOriginal = nameSimilarity(row.description, line.original_name ?? '')
  const nameVsIngredient = nameSimilarity(row.description, line.ingredient_name ?? '')
  const nameScore = Math.max(nameVsOriginal, nameVsIngredient)

  let score = nameScore

  if (rowCount > 1 && lineCount > 1) {
    const rowPos = row.orderIndex / (rowCount - 1)
    const linePos = line.orderIndex / (lineCount - 1)
    const orderProximity = 1 - Math.min(1, Math.abs(rowPos - linePos))
    score += MATCHER_THRESHOLDS.orderBonusMax * orderProximity
  }

  if (nearEqual(row.quantity, line.quantity)) {
    score += MATCHER_THRESHOLDS.numericBonusMax
  }
  if (nearEqual(row.unitPrice, line.unit_price)) {
    score += MATCHER_THRESHOLDS.numericBonusMax
  }

  return { score, nameScore }
}

/**
 * Matching 1–1 conservador.
 * Divergencia de cantidad/precio NO descalifica: solo aportan bonus.
 */
export function matchHistoricalRows(
  rows: DocumentRowForMatch[],
  lines: OperativeLineForMatch[]
): MatcherResult {
  const eligibleLines = lines.filter((l) => {
    const st = String(l.status ?? '')
    return st !== 'excluded'
  })

  type Scored = {
    rowKey: string
    lineId: string
    score: number
    nameScore: number
  }

  const scored: Scored[] = []
  for (const row of rows) {
    for (const line of eligibleLines) {
      const { score, nameScore } = scorePair(row, line, rows.length, eligibleLines.length)
      scored.push({ rowKey: row.rowMappingKey, lineId: line.id, score, nameScore })
    }
  }

  scored.sort((a, b) => b.score - a.score)

  const usedRows = new Set<string>()
  const usedLines = new Set<string>()
  const assigned = new Map<string, Scored>()

  for (const s of scored) {
    if (usedRows.has(s.rowKey) || usedLines.has(s.lineId)) continue
    usedRows.add(s.rowKey)
    usedLines.add(s.lineId)
    assigned.set(s.rowKey, s)
  }

  const rowResults: RowMatchResult[] = []

  for (const row of rows) {
    const best = assigned.get(row.rowMappingKey)
    const candidatesForRow = scored
      .filter((s) => s.rowKey === row.rowMappingKey)
      .sort((a, b) => b.score - a.score)

    const bestScore = candidatesForRow[0]?.score ?? 0
    const secondScore = candidatesForRow[1]?.score ?? 0
    const bestName = candidatesForRow[0]?.nameScore ?? 0
    const margin = bestScore - secondScore

    if (!best) {
      rowResults.push({
        rowMappingKey: row.rowMappingKey,
        decision: 'NO_MATCH',
        invoiceLineId: null,
        confidence: 0,
        bestScore,
        secondScore,
        reason: 'sin_candidato_asignable',
      })
      continue
    }

    const uniqueEnough = margin >= MATCHER_THRESHOLDS.minMarginOverSecond || candidatesForRow.length === 1
    const strongName = best.nameScore >= MATCHER_THRESHOLDS.minNameScoreForMatch

    if (strongName && uniqueEnough) {
      rowResults.push({
        rowMappingKey: row.rowMappingKey,
        decision: 'MATCH',
        invoiceLineId: best.lineId,
        confidence: Math.min(1, best.nameScore),
        bestScore: best.score,
        secondScore,
        reason: 'nombre_unico_fuerte',
      })
      continue
    }

    if (bestName >= 0.55 && (!uniqueEnough || !strongName)) {
      rowResults.push({
        rowMappingKey: row.rowMappingKey,
        decision: 'AMBIGUOUS',
        invoiceLineId: null,
        confidence: bestName,
        bestScore,
        secondScore,
        reason: !uniqueEnough ? 'margen_insuficiente' : 'nombre_insuficiente',
      })
      continue
    }

    rowResults.push({
      rowMappingKey: row.rowMappingKey,
      decision: 'NO_MATCH',
      invoiceLineId: null,
      confidence: bestName,
      bestScore,
      secondScore,
      reason: 'bajo_umbral',
    })
  }

  const matches = rowResults.filter((r) => r.decision === 'MATCH')
  const ambiguous = rowResults.filter((r) => r.decision === 'AMBIGUOUS')
  const noMatch = rowResults.filter((r) => r.decision === 'NO_MATCH')
  const matchedLineIds = new Set(matches.map((m) => m.invoiceLineId).filter(Boolean) as string[])
  const unmatchedLineIds = lines.map((l) => l.id).filter((id) => !matchedLineIds.has(id))

  return { rows: rowResults, matches, ambiguous, noMatch, unmatchedLineIds }
}

/** Solo MATCH genera provenance. AMBIGUOUS y NO_MATCH nunca. */
export function provenanceCandidatesFromMatcher(result: MatcherResult): ProvenanceCandidate[] {
  return result.matches
    .filter((m) => m.decision === 'MATCH' && m.invoiceLineId)
    .map((m) => ({
      invoice_line_id: m.invoiceLineId as string,
      row_mapping_key: m.rowMappingKey,
      linked_by: 'backfill-matcher-v1' as const,
      confidence_score: m.confidence,
    }))
}
