import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectDocumentReviewReasons,
  currentDocumentWarnings,
  documentReviewReasons,
  isDocumentOnlyReview,
} from './document-review.ts'
import type { CanonicalDocument } from '../extractors/canonical.ts'

test('separa el aviso documental de las acciones de cada producto', () => {
  const row = {
    reviewReasons: ['presentacion_sin_validar', 'lineas_subtotal_no_reconcilian'],
    warnings: ['lineas_subtotal_no_reconcilian'],
  }
  assert.deepEqual(documentReviewReasons(row), ['lineas_subtotal_no_reconcilian'])
  assert.equal(isDocumentOnlyReview(row), false)
})

test('no exige revisar cada línea cuando solo bloquea el documento completo', () => {
  const row = {
    reviewReasons: ['total_documento_no_verificable'],
    warnings: ['total_documento_no_verificable'],
  }
  assert.equal(isDocumentOnlyReview(row), true)
  assert.deepEqual(collectDocumentReviewReasons([row, row]), ['total_documento_no_verificable'])
})

test('un albarán anterior con dos bases de IVA deja de mostrar avisos falsos sin cambiar su evidencia', () => {
  const line = (amount: string): CanonicalDocument['lines'][number] => ({
    page_index: 0, supplier_product_code_raw: null, description_raw: 'Artículo',
    quantity_raw: '1', billing_unit_raw: 'ud', package_count_raw: null,
    units_per_package_raw: null, content_per_unit_raw: null, content_unit_raw: null,
    unit_price_raw: amount, discount_raw: null, discount_header_raw: null,
    other_charge_raw: null, other_charge_header_raw: null, net_unit_price_raw: null,
    line_total_raw: amount, tax_rate_raw: null,
  })
  const document: CanonicalDocument = {
    supplier_name_raw: null, document_number_raw: null, document_date_raw: null,
    currency_raw: null, subtotal_raw: '56,91', tax_raw: '3,18', total_raw: '69,17',
    lines: [line('56,91'), line('9,08')],
  }
  const stored = ['subtotal_iva_total_no_reconcilian', 'lineas_subtotal_no_reconcilian']
  assert.deepEqual(currentDocumentWarnings(stored, document), [])
  assert.deepEqual(stored, ['subtotal_iva_total_no_reconcilian', 'lineas_subtotal_no_reconcilian'])
  assert.deepEqual(currentDocumentWarnings(stored, { ...document, total_raw: '70,00' }), stored)
})
