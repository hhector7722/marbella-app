import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { eventOrderItemsToStartingPack, qtyByIdToSubmitItems, formatPlatoMarbellaItemNotes, parsePlatoMarbellaItemNotes } from './event-order-carta.ts'
import { quantityForProduct } from './event-orders-matrix.ts'

describe('notas del pedido cliente', () => {
  it('envía las notas de líneas enteras y medias sin mezclarlas', () => {
    assert.deepEqual(
      qtyByIdToSubmitItems({ '12': 2, '12:medio': 1 }, { '12': 'Sin sal', '12:medio': 'Poco hecho' }),
      [
        { product_id: '12', quantity: 2, notes: 'Sin sal' },
        { product_id: '12', quantity: 1, is_half: true, notes: 'Poco hecho' },
      ]
    )
  })

  it('recupera las notas al reabrir y no presenta el marcador legado de media ración como nota', () => {
    assert.deepEqual(
      eventOrderItemsToStartingPack([
        { product_id: '12', quantity: 2, notes: 'Sin sal' },
        { product_id: '12', quantity: 1, is_half: true, notes: 'Poco hecho' },
        { product_id: '13', quantity: 1, notes: '1/2' },
      ]),
      [
        { product_id: '12', quantity: 2, notes: 'Sin sal' },
        { product_id: '12:medio', quantity: 1, notes: 'Poco hecho' },
        { product_id: '13:medio', quantity: 1, notes: null },
      ]
    )
  })
})

describe('Plato Marbella personalizado', () => {
  const platoA = {
    entrante: 'BERENJENA A LA PARMESANA',
    principal: 'POLLO',
    guarnicion: 'PATATAS PANADERA',
  }
  const platoB = {
    entrante: 'PASTA AL PESTO',
    principal: 'ENTRAÑA',
    guarnicion: 'VERDURAS AL HORNO',
  }

  it('mantiene los tres ingredientes y las indicaciones en un formato legible por el personal', () => {
    const note = formatPlatoMarbellaItemNotes(platoA, 'Sin sal')
    assert.match(note, /Entrante: BERENJENA A LA PARMESANA/)
    assert.match(note, /Principal: POLLO/)
    assert.match(note, /Guarnición: PATATAS PANADERA/)
    assert.deepEqual(parsePlatoMarbellaItemNotes(note), { choices: platoA, note: 'Sin sal' })
    assert.equal(parsePlatoMarbellaItemNotes('Sin sal'), null)
    assert.ok(note.length <= 400)
  })

  it('no fusiona dos platos con las mismas referencias de TPV y diferentes ingredientes', () => {
    const a = formatPlatoMarbellaItemNotes(platoA)
    const b = formatPlatoMarbellaItemNotes(platoB)
    const input = [
      { product_id: '136', name: 'PLAT.MARBELLA', quantity: 1, notes: a },
      { product_id: '136', name: 'PLAT.MARBELLA', quantity: 1, notes: b },
      { product_id: '12', quantity: 2, notes: 'Sin sal' },
    ]
    assert.deepEqual(eventOrderItemsToStartingPack(input), [
      { product_id: '12', quantity: 2, notes: 'Sin sal' },
      { product_id: '136', quantity: 1, notes: a },
      { product_id: '136', quantity: 1, notes: b },
    ])
    assert.equal(quantityForProduct({ id: 'event', responsible_name: 'Cliente', items: input.map((it) => ({
      ...it,
      name: it.name ?? 'Producto',
      unit_price: 12.9,
    })) }, '136'), 2)
  })
})
