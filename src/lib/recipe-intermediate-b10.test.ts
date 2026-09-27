import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const cost = read('../../scripts/recipe-cost/recipe-cost-v2.contract.sql')
const stock = read('../../scripts/recipe-stock/recipe-stock-v2.contract.sql')
const rows = read('../../scripts/recipe-stock/recipe-stock-v2-rows.contract.sql')
const cycles = read('../../scripts/recipe-subrecipes/recipe-subrecipes-cycle.contract.sql')
const ticket = read('../../scripts/recipe-stock/ticket-stock-deduction-v2.contract.sql')
const staff = read('../../scripts/recipe-stock/staff-consumption-v2.contract.sql')
const ranking = read('../../scripts/recipe-stock/product-margin-ranking-v2.contract.sql')
const copilot = read('../../scripts/recipe-stock/copilot-recipes-v2.contract.sql')
const matrix = read('../../scripts/recipe-stock/B10-MATRIX.md')
const list = read('../app/recipes/page.tsx')
const foodCost = read('./recipe-food-cost.ts')

test('la matriz nombra las autoridades y no un motor nuevo', () => {
  assert.match(matrix, /get_recipe_cost_v2/)
  assert.match(matrix, /get_recipe_stock_requirements_v2/)
  assert.match(matrix, /process_ticket_stock_deduction/)
  assert.match(matrix, /get_product_margin_ranking/)
  assert.match(matrix, /gestionar_recetas/)
  assert.match(matrix, /Pesto/)
})

test('los contratos de coste y stock cubren los estados de la matriz', () => {
  for (const marker of ['caso 8', 'caso 9', 'caso 18', 'caso 19', 'caso 20', 'caso 21', 'caso 22', 'MAX_DEPTH_EXCEEDED', 'RECIPE_NOT_FOUND']) {
    assert.match(cost, new RegExp(marker))
  }
  for (const marker of ['MISSING_YIELD', 'CYCLE', 'RECIPE_NOT_FOUND', 'caso 25']) {
    assert.match(stock, new RegExp(marker))
  }
  assert.match(rows, /recipe_stock_requirements_v2_rows/)
  assert.match(cycles, /A→A fue aceptado/)
  assert.match(cycles, /UPDATE cíclico fue aceptado/)
  assert.match(ticket, /recipe_stock_requirements_v2_rows/)
  assert.match(staff, /Media ración/)
  assert.match(ranking, /has_cost_basis/)
  assert.match(copilot, /get_recipe_cost_v2/)
  assert.match(copilot, /src ILIKE '%recipe_ingredients%'/)
})

test('el listado pide el coste v2 cuando la receta tiene elaboraciones', () => {
  assert.match(list, /get_recipe_cost_v2/)
  assert.match(list, /recipe_subrecipes!recipe_subrecipes_parent_recipe_id_fkey/)
  assert.match(foodCost, /canonicalListCostHasBasis/)
  const branch = foodCost.indexOf('if ((recipe.recipe_subrecipes?.length ?? 0) > 0)')
  const legacy = foodCost.indexOf('return sum + recipeLineCost')
  assert.ok(branch >= 0 && legacy > branch)
})
