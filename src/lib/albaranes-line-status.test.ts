import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INVOICE_LINE_STATUS_EXPENSE_ONLY,
  invoiceLineRequiresStock,
  isInvoiceLineExpenseOnly,
  isInvoiceLineResolved,
} from './albaranes-line-status.ts'

test('Otros: gasto sin stock queda resuelto sin ingrediente ni movimiento', () => {
  const other = { status: INVOICE_LINE_STATUS_EXPENSE_ONLY, mapped_ingredient_id: null }
  assert.equal(isInvoiceLineExpenseOnly(other), true)
  assert.equal(isInvoiceLineResolved(other), true)
  assert.equal(invoiceLineRequiresStock(other), false)
})

test('la clasificación gasto no convierte pendientes en recibidos por sí sola', () => {
  const pending = { status: 'pending', ingredient_id: null }
  assert.equal(isInvoiceLineResolved(pending), false)
  assert.equal(isInvoiceLineExpenseOnly(pending), false)
  const receipt = { status: 'mapped', ingredient_id: 'real-product' }
  assert.equal(isInvoiceLineResolved(receipt), true)
  assert.equal(invoiceLineRequiresStock(receipt), true)
})
