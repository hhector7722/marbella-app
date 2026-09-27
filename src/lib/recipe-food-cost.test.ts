import assert from 'node:assert/strict'
import test from 'node:test'

import { getRecipeFoodCostStatus } from './recipe-food-cost.ts'

const directLine = {
  quantity_gross: 1000,
  unit: 'g',
  ingredients: { current_price: 2, purchase_unit: 'kg' },
}

test('una directa válida conserva el estado legacy', () => {
  const status = getRecipeFoodCostStatus({
    sale_price: 11,
    recipe_ingredients: [directLine],
    canonical_cost: { ok: false, total_cost_eur: null, components: [] },
  })
  assert.equal(status, 'optimal')
})

test('una receta con elaboraciones usa el coste v2', () => {
  const status = getRecipeFoodCostStatus({
    sale_price: 11,
    recipe_ingredients: [],
    recipe_subrecipes: [{ id: 'salsa' }],
    canonical_cost: {
      ok: true,
      total_cost_eur: 4,
      components: [{ kind: 'ingredient' }],
    },
  })
  assert.equal(status, 'critical')
})

test('una receta recursiva inválida no sale como óptima', () => {
  const status = getRecipeFoodCostStatus({
    sale_price: 11,
    recipe_ingredients: [],
    recipe_subrecipes: [{ id: 'salsa' }],
    canonical_cost: { ok: false, total_cost_eur: null, components: [{ kind: 'ingredient' }] },
  })
  assert.equal(status, null)
})

test('una receta sin base física no sale como coste cero', () => {
  const status = getRecipeFoodCostStatus({
    sale_price: 11,
    recipe_ingredients: [],
    recipe_subrecipes: [{ id: 'vacia' }],
    canonical_cost: { ok: true, total_cost_eur: 0, components: [] },
  })
  assert.equal(status, null)
})
