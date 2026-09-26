import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  RecipeWasteError,
  recipeWasteItemsFromRows,
  type RecipeStockRequirementRow,
} from './recipe-waste.ts'

const NATA = '11111111-1111-4111-8111-111111111111'
const BACON = '22222222-2222-4222-8222-222222222222'
const PARMESAN = '33333333-3333-4333-8333-333333333333'
const PEPPER = '44444444-4444-4444-8444-444444444444'
const FLOUR = '55555555-5555-4555-8555-555555555555'

function carbonaraRows(scale: number): RecipeStockRequirementRow[] {
  return [
    row(NATA, 'Nata', 50 * scale, 'ml', 4),
    row(BACON, 'Bacon', 20 * scale, 'g', 4),
    row(PARMESAN, 'Parmesano', 10 * scale, 'g', 4),
    row(PEPPER, 'Pimienta molida', 0.5 * scale, 'g', 4),
  ]
}

function row(
  ingredientId: string | null,
  _name: string,
  quantity: number | null,
  unit: string | null,
  ingredientCount: number,
  ok = true,
  errors: unknown = null,
): RecipeStockRequirementRow {
  return {
    ok,
    ingredient_count: ingredientCount,
    ingredient_id: ingredientId,
    quantity_base: quantity,
    unit_base: unit,
    errors,
  }
}

test('A: la merma de receta usa la expansión y no el escandallo directo', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/dashboard/inventory/waste/actions.ts'),
    'utf8',
  )
  const recipeWaste = source.slice(source.indexOf('export async function processRecipeWaste'))
  const ingredientWaste = source.slice(
    source.indexOf('export async function processWasteEntries'),
    source.indexOf('export async function processRecipeWaste'),
  )

  assert.match(recipeWaste, /recipe_stock_requirements_v2_rows/)
  assert.match(recipeWaste, /p_recipe_multiplier:\s*units/)
  assert.match(recipeWaste, /record_waste_movements/)
  assert.equal(recipeWaste.includes('recipe_ingredients'), false)
  assert.equal(recipeWaste.includes('quantity_gross'), false)
  assert.equal(recipeWaste.includes('umb_multiplier'), false)
  assert.ok(
    recipeWaste.indexOf('recipe_stock_requirements_v2_rows') <
      recipeWaste.indexOf('record_waste_movements'),
  )
  assert.equal(ingredientWaste.includes('recipe_stock_requirements_v2_rows'), false)
  assert.match(ingredientWaste, /dashboard_waste/)
})

test('B: carbonara de una ración envía el lote físico', () => {
  const items = recipeWasteItemsFromRows(carbonaraRows(1), 'Pasta carbonara', 1)
  assert.deepEqual(
    items.map((item) => [item.ingredient_id, item.quantity_base, item.unit_base]),
    [
      [NATA, 50, 'ml'],
      [BACON, 20, 'g'],
      [PARMESAN, 10, 'g'],
      [PEPPER, 0.5, 'g'],
    ],
  )
  assert.equal(items[0]?.description, 'Merma receta: Pasta carbonara × 1 ud')
})

test('C: el multiplicador 2 no se aplica otra vez', () => {
  const items = recipeWasteItemsFromRows(carbonaraRows(2), 'Pasta carbonara', 2)
  assert.deepEqual(
    items.map((item) => item.quantity_base),
    [100, 40, 20, 1],
  )
})

test('D: ok false no produce líneas para el writer', () => {
  assert.throws(
    () =>
      recipeWasteItemsFromRows(
        [row(NATA, 'Nata', 50, 'ml', 1, false, [{ status: 'INCOMPATIBLE_UNITS' }])],
        'Rota',
        1,
      ),
    (err: unknown) => {
      if (!(err instanceof RecipeWasteError) || !Array.isArray(err.expansionErrors)) return false
      const first = err.expansionErrors[0] as { status?: string } | undefined
      return first?.status === 'INCOMPATIBLE_UNITS'
    },
  )
})

test('E: una expansión válida vacía es un error', () => {
  assert.throws(
    () =>
      recipeWasteItemsFromRows(
        [row(null, '', null, null, 0)],
        'Vacía',
        1,
      ),
    (err: unknown) =>
      err instanceof RecipeWasteError &&
      err.message === 'Esta receta no tiene materias primas configuradas.',
  )
})

test('F: cantidad nula o unidad vacía abortan toda la merma', () => {
  assert.throws(() =>
    recipeWasteItemsFromRows(
      [row(FLOUR, 'Harina', 250, 'g', 2), row(NATA, 'Nata', null, 'ml', 2)],
      'Mixta',
      1,
    ),
  )
  assert.throws(() =>
    recipeWasteItemsFromRows([row(FLOUR, 'Harina', 250, '  ', 1)], 'Sin unidad', 1),
  )
})

test('G: una cantidad cero se omite y el resto se envía', () => {
  const items = recipeWasteItemsFromRows(
    [row(FLOUR, 'Harina', 0, 'g', 2), row(BACON, 'Bacon', 20, 'g', 2)],
    'Con cero',
    1,
  )
  assert.deepEqual(items.map((item) => item.ingredient_id), [BACON])
  assert.equal(items[0]?.quantity_base, 20)
})

test('H: una receta directa envía su materia prima en unidad base', () => {
  const items = recipeWasteItemsFromRows(
    [row(FLOUR, 'Harina', 250, 'g', 1)],
    'Directa',
    1,
  )
  assert.deepEqual(items, [
    {
      ingredient_id: FLOUR,
      quantity_base: 250,
      unit_base: 'g',
      description: 'Merma receta: Directa × 1 ud',
    },
  ])
})
