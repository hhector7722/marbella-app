import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runVerifiedReceiptBatch } from './verified-receipts.ts'

const row = (proposalId: string, disposition = 'ready') => ({
  proposalId,
  lineId: `line-${proposalId}`,
  mappingVersionId: `mapping-${proposalId}`,
  sourceItemName: `Producto ${proposalId}`,
  disposition,
})

test('confirma solo las líneas que pasan K4 y resume omitidas y bloqueadas', async () => {
  const applied: string[] = []
  const result = await runVerifiedReceiptBatch(
    ['one', 'two', 'three', 'four', 'gone'],
    [row('one'), row('two', 'needs_review'), row('three', 'confirmed'), row('four')],
    {
      preview: async (lineId) => lineId === 'line-four'
        ? { success: false, code: 'needs_review', message: 'K4 bloqueó la presentación.' }
        : { success: true },
      apply: async (lineId, _mappingVersionId, idempotencyKey) => {
        applied.push(`${lineId}:${idempotencyKey}`)
        return { success: true }
      },
    }
  )
  assert.deepEqual(applied, ['line-one:receipt-verified:line-one'])
  assert.deepEqual([result.confirmed, result.skipped, result.blocked], [1, 2, 2])
  assert.equal(result.outcomes.find((item) => item.proposalId === 'four')?.reason, 'K4 bloqueó la presentación.')
})

test('reintento y carrera concurrente no cuentan como confirmación nueva', async () => {
  let writes = 0
  const operation = {
    preview: async () => ({ success: true as const }),
    apply: async () => {
      writes += 1
      return writes === 1
        ? { success: true as const }
        : { success: true as const, idempotent: true }
    },
  }
  const first = await runVerifiedReceiptBatch(['one'], [row('one')], operation)
  const retry = await runVerifiedReceiptBatch(['one'], [row('one')], operation)
  assert.deepEqual([first.confirmed, retry.confirmed, retry.skipped], [1, 0, 1])

  const concurrent = await runVerifiedReceiptBatch(['one'], [row('one')], {
    preview: operation.preview,
    apply: async () => ({ success: false, code: 'receipt_already_applied', message: 'Ya recibida.' }),
  })
  assert.deepEqual([concurrent.confirmed, concurrent.skipped], [0, 1])
})
