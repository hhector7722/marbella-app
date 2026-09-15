const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

const migration = read('supabase/migrations/20260915194500_k5_interpretation_proposals.sql')
const profileMissingMigration = read('supabase/migrations/20260915194600_k5_optional_profile_guard.sql')
const supersessionMigration = read('supabase/migrations/20260915194700_k5_supersession_chain.sql')
const idempotentRetryMigration = read('supabase/migrations/20260915194800_k5_idempotent_receipt_retry.sql')
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
  assert.match(profileMissingMigration, /ALTER COLUMN supplier_profile_id DROP NOT NULL/)
  assert.match(profileMissingMigration, /k5_profile_triplet_consistent/)
  assert.match(profileMissingMigration, /k5_ready_requires_profile/)
})

test('recalcular crea un nuevo hecho y la supersesión no puede bifurcarse', () => {
  assert.match(supersessionMigration, /DROP INDEX IF EXISTS public\.purchase_interpretation_proposals_input_fingerprint_uidx/)
  assert.match(supersessionMigration, /purchase_interpretation_proposals_single_successor_uidx/)
  assert.match(interpretationActions, /\.from\('purchase_interpretation_proposals'\)[\s\S]*\.insert\(payloads\)/)
  assert.doesNotMatch(interpretationActions, /existingByFingerprint|const missing = payloads/)
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

test('reintento K4 con proposal conserva idempotencia y exige el mismo vínculo K5', () => {
  assert.match(idempotentRetryMigration, /purchase_receipt_confirmations/)
  assert.match(idempotentRetryMigration, /purchase_receipt_interpretation_links/)
  assert.match(idempotentRetryMigration, /interpretation_proposal_id IS DISTINCT FROM p_interpretation_proposal_id/)
  assert.match(idempotentRetryMigration, /proposal_validated/)
  assert.match(idempotentRetryMigration, /private\.apply_receipt_line_with_proposal_idempotent/)
})

test('una línea K5 no puede omitir proposal y una revisión vieja no se puede confirmar', () => {
  assert.match(idempotentRetryMigration, /v_line_proposal_id IS NOT NULL/)
  assert.match(idempotentRetryMigration, /debe confirmarse con su propuesta de interpretación explícita/)
  assert.match(idempotentRetryMigration, /newer\.proposal_set_id IS DISTINCT FROM v_proposal\.proposal_set_id/)
  assert.match(idempotentRetryMigration, /Existe un recálculo K5 posterior/)
})

test('normalizador no contiene fallbacks económicos de factor 1 ni latest', () => {
  assert.doesNotMatch(normalizer, /conversionFactor\s*\?\?\s*1/)
  assert.doesNotMatch(normalizer, /conversion_factor\s*:\s*1/)
  assert.doesNotMatch(normalizer, /latest/i)
  assert.match(normalizer, /mapping_presentation_incompatible/)
  assert.match(normalizer, /needs_mapping/)
  assert.match(normalizer, /needs_review/)
})
