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
        ? [{ id: 'existing-stock' }] : [], error: null }
      if (table === 'ingredient_price_history') return { data: effect === 'price_history'
        ? [{ id: 'existing-price' }] : [], error: null }
      return { data: [], error: null }
    }
    return query
  }
  return { db: { from } as unknown as Parameters<typeof proposeMistralExtraction>[0]['db'], reads, writes }
}

describe('historical Mistral materialization guard', () => {
  for (const effect of ['legacy_stock', 'typed_stock', 'source_stock', 'price_history'] as const) {
    it(`keeps all old lines active when ${effect} already exists`, async () => {
      const { db, reads, writes } = blockedDatabase(effect)
      const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
        sourceHash: 'hash', canonical, correlationId: null })
      assert.equal(result.skipped, 'manual_lines_require_review')
      assert.deepEqual(writes, [])
      assert.ok(reads.some((read) => read.startsWith('stock_movements:')))
    })
  }

  it('checks economic effects despite a legacy OCR mismatch', async () => {
    const changed = legacyLines.map((line) => ({ ...line }))
    changed[1]!.original_name = 'OTRO PRODUCTO'
    const { db, reads, writes } = blockedDatabase('legacy_stock', changed)
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.skipped, 'manual_lines_require_review')
    assert.deepEqual(writes, [])
    assert.equal(reads.some((read) => read.startsWith('stock_movements:')), true)
  })

  it('checks effects even when the old and canonical line counts differ', async () => {
    const { db, reads, writes } = blockedDatabase('price_history', legacyLines.slice(0, 2))
    const result = await proposeMistralExtraction({ db, invoiceId, extractionId: 'extraction',
      sourceHash: 'hash', canonical, correlationId: null })
    assert.equal(result.skipped, 'manual_lines_require_review')
    assert.deepEqual(writes, [])
    assert.equal(reads.includes('ingredient_price_history:'), true)
  })
})
