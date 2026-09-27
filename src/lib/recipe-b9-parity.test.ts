import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const ticket = read('../../supabase/migrations/20260926142900_recursive_ticket_stock_deduction.sql')
const wasteAction = read('../app/dashboard/inventory/waste/actions.ts')
const wasteLib = read('./recipe-waste.ts')
const staff = read('../../supabase/migrations/20260926213000_recursive_staff_consumption.sql')
const ranking = read('../../supabase/migrations/20260926220000_recursive_product_margin_ranking.sql')
const tpvPage = read('../app/dashboard/recetas-tpv/page.tsx')
const tpvClient = read('../app/dashboard/recetas-tpv/MappingClient.tsx')
const legacy = read('../app/actions/import-legacy.ts')
const copilot = read('../../supabase/migrations/20260927060000_recursive_copilot_recipes.sql')
const sheet = read('../app/recipes/[id]/page.tsx')

test('la venta descuenta con el wrapper y no recorre subrecetas', () => {
  assert.match(ticket, /recipe_stock_requirements_v2_rows/)
  assert.equal(ticket.includes('recipe_subrecipes'), false)
})

test('la merma usa el wrapper y no vuelve a multiplicar la cantidad base', () => {
  assert.match(wasteAction, /recipe_stock_requirements_v2_rows/)
  assert.match(wasteAction, /p_recipe_multiplier/)
  assert.equal(wasteLib.includes('quantity_base *'), false)
  assert.equal(wasteLib.includes('* units'), false)
})

test('el consumo personal expande la ración completa y bloquea la media con elaboraciones', () => {
  const blockedAt = staff.indexOf('Media ración no disponible para recetas con elaboraciones')
  const halfFactorAt = staff.indexOf('quantity_gross * 0.5')
  assert.match(staff, /recipe_stock_requirements_v2_rows/)
  assert.ok(blockedAt >= 0)
  assert.ok(halfFactorAt > blockedAt)
})

test('el ranking usa el coste v2 y no convierte un desconocido en cero', () => {
  assert.match(ranking, /get_recipe_cost_v2/)
  assert.match(ranking, /has_cost_basis/)
  assert.match(ranking, /component->>'kind' = 'ingredient'/)
  assert.equal(ranking.includes('COALESCE(base_recipe_cost, 0)'), false)
  assert.equal(ranking.includes('recipe_ingredients'), false)
})

test('Recetas TPV proyecta la expansión y no materializa hojas', () => {
  assert.match(tpvPage, /recipe_stock_requirements_v2_rows/)
  assert.equal(tpvPage.includes('recipe_ingredients'), false)
  assert.equal(tpvClient.includes('recipe_ingredients'), false)
  assert.equal(tpvClient.includes('addRecipeIngredientLineAction'), false)
})

test('la importación legacy no borra subrecetas ni sobreescribe un padre sin mirarlas', () => {
  const guardAt = legacy.indexOf('parent_recipe_id')
  assert.ok(guardAt >= 0)
  assert.ok(guardAt < legacy.indexOf('.update('))
  assert.equal(/from\('recipe_subrecipes'\)[\s\S]{0,120}\.delete/.test(legacy), false)
  assert.equal(/from\('recipe_subrecipes'\)[\s\S]{0,120}\.insert/.test(legacy), false)
})

test('el Copilot lee expansión y coste canónicos', () => {
  assert.match(copilot, /recipe_stock_requirements_v2_rows/)
  assert.match(copilot, /get_recipe_cost_v2/)
  assert.equal(copilot.includes('recipe_ingredients'), false)
  assert.equal(copilot.includes('recipe_subrecipes'), false)
})

test('la ficha directa conserva el lector legacy de B5', () => {
  assert.match(sheet, /get_recipe_cost_v2/)
  assert.match(sheet, /rpc\('get_recipe_cost'/)
})
