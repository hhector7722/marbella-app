import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideIdempotency, shouldSkipBecauseDocumentVersionExists } from './idempotency.ts'
import { EvidenceOnlyWriter, type EvidenceWriteClient } from './writer.ts'
import { createHash } from 'node:crypto'
import { processInvoiceEvidenceOnly } from './pipeline.ts'

describe('evidence-backfill idempotency', () => {
  it('SKIP si existe extraction para la versión documental', () => {
    assert.equal(shouldSkipBecauseDocumentVersionExists(1), true)
    assert.equal(shouldSkipBecauseDocumentVersionExists(3), true)
    const d = decideIdempotency(2)
    assert.equal(d.skip, true)
    if (d.skip) assert.equal(d.reason, 'ALREADY_HAS_EVIDENCE')
  })

  it('continúa si extractionCountForHash = 0', () => {
    assert.equal(shouldSkipBecauseDocumentVersionExists(0), false)
    const d = decideIdempotency(0)
    assert.equal(d.skip, false)
  })

  it('A→B: primera creación inserted=true; segunda inserted=false no duplica writeCount de extraction', async () => {
    let insertCalls = 0
    const client: EvidenceWriteClient = {
      async rpc(_fn, args) {
        insertCalls += 1
        if (insertCalls === 1) {
          return {
            data: {
              extraction_id: 'ex-1',
              row_mapping: { '0_0': 'row-1' },
              inserted: true,
            },
            error: null,
          }
        }
        // misma (invoice, hash)
        assert.equal(args.p_file_version_hash, 'hash-a')
        return {
          data: {
            extraction_id: 'ex-1',
            row_mapping: { '0_0': 'row-1' },
            inserted: false,
          },
          error: null,
        }
      },
      from() {
        return {
          async insert() {
            return { data: null, error: null }
          },
        }
      },
    }

    const writer = new EvidenceOnlyWriter(client, { allowWrite: true })
    const first = await writer.persistDocumentEvidence({
      invoiceId: 'inv',
      fileVersionHash: 'hash-a',
      extractorVersion: 'v1',
      rawJsonArtifact: {},
      status: 'success',
      tables: [],
    })
    assert.equal(first.inserted, true)
    assert.equal(writer.getWriteCount(), 1)

    const second = await writer.persistDocumentEvidence({
      invoiceId: 'inv',
      fileVersionHash: 'hash-a',
      extractorVersion: 'v1',
      rawJsonArtifact: {},
      status: 'success',
      tables: [],
    })
    assert.equal(second.inserted, false)
    assert.equal(second.extraction_id, 'ex-1')
    assert.equal(writer.getWriteCount(), 1)
  })

  it('C: dos persistencias concurrentes simuladas → una sola inserted=true', async () => {
    let winners = 0
    const client: EvidenceWriteClient = {
      async rpc() {
        // Simula UNIQUE: el primero gana, el segundo ve conflicto
        if (winners === 0) {
          winners = 1
          return {
            data: { extraction_id: 'ex-win', row_mapping: {}, inserted: true },
            error: null,
          }
        }
        return {
          data: { extraction_id: 'ex-win', row_mapping: {}, inserted: false },
          error: null,
        }
      },
      from() {
        return { async insert() { return { data: null, error: null } } }
      },
    }
    const w1 = new EvidenceOnlyWriter(client, { allowWrite: true })
    const w2 = new EvidenceOnlyWriter(client, { allowWrite: true })
    const [a, b] = await Promise.all([
      w1.persistDocumentEvidence({
        invoiceId: 'inv',
        fileVersionHash: 'h',
        extractorVersion: 'v1',
        rawJsonArtifact: {},
        status: 'no_table',
        tables: null,
      }),
      w2.persistDocumentEvidence({
        invoiceId: 'inv',
        fileVersionHash: 'h',
        extractorVersion: 'v1',
        rawJsonArtifact: {},
        status: 'no_table',
        tables: null,
      }),
    ])
    const insertedCount = [a, b].filter((x) => x.inserted).length
    assert.equal(insertedCount, 1)
    assert.equal(a.extraction_id, b.extraction_id)
  })

  it('D: mismo invoice+documento → pipeline SKIP antes de OCR si hash ya existe', async () => {
    const buf = Buffer.from('doc')
    const sha = createHash('sha256').update(buf).digest('hex')
    let geminiCalls = 0
    const result = await processInvoiceEvidenceOnly('inv-1', {
      mode: 'write',
      writer: new EvidenceOnlyWriter(
        {
          async rpc() {
            throw new Error('no rpc')
          },
          from() {
            return { async insert() { throw new Error('no insert') } }
          },
        },
        { allowWrite: true }
      ),
      countExtractionsForDocument: async (_id, hash) => (hash === sha ? 1 : 0),
      loadInvoice: async () => ({
        id: 'inv-1',
        invoice_number: '1',
        invoice_date: '2018-06-26',
        total_amount: 1,
        file_path: 'a.jpg',
        content_sha256: sha,
        source: 'scanner',
        status: 'mapped',
        supplier_name: 'X',
      }),
      loadLines: async () => [],
      downloadFile: async () => {
        throw new Error('no download on early skip')
      },
      extractGemini: async () => {
        geminiCalls += 1
        return { ok: false, message: 'should not run' }
      },
    })
    assert.equal(result.outcome, 'SKIP_ALREADY_HAS_EVIDENCE')
    assert.equal(geminiCalls, 0)
    assert.deepEqual(result.writes, [])
  })

  it('E: provenance duplicate key se trata como skip idempotente', async () => {
    const client: EvidenceWriteClient = {
      async rpc() {
        return { data: { extraction_id: 'ex', row_mapping: {}, inserted: true }, error: null }
      },
      from() {
        return {
          async insert() {
            return { data: null, error: { message: 'duplicate key value', code: '23505' } }
          },
        }
      },
    }
    const writer = new EvidenceOnlyWriter(client, { allowWrite: true })
    const r = await writer.insertProvenance([
      {
        invoice_line_id: 'l1',
        document_row_id: 'r1',
        linked_by: 'backfill-matcher-v1',
        confidence_score: 1,
      },
    ])
    assert.equal(r.inserted, 0)
    assert.equal(r.skipped, 1)
  })

  it('RPC inserted=false en write → SKIP sin duplicar extraction write', async () => {
    const buf = Buffer.from('img-bytes')
    const sha = createHash('sha256').update(buf).digest('hex')
    let rpcCalls = 0
    const writer = new EvidenceOnlyWriter(
      {
        async rpc() {
          rpcCalls += 1
          return {
            data: {
              extraction_id: 'ex-existing',
              row_mapping: { '0_0': 'row-1' },
              inserted: false,
            },
            error: null,
          }
        },
        from() {
          return {
            async insert() {
              return { data: null, error: null }
            },
          }
        },
      },
      { allowWrite: true }
    )

    const result = await processInvoiceEvidenceOnly('inv-1', {
      mode: 'write',
      writer,
      countExtractionsForDocument: async () => 0,
      loadInvoice: async () => ({
        id: 'inv-1',
        invoice_number: '1',
        invoice_date: '2018-06-26',
        total_amount: 10,
        file_path: 'a.jpg',
        content_sha256: sha,
        source: 'scanner',
        status: 'mapped',
        supplier_name: 'Cava',
      }),
      loadLines: async () => [
        {
          id: 'l1',
          original_name: 'ITEM',
          quantity: 1,
          unit_price: 1,
          total_price: 1,
          line_unit: null,
          status: 'mapped',
          orderIndex: 0,
        },
      ],
      downloadFile: async () => ({
        ok: true,
        mimeType: 'image/jpeg',
        buffer: buf,
        rawBase64: buf.toString('base64'),
      }),
      extractGemini: async () => ({
        ok: true,
        data: {
          numero_factura: '1',
          fecha: '2018-06-26',
          total: 10,
          tables: [
            {
              index: 0,
              columns: [{ index: 0, name: 'DESCRIPCIÓN' }],
              rows: [{ index: 0, cells: [{ column_index: 0, raw_value: 'ITEM' }] }],
            },
          ],
        },
        rawJson: {},
      }),
    })

    assert.equal(result.outcome, 'SKIP_ALREADY_HAS_EVIDENCE')
    assert.equal(rpcCalls, 1)
    assert.ok(result.notes.includes('rpc_inserted_false'))
  })
})
