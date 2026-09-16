import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMappingAssistantSuggestions } from './mapping-assistant.ts'
import { canonicalSupplierItemKey, stripSupplierTechnicalPrefix } from './supplier-item-key.ts'

const ingredients = [
  { id: 'atun', name: 'Atún', current_price: 6.66, purchase_unit: 'kg', base_unit: 'g' },
  { id: 'huevos', name: 'Huevos', current_price: 0.2075, purchase_unit: 'ud', base_unit: 'ud' },
  { id: 'mezclum', name: 'Mezclum', current_price: 8.98, purchase_unit: 'kg', base_unit: 'g' },
  { id: 'naranja', name: 'Naranja', current_price: 2.13, purchase_unit: 'kg', base_unit: 'g' },
  { id: 'aquarius', name: 'Aquarius naranja', current_price: 2.6, purchase_unit: 'ud', base_unit: 'ud' },
  { id: 'patata', name: 'Patata agria', current_price: 0.91, purchase_unit: 'kg', base_unit: 'g' },
  { id: 'arroz', name: 'Arroz', current_price: 1.73, purchase_unit: 'kg', base_unit: 'g' },
]

const legacyMappings = [
  {
    supplier_item_name: 'Atun Aceite Bolsa 1 Kg', ingredient_id: 'atun', conversion_factor: 1,
    line_billing_unit: 'ud', line_content_qty: 1, line_content_unit: 'kg',
  },
  {
    supplier_item_name: 'Huevos Granja Medida L 12 uds', ingredient_id: 'huevos', conversion_factor: 0.0833,
    line_billing_unit: 'ud', line_content_qty: 12, line_content_unit: 'ud',
  },
  {
    supplier_item_name: 'Ensalada Mezclum 7 Brotes Bolsa 500 g', ingredient_id: 'mezclum', conversion_factor: 1,
    line_billing_unit: 'bolsa', line_content_qty: 0.5, line_content_unit: 'kg',
  },
  {
    supplier_item_name: 'Naranja Postre', ingredient_id: 'aquarius', conversion_factor: 1,
    line_billing_unit: 'kg', line_content_qty: 1, line_content_unit: 'ud',
  },
  {
    supplier_item_name: 'Patata Agria Saco Entero 10 Kg', ingredient_id: 'patata', conversion_factor: 1,
    line_billing_unit: 'kg', line_content_qty: 1, line_content_unit: 'kg',
  },
]

function row(proposalId: string, sourceItemName: string, lineUnit: string) {
  return { proposalId, lineId: `line-${proposalId}`, sourceItemName, lineUnit, reviewReasons: ['mapping_missing'] }
}

test('Ametller elimina códigos técnicos variables de la clave estable', () => {
  assert.equal(stripSupplierTechnicalPrefix('A403D260915 Tomate Pera Extra', 1), 'Tomate Pera Extra')
  assert.equal(stripSupplierTechnicalPrefix('A00260915 Patata Monalisa Saco Entero 10 Kg', 1), 'Patata Monalisa Saco Entero 10 Kg')
  assert.equal(stripSupplierTechnicalPrefix('L092615C03BAtunAceite Bolsa 1Kg', 1), 'AtunAceite Bolsa 1Kg')
  assert.equal(stripSupplierTechnicalPrefix('B260915Ensalada Mezclum7Brotes Bolsa 500g', 1), 'Ensalada Mezclum7Brotes Bolsa 500g')
  assert.equal(canonicalSupplierItemKey('A4041260915Limon1', 1), 'limon1')
  assert.equal(stripSupplierTechnicalPrefix('A00260915 producto', 99), 'A00260915 producto')
})

test('descarta el legacy erróneo de Naranja y propone el ingrediente de catálogo compatible', () => {
  const result = buildMappingAssistantSuggestions({
    supplierId: 1,
    rows: [row('naranja-row', 'A4051260915 Naranja Postre', 'kg')],
    ingredients,
    legacyMappings,
  })
  assert.equal(result.suggestions.length, 1)
  assert.equal(result.suggestions[0]!.ingredientId, 'naranja')
  assert.equal(result.suggestions[0]!.source, 'catalog_name')
  assert.equal(result.suggestions[0]!.conversionFactor, 1)
  assert.match(result.suggestions[0]!.note ?? '', /mapping antiguo/i)
})

test('recalcula la presentación desde la evidencia y no hereda factores legacy incorrectos', () => {
  const result = buildMappingAssistantSuggestions({
    supplierId: 1,
    rows: [
      row('huevos-row', 'L092615C15 HuevosCamperos 12uds', 'UNI'),
      row('mezclum-row', 'B260915Ensalada Mezclum7Brotes Bolsa 500g', 'BOL'),
      row('atun-row', 'L092615C03B AtunAceite Bolsa 1Kg', 'UNI'),
    ],
    ingredients,
    legacyMappings,
  })

  const huevos = result.suggestions.find((item) => item.proposalId === 'huevos-row')!
  assert.equal(huevos.ingredientId, 'huevos')
  assert.equal(huevos.lineContentQty, 12)
  assert.equal(huevos.lineContentUnit, 'ud')
  assert.equal(huevos.conversionFactor, 12)

  const mezclum = result.suggestions.find((item) => item.proposalId === 'mezclum-row')!
  assert.equal(mezclum.ingredientId, 'mezclum')
  assert.equal(mezclum.lineBillingUnit, 'bag')
  assert.equal(mezclum.lineContentQty, 500)
  assert.equal(mezclum.lineContentUnit, 'g')
  assert.equal(mezclum.conversionFactor, 0.5)

  const atun = result.suggestions.find((item) => item.proposalId === 'atun-row')!
  assert.equal(atun.ingredientId, 'atun')
  assert.equal(atun.conversionFactor, 1)
})

test('si factura por kg, el tamaño del saco no multiplica otra vez la cantidad', () => {
  const result = buildMappingAssistantSuggestions({
    supplierId: 1,
    rows: [row('patata-row', 'A02260915 Patata Agria Saco Entero 10Kg', 'kg')],
    ingredients,
    legacyMappings,
  })
  const suggestion = result.suggestions[0]!
  assert.equal(suggestion.ingredientId, 'patata')
  assert.equal(suggestion.lineContentQty, 1)
  assert.equal(suggestion.lineContentUnit, 'kg')
  assert.equal(suggestion.conversionFactor, 1)
})

test('no inventa un ingrediente cuando no hay candidato único y seguro', () => {
  const result = buildMappingAssistantSuggestions({
    supplierId: 1,
    rows: [row('pan-row', 'L092615C12B PanRalladoSANTA RITA 500g', 'UNI')],
    ingredients,
    legacyMappings,
  })
  assert.equal(result.suggestions.length, 0)
  assert.equal(result.unresolved.length, 1)
  assert.equal(result.unresolved[0]!.proposalId, 'pan-row')
})
