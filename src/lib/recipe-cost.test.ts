import assert from 'node:assert/strict'
import test from 'node:test'

import {
  convertToPurchaseUnitQuantityWithPackBridge,
  getRecipeIngredientLineCostAnalysis,
  resolveIngredientUnitPriceForRecipeCost,
} from './recipe-cost.ts'

test('current_price es la única autoridad económica', () => {
  assert.equal(resolveIngredientUnitPriceForRecipeCost(4.75), 4.75)
  assert.equal(resolveIngredientUnitPriceForRecipeCost(0), null)
  assert.equal(resolveIngredientUnitPriceForRecipeCost(null), null)
})

test('la equivalencia física no depende del antiguo modo de precio', () => {
  assert.equal(
    convertToPurchaseUnitQuantityWithPackBridge(1, 'ud', 'kg', {
      pack_unit_size_qty: 125,
      pack_unit_size_unit: 'g',
    }),
    0.125,
  )
  assert.equal(
    convertToPurchaseUnitQuantityWithPackBridge(24, 'ud', 'l', {
      pack_unit_size_qty: 330,
      pack_unit_size_unit: 'ml',
    }),
    7.92,
  )
})

test('el coste multiplica cantidad física convertida por current_price', () => {
  assert.deepEqual(
    getRecipeIngredientLineCostAnalysis(1, 'ud', 'kg', 8, {
      pack_unit_size_qty: 125,
      pack_unit_size_unit: 'g',
    }),
    { eur: 1, status: 'ok' },
  )
  assert.deepEqual(
    getRecipeIngredientLineCostAnalysis(1, 'ud', 'kg', 0, {
      pack_unit_size_qty: 125,
      pack_unit_size_unit: 'g',
    }),
    { eur: 0, status: 'missing_price' },
  )
})
