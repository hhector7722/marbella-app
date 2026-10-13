import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExactMappedSnapshot } from './mapped-snapshot.ts'

test('rollo de 300 metros factura 23,64 € y registra 300 m a 0,0788 €/m', () => {
  const snapshot = buildExactMappedSnapshot({
    lineQuantity: '1',
    observedUnitPrice: '23.64',
    mapping: {
      conversionFactor: '300', lineContentQty: '300',
      lineContentUnit: 'm', purchaseUnit: 'm', baseUnit: 'm',
    },
  })
  assert.deepEqual(snapshot, {
    physicalQuantity: '300', baseUnit: 'm',
    purchaseQuantity: '300', purchaseUnit: 'm',
    normalizedUnitPrice: '0.0788',
  })
})

test('el metro nunca se interpreta como kilogramo', () => {
  const snapshot = buildExactMappedSnapshot({
    lineQuantity: '1', observedUnitPrice: '23.64',
    mapping: { conversionFactor: '300', lineContentQty: '300',
      lineContentUnit: 'm', purchaseUnit: 'kg', baseUnit: 'g' },
  })
  assert.equal(snapshot, null)
})

test('3,21 QUILOS de longaniza producen 3,21 kg de compra y 3210 g de stock', () => {
  const snapshot = buildExactMappedSnapshot({
    lineQuantity: '3.21',
    observedUnitPrice: '13.52',
    mapping: {
      conversionFactor: '1',
      lineContentQty: '1',
      lineContentUnit: 'QUILOS',
      purchaseUnit: 'kg',
      baseUnit: 'g',
    },
  })
  assert.deepEqual(snapshot, {
    physicalQuantity: '3210',
    baseUnit: 'g',
    purchaseQuantity: '3.21',
    purchaseUnit: 'kg',
    normalizedUnitPrice: '13.52',
  })
})
