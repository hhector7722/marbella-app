import assert from 'node:assert/strict'
import test from 'node:test'

import { groupRecipeIngredients, isNonCulinaryRecipeMaterial } from './recipe-ingredient-grouping.ts'

test('deja alimentos y bebidas arriba; packaging abajo con separador discreto', () => {
  const input = [
    { id: 'bandeja', ingredients: { name: 'Bandejas bocadillos', category: 'Packaging' } },
    { id: 'atun', ingredients: { name: 'Atún', category: 'Alimentos' } },
    { id: 'tenedor', ingredients: { name: 'Tenedor Madera', category: 'Packaging' } },
    { id: 'agua', ingredients: { name: 'Agua', category: 'Bebidas' } },
  ]
  const result = groupRecipeIngredients(input)
  assert.deepEqual(result.ordered.map((row) => row.id), ['atun', 'agua', 'bandeja', 'tenedor'])
  assert.equal(result.separatorIndex, 2)
  assert.deepEqual(input.map((row) => row.id), ['bandeja', 'atun', 'tenedor', 'agua'])
})

test('reconoce material mal categorizado sin mover alimentos bajo Otros', () => {
  assert.equal(isNonCulinaryRecipeMaterial({ name: 'Vasos 350ml', category: 'Bebidas' }), true)
  assert.equal(isNonCulinaryRecipeMaterial({ name: 'Film', category: 'Alimentos' }), true)
  assert.equal(isNonCulinaryRecipeMaterial({ name: 'Cucharitas café', category: 'Otros' }), true)
  assert.equal(isNonCulinaryRecipeMaterial({ name: 'Aceite girasol', category: 'Otros' }), false)
  assert.equal(isNonCulinaryRecipeMaterial({ name: 'Sal', category: 'Alimentos' }), false)
  assert.equal(isNonCulinaryRecipeMaterial({ name: 'Pimientos piquillo', category: 'Alimentos' }), false)
  assert.equal(isNonCulinaryRecipeMaterial(null), false)
})

test('la línea separadora solo aparece si hay ambas clases', () => {
  assert.equal(groupRecipeIngredients([{ ingredients: { name: 'Atún', category: 'Alimentos' } }]).separatorIndex, null)
  assert.equal(groupRecipeIngredients([{ ingredients: { name: 'Servilleta 30x30', category: 'Packaging' } }]).separatorIndex, null)
  assert.equal(groupRecipeIngredients([]).separatorIndex, null)
})
