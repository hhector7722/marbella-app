import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MANUAL_EVIDENCE_CANDIDATE_NAME_THRESHOLD,
  decideManualProvenanceInsert,
  resolveActiveProvenance,
  scoreDocumentRowNameForLine,
  selectDocumentRowsForEvidenceReview,
  type DocumentRowSummary,
  type ProvenanceRecord,
} from './document-evidence.ts'

function row(
  partial: Partial<DocumentRowSummary> & {
    document_row_id: string
    description: string | null
  }
): DocumentRowSummary {
  return {
    table_id: 't1',
    table_index: 0,
    row_index: 0,
    quantity: 1,
    unit_price: 1,
    amount: 1,
    isHeuristicCandidate: true,
    linkedOtherLines: [],
    ...partial,
  }
}

describe('document-evidence — selectDocumentRowsForEvidenceReview', () => {
  it('FRANKFURT no recibe AGUA/APEROL como candidatas', () => {
    const rows = [
      row({
        document_row_id: 'r-frankfurt',
        description: 'FRANKFURT WESTFALIA 15 PZAS',
        row_index: 0,
      }),
      row({
        document_row_id: 'r-agua',
        description: 'AGUA MALAVELLA',
        row_index: 1,
      }),
      row({
        document_row_id: 'r-aperol',
        description: 'APEROL',
        row_index: 2,
      }),
    ]

    const selected = selectDocumentRowsForEvidenceReview({
      rows,
      lineOriginalName: 'FRANKFURT WESTFALIA 15 PZAS',
      activeDocumentRowId: null,
    })

    assert.deepEqual(
      selected.map((r) => r.document_row_id),
      ['r-frankfurt']
    )
    assert.ok(
      scoreDocumentRowNameForLine('AGUA MALAVELLA', 'FRANKFURT WESTFALIA 15 PZAS') <
        MANUAL_EVIDENCE_CANDIDATE_NAME_THRESHOLD
    )
    assert.ok(
      scoreDocumentRowNameForLine('APEROL', 'FRANKFURT WESTFALIA 15 PZAS') <
        MANUAL_EVIDENCE_CANDIDATE_NAME_THRESHOLD
    )
  })

  it('MATCH con provenance: solo la fila OCR vinculada', () => {
    const rows = [
      row({
        document_row_id: 'r-linked',
        description: 'FRANKFURT WESTFALIA 15 PZAS',
        row_index: 0,
      }),
      row({
        document_row_id: 'r-other',
        description: 'AGUA MALAVELLA',
        row_index: 1,
      }),
      row({
        document_row_id: 'r-also-similar',
        description: 'FRANKFURT',
        row_index: 2,
      }),
    ]

    const selected = selectDocumentRowsForEvidenceReview({
      rows,
      lineOriginalName: 'FRANKFURT WESTFALIA 15 PZAS',
      activeDocumentRowId: 'r-linked',
    })

    assert.equal(selected.length, 1)
    assert.equal(selected[0]?.document_row_id, 'r-linked')
  })

  it('AMBIGUOUS: deja candidatas reales de esa línea ordenadas por score', () => {
    const rows = [
      row({
        document_row_id: 'r-weak',
        description: 'WESTFALIA FRANKFURT',
        row_index: 2,
      }),
      row({
        document_row_id: 'r-strong',
        description: 'FRANKFURT WESTFALIA 15 PZAS',
        row_index: 0,
      }),
      row({
        document_row_id: 'r-noise',
        description: 'CERVEZA ESTRELLA',
        row_index: 1,
      }),
    ]

    const selected = selectDocumentRowsForEvidenceReview({
      rows,
      lineOriginalName: 'FRANKFURT WESTFALIA 15 PZAS',
      activeDocumentRowId: null,
    })

    assert.ok(selected.length >= 1)
    assert.equal(selected[0]?.document_row_id, 'r-strong')
    assert.ok(!selected.some((r) => r.document_row_id === 'r-noise'))
  })

  it('NO_MATCH / 0 candidatas: lista vacía (UI: Sin coincidencia automática)', () => {
    const rows = [
      row({
        document_row_id: 'r-agua',
        description: 'AGUA MALAVELLA',
        row_index: 0,
      }),
      row({
        document_row_id: 'r-aperol',
        description: 'APEROL',
        row_index: 1,
      }),
    ]

    const selected = selectDocumentRowsForEvidenceReview({
      rows,
      lineOriginalName: 'FRANKFURT WESTFALIA 15 PZAS',
      activeDocumentRowId: null,
    })

    assert.deepEqual(selected, [])
  })

  it('fila vinculada a otra línea sigue marcada (no candidata normal) si pasa umbral', () => {
    const rows = [
      row({
        document_row_id: 'r-shared',
        description: 'FRANKFURT WESTFALIA 15 PZAS',
        row_index: 0,
        linkedOtherLines: [
          {
            document_row_id: 'r-shared',
            invoice_line_id: 'other-line',
            original_name: 'FRANKFURT DUP',
          },
        ],
      }),
    ]

    const selected = selectDocumentRowsForEvidenceReview({
      rows,
      lineOriginalName: 'FRANKFURT WESTFALIA 15 PZAS',
      activeDocumentRowId: null,
    })

    assert.equal(selected.length, 1)
    assert.equal(selected[0]?.linkedOtherLines.length, 1)
    assert.equal(selected[0]?.linkedOtherLines[0]?.invoice_line_id, 'other-line')
  })

  it('excluye filas fuera de heurística de artículo aunque el nombre coincida', () => {
    const rows = [
      row({
        document_row_id: 'r-garbage',
        description: 'FRANKFURT WESTFALIA 15 PZAS',
        isHeuristicCandidate: false,
      }),
    ]

    const selected = selectDocumentRowsForEvidenceReview({
      rows,
      lineOriginalName: 'FRANKFURT WESTFALIA 15 PZAS',
      activeDocumentRowId: null,
    })

    assert.deepEqual(selected, [])
  })
})

describe('document-evidence — provenance helpers', () => {
  it('resolveActiveProvenance ignora supersedidos', () => {
    const chain: ProvenanceRecord[] = [
      {
        id: 'p1',
        invoice_line_id: 'l1',
        document_row_id: 'r1',
        supersedes_id: null,
        linked_by: 'backfill-matcher-v1',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        invoice_line_id: 'l1',
        document_row_id: 'r2',
        supersedes_id: 'p1',
        linked_by: 'manual-review',
        created_at: '2026-01-02T00:00:00Z',
      },
    ]
    const active = resolveActiveProvenance(chain)
    assert.equal(active?.id, 'p2')
  })

  it('decideManualProvenanceInsert rechaza si ya hay otra fila activa', () => {
    const decision = decideManualProvenanceInsert({
      lineInvoiceId: 'inv1',
      extractionInvoiceId: 'inv1',
      activeProvenance: {
        id: 'p1',
        invoice_line_id: 'l1',
        document_row_id: 'r1',
        supersedes_id: null,
        linked_by: 'manual-review',
        created_at: '2026-01-01T00:00:00Z',
      },
      requestedDocumentRowId: 'r2',
    })
    assert.equal(decision.ok, false)
    if (!decision.ok) assert.equal(decision.code, 'ALREADY_LINKED_OTHER_ROW')
  })
})
