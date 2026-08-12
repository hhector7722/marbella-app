import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHash } from 'node:crypto'
import {
  assertDryRunCannotUseWriter,
  processInvoiceEvidenceOnly,
} from './pipeline.ts'
import { EvidenceOnlyWriter, type EvidenceWriteClient } from './writer.ts'
import type { OperativeLineForMatch } from './matcher.ts'

const mockWriteClient: EvidenceWriteClient = {
  async rpc() {
    throw new Error('rpc no debería llamarse en dry-run')
  },
  from() {
    return {
      async insert() {
        throw new Error('insert no debería llamarse en dry-run')
      },
    }
  },
}

describe('evidence-backfill dry-run never writes', () => {
  it('assertDryRunCannotUseWriter lanza si hay writer', () => {
    const writer = new EvidenceOnlyWriter(mockWriteClient, { allowWrite: false })
    assert.throws(() => assertDryRunCannotUseWriter('dry-run', writer), /dry-run no puede recibir/)
    assert.doesNotThrow(() => assertDryRunCannotUseWriter('dry-run', undefined))
  })

  it('processInvoiceEvidenceOnly en dry-run deja writes=[] y no llama writer', async () => {
    let rpcCalled = false
    const writerTrap = new EvidenceOnlyWriter(
      {
        async rpc() {
          rpcCalled = true
          return { data: null, error: null }
        },
        from() {
          return {
            async insert() {
              rpcCalled = true
              return { data: null, error: null }
            },
          }
        },
      },
      { allowWrite: true }
    )

    await assert.rejects(
      () =>
        processInvoiceEvidenceOnly('inv-1', {
          mode: 'dry-run',
          writer: writerTrap,
          countExtractionsForDocument: async () => 0,
          loadInvoice: async () => null,
          loadLines: async () => [],
          downloadFile: async () => ({ ok: false, message: 'x' }),
        }),
      /dry-run no puede recibir/
    )
    assert.equal(rpcCalled, false)

    const fakeBuf = Buffer.from('fake-image-bytes')
    const fakeSha = createHash('sha256').update(fakeBuf).digest('hex')

    const result = await processInvoiceEvidenceOnly('inv-1', {
      mode: 'dry-run',
      countExtractionsForDocument: async () => 0,
      loadInvoice: async () => ({
        id: 'inv-1',
        invoice_number: 'A-1',
        invoice_date: '2018-06-26',
        total_amount: 10,
        file_path: 'path/a.jpg',
        content_sha256: fakeSha,
        source: 'scanner',
        status: 'mapped',
        supplier_name: 'Cava',
      }),
      loadLines: async (): Promise<OperativeLineForMatch[]> => [
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
        buffer: fakeBuf,
        rawBase64: fakeBuf.toString('base64'),
      }),
      extractGemini: async () => ({
        ok: true,
        data: {
          numero_factura: 'A-1',
          fecha: '2018-06-26',
          total: 10,
          tables: [
            {
              index: 0,
              columns: [
                { index: 0, name: 'DESCRIPCIÓN' },
                { index: 1, name: 'CANTIDAD' },
                { index: 2, name: 'PRECIO' },
              ],
              rows: [
                {
                  index: 0,
                  cells: [
                    { column_index: 0, raw_value: 'ITEM' },
                    { column_index: 1, raw_value: '1' },
                    { column_index: 2, raw_value: '1' },
                  ],
                },
              ],
            },
          ],
        },
        rawJson: {},
      }),
    })

    assert.deepEqual(result.writes, [])
    assert.equal(result.outcome, 'OK')
    assert.equal(result.ocr_ok, true)
  })

  it('SKIP idempotente por hash no escribe ni descarga si SHA BD ya tiene extraction', async () => {
    const result = await processInvoiceEvidenceOnly('inv-1', {
      mode: 'dry-run',
      countExtractionsForDocument: async (_id, hash) => (hash === 'abc' ? 1 : 0),
      loadInvoice: async () => ({
        id: 'inv-1',
        invoice_number: 'A-1',
        invoice_date: '2018-06-26',
        total_amount: 10,
        file_path: 'path/a.jpg',
        content_sha256: 'abc',
        source: 'scanner',
        status: 'mapped',
        supplier_name: 'Cava',
      }),
      loadLines: async () => [],
      downloadFile: async () => {
        throw new Error('no debe descargar si skip por hash BD')
      },
    })
    assert.equal(result.outcome, 'SKIP_ALREADY_HAS_EVIDENCE')
    assert.deepEqual(result.writes, [])
  })
})
