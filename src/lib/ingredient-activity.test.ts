import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSparklineGeometry,
  formatActivityDayMonth,
  formatActivityPercent,
  formatActivityQuantity,
  formatActivityUnitPrice,
  isSignificantVariation,
  mapIngredientActivity,
  SIGNIFICANT_VARIATION_PERCENT,
} from './ingredient-activity.ts'

test('mapea la respuesta de la RPC y descarta puntos inválidos', () => {
  const activity = mapIngredientActivity({
    ok: true,
    period_days: 30,
    purchases: 6,
    total_quantity: 72,
    purchase_unit: 'ud',
    base_unit: 'ud',
    avg_price: 0.58,
    previous_avg_price: 0.54,
    current_price: 0.6,
    variation_percent: 11.11,
    last_purchase: { date: '2026-09-03', supplier: 'Santa Teresa', unit_price: 0.6 },
    points: [
      { date: '2026-08-12', price: 0.55 },
      { date: '2026-08-20', price: '0.57' },
      { date: '2026-08-25', price: 0 },
      { date: '', price: 0.6 },
    ],
  })

  assert.ok(activity)
  assert.equal(activity.purchases, 6)
  assert.equal(activity.totalQuantity, 72)
  assert.equal(activity.purchaseUnit, 'ud')
  assert.equal(activity.avgPrice, 0.58)
  assert.deepEqual(activity.points, [
    { date: '2026-08-12', price: 0.55 },
    { date: '2026-08-20', price: 0.57 },
  ])
  assert.equal(activity.lastPurchase?.supplier, 'Santa Teresa')
  assert.equal(activity.lastPurchase?.unitPrice, 0.6)
})

test('devuelve null si la RPC no confirma ok', () => {
  assert.equal(mapIngredientActivity({ ok: false, code: 'not_found' }), null)
  assert.equal(mapIngredientActivity(null), null)
})

test('un ingrediente sin compras deja el resumen a cero y sin precio medio', () => {
  const activity = mapIngredientActivity({
    ok: true,
    purchases: 0,
    total_quantity: 0,
    points: [],
    last_purchase: null,
  })

  assert.ok(activity)
  assert.equal(activity.purchases, 0)
  assert.equal(activity.totalQuantity, 0)
  assert.equal(activity.avgPrice, null)
  assert.equal(activity.variationPercent, null)
  assert.equal(activity.lastPurchase, null)
  assert.deepEqual(activity.points, [])
})

test('formatea cantidad y precio con la unidad del ingrediente', () => {
  assert.equal(formatActivityQuantity(72, 'ud'), '72 ud')
  assert.equal(formatActivityQuantity(7.5, 'kg'), '7,5 kg')
  assert.equal(formatActivityQuantity(0, 'ud'), '')
  assert.equal(formatActivityQuantity(null, 'ud'), '')
  assert.equal(formatActivityUnitPrice(0.58, 'ud'), '0,58 €/ud')
  assert.equal(formatActivityUnitPrice(null, 'kg'), '')
})

test('la variación lleva signo, un decimal y no muestra cero', () => {
  assert.equal(formatActivityPercent(11.11), '+11,1 %')
  assert.equal(formatActivityPercent(-7), '-7 %')
  assert.equal(formatActivityPercent(0), '')
  assert.equal(formatActivityPercent(0.01), '')
  assert.equal(formatActivityPercent(null), '')
})

test('marca como relevante la variación que supera el umbral', () => {
  assert.equal(SIGNIFICANT_VARIATION_PERCENT, 5)
  assert.equal(isSignificantVariation(5), true)
  assert.equal(isSignificantVariation(-11), true)
  assert.equal(isSignificantVariation(4.9), false)
  assert.equal(isSignificantVariation(null), false)
})

test('la fecha corta se construye por componentes, sin Date', () => {
  assert.equal(formatActivityDayMonth('2026-09-03'), '03/09')
  assert.equal(formatActivityDayMonth('no-es-fecha'), '')
  assert.equal(formatActivityDayMonth(null), '')
})

test('la micrográfica calcula el trazo y los extremos', () => {
  const geometry = buildSparklineGeometry(
    [
      { date: '2026-08-12', price: 0.5 },
      { date: '2026-08-20', price: 0.6 },
      { date: '2026-09-03', price: 0.55 },
    ],
    100,
    20,
  )

  assert.ok(geometry.path.startsWith('M'))
  assert.equal(geometry.first?.x, 1)
  assert.equal(geometry.last?.x, 99)
  // El precio mínimo queda abajo y el máximo arriba (eje invertido).
  assert.equal(geometry.first?.y, 19)
  assert.equal(geometry.path.split('L').length - 1, 2)
})

test('la micrográfica soporta un único punto y el conjunto vacío', () => {
  const single = buildSparklineGeometry([{ date: '2026-09-03', price: 0.6 }], 100, 20)
  assert.equal(single.path, 'M50.00 10.00')
  assert.ok(single.first && single.last)

  const empty = buildSparklineGeometry([], 100, 20)
  assert.deepEqual(empty, { path: '', first: null, last: null })
})
