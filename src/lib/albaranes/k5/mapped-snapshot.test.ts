import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExactMappedSnapshot } from './mapped-snapshot.ts'

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
