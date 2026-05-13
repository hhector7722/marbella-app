/**
 * Modo per_pack: si el usuario declara compra por `ud` pero el tamaño por unidad
 * es volumen (ml, l, cl) o masa (g, kg), el coste homogéneo debe guardarse en
 * `purchase_unit` = `l` o `kg` para que el trigger y las recetas conviertan bien.
 * Caso típico: 7,61 €/botella y 740 ml por botella → €/L en catálogo.
 */

function norm(u: string | null | undefined): string {
  const s = String(u ?? '')
    .trim()
    .toLowerCase()
  if (s === 'u' || s === 'ud' || s === 'un' || s === 'unidad') return 'ud'
  if (s === 'lt' || s === 'l' || s === 'litro') return 'l'
  if (s === 'ml') return 'ml'
  if (s === 'cl') return 'cl'
  if (s === 'kg' || s === 'kilo') return 'kg'
  if (s === 'g' || s === 'gr') return 'g'
  return s
}

export function resolveDeclaredPurchaseUnitWithPackContent(
  declaredPurchaseUnit: string | null | undefined,
  packUnitSizeUnit: string | null | undefined
): string {
  const dec = norm(declaredPurchaseUnit)
  const sz = norm(packUnitSizeUnit)
  if (dec === 'ud') {
    if (sz === 'ml' || sz === 'l' || sz === 'cl') return 'l'
    if (sz === 'g' || sz === 'kg') return 'kg'
    return 'ud'
  }
  return dec || 'ud'
}
