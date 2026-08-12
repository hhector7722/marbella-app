import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  matchHistoricalRows,
  provenanceCandidatesFromMatcher,
  type DocumentRowForMatch,
  type OperativeLineForMatch,
} from './matcher.ts'

function line(
  partial: Partial<OperativeLineForMatch> & { id: string; original_name: string; orderIndex: number }
): OperativeLineForMatch {
  return {
    quantity: 1,
    unit_price: 1,
    total_price: 1,
    line_unit: null,
    status: 'mapped',
    ingredient_name: null,
    ...partial,
  }
}

function row(
  partial: Partial<DocumentRowForMatch> & { rowMappingKey: string; description: string; orderIndex: number }
): DocumentRowForMatch {
  return {
    quantity: 1,
    unitPrice: 1,
    unit: null,
    ...partial,
  }
}

describe('evidence-backfill matcher', () => {
  it('empareja por nombre exacto', () => {
    const result = matchHistoricalRows(
      [row({ rowMappingKey: '0_0', description: 'CASERAS 60G', orderIndex: 0 })],
      [line({ id: 'l1', original_name: 'CASERAS 60G', orderIndex: 0 })]
    )
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].invoiceLineId, 'l1')
    assert.equal(result.matches[0].decision, 'MATCH')
  })

  it('divergencia de cantidad/precio NO rompe un MATCH de nombre fuerte', () => {
    const result = matchHistoricalRows(
      [
        row({
          rowMappingKey: '0_0',
          description: 'TOMATE RAF',
          quantity: 10,
          unitPrice: 2.5,
          orderIndex: 0,
        }),
      ],
      [
        line({
          id: 'l1',
          original_name: 'TOMATE RAF',
          quantity: 99,
          unit_price: 0.01,
          orderIndex: 0,
        }),
      ]
    )
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].decision, 'MATCH')
    assert.equal(result.ambiguous.length, 0)
  })

  it('AMBIGUOUS nunca crea provenance', () => {
    const result = matchHistoricalRows(
      [row({ rowMappingKey: '0_0', description: 'ACEITE', orderIndex: 0 })],
      [
        line({ id: 'l1', original_name: 'ACEITE OLIVA 5L', orderIndex: 0 }),
        line({ id: 'l2', original_name: 'ACEITE GIRASOL 5L', orderIndex: 1 }),
      ]
    )
    assert.ok(result.ambiguous.length + result.noMatch.length >= 1)
    assert.equal(result.matches.length, 0)
    const prov = provenanceCandidatesFromMatcher(result)
    assert.equal(prov.length, 0)
    for (const a of result.ambiguous) {
      assert.equal(a.decision, 'AMBIGUOUS')
      assert.equal(a.invoiceLineId, null)
    }
  })

  it('NO_MATCH nunca crea provenance', () => {
    const result = matchHistoricalRows(
      [row({ rowMappingKey: '0_0', description: 'XYZ-NO-EXISTE-123', orderIndex: 0 })],
      [line({ id: 'l1', original_name: 'PAN DE HAMBURGUESA', orderIndex: 0 })]
    )
    assert.equal(result.matches.length, 0)
    assert.ok(result.noMatch.length >= 1)
    assert.equal(provenanceCandidatesFromMatcher(result).length, 0)
  })

  it('provenanceCandidatesFromMatcher solo incluye MATCH', () => {
    const result = matchHistoricalRows(
      [
        row({ rowMappingKey: '0_0', description: 'AGUA', orderIndex: 0 }),
        row({ rowMappingKey: '0_1', description: 'COSA RARA ZZ', orderIndex: 1 }),
      ],
      [
        line({ id: 'l1', original_name: 'AGUA', orderIndex: 0 }),
        line({ id: 'l2', original_name: 'OTRO', orderIndex: 1 }),
      ]
    )
    const prov = provenanceCandidatesFromMatcher(result)
    assert.ok(prov.every((p) => p.linked_by === 'backfill-matcher-v1'))
    assert.ok(prov.every((p) => result.matches.some((m) => m.invoiceLineId === p.invoice_line_id)))
    assert.ok(!prov.some((p) => result.ambiguous.some((a) => a.rowMappingKey === p.row_mapping_key)))
    assert.ok(!prov.some((p) => result.noMatch.some((n) => n.rowMappingKey === p.row_mapping_key)))
  })
})
