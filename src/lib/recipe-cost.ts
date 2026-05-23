/**
 * Conversión de unidades y coste de línea de receta.
 * El precio del ingrediente (current_price) es el del albarán del proveedor,
 * expresado por purchase_unit (€/kg, €/L, €/ud).
 * En la receta cada línea tiene quantity_gross + unit; se convierte a purchase_unit
 * y se multiplica por current_price.
 *
 * SSOT precios vs albaranes: `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md`
 */

export type MassVolumeUnit = 'g' | 'kg' | 'ml' | 'l' | 'cl' | 'ud';

const MASS_UNITS: MassVolumeUnit[] = ['g', 'kg'];
const VOLUME_UNITS: MassVolumeUnit[] = ['ml', 'l', 'cl'];
const COUNT_UNITS: MassVolumeUnit[] = ['ud'];

function normalizeUnit(u: string): MassVolumeUnit {
  const s = (u || '').trim().toLowerCase();
  if (s === 'l' || s === 'lt' || s === 'litro') return 'l';
  if (s === 'ml' || s === 'mililitro') return 'ml';
  if (s === 'cl' || s === 'cls' || s === 'centilitro' || s === 'centilitros') return 'cl';
  if (s === 'kg' || s === 'kilo') return 'kg';
  if (s === 'g' || s === 'gr' || s === 'gramo') return 'g';
  if (s === 'ud' || s === 'u' || s === 'unidad' || s === 'un') return 'ud';
  return s as MassVolumeUnit;
}

/** Unidad canónica para líneas de receta importadas (g, kg, ml, l, cl, ud). */
export function normalizeRecipeImportUnit(u: string): MassVolumeUnit {
  return normalizeUnit(u);
}

function unitDimension(unit: MassVolumeUnit): 'mass' | 'volume' | 'count' {
  if (MASS_UNITS.includes(unit)) return 'mass';
  if (VOLUME_UNITS.includes(unit)) return 'volume';
  return 'count';
}

function volumeToMl(qty: number, u: MassVolumeUnit): number | null {
  if (u === 'ml') return qty
  if (u === 'l') return qty * 1000
  if (u === 'cl') return qty * 10
  return null
}

function volumeFromMl(ml: number, u: MassVolumeUnit): number | null {
  if (u === 'ml') return ml
  if (u === 'l') return ml / 1000
  if (u === 'cl') return ml / 10
  return null
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
  if (unitDimension(from) === 'mass') {
    if (from === 'g' && to === 'kg') return quantity / 1000;
    if (from === 'kg' && to === 'g') return quantity * 1000;
    return quantity;
  }

  // volumen: ml, l, cl (vía ml)
  if (unitDimension(from) === 'volume') {
    const asMl = volumeToMl(quantity, from);
    if (asMl == null) return null;
    return volumeFromMl(asMl, to);
  }

  // ud = ud
  return quantity;
}

/** Contexto de pack del ingrediente (misma idea que `staff_consumption_qty_to_purchase_unit` en BD). */
export type IngredientPackBridgeContext = {
  supplier_pricing_mode?: string | null
  pack_unit_size_qty?: number | null
  pack_unit_size_unit?: string | null
}

function isPerPackMode(mode: string | null | undefined): boolean {
  return String(mode ?? '')
    .trim()
    .toLowerCase() === 'per_pack'
}

/**
 * Igual que `convertToPurchaseUnitQuantity`, más puente **per_pack**:
 * - receta en **ud** y compra en masa/volumen: `cantidad_ud × tamaño_por_ud` en unidad de compra.
 * - receta en masa/volumen y compra en **ud**: `cantidad / tamaño_por_ud` (ud de compra).
 */
export function convertToPurchaseUnitQuantityWithPackBridge(
  quantity: number,
  recipeUnit: string,
  purchaseUnit: string,
  pack: IngredientPackBridgeContext | null | undefined
): number | null {
  const direct = convertToPurchaseUnitQuantity(quantity, recipeUnit, purchaseUnit)
  if (direct != null) return direct

  if (!isPerPackMode(pack?.supplier_pricing_mode)) return null

  const pq = Number(pack?.pack_unit_size_qty)
  const pUnitRaw = pack?.pack_unit_size_unit
  if (!Number.isFinite(pq) || pq <= 0 || pUnitRaw == null || !String(pUnitRaw).trim()) return null
  const pUnit = String(pUnitRaw)

  const from = normalizeUnit(recipeUnit)
  const to = normalizeUnit(purchaseUnit)

  // Puente A: receta ud → compra masa o volumen (p. ej. 2 ud × 330 ml/ud → L de compra)
  if (from === 'ud' && (MASS_UNITS.includes(to) || VOLUME_UNITS.includes(to))) {
    const piece = convertToPurchaseUnitQuantity(pq, pUnit, purchaseUnit)
    if (piece != null && piece > 0) return quantity * piece
    return null
  }

  // Puente B: receta masa/volumen → compra ud (p. ej. 50 g / 250 g por ud)
  if (to === 'ud' && (MASS_UNITS.includes(from) || VOLUME_UNITS.includes(from))) {
    if (unitDimension(normalizeUnit(pUnit)) !== unitDimension(from)) return null
    const pieceInRecipeUnit = convertToPurchaseUnitQuantity(pq, pUnit, recipeUnit)
    if (pieceInRecipeUnit == null || pieceInRecipeUnit <= 0) return null
    return quantity / pieceInRecipeUnit
  }

  return null
}

/**
 * Coste de una línea de receta: cantidad (en unidad receta) convertida a unidad de compra × precio por unidad de compra.
 * Si la conversión no es posible (unidades incompatibles), devuelve 0.
 */
export function recipeLineCost(
  quantity: number,
  recipeUnit: string,
  purchaseUnit: string,
  currentPrice: number,
  pack?: IngredientPackBridgeContext | null
): number {
  return getRecipeIngredientLineCostAnalysis(quantity, recipeUnit, purchaseUnit, currentPrice, pack).eur;
}

/** Por qué una línea de receta no muestra coste en euros (evita confundir con «gratis»). */
export type RecipeLineCostStatus = 'ok' | 'missing_price' | 'incompatible_units'

/**
 * Coste de línea + diagnóstico. No usa 0 € como señal de error: distingue precio ausente vs unidades incompatibles.
 */
export function getRecipeIngredientLineCostAnalysis(
  quantity: number,
  recipeUnit: string,
  purchaseUnit: string,
  currentPrice: number | null | undefined,
  pack?: IngredientPackBridgeContext | null
): { eur: number; status: RecipeLineCostStatus } {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty === 0) {
    return { eur: 0, status: 'ok' };
  }

  const converted = convertToPurchaseUnitQuantityWithPackBridge(qty, recipeUnit, purchaseUnit, pack);
  if (converted == null) {
    return { eur: 0, status: 'incompatible_units' };
  }

  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { eur: 0, status: 'missing_price' };
  }

  return { eur: converted * price, status: 'ok' };
}

/** Texto para `title` / accesibilidad cuando el coste no se muestra en euros. */
export function recipeLineCostStatusHint(status: RecipeLineCostStatus): string {
  if (status === 'missing_price') {
    return 'Sin precio de compra en el ingrediente. Edita el artículo en Ingredientes o asigna precio desde albarán.'
  }
  if (status === 'incompatible_units') {
    return 'No se puede convertir la unidad de la receta a la unidad de compra. Prueba: misma familia (g/kg, ml/cl/L, ud), o en ingrediente «por pack» indica tamaño por ud (p. ej. 330 ml). Si el albarán es €/kg, pon cantidad de línea en kg.'
  }
  return ''
}

/**
 * Coste de línea en la tabla de ingredientes de receta (solo lectura).
 * Si con 2 decimales aparecería como 0,00 pero el importe es positivo,
 * muestra decimales hasta el primer dígito distinto de cero (p. ej. 0.0045 → 0.004).
 * En caso contrario, dos decimales habituales.
 */
export function formatRecipeIngredientLineCostEur(cost: number): string {
  if (!Number.isFinite(cost)) return '0.00';
  if (cost <= 0) return cost.toFixed(2);
  const roundedToCent = parseFloat(cost.toFixed(2));
  if (roundedToCent > 0) return cost.toFixed(2);

  const raw = cost.toFixed(12);
  const parts = raw.split('.');
  const dec = parts[1] ?? '';
  let i = 0;
  while (i < dec.length && dec[i] === '0') i++;
  if (i >= dec.length) return cost.toFixed(2);
  const frac = dec.slice(0, i + 1);
  return `${parts[0]}.${frac}`;
}

/** Unidades disponibles para selector en recetas (masa, volumen, unidades). */
export const RECIPE_UNIT_OPTIONS: { value: MassVolumeUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'cl', label: 'cl' },
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

/** Unidad en receta por defecto a partir de la unidad de compra. */
export function defaultRecipeUnitFromPurchase(purchaseUnit: string): MassVolumeUnit {
  const normalized = normalizeUnit(purchaseUnit || 'kg');
  const compatible = compatibleRecipeUnits(purchaseUnit || 'kg');
  if (compatible.includes(normalized)) return normalized;
  return compatible[0] ?? 'kg';
}

/** Unidad configurada en catálogo o, si falta, derivada de purchase_unit. */
export function resolveIngredientRecipeUnit(
  recipeUnit: string | null | undefined,
  purchaseUnit: string,
): MassVolumeUnit {
  const raw = String(recipeUnit ?? '').trim();
  if (raw) return normalizeRecipeImportUnit(raw);
  return defaultRecipeUnitFromPurchase(purchaseUnit || 'kg');
}
