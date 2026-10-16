import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewDiscountedLine } from './discounted-line.ts'

test('descuento íntegro permite coste cero, pero no descuadres', () => {
  const gift = { quantity: 1, grossUnitPrice: 15.43, discountPercent: 100, lineTotal: 0 }
  assert.deepEqual(reviewDiscountedLine(gift), { ...gift, effectiveUnitPrice: 0 })
  assert.equal(reviewDiscountedLine({ ...gift, lineTotal: 0.01 }), null)
  assert.equal(reviewDiscountedLine({ ...gift, discountPercent: 99 }), null)
})
