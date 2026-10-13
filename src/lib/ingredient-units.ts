/** Unidad física de stock exigida por K4 para cada unidad de compra. */
export function canonicalBaseUnitForPurchaseUnit(unit: string): 'g' | 'ml' | 'ud' | 'm' | null {
  const normalized = String(unit ?? '').trim().toLowerCase()
  if (normalized === 'kg' || normalized === 'g') return 'g'
  if (normalized === 'l' || normalized === 'ml' || normalized === 'cl') return 'ml'
  if (normalized === 'ud') return 'ud'
  if (['m', 'mt', 'mts', 'mts.', 'metro', 'metros'].includes(normalized)) return 'm'
  return null
}
