/**
 * Conversión de unidades y coste de línea de receta.
 * El precio del ingrediente (current_price) es el del albarán del proveedor,
 * expresado por purchase_unit (€/kg, €/L, €/ud).
 * En la receta cada línea tiene quantity_gross + unit; se convierte a purchase_unit
 * y se multiplica por current_price.
 */

export type MassVolumeUnit = 'g' | 'kg' | 'ml' | 'l' | 'ud';

const MASS_UNITS: MassVolumeUnit[] = ['g', 'kg'];
const VOLUME_UNITS: MassVolumeUnit[] = ['ml', 'l'];
const COUNT_UNITS: MassVolumeUnit[] = ['ud'];

function normalizeUnit(u: string): MassVolumeUnit {
  const s = (u || '').trim().toLowerCase();
  if (s === 'l' || s === 'lt' || s === 'litro') return 'l';
  if (s === 'ml' || s === 'mililitro') return 'ml';
  if (s === 'kg' || s === 'kilo') return 'kg';
  if (s === 'g' || s === 'gr' || s === 'gramo') return 'g';
  if (s === 'ud' || s === 'u' || s === 'unidad' || s === 'un') return 'ud';
  return s as MassVolumeUnit;
}

/** Unidad canónica para líneas de receta importadas (g, kg, ml, l, ud). */
export function normalizeRecipeImportUnit(u: string): MassVolumeUnit {
  return normalizeUnit(u);
}

function unitDimension(unit: MassVolumeUnit): 'mass' | 'volume' | 'count' {
  if (MASS_UNITS.includes(unit)) return 'mass';
  if (VOLUME_UNITS.includes(unit)) return 'volume';
  return 'count';
}

/**
 * Convierte cantidad desde la unidad de la receta a la unidad de compra del ingrediente.
 * Devuelve null si las dimensiones no son compatibles (ej. g vs L).
 */
export function convertToPurchaseUnitQuantity(
  quantity: number,
  recipeUnit: string,
  purchaseUnit: string
): number | null {
  const from = normalizeUnit(recipeUnit);
  const to = normalizeUnit(purchaseUnit);
  if (unitDimension(from) !== unitDimension(to)) return null;

  if (from === to) return quantity;

  // masa: g <-> kg (1000)
  if (from === 'g' && to === 'kg') return quantity / 1000;
  if (from === 'kg' && to === 'g') return quantity * 1000;

  // volumen: ml <-> l (1000)
  if (from === 'ml' && to === 'l') return quantity / 1000;
  if (from === 'l' && to === 'ml') return quantity * 1000;

  // ud = ud
  return quantity;
}

/**
 * Coste de una línea de receta: cantidad (en unidad receta) convertida a unidad de compra × precio por unidad de compra.
 * Si la conversión no es posible (unidades incompatibles), devuelve 0.
 */
export function recipeLineCost(
  quantity: number,
  recipeUnit: string,
  purchaseUnit: string,
  currentPrice: number
): number {
  const converted = convertToPurchaseUnitQuantity(quantity, recipeUnit, purchaseUnit);
  if (converted == null || currentPrice == null) return 0;
  return converted * currentPrice;
}

/** Unidades disponibles para selector en recetas (masa, volumen, unidades). */
export const RECIPE_UNIT_OPTIONS: { value: MassVolumeUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'L' },
  { value: 'ud', label: 'ud' },
];

/** Unidades compatibles con la dimensión del ingrediente (purchase_unit). */
export function compatibleRecipeUnits(purchaseUnit: string): MassVolumeUnit[] {
  const u = normalizeUnit(purchaseUnit);
  if (MASS_UNITS.includes(u)) return MASS_UNITS;
  if (VOLUME_UNITS.includes(u)) return VOLUME_UNITS;
  return COUNT_UNITS;
}
