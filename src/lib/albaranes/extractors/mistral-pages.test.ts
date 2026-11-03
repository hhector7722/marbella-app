import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mergePageObservations,
  countSourcePdfPages,
} from './mistral-pages.ts'
import {
  MISTRAL_EXTRACTOR_VERSION,
  MISTRAL_OCR_MODEL,
  type DocumentExtraction,
} from './mistral.ts'
import { CANONICAL_EXTRACTION_SCHEMA_VERSION } from './canonical.ts'

const SHA = 'a'.repeat(64)

function page(n: number, item: string, final = false): DocumentExtraction {
  return {
    extractor: 'mistral',
    extractorVersion: MISTRAL_EXTRACTOR_VERSION,
    schemaVersion: CANONICAL_EXTRACTION_SCHEMA_VERSION,
    model: MISTRAL_OCR_MODEL,
    fileSha256: SHA,
    pageCount: 1,
    elapsedMs: 230,
    usageInfo: {},
    canonical: {
      supplier_name_raw: 'AMETLLER ORIGEN HORECA, S.L.',
      document_number_raw: '0100009253',
      document_date_raw: '31/10/2026',
      currency_raw: 'EUR',
      subtotal_raw: final ? '870,40' : null,
      tax_raw: final ? '54,69' : null,
      total_raw: final ? '925,09' : null,
      lines: [{
        page_index: 0,
        supplier_product_code_raw: String(100 + n),
        description_raw: item,
        quantity_raw: '1',
        billing_unit_raw: 'UNI',
        package_count_raw: null,
        units_per_package_raw: null,
        content_per_unit_raw: null,
        content_unit_raw: null,
        unit_price_raw: '1,00',
        discount_raw: null,
        discount_header_raw: null,
        other_charge_raw: null,
        other_charge_header_raw: null,
        net_unit_price_raw: null,
        line_total_raw: '1,00',
        tax_rate_raw: '4,00',
      }],
    },
    rawResponse: {
      model: MISTRAL_OCR_MODEL,
      pages: [{index:n,markdown:item,tables:[{content:'| '+item+' |'}]}],
      usage_info: {},
    },
  }
}

test('combines independent three-page OCR with true page identities and last-page totals', () => {
  const merged = mergePageObservations([
    page(0, 'Aceite'), page(1, 'Arroz'), page(2, 'Tomate', true),
  ], SHA)
  assert.equal(merged.fileSha256, SHA)
  assert.equal(merged.pageCount, 3)
  assert.deepEqual(merged.canonical.lines.map(x => x.page_index), [0,1,2])
  assert.deepEqual(merged.canonical.lines.map(x => x.description_raw), ['Aceite','Arroz','Tomate'])
  assert.deepEqual([merged.canonical.subtotal_raw,merged.canonical.tax_raw,merged.canonical.total_raw],
    ['870,40','54,69','925,09'])
  assert.deepEqual((merged.rawResponse as { pages: Array<{index: number}> }).pages.map(x => x.index), [0,1,2])
})
test('stops when an OCR page belongs to another source document', () => {
  const foreign = page(1,'Arroz')
  foreign.fileSha256 = 'b'.repeat(64)
  assert.throws(() => mergePageObservations([page(0,'Aceite'),foreign],SHA),
    /mistral_page_identity_or_response_invalid/)
})
test('stops if document numbers conflict across independently extracted pages', () => {
  const conflicting = page(1, 'Other invoice')
  conflicting.canonical.document_number_raw = 'SOME-OTHER-INVOICE'
  assert.throws(() => mergePageObservations([page(0,'Aceite'), conflicting],SHA),
    /conflicting_mistral_page_identity_document_number_raw/)
})
test('stops on duplicated or missing source page responses', () => {
  const wrong = page(1, 'Duplicated')
  wrong.pageCount = 2
  assert.throws(() => mergePageObservations([page(0,'Aceite'),wrong],SHA),
    /mistral_page_identity_or_response_invalid/)
})
test('can read an actual three-page PDF in Node without a browser DOMMatrix global', async () => {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()
  pdf.text('Page one', 10, 10)
  pdf.addPage()
  pdf.text('Page two', 10, 10)
  pdf.addPage()
  pdf.text('Page three', 10, 10)
  const data = new Uint8Array(pdf.output('arraybuffer'))
  assert.equal(await countSourcePdfPages(data), 3)
})

test('prevents emission of empty economic evidence', () => {
  const empty = page(0,'Aceite')
  empty.canonical.lines = []
  assert.throws(() => mergePageObservations([empty],SHA),/mistral_page_lines_out_of_range/)
})
