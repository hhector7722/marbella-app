import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSupplierMemory, type VersionRow } from './memory.ts'

const confirmed: VersionRow = {
  id: 'confirmed', legacy_mapping_id: null, supplier_id: 7,
  supplier_item_name: 'TOMATE RAMA 5 KG', ingredient_id: 'tomate',
  conversion_factor: 5, line_billing_unit: 'caja',
  line_content_qty: 5, line_content_unit: 'kg',
  status: 'confirmed', supersedes_id: null, idempotency_key: null,
}

test('una propuesta posterior no borra la presentación confirmada de la memoria', () => {
  const memory = buildSupplierMemory({
    legacy: [], ingredients: [{ id: 'tomate', purchase_unit: 'kg', base_unit: 'g' }],
    versions: [confirmed, { ...confirmed, id: 'draft', status: 'proposed',
      supersedes_id: 'confirmed', line_content_qty: 12 }],
    observedCodes: [{ mapping_version_id: 'confirmed',
      observed: { supplier_product_code_raw: 'TOM-5' } }],
  })
  assert.equal(memory.presentations.length, 1)
  assert.equal(memory.presentations[0]?.mappingVersionId, 'confirmed')
  assert.equal(memory.presentations[0]?.supplierProductCode, 'TOM-5')
})

test('una corrección confirmada sustituye la presentación anterior', () => {
  const memory = buildSupplierMemory({
    legacy: [], ingredients: [{ id: 'tomate', purchase_unit: 'kg', base_unit: 'g' }],
    versions: [confirmed, { ...confirmed, id: 'corrected', status: 'confirmed',
      supersedes_id: 'confirmed', line_content_qty: 12 }],
  })
  assert.deepEqual(memory.presentations.map((row) => row.mappingVersionId), ['corrected'])
})


test('no reutiliza mapeos legacy de ingredientes archivados', () => {
  const oldIngredient = 'ingrediente-archivado'
  const activeIngredient = 'ingrediente-activo'
  const memory = buildSupplierMemory({
    legacy: [
      { id: 'legacy-old', supplier_id: 7, supplier_item_name: 'LECHE OBSOLETA', ingredient_id: oldIngredient },
      { id: 'legacy-active', supplier_id: 7, supplier_item_name: 'LECHE ACTUAL', ingredient_id: activeIngredient },
    ],
    ingredients: [{ id: activeIngredient, purchase_unit: 'l', base_unit: 'ml' }],
    versions: [
      { ...confirmed, id: 'old-version', legacy_mapping_id: 'legacy-old',
        supplier_item_name: 'LECHE OBSOLETA', ingredient_id: oldIngredient },
      { ...confirmed, id: 'active-version', legacy_mapping_id: 'legacy-active',
        supplier_item_name: 'LECHE ACTUAL', ingredient_id: activeIngredient },
    ],
  })
  assert.equal(memory.identities.some((item) => item.ingredientId === oldIngredient), false)
  assert.equal(memory.presentations.some((item) => item.ingredientId === oldIngredient), false)
  assert.equal(memory.identities.some((item) => item.ingredientId === activeIngredient), true)
})
