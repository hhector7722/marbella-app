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
