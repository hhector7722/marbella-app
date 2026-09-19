import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveVariableWeightEvidence } from './variable-weight.ts'

test('Videla: 1 PZ + 2,18 KG a 13,25 €/kg concilia 28,89 €', () => {
  const result = deriveVariableWeightEvidence({
    rawCells: ['10', '1,00PZ', '2,18KG', '13,25', '28,89'],
    unitPrice: '13,25',
    lineTotal: '28,89',
  })
  assert.deepEqual(result, {
    weightKg: 2.18,
    pieceCount: 1,
    matchedMeasure: '2,18KG',
    observedMeasures: ['1,00PZ', '2,18KG'],
  })
})

test('no inventa peso si importe y kg no concilian', () => {
  assert.equal(
    deriveVariableWeightEvidence({
      rawCells: ['1,00PZ', '2,18KG'],
      unitPrice: '13,25',
      lineTotal: '30,00',
    }),
    null
  )
})

test('rechaza dos pesos compatibles para evitar ambigüedad', () => {
  assert.equal(
    deriveVariableWeightEvidence({
      rawCells: ['1,00PZ', '2,18KG', '2180G'],
      unitPrice: '13,25',
      lineTotal: '28,89',
    }),
    null
  )
})


test('acepta precios persistidos con punto decimal', () => {
  const result = deriveVariableWeightEvidence({
    rawCells: ['1,00PZ', '2,18KG'],
    unitPrice: '13.25',
    lineTotal: '28.89',
  })
  assert.equal(result?.weightKg, 2.18)
})
