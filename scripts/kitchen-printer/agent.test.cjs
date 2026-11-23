const { test } = require('node:test')
const assert = require('node:assert/strict')
const iconv = require('iconv-lite')
const { buildTicket, wrap, printerForJob } = require('./agent.cjs')
const { brandRaster } = require('./brand-raster.cjs')
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

test('Logo monocromo y dos líneas negras rodean fecha, hora y pax', () => {
  const meta = '22/11/26' + ' '.repeat(10) + '14:00' + ' '.repeat(13) + '50 PAX'
  assert.equal(meta.length, 42)
  const layout = [
    { kind: 'brand', text: '' },
    { kind: 'text', text: 'AFAC', align: 'center', bold: true, doubleHeight: true },
    { kind: 'rule', text: '' },
    { kind: 'meta', text: meta },
    { kind: 'rule', text: '' },
    { kind: 'item', text: 'PATATES BRAVES', quantity: 5, bold: true },
  ]
  const result = buildTicket({ layout })
  const raster = Buffer.from([0x1d, 0x76, 0x30, 0x00, 72, 0, 118, 0])
  const rule = Buffer.concat([
    Buffer.from([0x1d, 0x76, 0x30, 0x00, 72, 0, 2, 0]),
    Buffer.alloc(72 * 2, 0xff),
  ])
  assert.ok(result.includes(raster), 'Cabecera gráfica con logo')
  const first = result.indexOf(rule)
  assert.ok(first > 0, 'Primera línea negra')
  const second = result.indexOf(rule, first + rule.length)
  assert.ok(second > first, 'Segunda línea negra')
  const metaAt = result.indexOf(Buffer.from(meta, 'ascii'))
  assert.ok(metaAt > first && metaAt < second, 'Fecha/hora/pax entre ambas líneas')
  assert.ok(result.includes(Buffer.from('AFAC', 'ascii')))
  assert.ok(!result.includes(Buffer.from('COMIDA', 'ascii')))
  assert.ok(result.includes(Buffer.from([0x1d, 0x56, 0x00])), 'Corte final')
})
test('La cabecera solo conserva el logo y cantidades/productos tienen el mismo tamaño', () => {
  const logo = brandRaster('')
  const stride = logo[4] + (logo[5] << 8)
  const height = logo[6] + (logo[7] << 8)
  assert.equal(stride, 72)
  assert.ok(height > 0)
  let logoBytes = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < stride; x++) {
      if (logo[8 + y * stride + x] !== 0) {
        assert.ok(x < 16, 'No debe quedar texto rasterizado a la derecha del logo')
        logoBytes++
      }
    }
  }
  assert.ok(logoBytes > 0)
  const ticket = buildTicket({ layout: [
    { kind: 'brand', text: '' },
    { kind: 'item', quantity: 8, text: 'PATATES BRAVES' },
  ] })
  assert.ok(!ticket.includes(Buffer.from([0x1d, 0x21, 0x10])), 'Cantidad sin doble altura')
  assert.ok(iconv.decode(ticket, 'cp858').includes('8 PATATES BRAVES'))
})
