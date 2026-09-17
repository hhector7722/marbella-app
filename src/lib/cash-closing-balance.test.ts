import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  closingMagnitudesFromBreakdown,
  computeCashClosingBalance,
  roundClosingMoney,
} from './cash-closing-balance.ts'

describe('computeCashClosingBalance', () => {
  it('cierre 17-sep-2026: cobro grande con tarjeta no infla el esperado', () => {
    const balance = computeCashClosingBalance({
      ventas: 782.6,
      pendiente: 23.6,
      cobros: 443.5,
      tarjeta: 970.6,
      efectivoContado: 235.5,
    })

    assert.equal(balance.esperado, 231.9)
    assert.equal(balance.descuadre, 3.6)
  })

  it('el descuadre es (Ventas − Pendiente + Cobros) − (Tarjeta + Efectivo) con signo invertido', () => {
    const ventas = 782.6
    const pendiente = 23.6
    const cobros = 443.5
    const tarjeta = 970.6
    const efectivo = 235.5
    const balance = computeCashClosingBalance({
      ventas,
      pendiente,
      cobros,
      tarjeta,
      efectivoContado: efectivo,
    })

    const identidad = roundClosingMoney(ventas - pendiente + cobros - (tarjeta + efectivo))
    assert.equal(balance.descuadre, roundClosingMoney(-identidad))
  })

  it('día sin cobros: esperado = ventas − tarjeta − pendiente', () => {
    const balance = computeCashClosingBalance({
      ventas: 100,
      pendiente: 0,
      cobros: 0,
      tarjeta: 60,
      efectivoContado: 40,
    })
    assert.equal(balance.esperado, 40)
    assert.equal(balance.descuadre, 0)
  })

  it('cobros en efectivo suben el esperado; no van en tarjeta', () => {
    const balance = computeCashClosingBalance({
      ventas: 100,
      pendiente: 0,
      cobros: 10,
      tarjeta: 60,
      efectivoContado: 50,
    })
    assert.equal(balance.esperado, 50)
    assert.equal(balance.descuadre, 0)
  })

  it('cobros con tarjeta ya van en tarjeta: el esperado no los suma otra vez', () => {
    const balance = computeCashClosingBalance({
      ventas: 100,
      pendiente: 0,
      cobros: 10,
      tarjeta: 70,
      efectivoContado: 40,
    })
    assert.equal(balance.esperado, 40)
    assert.equal(balance.descuadre, 0)
  })

  it('no clampa a cero cuando tarjeta supera ventas − pendiente (cobros con datáfono)', () => {
    const balance = computeCashClosingBalance({
      ventas: 10,
      pendiente: 0,
      cobros: 0,
      tarjeta: 100,
      efectivoContado: 0,
    })
    assert.equal(balance.esperado, -90)
    assert.equal(balance.descuadre, 90)
  })
})

describe('closingMagnitudesFromBreakdown', () => {
  it('Tarjeta del RPC ya incluye cobros con datáfono de otra fecha', () => {
    const magnitudes = closingMagnitudesFromBreakdown({
      total_bruto: 782.6,
      total_tarjeta: 970.6,
      total_pendiente: 24.8,
      total_cobros: 443.5,
      recuento_tickets: 164,
    })
    assert.equal(magnitudes.tarjeta, 970.6)
    assert.equal(magnitudes.cobros, 443.5)
  })

  it('si el RPC viejo no trae total_cobros, usa total_cobros_deuda', () => {
    const magnitudes = closingMagnitudesFromBreakdown({
      total_bruto: 100,
      total_tarjeta: 60,
      total_pendiente: 0,
      total_cobros_deuda: 12.5,
      recuento_tickets: 10,
    })
    assert.equal(magnitudes.cobros, 12.5)
  })
})
