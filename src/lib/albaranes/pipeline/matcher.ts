/** Identidad de producto sin decidir todavía unidades ni efectos económicos. */
export type SupplierProductMemory = {
  supplierId: number
  ingredientId: string
  supplierProductCode: string | null
  observedName: string
  mappingVersionId: string | null
  trustedPresentation: boolean
  presentationSignature?: string | null
}

export type ProductMatch = {
  ingredientId: string | null
  mappingVersionId: string | null
  source: 'code' | 'exact_name' | 'alias' | 'fuzzy' | 'ambiguous' | 'unmatched'
  score: number
  alternatives: Array<{ ingredientId: string; score: number; name: string }>
  trustedPresentation: boolean
}

export function normalizeSupplierText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
    .split(' ').map((token) => /\d/.test(token) ? token.replace(/[OQ]/g, '0') : token).join(' ')
}

function nameKey(value: string): string {
  const normalized = normalizeSupplierText(value)
  // Algunos documentos incluyen un lote técnico largo delante del nombre.
  // Conservarlo en evidencia, pero comparar también el nombre sin ese prefijo.
  return normalized.replace(/^[A-Z0-9]{8,}\s+(?=[A-Z])/, (prefix) =>
    /\d/.test(prefix) ? '' : prefix)
}

function numericTokens(value: string): string {
  return nameKey(value).split(' ').filter((part) => /^\d/.test(part)).join('|')
}

function compatiblePresentationName(observed: string, remembered: string): boolean {
  return numericTokens(observed) === numericTokens(remembered)
}

function distance(left: string, right: string): number {
  const prior = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let diagonal = prior[0]!
    prior[0] = i
    for (let j = 1; j <= right.length; j++) {
      const old = prior[j]!
      prior[j] = Math.min(prior[j]! + 1, prior[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = old
    }
  }
  return prior[right.length]!
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  const maxLength = Math.max(left.length, right.length)
  if (maxLength < 6) return 0
  const edit = 1 - distance(left, right) / maxLength
  const a = new Set(left.split(' '))
  const b = new Set(right.split(' '))
  const overlap = [...a].filter((word) => b.has(word)).length
  const tokenScore = (2 * overlap) / (a.size + b.size)
  return Math.max(edit, edit * 0.8 + tokenScore * 0.2)
}

function unresolved(source: ProductMatch['source'], alternatives: ProductMatch['alternatives'] = []): ProductMatch {
  return { ingredientId: null, mappingVersionId: null, source, score: alternatives[0]?.score ?? 0,
    alternatives, trustedPresentation: false }
}

export function matchSupplierProduct(input: {
  supplierId: number
  productCode: string | null
  description: string
  memory: SupplierProductMemory[]
}): ProductMatch {
  const code = normalizeSupplierText(input.productCode ?? '').replace(/ /g, '')
  const name = nameKey(input.description)
  const rows = input.memory.filter((row) => row.supplierId === input.supplierId && row.ingredientId)

  const codeRows = code ? rows.filter((row) =>
    normalizeSupplierText(row.supplierProductCode ?? '').replace(/ /g, '') === code
    && compatiblePresentationName(input.description, row.observedName)) : []
  const codeIngredients = new Set(codeRows.map((row) => row.ingredientId))
  if (codeIngredients.size > 1) return unresolved('ambiguous', codeRows.map((row) =>
    ({ ingredientId: row.ingredientId, score: 1, name: row.observedName })))
  if (codeIngredients.size === 1) {
    const exactCodeRows = codeRows.filter((row) => nameKey(row.observedName) === name)
    return resolved(exactCodeRows.length ? exactCodeRows : codeRows, 'code', 1)
  }

  const exact = name ? rows.filter((row) => nameKey(row.observedName) === name) : []
  const exactIngredients = new Set(exact.map((row) => row.ingredientId))
  if (exactIngredients.size > 1) return unresolved('ambiguous', exact.map((row) =>
    ({ ingredientId: row.ingredientId, score: 1, name: row.observedName })))
  if (exactIngredients.size === 1) return resolved(exact, 'exact_name', 1)

  const byIngredient = new Map<string, { row: SupplierProductMemory; score: number }>()
  for (const row of rows) {
    const score = compatiblePresentationName(input.description, row.observedName)
      ? similarity(name, nameKey(row.observedName)) : 0
    const previous = byIngredient.get(row.ingredientId)
    if (!previous || score > previous.score ||
        (score === previous.score && row.trustedPresentation && !previous.row.trustedPresentation)) {
      byIngredient.set(row.ingredientId, { row, score })
    }
  }
  const ranked = [...byIngredient.values()].sort((a, b) => b.score - a.score)
  const alternatives = ranked.slice(0, 3).map(({ row, score }) =>
    ({ ingredientId: row.ingredientId, score, name: row.observedName }))
  const best = ranked[0]
  if (!best || best.score < 0.88) return unresolved('unmatched', alternatives)
  if (ranked[1] && best.score - ranked[1].score < 0.08) return unresolved('ambiguous', alternatives)
  // Una semejanza textual solo propone identidad. Nunca autoriza por sí sola
  // una recepción económica; los alias confiables entran como memoria exacta.
  return resolved([best.row], 'fuzzy', best.score, alternatives)
}

function resolved(rows: SupplierProductMemory[], source: ProductMatch['source'], score: number,
  alternatives: ProductMatch['alternatives'] = []): ProductMatch {
  const signatures = new Set(rows.filter((row) => row.trustedPresentation)
    .map((row) => row.presentationSignature ?? row.mappingVersionId).filter(Boolean))
  if (signatures.size > 1) return unresolved('ambiguous', rows.map((row) => ({
    ingredientId: row.ingredientId, score, name: row.observedName,
  })))
  const preferred = rows.find((row) => row.trustedPresentation && row.mappingVersionId) ?? rows[0]!
  return { ingredientId: preferred.ingredientId, mappingVersionId: preferred.mappingVersionId,
    source, score, alternatives, trustedPresentation: preferred.trustedPresentation }
}
