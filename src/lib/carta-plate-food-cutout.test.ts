import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cropPixelBuffer,
  isIsolatedStudioCutout,
  isStudioBackdropPixel,
  knockoutStudioBackground,
  opaqueBounds,
  type PixelBuffer,
} from './carta-plate-food-cutout.ts'

function fillBuffer(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = (y * width + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = a
    }
  }
  return { data, width, height }
}

function sample(buf: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const o = (y * buf.width + x) * 4
  return [buf.data[o]!, buf.data[o + 1]!, buf.data[o + 2]!, buf.data[o + 3]!]
}

describe('carta-plate-food-cutout', () => {
  it('trata el blanco de estudio como fondo y el rojo como comida', () => {
    assert.equal(isStudioBackdropPixel(255, 255, 255, 255), true)
    assert.equal(isStudioBackdropPixel(248, 248, 250, 255), true)
    assert.equal(isStudioBackdropPixel(200, 40, 30, 255), false)
  })

  it('vacía el blanco conectado al borde y conserva la comida del centro', () => {
    const src = fillBuffer(20, 20, (x, y) => {
      if (x >= 6 && x <= 13 && y >= 6 && y <= 13) return [180, 40, 30, 255]
      return [255, 255, 255, 255]
    })
    const out = knockoutStudioBackground(src, { feather: 0 })
    assert.equal(sample(out.buffer, 0, 0)[3], 0)
    assert.equal(sample(out.buffer, 19, 19)[3], 0)
    const [r, g, b, a] = sample(out.buffer, 10, 10)
    assert.equal(r, 180)
    assert.equal(g, 40)
    assert.equal(b, 30)
    assert.equal(a, 255)
    assert.equal(isIsolatedStudioCutout(out), true)
  })

  it('no agujerea un blanco interior que no toca el borde', () => {
    const src = fillBuffer(16, 16, (x, y) => {
      if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return [255, 255, 255, 255]
      if (x >= 3 && x <= 12 && y >= 3 && y <= 12) return [40, 120, 50, 255]
      return [255, 255, 255, 255]
    })
    const out = knockoutStudioBackground(src, { feather: 0 })
    assert.equal(sample(out.buffer, 7, 7)[3], 255)
    assert.equal(sample(out.buffer, 0, 0)[3], 0)
  })

  it('recorta al bloque opaco de la comida', () => {
    const src = fillBuffer(20, 20, (x, y) => {
      if (x >= 6 && x <= 13 && y >= 6 && y <= 13) return [180, 40, 30, 255]
      return [255, 255, 255, 255]
    })
    const knocked = knockoutStudioBackground(src, { feather: 0 })
    const box = opaqueBounds(knocked.buffer)
    assert.ok(box)
    assert.equal(box!.x, 6)
    assert.equal(box!.y, 6)
    assert.equal(box!.w, 8)
    assert.equal(box!.h, 8)
    const cropped = cropPixelBuffer(knocked.buffer, box!, 0)
    assert.equal(cropped.width, 8)
    assert.equal(cropped.height, 8)
    assert.equal(sample(cropped, 0, 0)[0], 180)
  })
})
