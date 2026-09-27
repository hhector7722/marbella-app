import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { decideLegacyRecipeImport, LEGACY_SUBRECIPE_OVERWRITE_MESSAGE } from './legacy-recipe-import.ts'

const NAME = 'Pasta carbonara'

test('una receta nueva se crea como vendible explícita', () => {
  assert.deepEqual(
    decideLegacyRecipeImport({
      recipeName: NAME,
      exists: false,
      overwriteExisting: false,
      ownsSubrecipes: false,
    }),
    { action: 'create', is_sellable: true },
  )
})

test('una receta existente sin overwrite se omite', () => {
  assert.deepEqual(
    decideLegacyRecipeImport({
      recipeName: NAME,
      exists: true,
      overwriteExisting: false,
      ownsSubrecipes: false,
    }),
    { action: 'skip' },
  )
})

test('una receta directa existente se puede sobreescribir', () => {
  assert.deepEqual(
    decideLegacyRecipeImport({
      recipeName: NAME,
      exists: true,
      overwriteExisting: true,
      ownsSubrecipes: false,
    }),
    { action: 'overwrite' },
  )
})

test('una receta con elaboraciones propias no se sobreescribe', () => {
  const decision = decideLegacyRecipeImport({
    recipeName: NAME,
    exists: true,
    overwriteExisting: true,
    ownsSubrecipes: true,
  })
  assert.equal(decision.action, 'reject')
  if (decision.action === 'reject') {
    assert.match(decision.message, new RegExp(LEGACY_SUBRECIPE_OVERWRITE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(decision.message, /Pasta carbonara/)
  }
})

test('ser hija de otra receta no bloquea el overwrite', () => {
  assert.deepEqual(
    decideLegacyRecipeImport({
      recipeName: 'Salsa carbonara',
      exists: true,
      overwriteExisting: true,
      ownsSubrecipes: false,
    }),
    { action: 'overwrite' },
  )
})

test('el importador legacy no muta antes de comprobar subrecetas ni toca el árbol', () => {
  const source = readFileSync(new URL('../app/actions/import-legacy.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/dashboard/import/page.tsx', import.meta.url), 'utf8')
  const guardAt = source.indexOf('parent_recipe_id')
  const updateAt = source.indexOf('.update(')
  const deleteAt = source.indexOf('.delete(')

  assert.ok(guardAt >= 0)
  assert.ok(updateAt > guardAt)
  assert.ok(deleteAt > guardAt)
  assert.match(source, /decideLegacyRecipeImport/)
  assert.match(source, /is_sellable: true/)
  assert.equal(source.includes('yield_quantity'), false)
  assert.equal(source.includes('yield_unit'), false)
  assert.equal(/from\('recipe_subrecipes'\)[\s\S]{0,120}\.delete/.test(source), false)
  assert.equal(/from\('recipe_subrecipes'\)[\s\S]{0,120}\.insert/.test(source), false)
  assert.equal(source.includes('child_recipe_id'), false)
  assert.match(page, /no se permite si contiene elaboraciones/)
})
