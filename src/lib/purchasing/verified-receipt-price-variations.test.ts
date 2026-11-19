import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { verifiedReceiptPriceVariations, type ReceiptPriceRow } from './verified-receipt-price-variations.ts'

const row = (
  id: string, source: string | null, invoice: string | null, price: number, day: string,
  ingredient = 'ingrediente',
): ReceiptPriceRow => ({
  id, ingredient_id: ingredient, source, purchase_invoice_id: invoice,
  changed_at: day + 'T12:00:00', new_price: price,
})

describe('variaciones solo entre compras confirmadas', () => {
  it('no convierte una corrección manual en alerta ni en precio base', () => {
    const events = [
      row('1', null, null, 1.44, '2026-09-03', 'Champiñones'),
      row('2', 'manual', null, 1, '2026-10-07', 'Tomate frito'),
      row('3', 'receipt_confirmation', 'alb-1', 3.17, '2026-10-08', 'Tomate frito'),
      row('4', 'receipt_confirmation', 'alb-2', 7.97, '2026-10-14', 'Piquillo'),
    ]
    assert.equal(verifiedReceiptPriceVariations(events, '2026-08-20').length, 0)
  })

  it('una corrección manual reinicia la referencia de comparación', () => {
    const events = [
      row('1', 'receipt_confirmation', 'alb-1', 2, '2026-08-02'),
      row('2', 'manual', null, 100, '2026-09-01'),
      row('3', 'receipt_confirmation', 'alb-2', 2.5, '2026-10-10'),
      row('4', 'receipt_confirmation', 'alb-3', 3, '2026-10-20'),
    ]
    const variations = verifiedReceiptPriceVariations(events, '2026-09-01')
    assert.equal(variations.length, 1)
    assert.equal(variations[0]?.previousPrice, 2.5)
    assert.equal(variations[0]?.currentPrice, 3)
    assert.ok(Math.abs((variations[0]?.variation ?? 0) - 20) < 1e-9)
  })

  it('no compara dos recepciones del mismo albarán, pero conserva la última para otro documento', () => {
    const events = [
      row('1', 'receipt_confirmation', 'alb-1', 2, '2026-10-01'),
      row('2', 'receipt_confirmation', 'alb-1', 3, '2026-10-01'),
      row('3', 'receipt_confirmation', 'alb-2', 4, '2026-10-09'),
    ]
    const variations = verifiedReceiptPriceVariations(events, '2026-09-01')
    assert.equal(variations.length, 1)
    assert.equal(variations[0]?.previousPrice, 3)
    assert.equal(variations[0]?.currentPrice, 4)
  })

  it('incluye la compra de referencia anterior al periodo y excluye variaciones antiguas', () => {
    const events = [
      row('1', 'receipt_confirmation', 'alb-1', 10, '2026-05-01'),
      row('2', 'receipt_confirmation', 'alb-2', 12, '2026-06-01'),
      row('3', 'receipt_confirmation', 'alb-3', 15, '2026-11-15'),
    ]
    const values = verifiedReceiptPriceVariations(events, '2026-09-01')
    assert.equal(values.length, 1)
    assert.equal(values[0]?.previousPrice, 12)
    assert.equal(values[0]?.variation, 25)
  })
})
