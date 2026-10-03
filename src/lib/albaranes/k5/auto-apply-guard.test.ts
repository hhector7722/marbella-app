import assert from 'node:assert/strict'
import test from 'node:test'
import { commonAutoApplyBlockReason } from './auto-apply-guard.ts'

const ready = {
  reviewReasons: [], warnings: [], lineId: 'line', mappingVersionId: 'version',
  ingredientId: 'ingredient', lineQuantity: 2, observedUnitPrice: 3,
  physicalQuantity: 2, purchaseQuantity: 2, normalizedUnitPrice: 3,
  lineUnit: 'kg', baseUnit: 'kg', purchaseUnit: 'kg', mappingReusable: true,
  alreadyConfirmed: false, pendingOrder: false,
}

test('la puerta común bloquea pedidos pendientes aun con origen Mistral confiable', () => {
  assert.equal(commonAutoApplyBlockReason({ ...ready, pendingOrder: true }),
    'pending_order_requires_allocation')
})

test('la puerta común bloquea revisión, presentación y magnitudes incompletas', () => {
  assert.equal(commonAutoApplyBlockReason({ ...ready, reviewReasons: ['math_mismatch'] }),
    'review_reasons_present')
  assert.equal(commonAutoApplyBlockReason({ ...ready, mappingReusable: false }),
    'mapping_not_reusable_leaf')
  assert.equal(commonAutoApplyBlockReason({ ...ready, physicalQuantity: null }),
    'economic_magnitudes_incomplete')
})

test('solo una propuesta completa pasa al dry-run K4', () => {
  assert.equal(commonAutoApplyBlockReason(ready), null)
})
