import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCartaOrderProductName } from './carta-menu-i18n.ts'

describe('nombre visible de producto en pedidos', () => {
  it('presenta los nombres importados en mayúsculas en caja oración', () => {
    assert.equal(formatCartaOrderProductName('CALAMARES A LA ROMANA'), 'Calamares a la romana')
    assert.equal(formatCartaOrderProductName('1/2 ENT. LLOM PLANXA'), '1/2 Ent. llom planxa')
  })

  it('conserva los nombres que ya tienen mayúsculas y minúsculas', () => {
    assert.equal(formatCartaOrderProductName('Coca-Cola Zero'), 'Coca-Cola Zero')
  })
})
