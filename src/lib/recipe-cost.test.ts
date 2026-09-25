import assert from 'node:assert/strict'
import test from 'node:test'

import {
  convertToPurchaseUnitQuantityWithPackBridge,
  getRecipeIngredientLineCostAnalysis,
  getRecipeIngredientLineCostV2,
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

test('v2: precio y unidades compatibles devuelven OK', () => {
  assert.deepEqual(getRecipeIngredientLineCostV2(500, 'g', 'kg', 4), {
    costEur: 2,
    status: 'OK',
    issues: ['OK'],
  })
})

test('v2: NaN e Infinity no son un precio', () => {
  for (const price of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(getRecipeIngredientLineCostV2(1, 'kg', 'kg', price), {
      costEur: null,
      status: 'MISSING_PRICE',
      issues: ['MISSING_PRICE'],
    })
  }
})

test('v2: current_price null o 0 es MISSING_PRICE y coste null', () => {
  assert.deepEqual(getRecipeIngredientLineCostV2(1, 'kg', 'kg', null), {
    costEur: null,
    status: 'MISSING_PRICE',
    issues: ['MISSING_PRICE'],
  })
  assert.deepEqual(getRecipeIngredientLineCostV2(1, 'kg', 'kg', 0), {
    costEur: null,
    status: 'MISSING_PRICE',
    issues: ['MISSING_PRICE'],
  })
})

test('v2: unidades incompatibles no son 0 €', () => {
  assert.deepEqual(getRecipeIngredientLineCostV2(100, 'g', 'l', 3), {
    costEur: null,
    status: 'INCOMPATIBLE_UNITS',
    issues: ['INCOMPATIBLE_UNITS'],
  })
})

test('v2: convierte g/kg, ml/cl/l y el puente físico', () => {
  assert.equal(getRecipeIngredientLineCostV2(250, 'g', 'kg', 8).costEur, 2)
  assert.equal(getRecipeIngredientLineCostV2(100, 'cl', 'l', 3).costEur, 3)
  assert.equal(getRecipeIngredientLineCostV2(50, 'ml', 'cl', 2).costEur, 10)
  assert.deepEqual(
    getRecipeIngredientLineCostV2(1, 'ud', 'kg', 8, {
      pack_unit_size_qty: 125,
      pack_unit_size_unit: 'g',
    }),
    { costEur: 1, status: 'OK', issues: ['OK'] },
  )
  assert.equal(
    getRecipeIngredientLineCostV2(24, 'ud', 'l', 1, {
      pack_unit_size_qty: 330,
      pack_unit_size_unit: 'ml',
    }).costEur,
    7.92,
  )
})

test('v2: precio ausente y unidad incompatible se conservan juntos', () => {
  assert.deepEqual(getRecipeIngredientLineCostV2(1, 'g', 'l', null), {
    costEur: null,
    status: 'INCOMPATIBLE_UNITS',
    issues: ['INCOMPATIBLE_UNITS', 'MISSING_PRICE'],
  })
})
