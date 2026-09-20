import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveReceiptPresentationEconomics } from './receipt-presentation.ts'

test('1 caja de 125 g a 2,49 € normaliza a 19,92 €/kg', () => {
  const result = deriveReceiptPresentationEconomics({
    contentQty: 125,
    contentUnit: 'g',
    purchaseUnit: 'kg',
    observedUnitPrice: 2.49,
  })
  assert.ok(result)
  assert.equal(result.conversionFactor, 0.125)
  assert.equal(result.normalizedUnitPrice, 19.92)
  assert.equal(result.purchaseUnit, 'kg')
})

test('una unidad contable mantiene factor y precio 1:1', () => {
  const result = deriveReceiptPresentationEconomics({
    contentQty: 1,
    contentUnit: 'ud',
    purchaseUnit: 'ud',
    observedUnitPrice: 3.25,
  })
  assert.deepEqual(result, {
    conversionFactor: 1,
    normalizedUnitPrice: 3.25,
    purchaseUnit: 'ud',
  })
})

test('rechaza familias incompatibles', () => {
  assert.equal(
    deriveReceiptPresentationEconomics({
      contentQty: 125,
      contentUnit: 'g',
      purchaseUnit: 'l',
      observedUnitPrice: 2.49,
    }),
    null
  )
})
