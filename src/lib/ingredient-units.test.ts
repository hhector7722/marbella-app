import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalBaseUnitForPurchaseUnit } from './ingredient-units.ts'

test('el alta de ingrediente usa la misma unidad base que K4', () => {
  assert.equal(canonicalBaseUnitForPurchaseUnit('kg'), 'g')
  assert.equal(canonicalBaseUnitForPurchaseUnit('l'), 'ml')
  assert.equal(canonicalBaseUnitForPurchaseUnit('ud'), 'ud')
  assert.equal(canonicalBaseUnitForPurchaseUnit('caja'), null)
})

test('la unidad metro se mantiene separada de kg y litros', () => {
  assert.equal(canonicalBaseUnitForPurchaseUnit('m'), 'm')
  assert.equal(canonicalBaseUnitForPurchaseUnit('metros'), 'm')
  assert.equal(canonicalBaseUnitForPurchaseUnit('mts.'), 'm')
})
