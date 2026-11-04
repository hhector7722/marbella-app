import assert from 'node:assert/strict'
import test from 'node:test'
import { isHalfPortionSandwichCategory, recipeVisibleInCatalog, type MenuCategoryRow } from './recipe-menu-categories.ts'

const rows: MenuCategoryRow[] = [
  { id: 'hot', name: 'Bocadillos - Calientes', slug: 'bocadillos-calientes', parent_id: 'sandwich', sort_order: 1 },
  { id: 'cold', name: 'Bocadillos - Fríos', slug: 'bocadillos-frios', parent_id: 'sandwich', sort_order: 2 },
  { id: 'special', name: 'Bocadillos - Especiales', slug: 'bocadillos-especiales', parent_id: 'sandwich', sort_order: 3 },
  { id: 'tapas', name: 'Tapas', slug: 'tapas', parent_id: null, sort_order: 4 },
]

test('solo fríos y calientes ofrecen Entero/Medio', () => {
  assert.equal(isHalfPortionSandwichCategory({ menu_category_id: 'hot' }, rows), true)
  assert.equal(isHalfPortionSandwichCategory({ menu_category_id: 'cold' }, rows), true)
  assert.equal(isHalfPortionSandwichCategory({ menu_category_id: 'special' }, rows), false)
  assert.equal(isHalfPortionSandwichCategory({ menu_category_id: 'tapas' }, rows), false)
})

test('reconoce etiqueta legacy mientras las categorías cargan', () => {
  assert.equal(isHalfPortionSandwichCategory({ category: 'Bocadillos - Fríos' }, []), true)
  assert.equal(isHalfPortionSandwichCategory({ category: 'Bocadillos - Calientes' }, []), true)
  assert.equal(isHalfPortionSandwichCategory({ category: 'Bocadillos - Especiales' }, []), false)
  assert.equal(isHalfPortionSandwichCategory({ category: 'Platos - Platos' }, []), false)
  assert.equal(isHalfPortionSandwichCategory(null, []), false)
})

test('cuando hay categoría por slug, no confunde etiquetas antiguas', () => {
  assert.equal(isHalfPortionSandwichCategory({ menu_category_id: 'special', category: 'Bocadillos - Fríos' }, rows), false)
})

test('Producción separa elaboraciones internas de las recetas vendibles', () => {
  const production = { is_sellable: false, menu_category_id: 'prod' }
  const legacyInternal = { is_sellable: false, menu_category_id: 'platos' }
  const sellable = { is_sellable: true, menu_category_id: 'platos' }
  assert.equal(recipeVisibleInCatalog(production, null, 'prod'), false)
  assert.equal(recipeVisibleInCatalog(production, 'platos-marbella', 'prod'), false)
  assert.equal(recipeVisibleInCatalog(production, 'produccion', 'prod'), true)
  assert.equal(recipeVisibleInCatalog(legacyInternal, 'produccion', 'prod'), false)
  assert.equal(recipeVisibleInCatalog(sellable, null, 'prod'), true)
  assert.equal(recipeVisibleInCatalog(sellable, 'produccion', 'prod'), false)
  assert.equal(recipeVisibleInCatalog(sellable, 'platos-marbella', 'prod'), true)
  assert.equal(recipeVisibleInCatalog({ is_sellable: null }, null, 'prod'), true)
})
