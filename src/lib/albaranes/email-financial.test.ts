import assert from 'node:assert/strict'
import test from 'node:test'
import { documentedInvoiceDate, financialEvidence, parseSpanishMoney } from './email-financial.ts'
import type { CanonicalDocument } from './extractors/canonical.ts'

test('Spanish OCR money formats do not assume 10 percent VAT', () => {
  assert.equal(parseSpanishMoney('1.661,00 €'),1661)
  assert.equal(parseSpanishMoney('27,65'),27.65)
  assert.equal(parseSpanishMoney('3.90'),3.9)
  assert.equal(parseSpanishMoney('1,234.56 EUR'),1234.56)
  assert.equal(parseSpanishMoney(''),null)
  assert.equal(parseSpanishMoney('TOTAL'),null)
  assert.equal(parseSpanishMoney('1.234,0x'),null)
})
test('verified subtotal and tax are preserved', () => {
  const doc = { total_raw:'27,65', subtotal_raw:'22,85', tax_raw:'4,80',
    lines: [] } as unknown as CanonicalDocument
  assert.deepEqual(financialEvidence(doc),{
    total_amount:27.65,base_amount:22.85,tax_amount:4.8,tax_rate:21.01,
    tax_unknown:false,from_document_total:true
  })
})
test('unknown VAT leaves gross expense not an invented rate', () => {
  const doc = { total_raw:'3,90', subtotal_raw:'1,95', tax_raw:null,
    lines: [] } as unknown as CanonicalDocument
  const r=financialEvidence(doc)
  assert.equal(r?.total_amount,3.9)
  assert.equal(r?.base_amount,3.9)
  assert.equal(r?.tax_amount,null)
  assert.equal(r?.tax_unknown,true)
})
test('document date accepts Spanish and ISO formats only', () => {
  assert.equal(documentedInvoiceDate('27/10/2026'),'2026-10-27')
  assert.equal(documentedInvoiceDate('2026-10-27'),'2026-10-27')
  assert.equal(documentedInvoiceDate('31/02/2026'),null)
  assert.equal(documentedInvoiceDate('ayer'),null)
})
