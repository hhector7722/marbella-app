import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlatoMarbellaEscandallo,
  costForMarbellaOption,
  type PlatoMarbellaCostRow,
  type RecipeCostPayload,
} from './plato-marbella-escandallo.ts'

const payload = (cost: number): RecipeCostPayload => ({
  ok: true,
  total_cost_eur: cost,
  components: [{ kind: 'ingredient' }],
  errors: [],
})
const row = (
  articulo_id: number,
  recipe_id: string,
  slot: string,
  factor = 1,
): PlatoMarbellaCostRow => ({
  articulo_id,
  recipe_id,
  carta_nombre: 'Opción ' + articulo_id,
  precio: 0,
  plato_marbella_slot: slot,
  plato_marbella_is_menu_price: false,
  tpv_factor_porcion: factor,
})
const menuPrice: PlatoMarbellaCostRow = {
  articulo_id: 136,
  recipe_id: 'marbella',
  carta_nombre: 'Plato Marbella',
  precio: 12.9,
  plato_marbella_slot: null,
  plato_marbella_is_menu_price: true,
}

test('coste máximo: suma de los tres máximos y los ingredientes fijos, sin enumerar combinaciones', () => {
  const rows = [
    menuPrice,
    row(1, 'e1', 'entrante'),
    row(2, 'e2', 'entrante'),
    row(3, 'p1', 'principal'),
    row(4, 'p2', 'principal'),
    row(5, 'g1', 'guarnicion'),
    row(6, 'g2', 'guarnicion'),
  ]
  const prices = new Map([
    ['e1', payload(1)],
    ['e2', payload(2)],
    ['p1', payload(3)],
    ['p2', payload(4)],
    ['g1', payload(0.5)],
    ['g2', payload(0.8)],
  ])
  const report = buildPlatoMarbellaEscandallo(rows, prices, payload(0.3))
  assert.equal(report.combinations, 8)
  assert.equal(report.complete, true)
  assert.ok(Math.abs((report.minimum ?? 0) - 4.8) < 1e-10)
  assert.ok(Math.abs((report.maximum ?? 0) - 7.1) < 1e-10)
  assert.ok(Math.abs((report.average ?? 0) - 5.95) < 1e-10)
  assert.equal(report.maximumChoices.entrante?.row.recipe_id, 'e2')
  assert.equal(report.maximumChoices.principal?.row.recipe_id, 'p2')
  assert.equal(report.maximumChoices.guarnicion?.row.recipe_id, 'g2')
  assert.equal(report.menuPrice, 12.9)
})

test('factor TPV de 0,25 convierte el lote de receta al coste por ración', () => {
  const option = costForMarbellaOption(row(1, 'batch', 'entrante', 0.25), payload(12))
  assert.equal(option.costEur, 3)
  assert.equal(option.factor, 0.25)
  assert.equal(option.problem, null)
})

test('una receta vacía no es coste cero confirmado: impide publicar un máximo definitivo', () => {
  const rows = [
    menuPrice, row(1, 'e1', 'entrante'), row(2, 'p1', 'principal'),
    row(3, 'p2', 'principal'), row(4, 'g1', 'guarnicion'),
  ]
  const prices = new Map<string, RecipeCostPayload | null>([
    ['e1', payload(1)],
    ['p1', payload(2)],
    ['p2', { ok: true, total_cost_eur: 0, components: [], errors: [] }],
    ['g1', payload(0.5)],
  ])
  const report = buildPlatoMarbellaEscandallo(rows, prices, { ok: true, total_cost_eur: 0, components: [] })
  assert.equal(report.complete, false)
  assert.equal(report.maximum, null)
  assert.equal(report.average, null)
  assert.equal(report.missing.length, 1)
  assert.ok(Math.abs((report.provisionalMaximum ?? 0) - 3.5) < 1e-10)
  assert.match(report.missing[0].problem ?? '', /ingredientes/)
})

test('un precio de ingrediente ausente o un factor inválido bloquean el coste de la opción', () => {
  const broken: RecipeCostPayload = {
    ok: false,
    errors: [{ status: 'MISSING_PRICE', component_name: 'Parmesano' }],
  }
  assert.match(costForMarbellaOption(row(1, 'r1', 'principal'), broken).problem ?? '', /MISSING_PRICE/)
  assert.match(costForMarbellaOption(row(2, 'r2', 'principal', 0), payload(3)).problem ?? '', /Factor/)
  assert.equal(costForMarbellaOption(row(3, 'r3', 'guarnicion'), null).costEur, null)
})

test('si falta un tramo el máximo y la media no son válidos', () => {
  const rows = [menuPrice, row(1, 'e1', 'entrante'), row(2, 'p1', 'principal')]
  const report = buildPlatoMarbellaEscandallo(rows, new Map([['e1', payload(1)], ['p1', payload(2)]]), payload(0))
  assert.equal(report.combinations, 0)
  assert.equal(report.complete, false)
  assert.equal(report.maximum, null)
  assert.equal(report.provisionalMaximum, null)
})
