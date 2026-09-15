const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const migration = read('supabase/migrations/20260915194500_k5_interpretation_proposals.sql')
const profileMissingMigration = read('supabase/migrations/20260915194600_k5_profile_missing_is_review.sql')
const interpretationActions = read('src/app/dashboard/albaranes/interpretation-actions.ts')
const receiptActions = read('src/app/dashboard/albaranes/receipt-actions.ts')
const normalizer = read('src/lib/albaranes/k5/normalizer.ts')

test('K5 persiste propuestas append-only con extracción y versiones explícitas', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.purchase_interpretation_proposals/)
  assert.match(migration, /document_extraction_id uuid NOT NULL/)
  assert.match(migration, /supplier_profile_version text/)
  assert.match(migration, /supplier_profile_hash text/)
  assert.match(migration, /normalizer_version text NOT NULL/)
  assert.match(migration, /supersedes_proposal_id uuid/)
  assert.match(migration, /purchase_interpretation_proposals_append_only/)
  assert.match(profileMissingMigration, /supplier_profile_missing|DROP NOT NULL|profile_metadata_all_or_none/)
})

test('RLS bloquea anon y restringe propuestas a manager/admin', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.purchase_interpretation_proposals FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /public\.is_purchase_manager_or_admin\(\)/)
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE).*\bTO anon\b/i)
})

test('generación K5 exige extractionId explícito y no selecciona latest implícito', () => {
  assert.match(interpretationActions, /extractionId: string/)
  assert.match(interpretationActions, /\.eq\('id', extractionId\)/)
  assert.doesNotMatch(interpretationActions, /document_extractions[\s\S]{0,500}\.limit\(1\)[\s\S]{0,100}\.maybeSingle\(\)/)
  assert.doesNotMatch(interpretationActions, /\.order\('extracted_at'[\s\S]{0,200}generateInterpretationProposalsAction/)
})

test('K5 no escribe ledger, precios ni confirmaciones', () => {
  const forbidden = [
    "from('stock_movements')",
    "from('ingredient_price_history')",
    "from('purchase_receipt_confirmations').insert",
    "rpc('apply_receipt_line'",
  ]
  for (const token of forbidden) assert.equal(interpretationActions.includes(token), false, token)
})

test('K4 acepta proposal opcional y la revalida antes del efecto económico', () => {
  assert.match(migration, /p_interpretation_proposal_id uuid DEFAULT NULL/)
  assert.match(migration, /proposal_validated/)
  assert.match(migration, /private\.apply_receipt_line\([\s\S]*true[\s\S]*physical_quantity/)
  assert.match(migration, /purchase_receipt_interpretation_links/)
  assert.match(receiptActions, /p_interpretation_proposal_id: proposalId/)
})

test('normalizador no contiene fallbacks económicos de factor 1 ni latest', () => {
  assert.doesNotMatch(normalizer, /conversionFactor\s*\?\?\s*1/)
  assert.doesNotMatch(normalizer, /conversion_factor\s*:\s*1/)
  assert.doesNotMatch(normalizer, /latest/i)
  assert.match(normalizer, /mapping_presentation_incompatible/)
  assert.match(normalizer, /needs_mapping/)
  assert.match(normalizer, /needs_review/)
})
