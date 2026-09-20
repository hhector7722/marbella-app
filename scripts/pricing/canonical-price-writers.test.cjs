/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260920125954_canonical_manual_ingredient_price_writer.sql'),
  'utf8',
)

test('retira el writer económico derivado del pack', () => {
  assert.match(migration, /DROP TRIGGER IF EXISTS trigger_ingredients_pack_pricing_sync/)
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.trg_ingredients_pack_pricing_sync/)
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.compute_ingredient_current_price_from_pack/)
  assert.doesNotMatch(migration, /NEW\.current_price\s*:=\s*public\.compute_ingredient_current_price_from_pack/)
})

test('bloquea cualquier tercer writer de current_price', () => {
  assert.match(migration, /guard_canonical_ingredient_price_write/)
  assert.match(migration, /app\.receipt_confirmation_price_write/)
  assert.match(migration, /app\.manual_ingredient_price_write/)
  assert.match(migration, /CANONICAL_PRICE_WRITER_ONLY/)
})

test('el writer manual exige rol, precio positivo y conserva la unidad', () => {
  assert.match(migration, /is_purchase_manager_or_admin\(\)/)
  assert.match(migration, /p_new_price IS NULL OR p_new_price <= 0/)
  assert.match(migration, /source,[\s\S]+provenance[\s\S]+'manual'/)
  assert.match(migration, /'purchase_unit', v_ingredient\.purchase_unit/)
  assert.doesNotMatch(migration, /SET[\s\S]{0,160}purchase_unit\s*=/)
  assert.doesNotMatch(migration, /stock_current\s*=/)
})

test('la misma cifra no genera un histórico duplicado', () => {
  const noChange = migration.slice(
    migration.indexOf('IF v_ingredient.current_price IS NOT DISTINCT FROM p_new_price'),
    migration.indexOf("PERFORM set_config('app.manual_ingredient_price_write'"),
  )
  assert.match(noChange, /'changed', false/)
  assert.doesNotMatch(noChange, /ingredient_price_history/)
})

test('la RPC no queda expuesta a anon o PUBLIC', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.set_ingredient_current_price\(uuid, numeric\)[\s\S]+FROM PUBLIC, anon/,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.set_ingredient_current_price\(uuid, numeric\)[\s\S]+TO authenticated, service_role/,
  )
})
