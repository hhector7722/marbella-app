import assert from 'node:assert/strict'
import test from 'node:test'
import { assessDocument, type PresentationMemory } from './assess.ts'
import type { CanonicalDocument } from '../extractors/canonical.ts'

const presentation: PresentationMemory = { supplierId: 7, ingredientId: 'cola', supplierProductCode: null,
  observedName: 'COCA COLA ZERO', mappingVersionId: 'm1', trustedPresentation: true,
  status: 'confirmed', conversionFactor: '1', lineBillingUnit: 'ud', lineContentQty: '1',
  lineContentUnit: 'ud', purchaseUnit: 'ud', baseUnit: 'ud' }

function document(line: Partial<CanonicalDocument['lines'][number]>): CanonicalDocument {
  return { supplier_name_raw: 'Proveedor', document_number_raw: '1', document_date_raw: null,
    currency_raw: 'EUR', subtotal_raw: '14,40', tax_raw: null, total_raw: null,
    lines: [{ page_index: 0, supplier_product_code_raw: null, description_raw: 'COCA COLA ZERO',
      quantity_raw: '24', billing_unit_raw: 'UD', package_count_raw: null,
      units_per_package_raw: null, content_per_unit_raw: null, content_unit_raw: null,
      unit_price_raw: '0,60', discount_raw: null, discount_header_raw: null,
      other_charge_raw: null, other_charge_header_raw: null, net_unit_price_raw: null,
      line_total_raw: '14,40', tax_rate_raw: null, ...line }] }
}

test('identidad probable, mapping confirmado y cuentas coherentes producen propuesta lista', () => {
  const result = assessDocument({ document: document({}), supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.readyCount, 1)
  assert.equal(result.lines[0]?.normalized?.purchaseQuantity, '24')
})

test('un aviso de totales del documento no bloquea una línea correcta', () => {
  const source = document({})
  source.subtotal_raw = '10,00'
  const result = assessDocument({ document: source, supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.deepEqual(result.documentReasons, ['lineas_subtotal_no_reconcilian'])
  assert.equal(result.lines[0]?.status, 'ready_for_review')
  assert.deepEqual(result.lines[0]?.reasons, [])
})

test('alias conocido sin presentación conserva candidato pero bloquea recepción', () => {
  const result = assessDocument({ document: document({}), supplierId: 7,
    memory: [presentation], presentations: [] })
  assert.equal(result.lines[0]?.ingredientId, 'cola')
  assert.equal(result.lines[0]?.mappingVersionId, 'm1')
  assert.ok(result.lines[0]?.reasons.includes('presentacion_sin_validar'))
})

test('una coincidencia solo parecida pide confirmar la identidad antes de K4', () => {
  const source = document({ description_raw: 'COCA COLA ZEROO' })
  const result = assessDocument({ document: source, supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.lines[0]?.status, 'needs_review')
  assert.ok(result.lines[0]?.reasons.includes('mapping_requires_human_review'))
})

test('importe que no reconcilia impide propuesta lista', () => {
  const result = assessDocument({ document: document({ line_total_raw: '17,40' }), supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.readyCount, 0)
  assert.ok(result.lines[0]?.reasons.includes('cantidad_precio_importe_no_reconcilian'))
})

test('Videla: la propuesta usa 10 kg y 5,56 €/kg del bulto impreso', () => {
  const chicken: PresentationMemory = { ...presentation, supplierId: 3,
    ingredientId: 'pechuga', observedName: 'POLLO CONG PECHUGA', mappingVersionId: 'pollo-m1',
    lineBillingUnit: 'kg', lineContentUnit: 'kg', purchaseUnit: 'kg', baseUnit: 'g' }
  const source = document({ description_raw: 'POLLO CONG PECHUGA', quantity_raw: '1,00',
    billing_unit_raw: 'BU 10,00 KG', unit_price_raw: '5,56', line_total_raw: '55,60' })
  source.subtotal_raw = '55,60'
  const result = assessDocument({ document: source, supplierId: 3,
    memory: [chicken], presentations: [chicken] })
  assert.equal(result.readyCount, 1)
  assert.equal(result.lines[0]?.economicQuantity, '10.000')
  assert.equal(result.lines[0]?.effectiveUnitPrice, '5.5600')
})
