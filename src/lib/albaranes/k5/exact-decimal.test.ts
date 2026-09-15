import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addExact,
  divideExact,
  multiplyExact,
  parseExactDecimal,
  percentageMultiplier,
  toFiniteDecimalString,
  withinExactTolerance,
} from './exact-decimal.ts'

function decimal(value: string) {
  const parsed = parseExactDecimal(value)
  assert.ok(parsed, `No se pudo parsear ${value}`)
  return parsed
}

test('parsea coma, punto y separadores de miles sin Number', () => {
  assert.equal(toFiniteDecimalString(decimal('15,60 KG')), '15.6')
  assert.equal(toFiniteDecimalString(decimal('1.234,56 €')), '1234.56')
  assert.equal(toFiniteDecimalString(decimal('1,234.56')), '1234.56')
})

test('multiplica cantidades y precios exactamente', () => {
  assert.equal(toFiniteDecimalString(multiplyExact(decimal('15.60'), decimal('9.75'))), '152.1')
  assert.equal(toFiniteDecimalString(multiplyExact(decimal('12.00'), decimal('8.35'))), '100.2')
})

test('descuento porcentual mantiene exactitud decimal', () => {
  const multiplier = percentageMultiplier(decimal('38'))
  assert.ok(multiplier)
  const net = multiplyExact(multiplyExact(decimal('8'), decimal('33.86')), multiplier)
  assert.equal(toFiniteDecimalString(net), '167.9456')
  assert.equal(withinExactTolerance(net, decimal('167.95'), decimal('0.01')), true)
})

test('una división no terminante nunca se redondea silenciosamente', () => {
  const quotient = divideExact(decimal('10'), decimal('3'))
  assert.ok(quotient)
  assert.equal(toFiniteDecimalString(quotient), null)
})

test('suma exacta sin error binario', () => {
  assert.equal(toFiniteDecimalString(addExact(decimal('0.1'), decimal('0.2'))), '0.3')
})
