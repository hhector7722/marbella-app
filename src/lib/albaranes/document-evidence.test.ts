import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MANUAL_PROVENANCE_LINKED_BY,
  buildDocumentRowSummaries,
  decideManualProvenanceInsert,
  isUniqueViolationError,
  resolveActiveProvenance,
  storedTablesToGemini,
  type ProvenanceRecord,
  type StoredEvidenceTable,
} from './document-evidence.ts'

function sampleTables(): StoredEvidenceTable[] {
  return [
    {
      id: 'table-0',
      table_index: 0,
      columns: [
        { id: 'c-desc', col_index: 0, original_name: 'Descripción' },
        { id: 'c-qty', col_index: 1, original_name: 'Cantidad' },
        { id: 'c-price', col_index: 2, original_name: 'Precio' },
        { id: 'c-amt', col_index: 3, original_name: 'Importe' },
      ],
      rows: [
        {
          id: 'row-a',
          row_index: 0,
          cells: [
            { column_id: 'c-desc', raw_value: 'Entrecot vedella' },
            { column_id: 'c-qty', raw_value: '2,5' },
            { column_id: 'c-price', raw_value: '12,50' },
            { column_id: 'c-amt', raw_value: '31,25' },
          ],
        },
        {
          id: 'row-b',
          row_index: 1,
          cells: [
            { column_id: 'c-desc', raw_value: 'PORTES' },
            { column_id: 'c-qty', raw_value: '1' },
            { column_id: 'c-price', raw_value: '5,00' },
            { column_id: 'c-amt', raw_value: '5,00' },
          ],
        },
      ],
    },
  ]
}

describe('document-evidence lectura OCR sin provenance', () => {
  it('1. sin provenance → construye filas OCR desde tablas existentes', () => {
    const summaries = buildDocumentRowSummaries(sampleTables(), [], 'line-1')
    assert.equal(summaries.length, 2)
    assert.equal(summaries[0]!.document_row_id, 'row-a')
    assert.equal(summaries[0]!.description, 'Entrecot vedella')
    assert.equal(summaries[0]!.quantity, 2.5)
    assert.equal(summaries[0]!.unit_price, 12.5)
    assert.equal(summaries[0]!.amount, 31.25)
    assert.equal(summaries[0]!.isHeuristicCandidate, true)
    // PORTES sigue visible (caso 0 candidatos / filas disponibles) aunque no sea candidato heurístico
    assert.equal(summaries[1]!.document_row_id, 'row-b')
    assert.equal(summaries[1]!.isHeuristicCandidate, false)
  })

  it('storedTablesToGemini preserva índices de columna', () => {
    const gemini = storedTablesToGemini(sampleTables())
    assert.equal(gemini[0]!.columns[0]!.name, 'Descripción')
    assert.equal(gemini[0]!.rows[0]!.cells[0]!.raw_value, 'Entrecot vedella')
  })
})

describe('document-evidence con provenance activa', () => {
  it('2. con provenance → resolveActiveProvenance elige el no supersedido', () => {
    const chain: ProvenanceRecord[] = [
      {
        id: 'p2',
        invoice_line_id: 'line-1',
        document_row_id: 'row-b',
        supersedes_id: 'p1',
        linked_by: MANUAL_PROVENANCE_LINKED_BY,
        created_at: '2026-08-13T12:00:00Z',
      },
      {
        id: 'p1',
        invoice_line_id: 'line-1',
        document_row_id: 'row-a',
        supersedes_id: null,
        linked_by: 'backfill-matcher-v1',
        created_at: '2026-08-12T12:00:00Z',
      },
    ]
    const active = resolveActiveProvenance(chain)
    assert.equal(active?.id, 'p2')
    assert.equal(active?.document_row_id, 'row-b')
  })
})

describe('document-evidence decisión de INSERT manual', () => {
  it('3. selección válida → mode insert', () => {
    const d = decideManualProvenanceInsert({
      lineInvoiceId: 'inv-1',
      extractionInvoiceId: 'inv-1',
      activeProvenance: null,
      requestedDocumentRowId: 'row-a',
    })
    assert.equal(d.ok, true)
    if (d.ok) assert.equal(d.mode, 'insert')
  })

  it('4. vínculo repetido (mismo par activo) → idempotente', () => {
    const d = decideManualProvenanceInsert({
      lineInvoiceId: 'inv-1',
      extractionInvoiceId: 'inv-1',
      activeProvenance: {
        id: 'p1',
        invoice_line_id: 'line-1',
        document_row_id: 'row-a',
        supersedes_id: null,
        linked_by: MANUAL_PROVENANCE_LINKED_BY,
        created_at: '2026-08-13T12:00:00Z',
      },
      requestedDocumentRowId: 'row-a',
    })
    assert.equal(d.ok, true)
    if (d.ok && d.mode === 'idempotent') {
      assert.equal(d.existingId, 'p1')
    } else {
      assert.fail('esperaba idempotent')
    }
  })

  it('5. invoice_line de otro invoice (mismatch extracción) → rechazado', () => {
    const d = decideManualProvenanceInsert({
      lineInvoiceId: 'inv-A',
      extractionInvoiceId: 'inv-B',
      activeProvenance: null,
      requestedDocumentRowId: 'row-a',
    })
    assert.equal(d.ok, false)
    if (!d.ok) assert.equal(d.code, 'INVOICE_MISMATCH')
  })

  it('6. document_row de otro invoice → mismo rechazo INVOICE_MISMATCH', () => {
    const d = decideManualProvenanceInsert({
      lineInvoiceId: 'inv-1',
      extractionInvoiceId: 'inv-OTHER',
      activeProvenance: null,
      requestedDocumentRowId: 'row-foreign',
    })
    assert.equal(d.ok, false)
    if (!d.ok) assert.equal(d.code, 'INVOICE_MISMATCH')
  })

  it('7. fila ocupada por otra línea: schema permite; UI informa occupancy', () => {
    const summaries = buildDocumentRowSummaries(
      sampleTables(),
      [
        {
          document_row_id: 'row-a',
          invoice_line_id: 'line-OTHER',
          original_name: 'Otra línea',
        },
      ],
      'line-1'
    )
    assert.equal(summaries[0]!.linkedOtherLines.length, 1)
    assert.equal(summaries[0]!.linkedOtherLines[0]!.original_name, 'Otra línea')
    // Decisión de insert NO bloquea por ocupación (no hay UNIQUE en document_row_id)
    const d = decideManualProvenanceInsert({
      lineInvoiceId: 'inv-1',
      extractionInvoiceId: 'inv-1',
      activeProvenance: null,
      requestedDocumentRowId: 'row-a',
    })
    assert.equal(d.ok, true)
  })

  it('ya vinculada a otra fila distinta → rechazo sin inventar supersede', () => {
    const d = decideManualProvenanceInsert({
      lineInvoiceId: 'inv-1',
      extractionInvoiceId: 'inv-1',
      activeProvenance: {
        id: 'p1',
        invoice_line_id: 'line-1',
        document_row_id: 'row-a',
        supersedes_id: null,
        linked_by: 'backfill-matcher-v1',
        created_at: '2026-08-13T12:00:00Z',
      },
      requestedDocumentRowId: 'row-b',
    })
    assert.equal(d.ok, false)
    if (!d.ok) assert.equal(d.code, 'ALREADY_LINKED_OTHER_ROW')
  })
})

describe('document-evidence invariantes de escritura', () => {
  it('8/9. allowlist conceptual: solo purchase_line_provenance; unique violation = idempotente', () => {
    assert.equal(MANUAL_PROVENANCE_LINKED_BY, 'manual-review')
    assert.equal(isUniqueViolationError({ code: '23505', message: 'duplicate key' }), true)
    assert.equal(isUniqueViolationError({ code: '42P01', message: 'missing' }), false)
    // El INSERT de la action solo escribe purchase_line_provenance (ver confirmInvoiceLineProvenanceAction).
    // No hay caminos a purchase_invoice_lines ni document_* en document-evidence.ts.
  })
})
