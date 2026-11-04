import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPlatoMarbellaEditorOptions, eligiblePlatoMarbellaOptions } from './plato-marbella-editor-options.ts'

test('Crema vendible vinculada al TPV sigue seleccionable aunque esté oculta en carta', () => {
  const options = buildPlatoMarbellaEditorOptions(
    [
      { articulo_id: 207, recipe_id: 'crema-vendible' },
      { articulo_id: 999, recipe_id: 'crema-produccion' },
      { articulo_id: 136, recipe_id: 'menu' },
    ],
    [
      { id: 207, nombre: 'Crema' },
      { id: 999, nombre: 'Crema prod' },
      { id: 136, nombre: 'PLAT.MARBELLA' },
    ],
    [
      { id: 'crema-vendible', name: 'Crema', is_sellable: true, photo_url: '/crema.png' },
      { id: 'crema-produccion', name: 'Crema prod', is_sellable: false, photo_url: null },
      { id: 'menu', name: 'Plato Marbella', is_sellable: true, photo_url: null },
    ],
    [
      { articulo_id: 207, override_nombre_es: 'CREMA', override_nombre: null,
        is_hidden: true, plato_marbella_slot: 'entrante', plato_marbella_is_menu_price: false },
      { articulo_id: 136, override_nombre_es: null, override_nombre: null,
        is_hidden: false, plato_marbella_slot: null, plato_marbella_is_menu_price: true },
    ],
  )
  assert.equal(options.find((o) => o.articulo_id === 207)?.recipe_name, 'Crema')
  assert.equal(options.find((o) => o.articulo_id === 207)?.photo_url, '/crema.png')
  assert.equal(options.find((o) => o.articulo_id === 207)?.is_hidden, true)
  assert.equal(options.some((o) => o.articulo_id === 999), false)
  assert.deepEqual(eligiblePlatoMarbellaOptions(options).map((o) => o.articulo_id), [207])
})

test('no se duplican en el selector opciones activas ni el artículo del precio', () => {
  const options = buildPlatoMarbellaEditorOptions(
    [
      { articulo_id: 1, recipe_id: 'a' }, { articulo_id: 2, recipe_id: 'b' },
      { articulo_id: 136, recipe_id: 'menu' },
    ],
    [{ id: 1, nombre: 'Alfa' }, { id: 2, nombre: 'Beta' }, { id: 136, nombre: 'PLAT.MARBELLA' }],
    [
      { id: 'a', name: 'Alfa', is_sellable: true, photo_url: null },
      { id: 'b', name: 'Beta', is_sellable: true, photo_url: null },
      { id: 'menu', name: 'Plato Marbella', is_sellable: true, photo_url: null },
    ],
    [
      { articulo_id: 1, override_nombre_es: null, override_nombre: null, is_hidden: false, plato_marbella_slot: 'entrante', plato_marbella_is_menu_price: false },
      { articulo_id: 136, override_nombre_es: null, override_nombre: null, is_hidden: false, plato_marbella_slot: null, plato_marbella_is_menu_price: true },
    ],
  )
  assert.deepEqual(eligiblePlatoMarbellaOptions(options).map((o) => o.articulo_id), [2])
})
