import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewDiscountedLine } from './discounted-line.ts'

test('Panabad: el precio efectivo sale del importe neto redondeado', () => {
  const result = reviewDiscountedLine({ quantity: 2, grossUnitPrice: 49.25,
    discountPercent: 25, lineTotal: 73.87 })
  assert.equal(result?.effectiveUnitPrice, 36.935)
  assert.equal(result?.effectiveUnitPrice.toFixed(2), '36.94')
  assert.equal(reviewDiscountedLine({ quantity: 2, grossUnitPrice: 49.25,
    discountPercent: 25, lineTotal: 23.87 }), null)
})

test('también concilia otras líneas y evita aplicar un descuento no verificado', () => {
  assert.equal(reviewDiscountedLine({ quantity: 5, grossUnitPrice: 33.86,
    discountPercent: 38, lineTotal: 104.97 })?.effectiveUnitPrice, 20.994)
  assert.equal(reviewDiscountedLine({ quantity: 2, grossUnitPrice: 43.98,
    discountPercent: 25, lineTotal: 65.97 })?.effectiveUnitPrice, 32.985)
  assert.equal(reviewDiscountedLine({ quantity: 2, grossUnitPrice: 49.25,
    discountPercent: 0, lineTotal: 73.87 }), null)
})
