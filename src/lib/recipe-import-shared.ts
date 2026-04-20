import { normalizeRecipeImportUnit, type MassVolumeUnit } from '@/lib/recipe-cost'

/** Heurística simple para detectar texto probablemente en catalán (fichas típicas). */
export function isProbablyCatalan(s: string): boolean {
  const t = (s || '').toLowerCase()
  return (
    t.includes('netejar') ||
    t.includes("d'aigua") ||
    t.includes('aigua calenta') ||
    t.includes('vaixella') ||
    t.includes("l'esquerre") ||
    t.includes('a l\'esquerre') ||
    t.includes('tassa') ||
    t.includes('cullereta') ||
    t.includes('paletina') ||
    t.includes('abocar') ||
    t.includes('comprobar') ||
    t.includes('hi ha')
  )
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
