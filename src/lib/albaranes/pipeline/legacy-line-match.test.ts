import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchLegacyLinesToMistral, parseQuantity } from './legacy-line-match.ts'

const panabadLegacy = [
  { id: 'bocata', originalName: 'BOCATA MEDITERRANEO- 60 Uds.', quantity: 8 },
  { id: 'bombon', originalName: 'CROISSANT BOMBON FERMENTADO - 40 Uds.', quantity: 1 },
  { id: 'mantequilla', originalName: 'CROISSANT 75 gr MANTEQUILLA FERMENTADO - Caja 55 u', quantity: 1 },
]
const panabadMistral = [
  { rowIndex: 0, descriptionRaw: 'BOCATA MEDITERRANEO- 60 Uds. 100006632', quantityRaw: '8,000', supplierProductCodeRaw: '1530007' },
  { rowIndex: 1, descriptionRaw: 'CROISSANT BOMBON FERMENTADO - 40 u', quantityRaw: '1,000', supplierProductCodeRaw: '17080809' },
  { rowIndex: 2, descriptionRaw: 'CROISSANT 75 gr MANTEQUILLA FERMENTADO - Caja 55 u', quantityRaw: '1,000', supplierProductCodeRaw: '17104016' },
]

describe('historical line reconciliation', () => {
  it('matches the three actual Panabad 05/09 lines to distinct Mistral rows', () => {
    const result = matchLegacyLinesToMistral({ legacyLines: panabadLegacy, mistralRows: panabadMistral })
    assert.deepEqual(result.map((item) => [item.legacyLineId, item.mistralRowIndex, item.reason]), [
      ['bocata', 0, 'matched'], ['bombon', 1, 'matched'], ['mantequilla', 2, 'matched'],
    ])
    assert.equal(result[0]!.evidence.mistralCode, '100006632')
    assert.equal(result[0]!.evidence.legacyQuantity, 8)
    assert.equal(result[0]!.evidence.mistralQuantity, 8)
  })

  it('accepts accents, punctuation and Uds/u changes without changing pack size', () => {
    const result = matchLegacyLinesToMistral({
      legacyLines: [{ id: 'b', originalName: 'BÓCATA MEDITERRÁNEO, 60 UDS', quantity: 8 }],
      mistralRows: panabadMistral,
    })
    assert.equal(result[0]!.mistralRowIndex, 0)
  })

  it('blocks duplicate rows and duplicate legacy lines instead of assigning one row twice', () => {
    const duplicateRow = matchLegacyLinesToMistral({
      legacyLines: [panabadLegacy[0]!],
      mistralRows: [panabadMistral[0]!, { ...panabadMistral[0]!, rowIndex: 3 }],
    })
    assert.equal(duplicateRow[0]!.reason, 'ambiguous_mistral_rows')
    assert.equal(duplicateRow[0]!.mistralRowIndex, null)
    const duplicateLegacy = matchLegacyLinesToMistral({
      legacyLines: [panabadLegacy[0]!, { ...panabadLegacy[0]!, id: 'second' }],
      mistralRows: [panabadMistral[0]!],
    })
    assert.deepEqual(duplicateLegacy.map((item) => item.reason), ['ambiguous_legacy_lines', 'ambiguous_legacy_lines'])
    assert.deepEqual(duplicateLegacy.map((item) => item.mistralRowIndex), [null, null])
  })

  it('does not match by position, price or quantity alone', () => {
    const result = matchLegacyLinesToMistral({
      legacyLines: [{ id: 'wrong', originalName: 'CROISSANT DE QUESO - 40 Uds.', quantity: 1 }],
      mistralRows: [panabadMistral[1]!],
    })
    assert.equal(result[0]!.reason, 'no_exact_match')
    assert.equal(result[0]!.mistralRowIndex, null)
  })

  it('blocks changed quantities, conflicting appended codes and unusable quantities', () => {
    const changedQuantity = matchLegacyLinesToMistral({
      legacyLines: [{ ...panabadLegacy[0]!, quantity: 7 }], mistralRows: [panabadMistral[0]!],
    })
    assert.equal(changedQuantity[0]!.reason, 'no_exact_match')
    const changedCode = matchLegacyLinesToMistral({
      legacyLines: [{ ...panabadLegacy[0]!, originalName: 'BOCATA MEDITERRANEO- 60 Uds. 999999999' }],
      mistralRows: [panabadMistral[0]!],
    })
    assert.equal(changedCode[0]!.reason, 'no_exact_match')
    const invalid = matchLegacyLinesToMistral({
      legacyLines: [{ ...panabadLegacy[0]!, quantity: null }], mistralRows: [panabadMistral[0]!],
    })
    assert.equal(invalid[0]!.reason, 'invalid_evidence')
    assert.equal(parseQuantity('8 cajas más 1'), null)
  })
})
