import assert from 'node:assert/strict'
import test from 'node:test'
import { assessDocument, type PresentationMemory } from './assess.ts'
import type { CanonicalDocument } from '../extractors/canonical.ts'

const presentation: PresentationMemory = { supplierId: 7, ingredientId: 'cola', supplierProductCode: null,
  observedName: 'COCA COLA ZERO', mappingVersionId: 'm1', trustedPresentation: true,
  status: 'confirmed', conversionFactor: '1', lineBillingUnit: 'ud', lineContentQty: '1',
  lineContentUnit: 'ud', purchaseUnit: 'ud', baseUnit: 'ud' }

function document(line: Partial<CanonicalDocument['lines'][number]>): CanonicalDocument {
  return { supplier_name_raw: 'Proveedor', document_number_raw: '1', document_date_raw: null,
    currency_raw: 'EUR', subtotal_raw: '14,40', tax_raw: null, total_raw: null,
    lines: [{ page_index: 0, supplier_product_code_raw: null, description_raw: 'COCA COLA ZERO',
      quantity_raw: '24', billing_unit_raw: 'UD', package_count_raw: null,
      units_per_package_raw: null, content_per_unit_raw: null, content_unit_raw: null,
      unit_price_raw: '0,60', discount_raw: null, discount_header_raw: null,
      other_charge_raw: null, other_charge_header_raw: null, net_unit_price_raw: null,
      line_total_raw: '14,40', tax_rate_raw: null, ...line }] }
}

test('identidad probable, mapping confirmado y cuentas coherentes producen propuesta lista', () => {
  const result = assessDocument({ document: document({}), supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.readyCount, 1)
  assert.equal(result.lines[0]?.normalized?.purchaseQuantity, '24')
})

test('una línea gratuita con presentación confirmada mantiene coste cero y cantidad física', () => {
  const source = document({ unit_price_raw: '0,00', line_total_raw: '0,00', discount_raw: '0' })
  source.subtotal_raw = '0,00'
  const result = assessDocument({ document: source, supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.lines[0]?.status, 'ready_for_review')
  assert.equal(result.lines[0]?.normalized?.purchaseQuantity, '24')
  assert.equal(result.lines[0]?.normalized?.normalizedUnitPrice, '0')
})

test('un aviso de totales del documento no bloquea una línea correcta', () => {
  const source = document({})
  source.subtotal_raw = '10,00'
  const result = assessDocument({ document: source, supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.deepEqual(result.documentReasons, ['lineas_subtotal_no_reconcilian'])
  assert.equal(result.lines[0]?.status, 'ready_for_review')
  assert.deepEqual(result.lines[0]?.reasons, [])
})

test('alias conocido sin presentación conserva candidato pero bloquea recepción', () => {
  const result = assessDocument({ document: document({}), supplierId: 7,
    memory: [presentation], presentations: [] })
  assert.equal(result.lines[0]?.ingredientId, 'cola')
  assert.equal(result.lines[0]?.mappingVersionId, 'm1')
  assert.ok(result.lines[0]?.reasons.includes('presentacion_sin_validar'))
})

test('una coincidencia solo parecida pide confirmar la identidad antes de K4', () => {
  const source = document({ description_raw: 'COCA COLA ZEROO' })
  const result = assessDocument({ document: source, supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.lines[0]?.status, 'needs_review')
  assert.ok(result.lines[0]?.reasons.includes('mapping_requires_human_review'))
})

test('importe que no reconcilia impide propuesta lista', () => {
  const result = assessDocument({ document: document({ line_total_raw: '17,40' }), supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.readyCount, 0)
  assert.ok(result.lines[0]?.reasons.includes('cantidad_precio_importe_no_reconcilian'))
})

test('SHERS conserva el DTO por caja antes incluso de elegir ingrediente', () => {
  const milk = document({ description_raw: 'RAM SENCERA 1,5L C/6',
    quantity_raw: '15,00', billing_unit_raw: 'CA', unit_price_raw: '17,57',
    discount_raw: '6,55', discount_header_raw: 'DTO.', net_unit_price_raw: '11,02',
    line_total_raw: '165,34' })
  milk.subtotal_raw = '165,34'
  const result = assessDocument({ document: milk, supplierId: 8,
    memory: [], presentations: [] })
  assert.equal(result.lines[0]?.status, 'needs_mapping')
  assert.equal(result.lines[0]?.effectiveUnitPrice, '11.0227')
  assert.equal(result.lines[0]?.observedUnitPrice, 17.57)
  assert.ok(!result.lines[0]?.reasons.includes('cantidad_precio_importe_no_reconcilian'))
})

test('general: precio neto, porcentajes y redondeos funcionan sin limitarse a un proveedor', () => {
  for (const [line, expected] of [
    [{ quantity_raw: '2', unit_price_raw: '3,23', net_unit_price_raw: '3,24', line_total_raw: '6,47' }, '3.235'],
    [{ quantity_raw: '100', unit_price_raw: '33,86', discount_raw: '38,00',
      discount_header_raw: '% DTO.', line_total_raw: '2099,43' }, '20.9943'],
    [{ quantity_raw: '100', unit_price_raw: '1,16', line_total_raw: '115,55' }, '1.1555'],
  ] as const) {
    const source = document(line)
    source.subtotal_raw = line.line_total_raw
    const result = assessDocument({ document: source, supplierId: 7, memory: [], presentations: [] })
    assert.equal(result.lines[0]?.effectiveUnitPrice, expected)
  }
})

test('los textos administrativos no generan propuestas ni suman al subtotal', () => {
  const source = document({})
  source.lines.push(
    { ...source.lines[0]!, description_raw: 'TANCAT', quantity_raw: null,
      unit_price_raw: null, line_total_raw: null },
    { ...source.lines[0]!, description_raw: 'NO HI HA DINERS', quantity_raw: null,
      unit_price_raw: null, line_total_raw: null },
    { ...source.lines[0]!, description_raw: 'FILTEMP./RECOLLIDA', quantity_raw: null,
      unit_price_raw: null, line_total_raw: null },
  )
  const result = assessDocument({ document: source, supplierId: 7,
    memory: [presentation], presentations: [presentation] })
  assert.equal(result.lines.length, 1)
  assert.equal(result.readyCount, 1)
  assert.deepEqual(result.documentReasons, [])
  assert.equal(result.lines[0]?.rowIndex, 0)
})

test('Videla: la propuesta usa 10 kg y 5,56 €/kg del bulto impreso', () => {
  const chicken: PresentationMemory = { ...presentation, supplierId: 3,
    ingredientId: 'pechuga', observedName: 'POLLO CONG PECHUGA', mappingVersionId: 'pollo-m1',
    lineBillingUnit: 'kg', lineContentUnit: 'kg', purchaseUnit: 'kg', baseUnit: 'g' }
  const source = document({ description_raw: 'POLLO CONG PECHUGA', quantity_raw: '1,00',
    billing_unit_raw: 'BU 10,00 KG', unit_price_raw: '5,56', line_total_raw: '55,60' })
  source.subtotal_raw = '55,60'
  const result = assessDocument({ document: source, supplierId: 3,
    memory: [chicken], presentations: [chicken] })
  assert.equal(result.readyCount, 1)
  assert.equal(result.lines[0]?.economicQuantity, '10.000')
  assert.equal(result.lines[0]?.effectiveUnitPrice, '5.5600')
})


test('mismo ingrediente con pack y unidades confirmados exige elegir presentación, sin volver a identificar producto', () => {
  const units: PresentationMemory = { ...presentation,
    mappingVersionId: 'm-units', presentationSignature: '50|ud|50|ud',
    conversionFactor: '50', lineBillingUnit: 'ud', lineContentQty: '50' }
  const pack: PresentationMemory = { ...presentation,
    mappingVersionId: 'm-pack', presentationSignature: '50|pack|50|ud',
    conversionFactor: '50', lineBillingUnit: 'pack', lineContentQty: '50' }
  const result = assessDocument({ document: document({}), supplierId: 7,
    memory: [units, pack], presentations: [units, pack] })
  assert.equal(result.lines[0]?.ingredientId, 'cola')
  assert.equal(result.lines[0]?.mappingVersionId, null)
  assert.equal(result.lines[0]?.status, 'needs_review')
  assert.ok(result.lines[0]?.reasons.includes('presentacion_sin_validar'))
  assert.equal(result.lines[0]?.normalized, null)
})


test('SKU aprobado prioriza exactamente la presentación confirmada sobre mapeos históricos ambiguos', () => {
  const pack = { ...presentation, mappingVersionId: 'pack-50',
    supplierProductCode: null, conversionFactor: '50', lineContentQty: '50',
    lineBillingUnit: 'pack', presentationSignature: '50|pack|50|ud' }
  const bad = { ...pack, ingredientId: 'otro', mappingVersionId: 'historico',
    presentationSignature: '50|ud|50|ud' }
  const source = document({ description_raw: 'BOWL BIONIC 350ml RPP: ENV/2023/000',
    supplier_product_code_raw: 'TW1330', quantity_raw: '2',
    unit_price_raw: '3,87',line_total_raw:'7,74' })
  source.subtotal_raw = '7,74'
  const checked = assessDocument({ document: source, supplierId: 7,
    memory: [pack,bad], presentations: [pack,bad],
    verifiedSkuRules: [{
      supplier_code: 'TW1330',
      expected_description: 'BOWL BIONIC 350ml RPP: ENV/2023/00',
      ingredient_id: 'cola',mapping_version_id: 'pack-50'
    }]})
  assert.equal(checked.lines[0]?.status,'ready_for_review')
  assert.equal(checked.lines[0]?.ingredientId,'cola')
  assert.equal(checked.lines[0]?.normalized?.purchaseQuantity,'100')
  const changed = assessDocument({ document: document({
    description_raw:'BOWL BIONIC 350ml PACK 12 RPP: ENV/2023/00',
    supplier_product_code_raw:'TW1330'
  }),supplierId:7,memory:[pack,bad],presentations:[pack,bad],
    verifiedSkuRules:[{supplier_code:'TW1330',expected_description:
      'BOWL BIONIC 350ml RPP: ENV/2023/00',
      ingredient_id:'cola',mapping_version_id:'pack-50'}]})
  assert.notEqual(changed.lines[0]?.status,'ready_for_review')
})


test('Sanilec A/64227: las 7 equivalencias del propietario producen las unidades esperadas', () => {
  const cases = [
    {code:'TW1330',name:'^ BOWL BIONIC NATURAL 350ml. Caja (24 pak x50Uds.) gp RPP: ENV/2023/000001721',
      qty:'2',price:'3,87',total:'7,74',ingredient:'bol',factor:'50',billing:'pack',purchase:'ud',base:'ud',expected:'100'},
    {code:'TW5100',name:'^ PALETINA MADERA CAFE 0,5x11,4x0,15 cms. (Pak 1.000 Uds) gp',
      qty:'1',price:'3,25',total:'3,25',ingredient:'paletinas',factor:'1000',billing:'pack',purchase:'ud',base:'ud',expected:'1000'},
    {code:'TW1073',name:'BANDEJA Bionic 700 MI 27x16,7x2,6 cm Bagazo Kraft (Pack 50 uds) (Caja 8 packs)gp',
      qty:'1',price:'10,7520',total:'10,75',ingredient:'bandejas-canonicas',factor:'50',billing:'pack',purchase:'ud',base:'ud',expected:'50'},
    {code:'TW1750',name:'VASO CARTON Kraft 8oz (Pak 50 Uds)(Cj.20 Paks) do RPP: ENV/2023/000030369',
      qty:'12',price:'2,9350',total:'35,22',ingredient:'vasos',factor:'50',billing:'pack',purchase:'ud',base:'ud',expected:'600'},
    {code:'BA1180',name:'ESTROPAJO UNINOX (Pack 6 Uds.) mult RPP: ENV/2023/000017227',
      qty:'6',price:'1,5600',total:'9,36',ingredient:'estropajo',factor:'1',billing:'ud',purchase:'ud',base:'ud',expected:'6'},
    {code:'BA1160',name:'ESTROPAJO NANAS (PAK.12) mult RPP: ENV/2023/000017227',
      qty:'12',price:'1,0900',total:'13,08',ingredient:'estropajo',factor:'1',billing:'ud',purchase:'ud',base:'ud',expected:'12'},
    {code:'QM3081',name:'MULTIGRAS PLANCHAS Desengrasante temp. moderada Env. 6 kg. dm RPP: ENV/2023/000',
      qty:'6',price:'3,8825',total:'23,30',ingredient:'desengrasante',factor:'1',billing:'kg',purchase:'kg',base:'g',expected:'6'},
  ] as const
  for(const c of cases) {
    const mapping = { ...presentation, ingredientId:c.ingredient,
      mappingVersionId:'approved-'+c.code, observedName:c.name,
      conversionFactor:c.factor,lineBillingUnit:c.billing,
      lineContentQty:c.factor, lineContentUnit:c.purchase, purchaseUnit:c.purchase,baseUnit:c.base }
    const source = document({ supplier_product_code_raw:c.code,
      description_raw:c.name,quantity_raw:c.qty,unit_price_raw:c.price,
      line_total_raw:c.total,billing_unit_raw:null })
    source.subtotal_raw=c.total
    const result = assessDocument({ document:source,supplierId:7,
      memory:[],presentations:[mapping],
      verifiedSkuRules:[{supplier_code:c.code,expected_description:c.name,
        ingredient_id:c.ingredient,mapping_version_id:'approved-'+c.code}]})
    assert.equal(result.lines[0]?.status,'ready_for_review',c.code+': '+JSON.stringify(result.lines[0]?.reasons))
    assert.equal(result.lines[0]?.normalized?.purchaseQuantity,c.expected,c.code)
  }
})
