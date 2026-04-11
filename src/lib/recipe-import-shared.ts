import { normalizeRecipeImportUnit, type MassVolumeUnit } from '@/lib/recipe-cost'

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
