import assert from 'node:assert/strict'
import test from 'node:test'

import { productMarginRowSchema } from './schemas.ts'
import {
  PRODUCT_MARGIN_BAR,
  UNKNOWN_MARGIN_LABEL,
  productMarginBarFill,
  productMarginPercent,
  rankingMoneyText,
} from './product-margin-display.ts'

const row = {
  product_name: 'Pasta carbonara',
  recipe_id: '8bbe3122-225e-4d5f-aa53-af18bfabf471',
  total_units_sold: 2,
  avg_sale_price: 11,
  recipe_cost: null,
  margin_per_unit: null,
  total_margin_contribution: null,
}

test('el esquema acepta un coste nulo y lo conserva', () => {
  const parsed = productMarginRowSchema.parse(row)
  assert.equal(parsed.recipe_cost, null)
  assert.equal(parsed.margin_per_unit, null)
  assert.equal(parsed.total_margin_contribution, null)
  assert.equal(parsed.total_units_sold, 2)
  assert.equal(parsed.avg_sale_price, 11)
})

test('el esquema no convierte null en cero', () => {
  const parsed = productMarginRowSchema.parse({
    ...row,
    recipe_cost: null,
    margin_per_unit: null,
    total_margin_contribution: null,
  })
  assert.notEqual(parsed.recipe_cost, 0)
  assert.equal(parsed.recipe_cost, null)
})

test('un margen desconocido no es un cero por ciento', () => {
  assert.equal(productMarginPercent(null, 11), null)
  assert.equal(productMarginBarFill(null), PRODUCT_MARGIN_BAR.unknown)
  assert.notEqual(productMarginBarFill(null), PRODUCT_MARGIN_BAR.low)
  assert.equal(rankingMoneyText(null, () => '0 €'), '—')
  assert.equal(UNKNOWN_MARGIN_LABEL, '—')
})

test('un margen conocido conserva el porcentaje', () => {
  assert.equal(productMarginPercent(8, 10), 80)
  assert.equal(productMarginBarFill(80), PRODUCT_MARGIN_BAR.high)
})
