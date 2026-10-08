import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { eventOrderItemsToStartingPack, qtyByIdToSubmitItems } from './event-order-carta.ts'

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
