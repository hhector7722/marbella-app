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

test('Videla: un bulto con 10 kg impresos en la unidad se factura por peso', () => {
  const check = validateObservedLine(row({ quantity_raw: '1,00', billing_unit_raw: 'BU 10,00 KG',
    unit_price_raw: '5,56', line_total_raw: '55,60' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.packageContent, 10)
  assert.equal(check.priceBasis, 'package_content')
  assert.ok(validateObservedLine(row({ quantity_raw: '2', billing_unit_raw: 'BU 10,00 KG',
    unit_price_raw: '5,56', line_total_raw: '111,20' })).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
})

test('Santa Teresa: Importe es el total y Pre+Iva el precio de una unidad', () => {
  const check = validateObservedLine(row({ quantity_raw: '600', unit_price_raw: '0.54',
    tax_rate_raw: '21.0', line_total_raw: '0.65', other_charge_raw: '324.00',
    other_charge_header_raw: 'Importe', discount_raw: '1.58', discount_header_raw: 'Ibee' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.lineTotal, 324)
  assert.equal(check.priceBasis, 'billing_quantity')
  assert.ok(validateObservedLine(row({ quantity_raw: '600', unit_price_raw: '0.54',
    tax_rate_raw: '21.0', line_total_raw: '0.65', other_charge_raw: '300.00',
    other_charge_header_raw: 'Importe' })).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
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

test('impide recepción automática sin importe de control y compara subtotal aun sin IVA', () => {
  const doc: CanonicalDocument = { supplier_name_raw: null, document_number_raw: null,
    document_date_raw: null, currency_raw: null, subtotal_raw: null, tax_raw: null,
    total_raw: null, lines: [row({ quantity_raw: '1', unit_price_raw: '5', line_total_raw: '5' })] }
  assert.ok(validateObservedDocument(doc).reasons.includes('total_documento_no_verificable'))
  assert.ok(validateObservedDocument({ ...doc, subtotal_raw: '6' }).reasons
    .includes('lineas_subtotal_no_reconcilian'))
  assert.deepEqual(validateObservedDocument({ ...doc, subtotal_raw: '5' }).reasons, [])
})
