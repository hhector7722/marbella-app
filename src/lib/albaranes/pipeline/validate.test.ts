import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isMisreadNetAmount,
  isVerifiedTaxRateMisreadAsDiscount,
  isVerifiedZeroPricedLine,
  isMisreadDiscountAmount,
  reconcileMisreadDiscountUnitPrice,
  reviewTaxMisreadAsFixedDiscount,
  reconcileFixedDiscountedUnitPrice,
  reconcileFreeFixedDiscountedUnitPrice,
  reconcilePercentageDiscountedUnitPrice,
  reconcileRoundedDisplayedUnitPrice,
  reconcileVerifiedTotalWeightUnitPrice,
  reconcileUnadjustedNetUnitPrice,
  validateObservedDocument,
  validateObservedLine,
  verifiedTotalWeightColumn,
} from './validate.ts'
import type { CanonicalDocument } from '../extractors/canonical.ts'

function row(fields: Partial<CanonicalDocument['lines'][number]>): CanonicalDocument['lines'][number] {
  return { page_index: 0, supplier_product_code_raw: null, description_raw: 'Producto',
    quantity_raw: null, billing_unit_raw: null, package_count_raw: null, units_per_package_raw: null,
    content_per_unit_raw: null, content_unit_raw: null, unit_price_raw: null, discount_raw: null,
    discount_header_raw: null, other_charge_raw: null, other_charge_header_raw: null,
    net_unit_price_raw: null, line_total_raw: null, tax_rate_raw: null, ...fields }
}

test('reconcilia cantidad, precio y descuento porcentual de Panabad', () => {
  const check = validateObservedLine(row({ quantity_raw: '10,000', unit_price_raw: '33,86',
    discount_raw: '38,00', discount_header_raw: '% Dto.', line_total_raw: '209,93' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.discountPercent, 38)
})

test('Ametller: IVA copiado en DTO y total copiado en neto no inventan descuento', () => {
  const evidence = row({ quantity_raw: '4,000', unit_price_raw: '2,190',
    line_total_raw: '8,76', discount_raw: '10,00 %', discount_header_raw: 'Dto.',
    tax_rate_raw: '10,00 %', net_unit_price_raw: '8,76' })
  assert.equal(isVerifiedTaxRateMisreadAsDiscount(evidence), true)
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
  assert.equal(validateObservedLine(evidence).discountPercent, null)
  assert.equal(isVerifiedTaxRateMisreadAsDiscount({ ...evidence, line_total_raw: '7,88' }), false)
  assert.equal(isVerifiedTaxRateMisreadAsDiscount({ ...evidence, tax_rate_raw: '4,00 %' }), false)
})

test('Sant Aniol: una entrega gratuita explícita conserva su cantidad y coste cero', () => {
  const gift = row({ quantity_raw: '17', unit_price_raw: '0,000', line_total_raw: '0,00',
    discount_raw: '0', other_charge_raw: '0', other_charge_header_raw: 'Dto Porte' })
  assert.equal(isVerifiedZeroPricedLine(gift), true)
  assert.deepEqual(validateObservedLine(gift).reasons, [])
  assert.equal(validateObservedLine(gift).priceBasis, 'billing_quantity')
  assert.equal(isVerifiedZeroPricedLine({ ...gift, line_total_raw: '1,00' }), false)
  assert.equal(isVerifiedZeroPricedLine({ ...gift, other_charge_raw: '1' }), false)
  assert.equal(isVerifiedZeroPricedLine({ ...gift, unit_price_raw: null }), false)
})

test('Ametller: importe copiado en DTO no se aplica como descuento', () => {
  const evidence = row({ quantity_raw: '10', unit_price_raw: '0,57',
    discount_raw: '5,70', discount_header_raw: 'Dto', line_total_raw: '5,70' })
  assert.equal(isMisreadDiscountAmount(evidence), true)
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
  assert.equal(validateObservedLine(evidence).priceBasis, 'billing_quantity')
  assert.equal(isMisreadDiscountAmount({ ...evidence, line_total_raw: '5,60' }), false)
  assert.equal(isMisreadDiscountAmount({ ...evidence, other_charge_raw: '0,10' }), false)
  assert.equal(isMisreadDiscountAmount({ ...evidence, net_unit_price_raw: '0,42' }), false)
  const rounded = row({ quantity_raw: '9,100', unit_price_raw: '4,650',
    discount_raw: '42,32', discount_header_raw: 'Dto', line_total_raw: '42,32' })
  assert.equal(reconcileMisreadDiscountUnitPrice(rounded), '4.6505')
  assert.equal(reconcileMisreadDiscountUnitPrice({ ...rounded, line_total_raw: '42,00' }), null)
})

test('SERHS: corrige DTO de 3,38 leído como IVA 21 sin aceptar cifras arbitrarias', () => {
  const evidence = row({ unit_price_raw: '8,58', discount_raw: '21,00',
    discount_header_raw: 'DTO.', tax_rate_raw: '21,00', net_unit_price_raw: '3,38' })
  const corrected = reviewTaxMisreadAsFixedDiscount(evidence,
    { quantity: 1, discount: 3.38, lineTotal: 5.20 })
  assert.equal(corrected?.discount_raw, '3.38')
  assert.equal(corrected?.net_unit_price_raw, '5.2')
  assert.equal(reconcileFixedDiscountedUnitPrice(corrected!), '5.2')
  assert.equal(reviewTaxMisreadAsFixedDiscount(evidence,
    { quantity: 1, discount: 3.39, lineTotal: 5.20 }), null)
  assert.equal(reviewTaxMisreadAsFixedDiscount({ ...evidence, tax_rate_raw: '10' },
    { quantity: 1, discount: 3.38, lineTotal: 5.20 }), null)
})

test('el precio efectivo se calcula del importe, sin alterar el impreso', () => {
  assert.equal(reconcileRoundedDisplayedUnitPrice('10', '1,16', '11,56'), '1.156')
  assert.equal(reconcileRoundedDisplayedUnitPrice('5', '1,29', '6,46'), '1.292')
  assert.equal(reconcileRoundedDisplayedUnitPrice('10', '1,1600', '11,56'), null)
  assert.equal(reconcileRoundedDisplayedUnitPrice('1', '1,16', '1,12'), null)
})

test('Ametller: reconoce importe copiado como precio neto solo cuando la línea cuadra', () => {
  const evidence = row({
    quantity_raw: '1,600', unit_price_raw: '2,490',
    net_unit_price_raw: '3,99', line_total_raw: '3,99',
  })
  assert.equal(isMisreadNetAmount(evidence), true)
  assert.equal(isMisreadNetAmount({ ...evidence, discount_raw: '10' }), false)
  assert.equal(isMisreadNetAmount({ ...evidence, line_total_raw: '4,30' }), false)
  assert.equal(isMisreadNetAmount({ ...evidence, net_unit_price_raw: '2,49' }), false)
})

test('SANET: 10 litros a 1,16 € admiten 11,56 € por redondeo del precio mostrado', () => {
  const checked = validateObservedLine(row({
    quantity_raw: '10', unit_price_raw: '1,16', line_total_raw: '11,56',
  }))
  assert.deepEqual(checked.reasons, [])
  assert.equal(checked.priceBasis, 'billing_quantity')
})

test('el redondeo no oculta un importe falso ni un precio impreso con más precisión', () => {
  for (const [quantity, price, total] of [
    ['1', '1,16', '1,12'], // Una unidad: cuatro céntimos no son redondeo unitario.
    ['10', '1,16', '11,50'], // Demasiada diferencia absoluta.
    ['10', '1,1600', '11,56'], // Cuatro decimales impresos: no hay redondeo a céntimos.
  ]) {
    const checked = validateObservedLine(row({
      quantity_raw: quantity, unit_price_raw: price, line_total_raw: total,
    }))
    assert.ok(checked.reasons.includes('cantidad_precio_importe_no_reconcilian'))
  }
})

test('un descuento sin interpretar no queda oculto por la tolerancia de redondeo', () => {
  const checked = validateObservedLine(row({
    quantity_raw: '10', unit_price_raw: '1,16', line_total_raw: '11,56',
    discount_raw: '2', discount_header_raw: 'DTO.',
  }))
  assert.ok(checked.reasons.includes('descuento_sin_porcentaje_verificado'))
  assert.ok(checked.reasons.includes('cantidad_precio_importe_no_reconcilian'))
})

test('deduce el descuento porcentual de Panabad cuando falta su cabecera', () => {
  const check = validateObservedLine(row({ quantity_raw: '12', unit_price_raw: '33,86',
    discount_raw: '38,00', discount_header_raw: null, line_total_raw: '251,92' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.discountPercent, 38)
})

test('Nestlé: DTO sin símbolo se reconoce como porcentaje por el importe impreso', () => {
  const source = row({ quantity_raw: '1,00', unit_price_raw: '51,600',
    discount_raw: '15,00', discount_header_raw: 'Dto', line_total_raw: '43,86' })
  const check = validateObservedLine(source)
  assert.deepEqual(check.reasons, [])
  assert.equal(check.discountPercent, 15)
  assert.equal(check.priceBasis, 'billing_quantity')
  assert.equal(reconcilePercentageDiscountedUnitPrice(source), '43.86')
  assert.equal(reconcileFixedDiscountedUnitPrice(source), null)
})

test('reconcilia el descuento en euros de SHERS con su precio neto impreso', () => {
  const check = validateObservedLine(row({ quantity_raw: '1', unit_price_raw: '8,58',
    discount_raw: '3,38', discount_header_raw: 'DTO.', net_unit_price_raw: '5,20',
    line_total_raw: '5,20' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.discountPercent, null)
  assert.equal(check.netUnitPrice, 5.2)
})

test('SHERS: leche entera con DTO fijo de 6,55 €, 15 cajas y 165,34 €', () => {
  const evidence = row({ quantity_raw: '15,00', unit_price_raw: '17,57',
    discount_raw: '6,55', discount_header_raw: 'DTO.', net_unit_price_raw: '11,02',
    line_total_raw: '165,34' })
  const checked = validateObservedLine(evidence)
  assert.deepEqual(checked.reasons, [])
  assert.equal(checked.priceBasis, 'billing_quantity')
  assert.equal(reconcileFixedDiscountedUnitPrice(evidence), '11.0227')
})

test('SHERS: leche entera con 6 cajas y avena con 2 cajas conservan importe neto', () => {
  const milk = row({ quantity_raw: '6,00', unit_price_raw: '17,57', discount_raw: '6,55',
    discount_header_raw: 'DTO.', net_unit_price_raw: '11,02', line_total_raw: '66,14' })
  const oat = row({ quantity_raw: '2,00', unit_price_raw: '16,28', discount_raw: '6,68',
    discount_header_raw: 'DTO.', net_unit_price_raw: '9,60', line_total_raw: '19,20' })
  assert.deepEqual(validateObservedLine(milk).reasons, [])
  assert.deepEqual(validateObservedLine(oat).reasons, [])
  assert.equal(reconcileFixedDiscountedUnitPrice(milk), '11.0233')
  assert.equal(reconcileFixedDiscountedUnitPrice(oat), '9.6')
})

test('SHERS: diferencias no justificadas o descuento sin neto impreso mantienen bloqueo', () => {
  const source = row({ quantity_raw: '15,00', unit_price_raw: '17,57',
    discount_raw: '6,55', discount_header_raw: 'DTO.', net_unit_price_raw: '11,02',
    line_total_raw: '165,34' })
  const failures = [
    { line_total_raw: '165,60' },
    { net_unit_price_raw: '12,02' },
    { discount_raw: '5,55' },
    { net_unit_price_raw: null },
    { other_charge_raw: '1,20' },
    { discount_header_raw: '% DTO.' },
  ]
  for (const patch of failures) {
    const evidence = row({ ...source, ...patch })
    assert.equal(reconcileFixedDiscountedUnitPrice(evidence), null)
    const reasons = validateObservedLine(evidence).reasons
    assert.ok(reasons.includes('cantidad_precio_importe_no_reconcilian')
      || reasons.includes('descuento_sin_porcentaje_verificado')
      || reasons.includes('precio_neto_contradictorio'))
  }
})

test('SHERS guantes negros: 2 unidades con 8,22 € bruto, 3,24 € de DTO y total 9,97 €', () => {
  const evidence = row({
    quantity_raw: '2,00',
    unit_price_raw: '8,22',
    discount_raw: '3,24',
    discount_header_raw: 'DTO.',
    net_unit_price_raw: '4,99',
    line_total_raw: '9,97',
  })
  assert.equal(reconcileFixedDiscountedUnitPrice(evidence), '4.985')
  const checked = validateObservedLine(evidence)
  assert.deepEqual(checked.reasons, [])
  assert.equal(checked.priceBasis, 'billing_quantity')
})

test('SHERS guantes: rechaza errores mayores que un céntimo o precio neto no respaldado', () => {
  const evidence = row({
    quantity_raw: '2,00',
    unit_price_raw: '8,22',
    discount_raw: '3,24',
    discount_header_raw: 'DTO.',
    net_unit_price_raw: '4,99',
    line_total_raw: '9,97',
  })
  for (const patch of [
    { discount_raw: '3,22' },
    { net_unit_price_raw: '4,97' },
    { line_total_raw: '9,90' },
    { unit_price_raw: '8,2200' },
    { other_charge_raw: '1,00' },
  ]) {
    assert.equal(reconcileFixedDiscountedUnitPrice({ ...evidence, ...patch }), null)
  }
})

test('redondeo general: se acepta una diferencia mayor de 5 céntimos solo cuando la unidad redondea exactamente', () => {
  const evidence = row({
    quantity_raw: '100', unit_price_raw: '1,16', line_total_raw: '115,55',
  })
  assert.equal(reconcileRoundedDisplayedUnitPrice('100', '1,16', '115,55'), '1.1555')
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
  assert.equal(validateObservedLine(evidence).priceBasis, 'billing_quantity')
  assert.equal(reconcileRoundedDisplayedUnitPrice('100', '1,16', '114,00'), null)
})

test('SHERS: descuento fijo con 100 cajas concilia sin límite arbitrario de 10 céntimos', () => {
  const evidence = row({
    quantity_raw: '100', unit_price_raw: '17,57', discount_raw: '6,55',
    discount_header_raw: 'DTO.', net_unit_price_raw: '11,02',
    line_total_raw: '1102,30',
  })
  assert.equal(reconcileFixedDiscountedUnitPrice(evidence), '11.023')
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
})

test('descuento porcentual genérico verificado para lotes grandes', () => {
  const evidence = row({
    quantity_raw: '100', unit_price_raw: '33,86', discount_raw: '38,00',
    discount_header_raw: '% DTO.', line_total_raw: '2099,43',
  })
  assert.equal(reconcilePercentageDiscountedUnitPrice(evidence), '20.9943')
  const check = validateObservedLine(evidence)
  assert.deepEqual(check.reasons, [])
  assert.equal(check.priceBasis, 'billing_quantity')
})

test('neto impreso sin descuento: se calcula el precio real desde la línea', () => {
  const evidence = row({
    quantity_raw: '2', unit_price_raw: '3,23', net_unit_price_raw: '3,24',
    line_total_raw: '6,47',
  })
  assert.equal(reconcileUnadjustedNetUnitPrice(evidence), '3.235')
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
  assert.equal(reconcileUnadjustedNetUnitPrice({ ...evidence, discount_raw: '0,50' }), null)
  assert.equal(reconcileUnadjustedNetUnitPrice({ ...evidence, line_total_raw: '6,37' }), null)
})

test('no supone un descuento en euros sin precio neto explícito', () => {
  const check = validateObservedLine(row({ quantity_raw: '1', unit_price_raw: '8,58',
    discount_raw: '3,38', discount_header_raw: 'DTO.', line_total_raw: '5,20' }))
  assert.ok(check.reasons.includes('descuento_sin_porcentaje_verificado'))
  assert.ok(check.reasons.includes('cantidad_precio_importe_no_reconcilian'))
})

test('no trata Ibee de Santa Teresa como descuento', () => {
  const check = validateObservedLine(row({ quantity_raw: '72', unit_price_raw: '1.15',
    other_charge_raw: '2.16', other_charge_header_raw: 'Ibee', line_total_raw: '82.80' }))
  assert.deepEqual(check.reasons, [])
})

test('Ibee en columna OCR de descuento no bloquea si el importe bruto cuadra', () => {
  const evidence = row({ quantity_raw: '24', unit_price_raw: '0.54',
    net_unit_price_raw: '0.54', discount_raw: '0.79', discount_header_raw: 'Ibee',
    line_total_raw: '12.96' })
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
  assert.ok(validateObservedLine({ ...evidence, line_total_raw: '12.17' }).reasons
    .includes('descuento_sin_porcentaje_verificado'))
  assert.ok(validateObservedLine({ ...evidence, net_unit_price_raw: '0.48' }).reasons
    .includes('descuento_sin_porcentaje_verificado'))
})

test('Santa Teresa: Pre+Iva no se interpreta como precio neto ni Ibee como descuento', () => {
  const evidence = row({ quantity_raw: '24', unit_price_raw: '0.92',
    net_unit_price_raw: '1.11', discount_raw: '0.90', discount_header_raw: 'Ibee',
    line_total_raw: '22.08' })
  assert.deepEqual(validateObservedLine(evidence).reasons, [])
  assert.equal(validateObservedLine(evidence).lineTotal, 22.08)
  assert.ok(validateObservedLine({ ...evidence, net_unit_price_raw: '1.12' }).reasons
    .includes('precio_neto_contradictorio'))
  assert.ok(validateObservedLine({ ...evidence, line_total_raw: '21.08' }).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
  const olives = row({ quantity_raw: '18', unit_price_raw: '6.95',
    net_unit_price_raw: '7.65', discount_raw: '0.00', discount_header_raw: 'Ibee',
    line_total_raw: '125.10' })
  assert.deepEqual(validateObservedLine(olives).reasons, [])
})

test('bloquea filas impresas sin cantidad entregada', () => {
  assert.ok(validateObservedLine(row({ unit_price_raw: '1', line_total_raw: '1' }))
    .reasons.includes('cantidad_ausente_o_invalida'))
})

test('reconcilia una caja de 10 kg con precio por kg', () => {
  const check = validateObservedLine(row({ quantity_raw: '1', billing_unit_raw: 'BU',
    content_per_unit_raw: '10', content_unit_raw: 'KG', unit_price_raw: '5,56', line_total_raw: '55,60' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.priceBasis, 'package_content')
})

test('Videla: un bulto con 10 kg impresos en la unidad se factura por peso', () => {
  const check = validateObservedLine(row({ quantity_raw: '1,00', billing_unit_raw: 'BU 10,00 KG',
    unit_price_raw: '5,56', line_total_raw: '55,60' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.packageContent, 10)
  assert.equal(check.priceBasis, 'package_content')
  assert.ok(validateObservedLine(row({ quantity_raw: '2', billing_unit_raw: 'BU 10,00 KG',
    unit_price_raw: '5,56', line_total_raw: '111,20' })).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
})

test('Videla: varios bultos con peso total impreso solo se aceptan si el importe cuadra', () => {
  const evidence = row({ quantity_raw: '3,00', billing_unit_raw: 'BU',
    content_per_unit_raw: '15,60', content_unit_raw: 'KG',
    unit_price_raw: '9,75', line_total_raw: '152,10' })
  assert.equal(verifiedTotalWeightColumn(evidence), 15.6)
  assert.equal(reconcileVerifiedTotalWeightUnitPrice(evidence), 9.75)
  const rounded = { ...evidence, billing_unit_raw: 'CJ', content_per_unit_raw: '7,50',
    unit_price_raw: '5,95', line_total_raw: '44,63' }
  assert.equal(verifiedTotalWeightColumn(rounded), 7.5)
  assert.equal(reconcileVerifiedTotalWeightUnitPrice(rounded), 5.9507)
  assert.equal(reconcileVerifiedTotalWeightUnitPrice({ ...rounded, line_total_raw: '45,63' }), null)
  assert.equal(verifiedTotalWeightColumn({ ...evidence, content_per_unit_raw: '5,20' }), null)
  assert.equal(verifiedTotalWeightColumn({ ...evidence, line_total_raw: '151,10' }), null)
  assert.equal(verifiedTotalWeightColumn({ ...evidence, discount_raw: '1' }), null)
})

test('Santa Teresa: Importe es el total y Pre+Iva el precio de una unidad', () => {
  const check = validateObservedLine(row({ quantity_raw: '600', unit_price_raw: '0.54',
    tax_rate_raw: '21.0', line_total_raw: '0.65', other_charge_raw: '324.00',
    other_charge_header_raw: 'Importe', discount_raw: '1.58', discount_header_raw: 'Ibee' }))
  assert.deepEqual(check.reasons, [])
  assert.equal(check.lineTotal, 324)
  assert.equal(check.priceBasis, 'billing_quantity')
  assert.ok(validateObservedLine(row({ quantity_raw: '600', unit_price_raw: '0.54',
    tax_rate_raw: '21.0', line_total_raw: '0.65', other_charge_raw: '300.00',
    other_charge_header_raw: 'Importe' })).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
})

test('Santa Teresa: varias bases de IVA corrigen una tasa OCR común sin ocultar descuadres', () => {
  const pimientos = row({ quantity_raw: '3', unit_price_raw: '2.95',
    tax_rate_raw: '21.0', line_total_raw: '3.25', other_charge_raw: '8.85',
    other_charge_header_raw: 'Importe' })
  assert.equal(validateObservedLine(pimientos).lineTotal, 8.85)
  assert.deepEqual(validateObservedLine(pimientos).reasons, [])
  const zumo = row({ quantity_raw: '24', unit_price_raw: '0.50', tax_rate_raw: '4.0',
    line_total_raw: '0.61', other_charge_raw: '12.00', other_charge_header_raw: 'Importe' })
  assert.deepEqual(validateObservedLine(zumo).reasons, [])
  assert.ok(validateObservedLine({ ...zumo, other_charge_raw: '11.00' }).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
  assert.ok(validateObservedLine({ ...zumo, line_total_raw: '0.74' }).reasons
    .includes('cantidad_precio_importe_no_reconcilian'))
})

test('bloquea total inconsistente y precio neto que es un porcentaje', () => {
  const check = validateObservedLine(row({ quantity_raw: '2', unit_price_raw: '43,98',
    net_unit_price_raw: '25', line_total_raw: '65,97' }))
  assert.ok(check.reasons.includes('cantidad_precio_importe_no_reconcilian'))
  assert.ok(check.reasons.includes('precio_neto_contradictorio'))
})

test('reconcilia IVA de documento sin convertir importe bruto en subtotal', () => {
  const doc: CanonicalDocument = { supplier_name_raw: null, document_number_raw: null,
    document_date_raw: null, currency_raw: null, subtotal_raw: '268,10', tax_raw: '27,38',
    total_raw: '295,48', lines: [row({ quantity_raw: '1', unit_price_raw: '268,10', line_total_raw: '268,10' })] }
  assert.deepEqual(validateObservedDocument(doc).reasons, [])
  assert.equal(validateObservedDocument({ ...doc, total_raw: '200,00' }).reasons[0], 'subtotal_iva_total_no_reconcilian')
})

test('varias bases de IVA no generan aviso si todas las líneas más el IVA cuadran con el total', () => {
  const doc: CanonicalDocument = { supplier_name_raw: null, document_number_raw: null,
    document_date_raw: null, currency_raw: null, subtotal_raw: '56,91', tax_raw: '3,18',
    total_raw: '69,17', lines: [
      row({ quantity_raw: '1', unit_price_raw: '56,91', line_total_raw: '56,91' }),
      row({ quantity_raw: '1', unit_price_raw: '9,08', line_total_raw: '9,08' }),
    ] }
  assert.deepEqual(validateObservedDocument(doc).reasons, [])
  assert.ok(validateObservedDocument({ ...doc, lines: doc.lines.slice(0, 1) }).reasons
    .includes('subtotal_iva_total_no_reconcilian'))
})

test('impide recepción automática sin importe de control y compara subtotal aun sin IVA', () => {
  const doc: CanonicalDocument = { supplier_name_raw: null, document_number_raw: null,
    document_date_raw: null, currency_raw: null, subtotal_raw: null, tax_raw: null,
    total_raw: null, lines: [row({ quantity_raw: '1', unit_price_raw: '5', line_total_raw: '5' })] }
  assert.ok(validateObservedDocument(doc).reasons.includes('total_documento_no_verificable'))
  assert.ok(validateObservedDocument({ ...doc, subtotal_raw: '6' }).reasons
    .includes('lineas_subtotal_no_reconcilian'))
  assert.deepEqual(validateObservedDocument({ ...doc, subtotal_raw: '5' }).reasons, [])
})

test('BONKA: regalo con descuento fijo íntegro exige revisión humana cuando no hay neto impreso', () => {
  const gift = row({ quantity_raw: '1', unit_price_raw: '15,43',
    discount_raw: '15,43', discount_header_raw: 'DTO.',
    net_unit_price_raw: null, line_total_raw: null })
  assert.equal(reconcileFreeFixedDiscountedUnitPrice(gift), '0')
  assert.equal(reconcileFixedDiscountedUnitPrice(gift), null)
  assert.ok(validateObservedLine(gift).reasons.includes('importe_ausente_o_invalido'))
  assert.equal(reconcileFreeFixedDiscountedUnitPrice({ ...gift, discount_raw: '15,42' }), null)
  assert.equal(reconcileFreeFixedDiscountedUnitPrice({ ...gift, line_total_raw: '0,01' }), null)
  assert.equal(reconcileFreeFixedDiscountedUnitPrice({ ...gift, net_unit_price_raw: '0,01' }), null)
  assert.equal(reconcileFreeFixedDiscountedUnitPrice({ ...gift, other_charge_raw: '0,01' }), null)
  assert.equal(reconcileFreeFixedDiscountedUnitPrice({ ...gift, discount_header_raw: '% DTO.' }), null)
})

test('descuento porcentual del 100 % con neto 0 reconcilia; otros no', () => {
  const gift = row({ quantity_raw: '2', unit_price_raw: '5,00',
    discount_raw: '100', discount_header_raw: '% DTO.',
    net_unit_price_raw: '0,00', line_total_raw: '0,00' })
  assert.equal(reconcilePercentageDiscountedUnitPrice(gift), '0')
  assert.deepEqual(validateObservedLine(gift).reasons, [])
  assert.equal(validateObservedLine(gift).priceBasis, 'billing_quantity')
  assert.equal(reconcilePercentageDiscountedUnitPrice({ ...gift, discount_raw: '99' }), null)
  assert.equal(reconcilePercentageDiscountedUnitPrice({ ...gift, line_total_raw: '0,01' }), null)
})
