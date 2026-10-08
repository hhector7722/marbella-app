import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalBaseUnitForPurchaseUnit } from './ingredient-units.ts'

test('el alta de ingrediente usa la misma unidad base que K4', () => {
  assert.equal(canonicalBaseUnitForPurchaseUnit('kg'), 'g')
  assert.equal(canonicalBaseUnitForPurchaseUnit('l'), 'ml')
  assert.equal(canonicalBaseUnitForPurchaseUnit('ud'), 'ud')
  assert.equal(canonicalBaseUnitForPurchaseUnit('caja'), null)
})
