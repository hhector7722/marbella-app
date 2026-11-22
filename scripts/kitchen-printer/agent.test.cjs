const { test } = require('node:test')
const assert = require('node:assert/strict')
const iconv = require('iconv-lite')
const { buildTicket, wrap } = require('./agent.cjs')
test('El ticket térmico contiene cantidad, productos y corte, sin importes', () => {
  const result = buildTicket({
    name: 'AFAC', date: '2026-11-22', time: '14:00',
    guests: 50, language: 'es', selection: 'food',
    items: [{ quantity: 5, name: 'PATATES BRAVES', note: 'Sin cebolla' }],
    observations: 'Alergia a frutos secos',
  })
  const text = iconv.decode(result, 'cp858')
  assert.match(text, /BAR LA MARBELLA/)
  assert.match(text, /PATATES BRAVES/)
  assert.match(text, /5 /)
  assert.match(text, /50 PAX/)
  assert.match(text, /AFAC/)
  assert.match(text, /Sin cebolla/)
  assert.match(text, /Alergia a frutos secos/)
  assert.ok(result.includes(Buffer.from([0x1d, 0x56, 0x00])))
  assert.doesNotMatch(text, /€|IVA|PRECIO/)
})
test('Se conservan los acentos y los productos largos no se cortan', () => {
  const name = 'ENTREPÀ DE PERNIL IBÈRIC AMB FORMATGE I TOMÀQUET DE PENJAR'
  const result = buildTicket({
    name: 'Público', date: '2026-11-22', time: '19:00', guests: 2,
    language: 'ca', selection: 'all',
    items: [{ quantity: 12, name, note: 'Sense sègol' }],
  })
  const decoded = iconv.decode(result, 'cp858')
  assert.match(decoded, /Público/)
  assert.match(decoded, /Sense sègol/)
  assert.ok(wrap(name, 34).length > 1)
})