import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateManualDiscount } from './manual-discount.ts'

test('BONKA: descuento manual de 15,43 € deja una caja en 0 €', () => {
  assert.deepEqual(calculateManualDiscount({
    quantity: 1, baseUnitPrice: 15.43, discountPerUnit: 15.43,
  }), { baseUnitPrice: 15.43, discountPerUnit: 15.43, finalUnitPrice: 0, lineTotal: 0 })
})

test('descuento adicional sobre descuento automático existente', () => {
  assert.deepEqual(calculateManualDiscount({
    quantity: 3, baseUnitPrice: 5.2, discountPerUnit: 1.2,
  }), { baseUnitPrice: 5.2, discountPerUnit: 1.2, finalUnitPrice: 4, lineTotal: 12 })
})

test('no acepta valores ausentes, descuentos superiores ni negativos', () => {
  const a = { quantity: 1, baseUnitPrice: 15.43, discountPerUnit: 15.43 }
  assert.equal(calculateManualDiscount({ ...a, discountPerUnit: 15.44 }), null)
  assert.equal(calculateManualDiscount({ ...a, discountPerUnit: -1 }), null)
  assert.equal(calculateManualDiscount({ ...a, discountPerUnit: 0 }), null)
  assert.equal(calculateManualDiscount({ ...a, baseUnitPrice: null }), null)
  assert.equal(calculateManualDiscount({ ...a, quantity: 0 }), null)
})
