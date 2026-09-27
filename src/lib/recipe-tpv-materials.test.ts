import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  TPV_INTERNAL_RECIPE_ERROR,
  attachSupplierMappings,
  formatMaterialLine,
  guardTpvMappingWrite,
  legacyInternalMappingView,
  projectRecipeStockRows,
  recipeIdsForTpvExpansion,
  sellableSelectorIds,
} from './recipe-tpv-materials.ts'

const SELLABLE = '8bbe3122-225e-4d5f-aa53-af18bfabf471'
const INTERNAL = '11111111-1111-4111-8111-111111111111'

test('el selector solo ofrece recetas vendibles', () => {
  const ids = sellableSelectorIds([
    { id: SELLABLE, is_sellable: true },
    { id: INTERNAL, is_sellable: false },
    { id: '22222222-2222-4222-8222-222222222222', is_sellable: null },
  ])
  assert.deepEqual(ids, [SELLABLE])
})

test('una receta inexistente o interna no autoriza el upsert', () => {
  const missing = guardTpvMappingWrite({
    articuloId: 10,
    recipeId: SELLABLE,
    factor: 1,
    recipe: null,
  })
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.error, 'La receta no existe.')

  const internal = guardTpvMappingWrite({
    articuloId: 10,
    recipeId: INTERNAL,
    factor: 1,
    recipe: { is_sellable: false },
  })
  assert.equal(internal.ok, false)
  if (!internal.ok) assert.equal(internal.error, TPV_INTERNAL_RECIPE_ERROR)
})

test('el factor válido pasa y el no positivo o no finito se rechaza', () => {
  const ok = guardTpvMappingWrite({
    articuloId: 10,
    recipeId: SELLABLE,
    factor: 2,
    recipe: { is_sellable: true },
  })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.factor, 2)

  for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const rejected = guardTpvMappingWrite({
      articuloId: 10,
      recipeId: SELLABLE,
      factor,
      recipe: { is_sellable: true },
    })
    assert.equal(rejected.ok, false)
  }
})

test('una directa válida produce una fila física', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 1,
      ingredient_id: 'flour',
      ingredient_name: 'Harina',
      quantity_base: 250,
      unit_base: 'g',
    },
  ])
  assert.equal(projection.status, 'ok')
  if (projection.status === 'ok') {
    assert.deepEqual(projection.rows, [
      { ingredient_id: 'flour', ingredient_name: 'Harina', quantity_base: 250, unit_base: 'g' },
    ])
  }
})

test('un padre sin ingredientes directos muestra las hojas del wrapper', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 1,
      ingredient_id: 'milk',
      ingredient_name: 'Leche',
      quantity_base: 120,
      unit_base: 'ml',
    },
  ])
  assert.equal(projection.status, 'ok')
  if (projection.status === 'ok') assert.equal(projection.rows[0]?.ingredient_id, 'milk')
})

test('una materia prima ya agregada no se duplica', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 1,
      ingredient_id: 'bacon',
      ingredient_name: 'Bacon',
      quantity_base: 40,
      unit_base: 'g',
      contributions: [{ quantity_base: 20 }, { quantity_base: 20 }],
    },
  ])
  assert.equal(projection.status, 'ok')
  if (projection.status === 'ok') {
    assert.equal(projection.rows.length, 1)
    assert.equal(projection.rows[0]?.quantity_base, 40)
  }
})

test('un conteo positivo sin materia prima no es un vacío válido', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 1,
      ingredient_id: null,
      ingredient_name: null,
      quantity_base: null,
      unit_base: null,
    },
  ])
  assert.equal(projection.status, 'invalid')
  assert.deepEqual(projection.rows, [])
})

test('un conteo cero con materia prima física no es un vacío válido', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 0,
      ingredient_id: 'bacon',
      ingredient_name: 'Bacon',
      quantity_base: 20,
      unit_base: 'g',
    },
  ])
  assert.equal(projection.status, 'invalid')
  assert.deepEqual(projection.rows, [])
})

test('una cantidad negativa o cero invalida la expansión', () => {
  for (const quantity of [-1, 0]) {
    const projection = projectRecipeStockRows([
      {
        ok: true,
        ingredient_count: 1,
        ingredient_id: 'bacon',
        ingredient_name: 'Bacon',
        quantity_base: quantity,
        unit_base: 'g',
      },
    ])
    assert.equal(projection.status, 'invalid')
    assert.deepEqual(projection.rows, [])
  }
})

test('un conteo que no coincide con las hojas físicas es inválido', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 2,
      ingredient_id: 'bacon',
      ingredient_name: 'Bacon',
      quantity_base: 20,
      unit_base: 'g',
    },
  ])
  assert.equal(projection.status, 'invalid')
  assert.deepEqual(projection.rows, [])
})

test('una expansión vacía válida no es un error', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 0,
      ingredient_id: null,
      ingredient_name: null,
      quantity_base: null,
      unit_base: null,
    },
  ])
  assert.deepEqual(projection, { status: 'ok', ingredient_count: 0, rows: [] })
})

test('una expansión inválida no usa cantidades parciales', () => {
  const projection = projectRecipeStockRows([
    {
      ok: false,
      ingredient_count: 1,
      ingredient_id: 'bacon',
      ingredient_name: 'Bacon',
      quantity_base: 20,
      unit_base: 'g',
      errors: [{ status: 'CYCLE' }],
    },
  ])
  assert.equal(projection.status, 'invalid')
  assert.deepEqual(projection.rows, [])
  if (projection.status === 'invalid') assert.deepEqual(projection.error_codes, ['CYCLE'])
})

test('una hoja recursiva recibe los textos de albarán de su ingrediente', () => {
  const projection = projectRecipeStockRows([
    {
      ok: true,
      ingredient_count: 1,
      ingredient_id: 'bacon',
      ingredient_name: 'Bacon',
      quantity_base: 20,
      unit_base: 'g',
    },
  ])
  const attached = attachSupplierMappings(projection, new Map([
    ['bacon', [{
      id: 'map-1',
      supplier_id: 4,
      supplier_item_name: 'BACON TAQUITO',
      supplier_name: 'Proveedor',
      ingredient_id: 'bacon',
    }]],
  ]))
  assert.equal(attached.rows[0]?.albaran[0]?.supplier_item_name, 'BACON TAQUITO')
})

test('un mapping legado a una interna sigue mapeado y fuera del selector', () => {
  const view = legacyInternalMappingView({
    mappedRecipeId: INTERNAL,
    sellableIds: new Set([SELLABLE]),
  })
  assert.deepEqual(view, { mapped: true, offeredInSelector: false })
  assert.deepEqual(recipeIdsForTpvExpansion([SELLABLE], [INTERNAL]), [SELLABLE, INTERNAL])
})

test('carbonara proyecta las cuatro materias primas de una ración', () => {
  const projection = projectRecipeStockRows([
    { ok: true, ingredient_count: 4, ingredient_id: 'nata', ingredient_name: 'Nata', quantity_base: 50, unit_base: 'ml' },
    { ok: true, ingredient_count: 4, ingredient_id: 'bacon', ingredient_name: 'Bacon', quantity_base: 20, unit_base: 'g' },
    { ok: true, ingredient_count: 4, ingredient_id: 'parmesan', ingredient_name: 'Parmesano', quantity_base: 10, unit_base: 'g' },
    { ok: true, ingredient_count: 4, ingredient_id: 'pepper', ingredient_name: 'Pimienta molida', quantity_base: 0.5, unit_base: 'g' },
  ])
  assert.equal(projection.status, 'ok')
  if (projection.status !== 'ok') return
  assert.deepEqual(
    projection.rows.map((row) => formatMaterialLine(row.ingredient_name, row.quantity_base, row.unit_base)),
    ['Nata · 50 ml', 'Bacon · 20 g', 'Parmesano · 10 g', 'Pimienta molida · 0.5 g'],
  )
})

test('Recetas TPV lee la expansión canónica y no el escandallo directo', () => {
  const page = readFileSync(new URL('../app/dashboard/recetas-tpv/page.tsx', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../app/dashboard/recetas-tpv/MappingClient.tsx', import.meta.url), 'utf8')
  const actions = readFileSync(new URL('../app/dashboard/recetas-tpv/actions.ts', import.meta.url), 'utf8')
  assert.match(page, /recipe_stock_requirements_v2_rows/)
  assert.match(page, /\.eq\('is_sellable', true\)/)
  assert.equal(page.includes('recipe_ingredients'), false)
  assert.equal(page.includes('recipe_subrecipes'), false)
  assert.equal(client.includes('recipe_ingredients'), false)
  assert.equal(client.includes('recipe_subrecipes'), false)
  assert.equal(client.includes('addRecipeIngredientLineAction'), false)
  assert.equal(client.includes('deleteRecipeIngredientLineAction'), false)
  assert.equal(actions.includes('addRecipeIngredientLineAction'), false)
  assert.equal(actions.includes('deleteRecipeIngredientLineAction'), false)
  assert.equal(actions.includes('recipe_ingredients'), false)
  assert.match(actions, /guardTpvMappingWrite/)
})
