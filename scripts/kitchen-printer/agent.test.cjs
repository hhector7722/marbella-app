const { test } = require('node:test')
const assert = require('node:assert/strict')
const iconv = require('iconv-lite')
const { buildTicket, wrap, printerForJob } = require('./agent.cjs')
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
test('Layout de previsualización y ticket físico contienen las mismas líneas', () => {
  const layout = [
    { kind: 'text', text: 'BAR LA MARBELLA', align: 'center', bold: true },
    { kind: 'text', text: 'COMANDA', align: 'center', bold: true, doubleHeight: true },
    { kind: 'text', text: '-'.repeat(42) },
    { kind: 'item', text: 'PATATES BRAVES', quantity: 8, bold: true },
    { kind: 'text', text: '    Sense ceba' },
    { kind: 'text', text: 'FI COMANDA', align: 'center' },
  ]
  const result = iconv.decode(buildTicket({ layout }), 'cp858')
  for (const line of layout) assert.ok(result.includes(line.text))
  assert.ok(result.includes('8 '))
  assert.ok(result.includes('PATATES BRAVES'))
  assert.ok(result.includes('Sense ceba'))
})
test('Destino de impresora limitado a la configuración local', () => {
  const cfg = {
    printers: {
      kitchen: { type: 'tcp', host: '192.168.1.180', port: 9100 },
      tpv1: { type: 'windows', queue: 'TPV-MASTER' },
    },
  }
  assert.equal(printerForJob(cfg, 'tpv1').queue, 'TPV-MASTER')
  assert.throws(() => printerForJob(cfg, 'tpv2'), /no autorizada/)
  assert.throws(() => printerForJob(cfg, '192.168.1.2'), /no autorizada/)
})