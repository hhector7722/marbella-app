import assert from 'node:assert/strict'
import test from 'node:test'
import { isAdministrativeNonProductRow } from './non-product-line.ts'

test('SHERS: tres textos administrativos sin datos económicos no son productos', () => {
  for (const name of ['TANCAT', 'NO HI HA DINERS', 'FILTEMP./RECOLLIDA']) {
    assert.equal(isAdministrativeNonProductRow({
      name, quantity: null, unitPrice: null, total: null,
      supplierProductCode: null, discount: null, netUnitPrice: null,
    }), true, name)
  }
})

test('mantiene un producto verdadero si hay código, cantidad, precio o importe', () => {
  for (const patch of [
    { supplierProductCode: '05087' },
    { quantity: '1' },
    { unitPrice: '1,00' },
    { total: '1,00' },
    { netUnitPrice: '0,99' },
    { discount: '0,01' },
  ]) {
    assert.equal(isAdministrativeNonProductRow({ name: 'TANCAT', ...patch }), false)
  }
  assert.equal(isAdministrativeNonProductRow({ name: 'Leche entera', quantity: null }), false)
  assert.equal(isAdministrativeNonProductRow({ name: 'Tancat de pollo', quantity: null }), false)
})
