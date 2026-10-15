import assert from 'node:assert/strict'
import test from 'node:test'
import { verifiedReviewedWeightQuantity } from './reviewed-weight-quantity.ts'

const base = {
  reviewed: true,
  sourceQuantityRaw: '10',
  correctedQuantity: '7.74',
  sourceUnitPriceRaw: '11,95',
  effectiveUnitPrice: '11.9496',
  sourceLineTotalRaw: '92,49',
  correctedLineTotal: '92.49',
  hasAdjustments: false,
  lineBillingUnit: 'kg',
  lineContentUnit: 'kg',
  lineContentQty: 1,
  conversionFactor: 1,
}

test('accepts manager corrected weights when original price and amount reconcile', () => {
  assert.equal(verifiedReviewedWeightQuantity(base), true)
  assert.equal(verifiedReviewedWeightQuantity({
    ...base, correctedQuantity: '20.30', sourceUnitPriceRaw: '9,75',
    effectiveUnitPrice: '9.7502', sourceLineTotalRaw: '197,93', correctedLineTotal: '197.93',
  }), true)
  assert.equal(verifiedReviewedWeightQuantity({
    ...base, sourceQuantityRaw: '7.74', correctedQuantity: '6.59',
    sourceUnitPriceRaw: '5,90', effectiveUnitPrice: '5.8998',
    sourceLineTotalRaw: '38,88', correctedLineTotal: '38.88',
  }), true)
})

test('rejects unreviewed, contradictory and non-weight corrections', () => {
  assert.equal(verifiedReviewedWeightQuantity({ ...base, reviewed: false }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, correctedQuantity: '10' }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, correctedQuantity: '8' }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, correctedLineTotal: '92.50' }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, effectiveUnitPrice: '11.95' }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, hasAdjustments: true }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, lineBillingUnit: 'CA' }), false)
  assert.equal(verifiedReviewedWeightQuantity({ ...base, lineContentQty: 2 }), false)
})
