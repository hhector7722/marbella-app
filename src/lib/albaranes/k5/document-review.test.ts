import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectDocumentReviewReasons,
  documentReviewReasons,
  isDocumentOnlyReview,
} from './document-review.ts'

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
