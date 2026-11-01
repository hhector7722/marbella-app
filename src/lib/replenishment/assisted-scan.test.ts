import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLA_LAYOUT, colaLayoutMatchesCapacities, computeStackTotals,
  mergeStackReading, visibleStackHint, stableHint, type StackCounts,
} from './assisted-scan.ts'

test('plano Cola: 48 posiciones, original 27, zero 21 y una posición ausente al fondo', () => {
  assert.equal(COLA_LAYOUT.length, 48)
  assert.equal(COLA_LAYOUT.filter(p => p.product === 'original').length, 27)
  assert.equal(COLA_LAYOUT.filter(p => p.product === 'zero').length, 21)
  assert.equal(COLA_LAYOUT.some(p => p.id === 'f1-c1'), false)
  assert.equal(colaLayoutMatchesCapacities(108, 84), true)
  assert.equal(colaLayoutMatchesCapacities(112, 84), false)
})
test('no duplica el recuento y satura un quinto envase sin trasladarlo', () => {
  const id = COLA_LAYOUT[0].id
  const a = mergeStackReading({}, id, 2, 'manual')
  const b = mergeStackReading(a, id, 3, 'manual')
  assert.equal(computeStackTotals(COLA_LAYOUT, b).confirmed, 1)
  assert.equal(computeStackTotals(COLA_LAYOUT, b).present, 3)
  const overflow = mergeStackReading(b, id, 5, 'manual')
  assert.equal(overflow[id].count, 4)
  assert.equal(computeStackTotals(COLA_LAYOUT, overflow).confirmedMissing, 0)
  assert.equal(computeStackTotals(COLA_LAYOUT, overflow).present, 4)
  assert.equal(computeStackTotals(COLA_LAYOUT, overflow).unverifiedCapacity, 188)
  assert.equal(mergeStackReading(b, id, -1, 'manual'), b)
  assert.equal(mergeStackReading(b, 'f99-c99', 0, 'manual'), b)
})
test('sin confirmar todos, nunca da un total final ficticio', () => {
  const a = mergeStackReading({}, COLA_LAYOUT[0].id, 2, 'manual')
  const result = computeStackTotals(COLA_LAYOUT, a)
  assert.equal(result.confirmedMissing, 2)
  assert.equal(result.unverifiedCapacity, 188)
  assert.equal(result.totalMissing, null)
  const full = Object.fromEntries(COLA_LAYOUT.map(p => [p.id, { count: 4, method: 'manual' }])) as StackCounts
  assert.equal(computeStackTotals(COLA_LAYOUT, full).totalMissing, 0)
  full[COLA_LAYOUT[0].id] = { count: 1, method: 'manual' }
  assert.equal(computeStackTotals(COLA_LAYOUT, full).totalMissing, 3)
  full[COLA_LAYOUT[0].id] = { count: 5, method: 'manual' }
  assert.equal(computeStackTotals(COLA_LAYOUT, full).totalMissing, 0)
})
test('sugiere extremos alineados hasta 5 y limita el resultado a 4', () => {
  const circle = (x: number,y: number) => ({x,y,radius:17,confidence:0.9})
  assert.equal(visibleStackHint([circle(155,78),circle(157,111)],320,240),2)
  assert.equal(visibleStackHint([circle(155,40),circle(156,73),circle(156,106),circle(156,139),circle(156,172)],320,240),4)
  assert.equal(visibleStackHint([circle(155,78)],320,240),null)
  assert.equal(visibleStackHint([circle(155,78),circle(225,111)],320,240),null)
  assert.equal(stableHint([2,2,2]),2)
  assert.equal(stableHint([2,3,2]),null)
  assert.equal(stableHint([null,null,null]),null)
})
