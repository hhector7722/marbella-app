/**
 * Emparejamiento de nombres de líneas de albarán (OCR/IA) con ingredientes de la BD.
 */

export type IngredientRow = { id: string; name: string; current_price: number; purchase_unit: string }

export type MatchCandidate = { id: string; name: string; score: number }

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(dp[i - 1]![j] + 1, dp[i]![j - 1] + 1, dp[i - 1]![j - 1] + cost)
    }
  }
  return dp[m]![n]!
}

function scoreMatch(extracted: string, ingredientName: string): number {
  const e = normalizeName(extracted)
  const n = normalizeName(ingredientName)
  if (!e || !n) return 0
  if (e === n) return 100
  if (n.includes(e) || e.includes(n)) return 88
  const te = new Set(e.split(' ').filter(Boolean))
  const tn = new Set(n.split(' ').filter(Boolean))
  let inter = 0
  for (const t of te) if (tn.has(t)) inter++
  const union = new Set([...te, ...tn]).size
  const jaccard = union ? inter / union : 0
  let s = jaccard * 75
  const maxLen = Math.max(e.length, n.length)
  if (maxLen > 0) {
    const dist = levenshtein(e, n)
    s = Math.max(s, (1 - dist / maxLen) * 65)
  }
  return Math.min(100, Math.round(s * 10) / 10)
}

/**
 * Devuelve candidatos ordenados por score descendente (máx. 8).
 * Si los dos mejores están a menos de 8 puntos y ambos > 40, se mantienen ambos como “ambiguo”.
 */
export function matchIngredientCandidates(
  extractedName: string,
  ingredients: IngredientRow[],
  maxCandidates = 8
): MatchCandidate[] {
  const scored = ingredients
    .map((ing) => ({
      id: ing.id,
      name: ing.name,
      score: scoreMatch(extractedName, ing.name),
    }))
    .filter((x) => x.score > 12)
    .sort((a, b) => b.score - a.score)

  const top = scored.slice(0, maxCandidates)
  return top
}

export function pickSuggestedCandidate(candidates: MatchCandidate[]): string | null {
  if (candidates.length === 0) return null
  const best = candidates[0]!
  if (best.score < 42) return null
  if (candidates.length >= 2) {
    const second = candidates[1]!
    if (best.score - second.score < 8 && second.score >= 40) return null
  }
  return best.id
}

/** Unidad de compra alineada con `STANDARD_UNITS` en ingredientes (kg, g, l, ml, cl, u). */
export function canonicalPurchaseUnit(raw: string | undefined | null): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!s) return 'kg'
  if (['kg', 'kilo', 'kilos'].includes(s)) return 'kg'
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(s)) return 'g'
  if (['l', 'lt', 'litro', 'litros'].includes(s)) return 'l'
  if (['ml', 'mililitro', 'mililitros'].includes(s)) return 'ml'
  if (['cl', 'cls', 'centilitro', 'centilitros'].includes(s)) return 'cl'
  if (['ud', 'uds', 'u', 'un', 'unidad', 'unidades', 'bote', 'botes', 'pieza', 'piezas'].includes(s)) return 'u'
  return 'kg'
}

/**
 * Convierte precio leído del documento a € / unidad_canónica.
 * Si el modelo ya devuelve precio por kg y unidad kg, no tocar.
 * Si devuelve €/g, convertir a €/kg multiplicando por 1000.
 */
export function normalizePriceToCanonicalUnit(
  priceRaw: number,
  unitRaw: string | undefined | null
): { price: number; unit: string } {
  const u = canonicalPurchaseUnit(unitRaw)
  let p = Number.isFinite(priceRaw) ? priceRaw : 0
  if (u === 'g') {
    return { price: p * 1000, unit: 'kg' }
  }
  if (u === 'ml') {
    return { price: p * 1000, unit: 'l' }
  }
  if (u === 'cl') {
    return { price: p * 100, unit: 'l' }
  }
  return { price: p, unit: u }
}
