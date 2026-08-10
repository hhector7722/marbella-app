import assert from 'node:assert/strict'
import test from 'node:test'

import { isIngredientPriceLocked } from './ingredient-price-sync.ts'

test('bloquea actualizaciones de albarán cuando price_locked es true', () => {
  assert.equal(isIngredientPriceLocked({ price_locked: true }), true)
})

test('permite evaluar una actualización cuando el precio no está bloqueado', () => {
  assert.equal(isIngredientPriceLocked({ price_locked: false }), false)
  assert.equal(isIngredientPriceLocked({ price_locked: null }), false)
  assert.equal(isIngredientPriceLocked({}), false)
})
