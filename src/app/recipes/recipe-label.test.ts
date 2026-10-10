import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test('el catálogo de recetas no etiqueta las elaboraciones internas', () => {
  const source = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
  const begin = source.indexOf('{filteredRecipes.map((recipe) => (')
  const end = source.indexOf('</CatalogGrid>', begin)
  assert.ok(begin >= 0 && end > begin, 'No se encuentra el catálogo de recetas')
  const catalog = source.slice(begin, end)
  assert.match(catalog, /title=\{recipe\.name\}/)
  assert.doesNotMatch(catalog, /Elaboración|subtitle=/)
  assert.match(catalog, /price=\{isInternalRecipe\(recipe\.is_sellable\) \? null : recipe\.sale_price\}/)
})
