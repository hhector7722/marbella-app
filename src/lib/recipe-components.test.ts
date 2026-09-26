import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canAddRecipeComponent,
  compatibleComponentUnits,
  directIngredientLineCost,
  directSubrecipeLineCost,
  ingredientRowCostSource,
  isValidComponentQuantity,
  sheetCostSource,
  subrecipeWriteErrorMessage,
} from './recipe-components.ts'

test('el rendimiento elige unidades compatibles', () => {
  assert.deepEqual(compatibleComponentUnits('ml').toSorted(), ['cl', 'l', 'ml'])
  assert.deepEqual(compatibleComponentUnits('kg').toSorted(), ['g', 'kg'])
  assert.deepEqual(compatibleComponentUnits('ud'), ['ud'])
  assert.deepEqual(compatibleComponentUnits(''), [])
})

test('la cantidad del componente rechaza cero, negativo, NaN e infinito', () => {
  assert.equal(isValidComponentQuantity(1), true)
  assert.equal(isValidComponentQuantity(0), false)
  assert.equal(isValidComponentQuantity(-2), false)
  assert.equal(isValidComponentQuantity(Number.NaN), false)
  assert.equal(isValidComponentQuantity(Number.POSITIVE_INFINITY), false)
})

test('solo se añade un candidato con rendimiento válido', () => {
  assert.equal(canAddRecipeComponent({ yieldQuantity: null, yieldUnit: null }), false)
  assert.equal(canAddRecipeComponent({ yieldQuantity: 0, yieldUnit: 'ml' }), false)
  assert.equal(canAddRecipeComponent({ yieldQuantity: 1000, yieldUnit: '' }), false)
  assert.equal(canAddRecipeComponent({ yieldQuantity: 1000, yieldUnit: 'ml' }), true)
  assert.equal(canAddRecipeComponent({ yieldQuantity: 1, yieldUnit: 'l' }), true)
})

test('la fila directa se localiza por line_id y un fallo no vale cero', () => {
  const components = [
    { kind: 'ingredient', line_id: 'ing', status: 'OK', cost_eur: 1 },
    { kind: 'subrecipe', line_id: 'descendente', status: 'OK', cost_eur: 0.2 },
    { kind: 'subrecipe', line_id: 'directa', status: 'OK', cost_eur: 0.48 },
  ]
  assert.deepEqual(directSubrecipeLineCost(components, 'directa'), { status: 'OK', costEur: 0.48 })
  assert.deepEqual(
    directSubrecipeLineCost(
      [{ kind: 'subrecipe', line_id: 'directa', status: 'MISSING_YIELD', cost_eur: null }],
      'directa',
    ),
    { status: 'MISSING_YIELD', costEur: null },
  )
  assert.notEqual(
    directSubrecipeLineCost(
      [{ kind: 'subrecipe', line_id: 'directa', status: 'CYCLE', cost_eur: null }],
      'directa',
    ).costEur,
    0,
  )
})

test('el motor de coste depende de vendibilidad, subrecetas y ración', () => {
  assert.equal(sheetCostSource({ isSellable: true, hasSubrecipes: false, portion: 'full' }), 'legacy')
  assert.equal(sheetCostSource({ isSellable: true, hasSubrecipes: false, portion: 'half' }), 'legacy')
  assert.equal(sheetCostSource({ isSellable: false, hasSubrecipes: false, portion: 'full' }), 'recursive')
  assert.equal(sheetCostSource({ isSellable: false, hasSubrecipes: true, portion: 'half' }), 'recursive')
  assert.equal(sheetCostSource({ isSellable: true, hasSubrecipes: true, portion: 'full' }), 'recursive')
  assert.equal(sheetCostSource({ isSellable: true, hasSubrecipes: true, portion: 'half' }), 'unavailable')
})

test('el ingrediente directo se localiza por kind y line_id', () => {
  const components = [
    { kind: 'ingredient', line_id: 'descendiente', status: 'OK', cost_eur: 9 },
    { kind: 'subrecipe', line_id: 'directo', status: 'OK', cost_eur: 5 },
    { kind: 'ingredient', line_id: 'directo', status: 'OK', cost_eur: 1.2 },
  ]
  assert.deepEqual(directIngredientLineCost(components, 'directo'), { status: 'OK', costEur: 1.2 })
  assert.deepEqual(
    directIngredientLineCost(
      [{ kind: 'ingredient', line_id: 'directo', status: 'MISSING_PRICE', cost_eur: null }],
      'directo',
    ),
    { status: 'MISSING_PRICE', costEur: null },
  )
  assert.notEqual(
    directIngredientLineCost(
      [{ kind: 'ingredient', line_id: 'directo', status: 'INCOMPATIBLE_UNITS', cost_eur: null }],
      'directo',
    ).costEur,
    0,
  )
})

test('la fila de ingrediente usa v2 solo en recursivo', () => {
  assert.equal(ingredientRowCostSource('recursive'), 'v2')
  assert.equal(ingredientRowCostSource('legacy'), 'client')
  assert.equal(ingredientRowCostSource('unavailable'), 'client')
  assert.equal(
    sheetCostSource({ isSellable: true, hasSubrecipes: true, portion: 'half' }),
    'unavailable',
  )
})

test('23514 de ciclo y 23505 de duplicado tienen texto propio', () => {
  assert.equal(
    subrecipeWriteErrorMessage({ code: '23514', message: 'recipe_subrecipes produciría un ciclo' }),
    'No se puede añadir: crearía un ciclo entre recetas.',
  )
  assert.equal(
    subrecipeWriteErrorMessage({ code: '23505', message: 'duplicate key' }),
    'Esta elaboración ya está incluida.',
  )
  assert.match(subrecipeWriteErrorMessage({ code: '42501', message: 'permission denied' }, 'save'), /permission denied/)
})
