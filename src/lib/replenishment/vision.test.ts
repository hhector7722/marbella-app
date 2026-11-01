import assert from 'node:assert/strict'
import test from 'node:test'
import { detectCanEnds, isStableCount, missingUnits } from './vision.ts'

function syntheticFrame(circles: Array<{ x: number; y: number; radius: number }>) {
  const width = 320
  const height = 240
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let luminance = 35
      for (const circle of circles) {
        const distance = Math.hypot(x - circle.x, y - circle.y)
        if (distance < circle.radius - 2) luminance = 105
        if (Math.abs(distance - circle.radius) <= 2) luminance = 215
      }
      data[i] = luminance
      data[i + 1] = luminance
      data[i + 2] = luminance
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

test('capacidad menos unidades confirmadas; no inventa recuentos sin comprobar', () => {
  assert.equal(missingUnits(36, 24), 12)
  assert.equal(missingUnits(36, 0), 36)
  assert.equal(missingUnits(36, null), null)
  assert.equal(missingUnits(36, 37), 0)
  assert.equal(missingUnits(4, 5), 0)
  assert.equal(missingUnits(4, 2), 2)
  assert.equal(missingUnits(36, 1.5), null)
})

test('estabilidad requiere tres observaciones iguales y capacidad posible', () => {
  assert.equal(isStableCount([6, 6], 20), null)
  assert.equal(isStableCount([6, 7, 6, 6], 20), 6)
  assert.equal(isStableCount([50, 50, 50], 20), null)
})

test('Hough identifica al menos los círculos sintéticos y no reconoce vídeo vacío como bebidas', () => {
  const circles = [
    { x: 100, y: 110, radius: 20 },
    { x: 160, y: 110, radius: 20 },
    { x: 220, y: 110, radius: 20 },
  ]
  const result = detectCanEnds(syntheticFrame(circles))
  for (const item of circles) {
    assert.ok(result.some(value => Math.hypot(value.x - item.x, value.y - item.y) < 7),
      'No encontró círculo centralizado en ' + item.x)
  }
  assert.equal(detectCanEnds(syntheticFrame([])).length, 0)
})
