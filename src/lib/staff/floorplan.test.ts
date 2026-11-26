import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneFloorplan, initialFloorplanLayout, validateFloorplanLayout,
} from './floorplan.ts'

function numbered() {
  const layout = initialFloorplanLayout()
  layout.salons.interior = 2
  layout.salons.individuales = 2
  let t = 0
  for (const item of layout.tables) item.number = ++t
  return layout
}

test('plano inicial respeta los grupos de los planos adjuntos', () => {
  const layout = initialFloorplanLayout()
  assert.equal(layout.tables.filter((t) => t.zone === 'alargadas').length, 8)
  assert.equal(layout.tables.filter((t) => t.zone === 'terraza').length, 17)
  assert.equal(layout.tables.filter((t) => t.zone === 'interior').length, 6)
  assert.equal(layout.tables.filter((t) => t.zone === 'individuales').length, 0)
  assert.ok(layout.tables.every((t) => t.number === null))
})

test('permite preparar borrador inicial pero impide publicarlo sin números', () => {
  const layout = initialFloorplanLayout()
  assert.deepEqual(validateFloorplanLayout(layout, false), [])
  assert.ok(validateFloorplanLayout(layout, true).some((x) => x.includes('numerar')))
})

test('publicación completa con salones válidos y números únicos', () => {
  assert.deepEqual(validateFloorplanLayout(numbered(), true), [])
})

test('el mismo número no puede repetirse dentro del mismo salón', () => {
  const layout = numbered()
  layout.tables[1].number = layout.tables[0].number
  assert.ok(validateFloorplanLayout(layout, true).some((x) => x.includes('duplicado')))
})

test('el mismo número sí puede pertenecer a dos salones diferentes', () => {
  const layout = numbered()
  const interior = layout.tables.find((t) => t.zone === 'interior')!
  interior.number = layout.tables[0].number
  assert.deepEqual(validateFloorplanLayout(layout, true), [])
})

test('tras publicar, añadir una mesa sin número impide guardar el nuevo plano', () => {
  const layout = numbered()
  const first = layout.tables[0]
  layout.tables.push({ ...first, id: 'nueva-individual', zone: 'individuales', number: null })
  assert.ok(validateFloorplanLayout(layout, true).some((x) => x.includes('numerar')))
})

test('las mesas deben mantenerse dentro de su zona', () => {
  const layout = numbered()
  layout.tables[0].x = 99
  assert.ok(validateFloorplanLayout(layout, true).some((x) => x.includes('fuera')))
})

test('la identidad y el número persisten al mover una mesa', () => {
  const layout = numbered()
  const stored = cloneFloorplan(layout)
  stored.tables[0].x = 27
  assert.equal(stored.tables[0].number, layout.tables[0].number)
  assert.equal(stored.tables[0].id, layout.tables[0].id)
  assert.equal(layout.tables[0].x, 12)
})
