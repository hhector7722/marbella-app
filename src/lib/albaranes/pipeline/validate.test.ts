import assert from 'node:assert/strict'
import test from 'node:test'
import { validateObservedDocument, validateObservedLine } from './validate.ts'
import type { CanonicalDocument } from '../extractors/canonical.ts'

function row(fields: Partial<CanonicalDocument['lines'][number]>): CanonicalDocument['lines'][number] {
  return { page_index: 0, supplier_product_code_raw: null, description_raw: 'Producto',
    quantity_raw: null, billing_unit_raw: null, package_count_raw: null, units_per_package_raw: null,
    content_per_unit_raw: null, content_unit_raw: null, unit_price_raw: null, discount_raw: null,
    discount_header_raw: null, other_charge_raw: null, other_charge_header_raw: null,
    net_unit_price_raw: null, line_total_raw: null, tax_rate_raw: null, ...fields }
}

test('reconcilia cantidad, precio y descuento porcentual de Panabad', () => {
  const check = validateObservedLine(row({ quantity_raw: '10,000', unit_price_raw: '33,86',
    discount_raw: '38,00', discount_header_raw: '% Dto.', line_total_raw: '209,93' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.discountPercent, 38)
})

test('no trata Ibee de Santa Teresa como descuento', () => {
  const check = validateObservedLine(row({ quantity_raw: '72', unit_price_raw: '1.15',
    other_charge_raw: '2.16', other_charge_header_raw: 'Ibee', line_total_raw: '82.80' }))
  assert.deepEqual(check.reasons, [])
})

test('bloquea filas impresas sin cantidad entregada', () => {
  assert.ok(validateObservedLine(row({ unit_price_raw: '1', line_total_raw: '1' }))
    .reasons.includes('cantidad_ausente_o_invalida'))
})

test('reconcilia una caja de 10 kg con precio por kg', () => {
  const check = validateObservedLine(row({ quantity_raw: '1', billing_unit_raw: 'BU',
    content_per_unit_raw: '10', content_unit_raw: 'KG', unit_price_raw: '5,56', line_total_raw: '55,60' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.priceBasis, 'package_content')
})

test('bloquea total inconsistente y precio neto que es un porcentaje', () => {
  const check = validateObservedLine(row({ quantity_raw: '2', unit_price_raw: '43,98',
    net_unit_price_raw: '25', line_total_raw: '65,97' }))
  assert.ok(check.reasons.includes('cantidad_precio_importe_no_reconcilian'))
  assert.ok(check.reasons.includes('precio_neto_contradictorio'))
})

test('reconcilia IVA de documento sin convertir importe bruto en subtotal', () => {
  const doc: CanonicalDocument = { supplier_name_raw: null, document_number_raw: null,
    document_date_raw: null, currency_raw: null, subtotal_raw: '268,10', tax_raw: '27,38',
    total_raw: '295,48', lines: [row({ quantity_raw: '1', unit_price_raw: '268,10', line_total_raw: '268,10' })] }
  assert.deepEqual(validateObservedDocument(doc).reasons, [])
  assert.equal(validateObservedDocument({ ...doc, total_raw: '200,00' }).reasons[0], 'subtotal_iva_total_no_reconcilian')
})
