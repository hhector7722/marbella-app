import assert from 'node:assert/strict'
import test from 'node:test'
import { isPassiveLineReviewAction, lineReviewActionLabel } from './line-review-action.ts'

test('SANILEC: sin total de documento la línea K5 sigue siendo revisable', () => {
  const documentOnly = {
    disposition: 'needs_review' as const,
    confirmed: false,
    warnings: ['total_documento_no_verificable'],
    reviewReasons: ['total_documento_no_verificable'],
  }
  assert.equal(lineReviewActionLabel(documentOnly), 'Revisar')
  assert.equal(isPassiveLineReviewAction(documentOnly, false), false)
})

test('la confirmación conserva su botón y la recepción previa permanece pasiva', () => {
  assert.equal(lineReviewActionLabel({ disposition: 'ready', confirmed: false }), 'Confirmar')
  assert.equal(isPassiveLineReviewAction({ disposition: 'ready', confirmed: false }, false), false)
  assert.equal(lineReviewActionLabel({ disposition: 'needs_mapping', confirmed: false }), 'Mapear')
  assert.equal(isPassiveLineReviewAction({ disposition: 'confirmed', confirmed: true }, false), true)
  assert.equal(isPassiveLineReviewAction({ disposition: 'needs_review', confirmed: false }, true), true)
})
