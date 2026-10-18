import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifiedCorrectedOcrAmount } from './verified-ocr-amount.ts'

const caseInput = {
  attested: true,
  priorReasons: ['cantidad_precio_importe_no_reconcilian'],
  priorManualCorrection: true,
  observed: {
    quantity_raw: '4,000', unit_price_raw: '6,660', line_total_raw: '26,84',
    discount_raw: null, net_unit_price_raw: null, other_charge_raw: null,
  },
  quantity: '4', unitPrice: '6.66', correctedTotal: '26.64',
}

test('permite el importe cotejado de una lectura OCR errónea sin alterar cantidad ni precio', () => {
  assert.equal(verifiedCorrectedOcrAmount(caseInput), true)
})

test('exige declaración humana y una corrección previa de la línea', () => {
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput, attested: false }), false)
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput, priorManualCorrection: false }), false)
})

test('rechaza descuentos, cambios de cantidad o precio y aritmética incorrecta', () => {
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput,
    observed: { ...caseInput.observed, discount_raw: '20%' } }), false)
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput, quantity: '5' }), false)
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput, unitPrice: '6.65' }), false)
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput, correctedTotal: '26.63' }), false)
  assert.equal(verifiedCorrectedOcrAmount({ ...caseInput, correctedTotal: '26.84' }), false)
})
