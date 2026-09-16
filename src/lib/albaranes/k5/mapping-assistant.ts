import { matchIngredientCandidates, type IngredientRow } from '../../albaran-price-match.ts'
import { canonicalSupplierItemKey, stripSupplierTechnicalPrefix } from './supplier-item-key.ts'

export type MappingAssistantIngredient = IngredientRow & {
  base_unit: string
}

export type MappingAssistantLegacy = {
  supplier_item_name: string
  ingredient_id: string
  conversion_factor: number | null
  line_billing_unit: string | null
  line_content_qty: number | null
  line_content_unit: string | null
}

export type MappingAssistantRow = {
  proposalId: string
  lineId: string
  sourceItemName: string
  lineUnit: string | null
  reviewReasons: string[]
}

export type MappingAssistantSuggestion = {
  proposalId: string
  lineId: string
  sourceItemName: string
  ingredientId: string
  ingredientName: string
  source: 'legacy_validated' | 'catalog_name'
  score: number
  lineBillingUnit: string
  lineContentQty: number
  lineContentUnit: string
  conversionFactor: number
  purchaseUnit: string
  baseUnit: string
  note: string | null
}

export type MappingAssistantUnresolved = {
  proposalId: string
  lineId: string
  sourceItemName: string
  reason: string
}

type Dimensional = Pick<
  MappingAssistantSuggestion,
  'lineBillingUnit' | 'lineContentQty' | 'lineContentUnit' | 'conversionFactor'
>

function unit(value: string | null | undefined): 'kg' | 'g' | 'l' | 'ml' | 'cl' | 'ud' | 'bag' | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (['kg', 'kilo', 'kilos'].includes(normalized)) return 'kg'
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(normalized)) return 'g'
  if (['l', 'lt', 'litro', 'litros'].includes(normalized)) return 'l'
  if (['ml', 'mililitro', 'mililitros'].includes(normalized)) return 'ml'
  if (['cl', 'centilitro', 'centilitros'].includes(normalized)) return 'cl'
  if (['ud', 'uds', 'u', 'un', 'uni', 'unidad', 'unidades'].includes(normalized)) return 'ud'
  if (['bol', 'bolsa', 'bolsas', 'bag'].includes(normalized)) return 'bag'
  return null
}

function family(value: string): 'mass' | 'volume' | 'unit' | null {
  const u = unit(value)
  if (u === 'kg' || u === 'g') return 'mass'
  if (u === 'l' || u === 'ml' || u === 'cl') return 'volume'
  if (u === 'ud') return 'unit'
  return null
}

function convert(quantity: number, fromRaw: string, toRaw: string): number | null {
  const from = unit(fromRaw)
  const to = unit(toRaw)
  if (!from || !to || from === 'bag' || to === 'bag') return null
  if (from === to) return quantity
  if (from === 'kg' && to === 'g') return quantity * 1000
  if (from === 'g' && to === 'kg') return quantity / 1000
  if (from === 'l' && to === 'ml') return quantity * 1000
  if (from === 'l' && to === 'cl') return quantity * 100
  if (from === 'ml' && to === 'l') return quantity / 1000
  if (from === 'ml' && to === 'cl') return quantity / 10
  if (from === 'cl' && to === 'l') return quantity / 100
  if (from === 'cl' && to === 'ml') return quantity * 10
  return null
}

function packageMeasure(sourceItemName: string, supplierId: number): { qty: number; unit: string } | null {
  const clean = stripSupplierTechnicalPrefix(sourceItemName, supplierId)
  const matches = [...clean.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|grs?|g|litros?|lt|l|ml|cl|uds?|unidades?)\b/gi)]
  if (matches.length === 0) return null
  const match = matches.at(-1)!
  const qty = Number(String(match[1]).replace(',', '.'))
  const canonical = unit(match[2])
  if (!Number.isFinite(qty) || qty <= 0 || !canonical || canonical === 'bag') return null
  return { qty, unit: canonical }
}

function deriveDimensional(
  row: MappingAssistantRow,
  ingredient: MappingAssistantIngredient,
  supplierId: number
): Dimensional | null {
  const line = unit(row.lineUnit)
  const purchase = unit(ingredient.purchase_unit)
  if (!purchase || purchase === 'bag') return null

  // Si el propio albarán factura por kg/l/ud, esa unidad manda. El texto de
  // presentación (p. ej. "saco 10 kg") es informativo y no multiplica otra vez.
  if (line && line !== 'bag' && family(line) && family(line) === family(purchase)) {
    const factor = convert(1, line, purchase)
    if (factor == null || !Number.isFinite(factor) || factor <= 0) return null
    return {
      lineBillingUnit: line,
      lineContentQty: 1,
      lineContentUnit: line,
      conversionFactor: factor,
    }
  }

  // Si factura por unidad/bolsa, el contenido explícito del nombre permite
  // construir una presentación exacta: 1 kg, 500 g, 12 uds, etc. Algunos
  // extractores antiguos no conservaron BOL como lineUnit; "Bolsa" en el
  // nombre es suficiente para proponer bag, pero sigue requiriendo aprobación.
  const pack = packageMeasure(row.sourceItemName, supplierId)
  if (pack) {
    const factor = convert(pack.qty, pack.unit, purchase)
    if (factor != null && Number.isFinite(factor) && factor > 0) {
      const explicitBag = /\bbolsa\b/i.test(stripSupplierTechnicalPrefix(row.sourceItemName, supplierId))
      return {
        lineBillingUnit: line === 'bag' || (!line && explicitBag)
          ? 'bag'
          : (line === 'ud' ? 'ud' : String(row.lineUnit ?? 'ud').trim().toLowerCase()),
        lineContentQty: pack.qty,
        lineContentUnit: pack.unit,
        conversionFactor: factor,
      }
    }
  }

  if (line === 'ud' && purchase === 'ud') {
    return {
      lineBillingUnit: 'ud',
      lineContentQty: 1,
      lineContentUnit: 'ud',
      conversionFactor: 1,
    }
  }

  return null
}

function uniqueEnough(scores: Array<{ score: number }>, minScore: number): boolean {
  const best = scores[0]
  if (!best || best.score < minScore) return false
  const second = scores[1]
  if (!second) return true
  return best.score - second.score >= 8 || second.score < 40
}

function ingredientScore(sourceItemName: string, ingredient: MappingAssistantIngredient, supplierId: number): number {
  return matchIngredientCandidates(stripSupplierTechnicalPrefix(sourceItemName, supplierId), [ingredient], 1)[0]?.score ?? 0
}

export function buildMappingAssistantSuggestions(params: {
  supplierId: number
  rows: MappingAssistantRow[]
  ingredients: MappingAssistantIngredient[]
  legacyMappings: MappingAssistantLegacy[]
}): { suggestions: MappingAssistantSuggestion[]; unresolved: MappingAssistantUnresolved[] } {
  const ingredientById = new Map(params.ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const suggestions: MappingAssistantSuggestion[] = []
  const unresolved: MappingAssistantUnresolved[] = []

  for (const row of params.rows) {
    const cleanedName = stripSupplierTechnicalPrefix(row.sourceItemName, params.supplierId)
    const legacyPseudo: IngredientRow[] = params.legacyMappings.map((mapping, index) => ({
      id: String(index),
      name: stripSupplierTechnicalPrefix(mapping.supplier_item_name, params.supplierId),
      current_price: 0,
      purchase_unit: '',
    }))
    const legacyMatches = matchIngredientCandidates(cleanedName, legacyPseudo, 4)
    const legacyMatch = uniqueEnough(legacyMatches, 70) ? legacyMatches[0] : null
    let legacyRejected = false

    if (legacyMatch) {
      const legacy = params.legacyMappings[Number(legacyMatch.id)]
      const ingredient = legacy ? ingredientById.get(legacy.ingredient_id) : null
      if (legacy && ingredient && ingredientScore(row.sourceItemName, ingredient, params.supplierId) >= 80) {
        const dimensional = deriveDimensional(row, ingredient, params.supplierId)
        if (dimensional) {
          suggestions.push({
            proposalId: row.proposalId,
            lineId: row.lineId,
            sourceItemName: row.sourceItemName,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            source: 'legacy_validated',
            score: legacyMatch.score,
            ...dimensional,
            purchaseUnit: ingredient.purchase_unit,
            baseUnit: ingredient.base_unit,
            note: null,
          })
          continue
        }
      }
      legacyRejected = true
    }

    const catalogMatches = matchIngredientCandidates(cleanedName, params.ingredients, 4)
    const catalogMatch = uniqueEnough(catalogMatches, 80) ? catalogMatches[0] : null
    const ingredient = catalogMatch ? ingredientById.get(catalogMatch.id) : null
    const dimensional = ingredient ? deriveDimensional(row, ingredient, params.supplierId) : null

    if (catalogMatch && ingredient && dimensional) {
      suggestions.push({
        proposalId: row.proposalId,
        lineId: row.lineId,
        sourceItemName: row.sourceItemName,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        source: 'catalog_name',
        score: catalogMatch.score,
        ...dimensional,
        purchaseUnit: ingredient.purchase_unit,
        baseUnit: ingredient.base_unit,
        note: legacyRejected ? 'El mapping antiguo se descartó por incompatibilidad de producto o presentación.' : null,
      })
      continue
    }

    const key = canonicalSupplierItemKey(row.sourceItemName, params.supplierId)
    unresolved.push({
      proposalId: row.proposalId,
      lineId: row.lineId,
      sourceItemName: row.sourceItemName,
      reason: key
        ? 'No hay un candidato único con nombre y presentación suficientemente seguros.'
        : 'No se pudo obtener una clave estable del producto.',
    })
  }

  return { suggestions, unresolved }
}
