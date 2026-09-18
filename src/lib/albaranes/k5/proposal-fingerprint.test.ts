import assert from 'node:assert/strict'
import test from 'node:test'
import { proposalInputFingerprint } from './normalizer.ts'

const base = {
  invoice_id: 'invoice',
  extraction_id: 'extraction',
  mapping_version_id: 'mapping',
  ingredient_id: 'ingredient',
  status: 'ready_for_review',
  line_quantity: '1',
  line_unit: 'kg',
  observed_unit_price: '2.80',
  line_total: '2.80',
  physical_quantity: '1000',
  base_unit: 'g',
  purchase_quantity: '1',
  purchase_unit: 'kg',
  normalized_unit_price: '2.80000000',
  review_reasons: [] as string[],
  warnings: [] as string[],
}

test('fingerprint cambia cuando cambia una magnitud persistida', () => {
  const original = proposalInputFingerprint(base)
  assert.notEqual(original, proposalInputFingerprint({ ...base, line_quantity: null }))
  assert.notEqual(original, proposalInputFingerprint({ ...base, normalized_unit_price: '2.81' }))
  assert.notEqual(original, proposalInputFingerprint({ ...base, warnings: ['collapsed_row'] }))
})

test('fingerprint es estable ante distinto orden de claves', () => {
  const reordered = {
    warnings: [],
    review_reasons: [],
    normalized_unit_price: '2.80000000',
    purchase_unit: 'kg',
    purchase_quantity: '1',
    base_unit: 'g',
    physical_quantity: '1000',
    line_total: '2.80',
    observed_unit_price: '2.80',
    line_unit: 'kg',
    line_quantity: '1',
    status: 'ready_for_review',
    ingredient_id: 'ingredient',
    mapping_version_id: 'mapping',
    extraction_id: 'extraction',
    invoice_id: 'invoice',
  }
  assert.equal(proposalInputFingerprint(base), proposalInputFingerprint(reordered))
})
