import assert from 'node:assert/strict'
import test from 'node:test'

import {
  elaborationUnitCost,
  formatElaborationCostEur,
  isInternalRecipe,
  parseYieldQuantity,
  recipeCostV2StatusLabel,
  yieldFieldsForSave,
} from './recipe-elaboration.ts'

test('la vendibilidad no se deduce del precio', () => {
  assert.equal(isInternalRecipe(false), true)
  assert.equal(isInternalRecipe(true), false)
  assert.equal(isInternalRecipe(null), false)
  assert.equal(isInternalRecipe(undefined), false)
})

test('el rendimiento interno rechaza vacío, cero, negativo y NaN', () => {
  for (const raw of ['', '0', '-1', 'NaN', 'Infinity']) {
    const saved = yieldFieldsForSave(raw, 'ml', true)
    assert.equal(saved.ok, false)
  }
  assert.equal(yieldFieldsForSave('1000', '', true).ok, false)
  const ok = yieldFieldsForSave('1000', 'ml', true)
  assert.deepEqual(ok, { ok: true, yield_quantity: 1000, yield_unit: 'ml' })
  assert.equal(parseYieldQuantity('1,5'), 1.5)
})

test('una vendible puede guardarse sin rendimiento y con 1 l', () => {
  assert.deepEqual(yieldFieldsForSave('', '', false), {
    ok: true,
    yield_quantity: null,
    yield_unit: null,
  })
  assert.equal(yieldFieldsForSave('1', '', false).ok, false)
  assert.deepEqual(yieldFieldsForSave('1', 'l', false), {
    ok: true,
    yield_quantity: 1,
    yield_unit: 'l',
  })
})

test('el coste por unidad no convierte un fallo en cero', () => {
  assert.equal(elaborationUnitCost(4.8, 1000), 0.0048)
  assert.equal(elaborationUnitCost(null, 1000), null)
  assert.equal(elaborationUnitCost(4.8, null), null)
  assert.equal(elaborationUnitCost(4.8, 0), null)
  assert.equal(formatElaborationCostEur(null), '—')
  assert.equal(formatElaborationCostEur(4.8 / 1000), '0.0048 €')
  assert.notEqual(formatElaborationCostEur(4.8 / 1000), '0.004 €')
  assert.notEqual(formatElaborationCostEur(4.8 / 1000), '0.00 €')
  assert.equal(formatElaborationCostEur(4.8), '4.80 €')
  assert.equal(formatElaborationCostEur(0.01), '0.01 €')
  assert.equal(recipeCostV2StatusLabel('MISSING_PRICE'), 'Falta el precio de un ingrediente')
  assert.equal(recipeCostV2StatusLabel('CYCLE'), 'La composición se cruza consigo misma')
})
