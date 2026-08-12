import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createGuardedEvidenceClient,
  EvidenceOnlyWriter,
  EvidenceWriteBlockedError,
  type EvidenceWriteClient,
} from './writer.ts'

function mockClient(opts?: {
  onRpc?: (fn: string) => void
  onInsert?: (table: string) => void
}): EvidenceWriteClient {
  return {
    async rpc(fn) {
      opts?.onRpc?.(fn)
      return {
        data: { extraction_id: 'ex-1', row_mapping: { '0_0': 'row-1' }, inserted: true },
        error: null,
      }
    },
    from(table: string) {
      return {
        async insert() {
          opts?.onInsert?.(table)
          return { data: null, error: null }
        },
      }
    },
  }
}

describe('evidence-backfill writer allowlist', () => {
  it('permite persist_document_evidence y provenance cuando allowWrite', async () => {
    const calls: string[] = []
    const writer = new EvidenceOnlyWriter(
      mockClient({
        onRpc: (fn) => calls.push(`rpc:${fn}`),
        onInsert: (t) => calls.push(`insert:${t}`),
      }),
      { allowWrite: true }
    )
    const persist = await writer.persistDocumentEvidence({
      invoiceId: 'inv',
      fileVersionHash: 'abc',
      extractorVersion: 'v1',
      rawJsonArtifact: {},
      status: 'success',
      tables: [],
    })
    assert.equal(persist.inserted, true)
    await writer.insertProvenance([
      {
        invoice_line_id: 'l1',
        document_row_id: 'row-1',
        linked_by: 'backfill-matcher-v1',
        confidence_score: 0.9,
      },
    ])
    assert.deepEqual(calls, ['rpc:persist_document_evidence', 'insert:purchase_line_provenance'])
  })

  it('bloquea writer con allowWrite=false', async () => {
    const writer = new EvidenceOnlyWriter(mockClient(), { allowWrite: false })
    await assert.rejects(
      () =>
        writer.persistDocumentEvidence({
          invoiceId: 'inv',
          fileVersionHash: 'abc',
          extractorVersion: 'v1',
          rawJsonArtifact: {},
          status: 'no_table',
          tables: null,
        }),
      (err: unknown) => err instanceof EvidenceWriteBlockedError
    )
  })

  it('forbidWrite falla para UPDATE/DELETE/INSERT otras tablas', () => {
    const writer = new EvidenceOnlyWriter(mockClient(), { allowWrite: true })
    assert.throws(() => writer.forbidWrite('UPDATE', 'purchase_invoices'), EvidenceWriteBlockedError)
    assert.throws(() => writer.forbidWrite('DELETE', 'purchase_invoice_lines'), EvidenceWriteBlockedError)
    assert.throws(() => writer.forbidWrite('INSERT', 'ingredients'), EvidenceWriteBlockedError)
    assert.throws(() => writer.assertInsertTableAllowed('purchase_invoices'), EvidenceWriteBlockedError)
    assert.throws(() => writer.assertRpcAllowed('check_purchase_invoice_duplicate'), EvidenceWriteBlockedError)
  })

  it('guarded client bloquea RPC/INSERT fuera de allowlist', async () => {
    const guarded = createGuardedEvidenceClient(mockClient(), { allowWrite: true })
    await assert.rejects(() => guarded.rpc('other_rpc', {}), EvidenceWriteBlockedError)
    await assert.rejects(() => guarded.from('purchase_invoices').insert({}), EvidenceWriteBlockedError)
  })

  it('guarded client bloquea todo en dry-run (allowWrite false)', async () => {
    const guarded = createGuardedEvidenceClient(mockClient(), { allowWrite: false })
    await assert.rejects(() => guarded.rpc('persist_document_evidence', {}), EvidenceWriteBlockedError)
    await assert.rejects(
      () => guarded.from('purchase_line_provenance').insert([]),
      EvidenceWriteBlockedError
    )
  })
})
