import assert from 'node:assert/strict'
import test from 'node:test'
import { isHalfPortionSandwichCategory, recipeVisibleInCatalog, labelMenuCategoryForRecipesEs, groupMenuCategoriesForRecipes, recipeMatchesMenuCategory, groupRecipeCategoryOptions, sortMenuCategoriesForRecipes, type MenuCategoryRow } from './recipe-menu-categories.ts'

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


test('categorías de recetas: nombres breves, minúsculas y sin rutas', () => {
  const categories: MenuCategoryRow[] = [
    { id: 'platos', name: 'Platos', slug: 'platos', parent_id: null, sort_order: 40 },
    { id: 'platos-general', name: 'Platos - Platos', slug: 'platos-platos', parent_id: 'platos', sort_order: 31 },
    { id: 'platos-marbella', name: 'Platos - Plato Marbella', slug: 'platos-marbella', parent_id: 'platos', sort_order: 32 },
    { id: 'cafeteria', name: 'Cafetería', slug: 'cafeteria', parent_id: null, sort_order: 50 },
    { id: 'bocadillos', name: 'Bocadillos', slug: 'bocadillos', parent_id: null, sort_order: 10 },
    { id: 'calientes', name: 'Bocadillos - Calientes', slug: 'bocadillos-calientes', parent_id: 'bocadillos', sort_order: 21 },
  ]
  const overrides = new Map([['platos', 'PLATOS'], ['platos-general', 'PLATOS'], ['platos-marbella', 'PLATO MARBELLA'], ['calientes', 'CALIENTES'], ['cafeteria', 'CAFETERIA']])
  const label = (id: string) => labelMenuCategoryForRecipesEs(categories.find((r) => r.id === id)!, categories, overrides)
  assert.equal(label('platos'), 'platos')
  assert.equal(label('platos-general'), 'platos generales')
  assert.equal(label('platos-marbella'), 'plato marbella')
  assert.equal(label('calientes'), 'calientes')
  assert.equal(label('cafeteria'), 'cafetería')

  const grouped = groupMenuCategoriesForRecipes(categories)
  assert.deepEqual(grouped.map((section) => [section.parent.id, section.children.map((r) => r.id)]), [
    ['bocadillos', ['calientes']], ['platos', ['platos-general', 'platos-marbella']], ['cafeteria', []],
  ])
  assert.equal(recipeMatchesMenuCategory({ menu_category_id: 'platos-marbella' }, categories[0], categories), true)
  assert.equal(recipeMatchesMenuCategory({ menu_category_id: 'platos-general' }, categories[2], categories), false)
  assert.equal(recipeMatchesMenuCategory({ menu_category_id: 'platos-marbella' }, categories[2], categories), true)
  assert.equal(recipeMatchesMenuCategory({ menu_category_id: 'cafeteria' }, categories[0], categories), false)

  const options = sortMenuCategoriesForRecipes(categories).map((row) => ({ id: row.id, parent_id: row.parent_id, label: label(row.id) }))
  assert.deepEqual(groupRecipeCategoryOptions(options).map((section) => section.parent.label), ['bocadillos', 'platos', 'cafetería'])
})
