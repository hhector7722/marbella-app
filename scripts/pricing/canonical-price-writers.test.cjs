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
const manualAction = fs.readFileSync(path.join(root, 'src/app/ingredients/actions.ts'), 'utf8')
const canonicalEditor = fs.readFileSync(
  path.join(root, 'src/components/ingredients/IngredientCanonicalEditModal.tsx'),
  'utf8',
)
const ingredientsPage = fs.readFileSync(path.join(root, 'src/app/ingredients/page.tsx'), 'utf8')
const ingredientCreate = fs.readFileSync(
  path.join(root, 'src/components/ingredients/IngredientCreateForm.tsx'),
  'utf8',
)
const recipePage = fs.readFileSync(path.join(root, 'src/app/recipes/[id]/page.tsx'), 'utf8')
const receiptReview = fs.readFileSync(
  path.join(root, 'src/components/albaranes/LineMappingModal.tsx'),
  'utf8',
)
const albaranesPage = fs.readFileSync(
  path.join(root, 'src/app/dashboard/albaranes/AlbaranesHistoricoClient.tsx'),
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
  assert.match(migration, /set_config\('app\.manual_ingredient_price_write', 'off', true\)/)
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

test('la edición manual usa una acción de servidor y la RPC canónica', () => {
  assert.match(manualAction, /^'use server'/)
  assert.match(manualAction, /auth\.getUser\(\)/)
  assert.match(manualAction, /\['manager', 'admin'\]/)
  assert.match(manualAction, /rpc\('set_ingredient_current_price'/)
  assert.match(canonicalEditor, /Precio actual/)
  assert.match(canonicalEditor, /Nuevo precio/)
  assert.match(canonicalEditor, /€\/\{unit\}/)
  assert.doesNotMatch(canonicalEditor, /pack_price|supplier_pricing_mode|conversion_factor/)
})

test('el alta usa un único formulario y el mismo writer manual canónico', () => {
  assert.match(ingredientCreate, /current_price:\s*0/)
  assert.match(ingredientCreate, /if \(!fromReceipt\)[\s\S]*setIngredientCurrentPriceAction\(ingredientId, numericPrice\)/)
  assert.doesNotMatch(ingredientCreate, /pack_price|supplier_pricing_mode|conversion_factor/)
  assert.match(ingredientsPage, /<IngredientCreateForm/)
  assert.match(recipePage, /<IngredientCreateForm/)
  assert.match(albaranesPage, /<IngredientCreateForm/)
})

test('ingredientes y recetas comparten exactamente el mismo editor manual de precio', () => {
  assert.match(ingredientsPage, /<IngredientCanonicalEditModal/)
  assert.match(recipePage, /<IngredientCanonicalEditModal/)
  assert.doesNotMatch(ingredientsPage, /Modo experto|Asistente|IngredientWizard|createMode/)
  assert.doesNotMatch(recipePage, /IngredientWizard/)
  assert.doesNotMatch(albaranesPage, /IngredientWizard|Asistente ingrediente|Wizard de ingrediente/)
})

test('la revisión de albarán no expone controles económicos internos', () => {
  assert.doesNotMatch(receiptReview, /Factor de conversión|Precio normalizado|Guardar y revisar/)
  assert.match(receiptReview, /Precio del albarán/)
  assert.match(receiptReview, /Precio actual/)
  assert.match(receiptReview, /Precio nuevo/)
  assert.match(receiptReview, /Confirmar recepción/)
  assert.doesNotMatch(receiptReview, /setIngredientCurrentPriceAction/)
})
