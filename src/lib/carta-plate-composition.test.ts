import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlatoMarbellaSlot } from './carta-plato-marbella.ts'
import {
  classifyPlateFood,
  placePlateFoods,
  plateFoodSignature,
  plateFoodVisualBox,
  PLATE_SAFE_MAX,
  PLATE_SAFE_MIN,
  type PlateFoodInput,
  type PlateFoodKind,
} from './carta-plate-composition.ts'

function food(
  slot: PlatoMarbellaSlot,
  id: string,
  label: string,
): PlateFoodInput {
  return { slot, id, label }
}

function bySlot(inputs: PlateFoodInput[]) {
  const placed = placePlateFoods(inputs)
  return Object.fromEntries(placed.map((p) => [p.slot, p]))
}

describe('carta-plate-composition', () => {
  it('clasifica por artículo y por nombre, no solo por tramo', () => {
    assert.equal(classifyPlateFood(food('entrante', '141', 'PASTA AL PESTO')), 'bowl')
    assert.equal(classifyPlateFood(food('principal', '145', 'ENTRAÑA')), 'main')
    assert.equal(classifyPlateFood(food('guarnicion', '203', 'PATATAS PANADERA')), 'side')
    assert.equal(
      classifyPlateFood(food('entrante', '138', 'BERENJENA A LA PARMESANA')),
      'main',
    )
    assert.equal(classifyPlateFood(food('entrante', '999', 'Pasta pesto')), 'bowl')
    assert.equal(classifyPlateFood(food('principal', '999', 'Entrecot')), 'main')
  })

  it('pesto + entraña + patatas queda igual aunque cambie el orden de entrada', () => {
    const pesto = food('entrante', '141', 'PASTA AL PESTO')
    const steak = food('principal', '145', 'ENTRAÑA')
    const potatoes = food('guarnicion', '203', 'PATATAS PANADERA')
    const a = bySlot([pesto, steak, potatoes])
    const b = bySlot([potatoes, pesto, steak])
    assert.deepEqual(a, b)
    assert.equal(plateFoodSignature(['side', 'bowl', 'main']), 'bowl+main+side')
    assert.ok(a.entrante && a.principal && a.guarnicion)
    assert.equal(a.entrante.kind, 'bowl')
    assert.equal(a.principal.kind, 'main')
    assert.equal(a.guarnicion.kind, 'side')
    assert.ok(a.entrante.top < a.guarnicion.top, 'el bol queda atrás')
    assert.ok(a.entrante.left < a.principal.left, 'el bol queda a la izquierda')
    assert.ok(a.guarnicion.top > a.principal.top, 'las patatas quedan delante')
    const pestoSolo = bySlot([pesto])
    assert.equal(pestoSolo.entrante?.left, a.entrante.left)
    assert.equal(pestoSolo.entrante?.top, a.entrante.top)
  })

  it('pesto + calamares + verduras forman una ración compacta en zona segura', () => {
    const placed = bySlot([
      food('entrante', '141', 'PASTA AL PESTO'),
      food('principal', '146', 'CALAMARES'),
      food('guarnicion', '197', 'VERDURAS AL HORNO'),
    ])
    const bowl = placed.entrante!
    const main = placed.principal!
    const side = placed.guarnicion!
    assert.equal(bowl.kind, 'bowl')
    assert.equal(main.kind, 'main')
    assert.equal(side.kind, 'side')
    const b = plateFoodVisualBox(bowl)
    const m = plateFoodVisualBox(main)
    const s = plateFoodVisualBox(side)
    for (const box of [b, m, s]) {
      assert.ok(box.left >= PLATE_SAFE_MIN - 0.05)
      assert.ok(box.top >= PLATE_SAFE_MIN - 0.05)
      assert.ok(box.right <= PLATE_SAFE_MAX + 0.05)
      assert.ok(box.bottom <= PLATE_SAFE_MAX + 0.05)
    }

    const overlapBowlMain = b.right - m.left
    const overlapBowlSide = b.bottom - s.top
    const overlapMainSide = m.bottom - s.top
    assert.ok(overlapBowlMain > 4, 'bol y calamares se rozan')
    assert.ok(overlapBowlMain < 26, 'bol y calamares no se tapan')
    assert.ok(overlapBowlSide > 4, 'las verduras conviven con el bol')
    assert.ok(overlapMainSide > 4, 'las verduras conviven con el principal')
    assert.ok(s.top > b.top + (b.bottom - b.top) * 0.35, 'las verduras no tapan el bol')
    assert.ok(s.top > m.top + (m.bottom - m.top) * 0.35, 'las verduras no tapan el principal')

    assert.ok(bowl.scale >= 0.92)
    assert.ok(main.scale >= 0.9)
    assert.ok(side.scale >= 0.9)

    const bowlCx = bowl.left + bowl.width / 2
    const mainCx = main.left + main.width / 2
    const sideCy = side.top + side.height / 2
    assert.ok(bowlCx > 34 && bowlCx < 42, 'el bol queda atrás a la izquierda')
    assert.ok(mainCx > 58 && mainCx < 68, 'los calamares quedan atrás a la derecha')
    assert.ok(sideCy > 62 && sideCy < 70, 'las verduras quedan delante con aire')
  })

  it('dos principales no comparten asiento', () => {
    const placed = placePlateFoods([
      food('entrante', '138', 'BERENJENA A LA PARMESANA'),
      food('principal', '147', 'POLLO'),
      food('guarnicion', '197', 'VERDURAS AL HORNO'),
    ])
    assert.equal(plateFoodSignature(placed.map((p) => p.kind)), 'main+main+side')
    const mains = placed.filter((p) => p.kind === 'main')
    assert.equal(mains.length, 2)
    assert.notEqual(mains[0]!.left, mains[1]!.left)
  })

  it('todas las combinaciones de tres tipos tienen tres asientos relativos', () => {
    const signatures: PlateFoodKind[][] = [
      ['bowl', 'main', 'side'],
      ['bowl', 'main', 'main'],
      ['bowl', 'side', 'side'],
      ['main', 'main', 'side'],
      ['main', 'side', 'side'],
      ['main', 'main', 'main'],
      ['bowl', 'bowl', 'side'],
      ['bowl', 'bowl', 'main'],
      ['bowl', 'bowl', 'bowl'],
    ]
    for (const kinds of signatures) {
      const inputs = kinds.map((kind, i) =>
        food(
          (['entrante', 'principal', 'guarnicion'] as const)[i]!,
          String(1000 + i),
          kind === 'bowl' ? `Pasta ${i}` : kind === 'side' ? `Patatas ${i}` : `Pollo ${i}`,
        ),
      )
      const placed = placePlateFoods(inputs)
      assert.equal(placed.length, 3, plateFoodSignature(kinds))
      for (const layer of placed) {
        assert.ok(layer.width > 0 && layer.height > 0)
        assert.equal(typeof layer.left, 'number')
        assert.doesNotMatch(String(layer.left), /px/)
        const box = plateFoodVisualBox(layer)
        const sig = plateFoodSignature(kinds)
        assert.ok(box.left >= PLATE_SAFE_MIN - 0.05, `${sig} left`)
        assert.ok(box.top >= PLATE_SAFE_MIN - 0.05, `${sig} top`)
        assert.ok(box.right <= PLATE_SAFE_MAX + 0.05, `${sig} right`)
        assert.ok(box.bottom <= PLATE_SAFE_MAX + 0.05, `${sig} bottom`)
      }
    }
  })
})
