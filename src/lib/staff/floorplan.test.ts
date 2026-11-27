import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneFloorplan, initialFloorplanLayout, validateFloorplanLayout,
  hasFixedFloorplanGeometry, fixedIndividualTable, INDIVIDUAL_SLOT_COUNT, alignFloorplanToPhotos,
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
  layout.tables.push(fixedIndividualTable(0,null))
  assert.ok(validateFloorplanLayout(layout, true).some((x) => x.includes('numerar')))
})

test('las mesas deben mantenerse dentro de su zona', () => {
  const layout = numbered()
  layout.tables[0].x = 99
  assert.ok(validateFloorplanLayout(layout, true).some((x) => x.includes('fuera')))
})

test('el número puede cambiar sin modificar la posición fija', () => {
  const layout = numbered()
  const original = cloneFloorplan(layout)
  layout.tables[0].number = 91
  assert.ok(hasFixedFloorplanGeometry(layout))
  assert.equal(layout.tables[0].x, original.tables[0].x)
  assert.equal(layout.tables[0].y, original.tables[0].y)
})

test('rechaza mover, girar, cambiar la forma o retirar mesas fotografiadas', () => {
  const original = numbered()
  assert.equal(hasFixedFloorplanGeometry(original), true)
  const moved = cloneFloorplan(original)
  moved.tables[0].x += 1
  assert.equal(hasFixedFloorplanGeometry(moved), false)
  const rotated = cloneFloorplan(original)
  rotated.tables[0].rotation = 90
  assert.equal(hasFixedFloorplanGeometry(rotated), false)
  const deleted = cloneFloorplan(original)
  deleted.tables.shift()
  assert.equal(hasFixedFloorplanGeometry(deleted), false)
})

test('mesas individuales adicionales usan exclusivamente casillas fijas', () => {
  const layout = numbered()
  layout.tables.push(fixedIndividualTable(0,55))
  assert.equal(hasFixedFloorplanGeometry(layout), true)
  const manipulated = cloneFloorplan(layout)
  manipulated.tables[manipulated.tables.length - 1].x += 3
  assert.equal(hasFixedFloorplanGeometry(manipulated), false)
})

test('el plano definitivo tiene nueve posiciones individuales y todas se pueden añadir', () => {
  assert.equal(INDIVIDUAL_SLOT_COUNT, 9)
  const layout = numbered()
  for(let i=0;i<INDIVIDUAL_SLOT_COUNT;i++) layout.tables.push(fixedIndividualTable(i,100+i))
  assert.equal(layout.tables.length,40)
  assert.equal(hasFixedFloorplanGeometry(layout),true)
  assert.deepEqual(validateFloorplanLayout(layout,true),[])
  assert.throws(()=>fixedIndividualTable(9,null))
  layout.tables.push({...fixedIndividualTable(0,200),id:'individual-9'})
  assert.equal(hasFixedFloorplanGeometry(layout),false)
})

test('reencaja la geometría anterior sin perder números ni salones', () => {
  const old = numbered()
  old.tables.push(fixedIndividualTable(3,55))
  const expected = cloneFloorplan(old)
  old.tables.forEach(t => { t.x = 1; t.y = 1 })
  const aligned = alignFloorplanToPhotos(old)
  assert.deepEqual(aligned,expected)
  assert.ok(hasFixedFloorplanGeometry(aligned))
  assert.equal(old.tables[0].x,1)
})
test('los centros se corresponden con las fotos originales', () => {
  const layout = initialFloorplanLayout()
  const check = (id:string,x:number,y:number) => {
    const t = layout.tables.find(t => t.id === id)!
    assert.ok(Math.abs(t.x+t.width/2-x)<0.001)
    assert.ok(Math.abs(t.y+t.height/2-y)<0.001)
  }
  check('al-1',198/1400*100,141/554*100)
  check('te-d-6',755/820*100,298/417*100)
  check('in-b-3',706/1104*100,931/1104*100)
  const slot = fixedIndividualTable(8,null)
  assert.ok(Math.abs(slot.x+slot.width/2-1117/1387*100)<0.001)
  assert.ok(Math.abs(slot.y+slot.height/2-801/1011*100)<0.001)
})
