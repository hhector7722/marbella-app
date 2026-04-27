import { normalizeRecipeImportUnit, type MassVolumeUnit } from '@/lib/recipe-cost'

function normalizeForLangHeuristics(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function catalanSignalHits(s: string): number {
  const t = normalizeForLangHeuristics(s)

  // Señales fuertes (muy específicas de catalán)
  if (t.includes('·') || t.includes('ç')) return 99

  return [
    // conectores / gramática muy común en fichas
    /\bamb\b/,
    /\bdespres\b/,
    /\bmentre\b/,
    /\bperque\b/,
    /\bcal\b/,
    /\bben\b/,
    /\buna mica\b/,
    /\b(poseu|posar|posa|posar-hi)\b/,
    /\bafegiu\b/,
    /\bbarregeu\b/,
    /\btalleu\b/,
    /\bdeixeu\b/,
    /\bremeneu\b/,
    /\bfins que\b/,
    /\ba l[' ]/,
    /\bl[' ]/,
    /\bd[' ]/,

    // vocabulario típico de cocina en catalán
    /\bforn\b/,
    /\bcoure\b/,
    /\bsofregi(t|da)\b/,
    /\ball\b/,
    /\boli\b/,
    /\bjulivert\b/,

    // palabras de secciones (muy frecuentes en import)
    /\belaboracio\b/,
    /\bpresentacio\b/,
    /\bingredients\b/,

    // legacy (staff/manuales) que ya teníamos
    /\bnetejar\b/,
    /\baigua calenta\b/,
    /\bvaixella\b/,
    /\bcullereta\b/,
    /\bpaletina\b/,
    /\babocar\b/,
    /\bhi ha\b/,
  ].reduce((acc, re) => acc + (re.test(t) ? 1 : 0), 0)
}

/** Heurística simple para detectar texto probablemente en catalán (fichas típicas). */
export function isProbablyCatalan(s: string): boolean {
  // Con 2 señales evitamos falsos positivos en español.
  return catalanSignalHits(s) >= 2
}

export function parseNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(',', '.').trim()
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Cantidad y unidad para recipe_ingredients: convierte cl→ml; unidad final en set permitido por recipe-cost.
 */
export function parseQuantityAndUnit(
  qtyRaw: unknown,
  unitRaw: unknown
): { qty: number; unit: MassVolumeUnit } | null {
  const qty = parseNum(qtyRaw)
  if (qty === null || qty <= 0) return null
  const raw = String(unitRaw ?? 'kg').trim().toLowerCase()
  if (raw === 'cl' || raw === 'cls') {
    return { qty: qty * 10, unit: 'ml' }
  }
  const u = normalizeRecipeImportUnit(raw)
  const allowed: MassVolumeUnit[] = ['g', 'kg', 'ml', 'l', 'ud']
  if (!allowed.includes(u)) {
    return { qty, unit: 'kg' }
  }
  return { qty, unit: u }
}

/** Convierte pasos de IA (string | string[]) a texto guardado en BD (saltos de línea). */
export function elaborationPresentationToDb(raw: unknown): string {
  if (raw == null) return ''
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean).join('\n')
  }
  return String(raw).trim()
}
