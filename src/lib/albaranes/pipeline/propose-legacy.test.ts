import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { proposeMistralExtraction } from './propose.ts'
import type { CanonicalDocument } from '../extractors/canonical.ts'

const invoiceId = 'bf43fb90-798d-4405-bb78-c3a45144183d'
const legacyLines = [
  { id: 'line-1', original_name: 'BOCATA MEDITERRANEO- 60 Uds.', quantity: 8,
    interpretation_proposal_id: null, superseded_by_extraction_id: null },
  { id: 'line-2', original_name: 'CROISSANT BOMBON FERMENTADO - 40 Uds.', quantity: 1,
    interpretation_proposal_id: null, superseded_by_extraction_id: null },
  { id: 'line-3', original_name: 'CROISSANT 75 gr MANTEQUILLA FERMENTADO - Caja 55 u', quantity: 1,
    interpretation_proposal_id: null, superseded_by_extraction_id: null },
]
const descriptions = [
  'BOCATA MEDITERRANEO- 60 Uds. 100006632',
  'CROISSANT BOMBON FERMENTADO - 40 u',
  'CROISSANT 75 gr MANTEQUILLA FERMENTADO - Caja 55 u',
]
const canonical: CanonicalDocument = {
  supplier_name_raw: 'Panabad', document_number_raw: '30/128.721', document_date_raw: '05/09/2026',
  currency_raw: 'EUR', subtotal_raw: null, tax_raw: null, total_raw: '251,58',
  lines: descriptions.map((description_raw, index) => ({
    page_index: 0, supplier_product_code_raw: null, description_raw,
    quantity_raw: index === 0 ? '8,000' : '1,000', billing_unit_raw: 'CAJA',
    package_count_raw: null, units_per_package_raw: null, content_per_unit_raw: null,
    content_unit_raw: null, unit_price_raw: null, discount_raw: null,
    discount_header_raw: null, other_charge_raw: null, other_charge_header_raw: null,
    net_unit_price_raw: null, line_total_raw: null, tax_rate_raw: null,
  })),
}

type QueryResult = { data: unknown; error: null }

function blockedDatabase(effect: 'legacy_stock' | 'typed_stock' | 'source_stock' | 'price_history' | 'none',
  lines = legacyLines) {
  const reads: string[] = []
  const writes: string[] = []
  function from(table: string) {
    let inColumn = ''
    const query = {
      select: () => query,
      eq: () => query,
      like: () => query,
      in: (column: string) => { inColumn = column; return query },
      limit: () => query,
      maybeSingle: async () => result(),
      insert: () => { writes.push(table); throw new Error('unexpected_insert') },
      then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve(result())),
    }
    function result(): QueryResult {
      reads.push(`${table}:${inColumn}`)
      if (table === 'purchase_invoices') return { data: { id: invoiceId, supplier_id: 2,
        created_by: 'manager', status: 'pending_mapping', duplicate_of_invoice_id: null }, error: null }
      if (table === 'purchase_invoice_lines') return { data: lines, error: null }
      if (table === 'document_extractions') return { data: effect === 'source_stock'
        ? [{ id: 'old-extraction' }] : [], error: null }
      if (table === 'stock_movements') return { data: effect === 'legacy_stock' && inColumn === 'reference_doc'
        || effect === 'typed_stock' && inColumn === 'reference_id'
        || effect === 'source_stock' && inColumn === 'source_document_extraction_id'
        ? [{ id: 'existing-stock', reference_doc: `ALB-LINE-${lines[0]!.id}`,
          reference_id: lines[0]!.id }] : [], error: null }
      if (table === 'ingredient_price_history') return { data: effect === 'price_history'
        ? [{ id: 'existing-price' }] : [], error: null }
      return { data: [], error: null }
    }
    return query
  }
  return { db: { from } as unknown as Parameters<typeof proposeMistralExtraction>[0]['db'], reads, writes }
}

function materializingDatabase(stockLineId: string | null,
  lines: Array<Omit<(typeof legacyLines)[number], 'interpretation_proposal_id'> & {
    interpretation_proposal_id: string | null }> = legacyLines,
  effect: 'receipt' | 'source_stock' | 'price_history' | null = null,
  invoiceStatus: 'pending_mapping' | 'mapped' = 'pending_mapping') {
  const proposals: Array<Record<string, unknown>> = []
  const insertedLines: Array<Record<string, unknown>> = []
  const retiredIds: string[] = []
  const writes: string[] = []
  function from(table: string) {
    let columns = ''
    let inColumn = ''
    let inValues: string[] = []
    let mutation: 'insert' | 'update' | null = null
    let payload: Record<string, unknown> = {}
    const query = {
      select: (value: string) => { columns = value; return query },
      eq: () => query,
      like: () => query,
      order: () => query,
      limit: () => query,
      in: (column: string, values: string[]) => { inColumn = column; inValues = values; return query },
      insert: (value: Record<string, unknown>) => {
        mutation = 'insert'; payload = value; writes.push(table)
        if (table === 'purchase_interpretation_proposals') proposals.push(value)
        if (table === 'purchase_invoice_lines') insertedLines.push(value)
        return query
      },
      update: (value: Record<string, unknown>) => {
        mutation = 'update'; payload = value; writes.push(table); return query
      },
      maybeSingle: async () => result(true),
      single: async () => result(true),
      then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve(result(false))),
    }
    function result(single: boolean): QueryResult {
      if (mutation === 'insert' && table === 'purchase_interpretation_proposals') {
        return { data: { id: `proposal-${proposals.length}` }, error: null }
      }
      if (mutation === 'update' && table === 'purchase_invoice_lines'
          && inColumn === 'id' && payload.superseded_by_extraction_id) retiredIds.push(...inValues)
      if (mutation) return { data: single ? null : [], error: null }
      if (table === 'purchase_invoices') return { data: { id: invoiceId, supplier_id: 2,
        created_by: 'manager', status: invoiceStatus, duplicate_of_invoice_id: null }, error: null }
      if (table === 'purchase_invoice_lines' && columns.includes('original_name')) {
        return { data: lines, error: null }
      }
      if (table === 'stock_movements' && stockLineId && inColumn === 'reference_doc') {
        return { data: [{ id: 'old-stock', reference_doc: `ALB-LINE-${stockLineId}` }], error: null }
      }
      if (table === 'purchase_receipt_confirmations' && effect === 'receipt') {
        return { data: [{ purchase_invoice_line_id: 'line-1' }], error: null }
      }
      if (table === 'stock_movements' && effect === 'source_stock'
          && inColumn === 'source_document_extraction_id') {
        return { data: [{ id: 'old-stock', reference_id: 'line-1', reference_doc: null }], error: null }
      }
      if (table === 'ingredient_price_history' && effect === 'price_history') {
        return { data: [{ id: 'old-price', purchase_invoice_line_id: 'line-1' }], error: null }
      }
      if (table === 'document_extractions' && effect === 'source_stock') {
        return { data: [{ id: 'old-extraction' }], error: null }
      }
      return { data: single ? null : [], error: null }
    }
    return query
  }
  return { db: { from } as unknown as Parameters<typeof proposeMistralExtraction>[0]['db'],
    proposals, insertedLines, retiredIds, writes }
}

describe('historical Mistral materialization guard', () => {
  for (const effect of ['price_history'] as const) {
    it(`keeps all old lines active when ${effect} already exists`, async () => {
      const { db, reads, writes } = blockedDatabase(effect)
      const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
        sourceHash: 'hash', canonical, correlationId: null })
      assert.equal(result.skipped, 'manual_lines_require_review')
      assert.deepEqual(writes, [])
      assert.ok(reads.some((read) => read.startsWith('stock_movements:')))
    })
  }

  for (const effect of ['receipt', 'source_stock', 'price_history'] as const) {
    it(`reviews pending lines while preserving a line with ${effect}`, async () => {
      const { db, proposals, retiredIds, writes } = materializingDatabase(null, legacyLines, effect)
      const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
        sourceHash: 'hash', canonical, correlationId: null })
      assert.equal(result.created, 2)
      assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [1, 2])
      assert.deepEqual(retiredIds.sort(), ['line-2', 'line-3'])
      assert.equal(writes.includes('stock_movements'), false)
    })
  }

  it('checks effects even when the old and canonical line counts differ', async () => {
    const { db, reads, writes } = blockedDatabase('price_history', legacyLines.slice(0, 2))
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.skipped, 'manual_lines_require_review')
    assert.deepEqual(writes, [])
    assert.equal(reads.includes('ingredient_price_history:'), true)
  })

  it('opens mismatched OCR rows for human review when they have no economic effects', async () => {
    const changed = legacyLines.map((line) => ({ ...line }))
    changed[1]!.original_name = 'OTRO PRODUCTO'
    const { db, proposals, insertedLines, retiredIds, writes } = materializingDatabase(null, changed)
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.created, 3)
    assert.equal(result.materialized, 3)
    assert.equal(result.requiresHumanReview, true)
    assert.equal(proposals.length, 3)
    assert.equal(insertedLines.length, 3)
    assert.deepEqual(retiredIds.sort(), changed.map((line) => line.id).sort())
    assert.equal(writes.includes('stock_movements'), false)
  })

  it('preserves rows with stock and materializes only uniquely matched pending rows', async () => {
    const { db, proposals, insertedLines, retiredIds, writes } = materializingDatabase('line-1')
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.created, 2)
    assert.equal(result.materialized, 2)
    assert.equal(result.requiresHumanReview, true)
    assert.equal(proposals.length, 2)
    assert.equal(insertedLines.length, 2)
    assert.deepEqual(retiredIds.sort(), ['line-2', 'line-3'])
    assert.equal(writes.includes('stock_movements'), false)
  })

  it('reconciles pending historical rows in a mapped invoice without touching received stock', async () => {
    const { db, proposals, retiredIds } = materializingDatabase('line-1', legacyLines, null, 'mapped')
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.created, 2)
    assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [1, 2])
    assert.deepEqual(retiredIds.sort(), ['line-2', 'line-3'])
  })

  it('reconciles a pending historical row alongside an existing Mistral row', async () => {
    const mixedLines = [legacyLines[0]!, { ...legacyLines[1],
      interpretation_proposal_id: 'existing-mistral-proposal' }]
    const { db, proposals, retiredIds } = materializingDatabase(null, mixedLines)
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.created, 1)
    assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [0])
    assert.deepEqual(retiredIds, ['line-1'])
  })

  it('does not let OCR drift in an already received row block a distinct pending row', async () => {
    const changed = legacyLines.map((line, index) => index === 0
      ? { ...line, original_name: 'OLD OCR NAME WITH TWO ERRORS' } : line)
    const { db, proposals, retiredIds } = materializingDatabase('line-1', changed)
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.created, 2)
    assert.equal(result.requiresHumanReview, true)
    assert.deepEqual(retiredIds.sort(), ['line-2', 'line-3'])
    assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [1, 2])
  })

  it('ignores a non-purchase OCR heading while reviewing a matched pending row', async () => {
    const withHeading: CanonicalDocument = { ...canonical, lines: [
      canonical.lines[0]!,
      { ...canonical.lines[0]!, description_raw: 'PEDIDO CONTESTADOR.',
        quantity_raw: null, unit_price_raw: null, line_total_raw: null },
      ...canonical.lines.slice(1),
    ] }
    const { db, proposals, retiredIds } = materializingDatabase('line-1')
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical: withHeading, correlationId: null })
    assert.equal(result.created, 2)
    assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [2, 3])
    assert.deepEqual(retiredIds.sort(), ['line-2', 'line-3'])
  })

  it('keeps an additional economic OCR row out of the review proposals', async () => {
    const withPurchase: CanonicalDocument = { ...canonical, lines: [
      ...canonical.lines,
      { ...canonical.lines[0]!, description_raw: 'COMPRA EXTRA SIN LÍNEA ANTERIOR' },
    ] }
    const { db, proposals, retiredIds, writes } = materializingDatabase('line-1')
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical: withPurchase, correlationId: null })
    assert.equal(result.created, 2)
    assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [1, 2])
    assert.deepEqual(retiredIds.sort(), ['line-2', 'line-3'])
    assert.equal(writes.includes('stock_movements'), false)
  })

  it('leaves an ambiguous pending row active while reviewing a distinct exact match', async () => {
    const changed = legacyLines.map((line, index) => index === 1
      ? { ...line, original_name: 'UNREADABLE PRODUCT' } : line)
    const { db, proposals, retiredIds } = materializingDatabase('line-1', changed)
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.created, 1)
    assert.deepEqual(proposals.map((proposal) => proposal.source_row_index), [2])
    assert.deepEqual(retiredIds, ['line-3'])
  })
})
