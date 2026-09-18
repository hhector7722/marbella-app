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
const priceScaleMigration = read('supabase/migrations/20260915195000_k5_compare_price_at_canonical_scale.sql')
const autoReceiptMigration = read('supabase/migrations/20260917215500_k5_service_auto_receipt_delegate.sql')
const interpretationActions = read('src/app/dashboard/albaranes/interpretation-actions.ts')
const receiptActions = read('src/app/dashboard/albaranes/receipt-actions.ts')
const autoProposalRoute = read('src/app/api/internal/albaranes/k5/auto-propose/route.ts')
const autoApplyRoute = read('src/app/api/internal/albaranes/k5/auto-apply/route.ts')
const doclingWorker = read('supabase/functions/docling-evidence-worker/index.ts')
const normalizer = read('src/lib/albaranes/k5/normalizer.ts')
const mappedSnapshot = read('src/lib/albaranes/k5/mapped-snapshot.ts')

test('las migraciones K5 tienen una versión única por timestamp', () => {
  const names = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => /_k5_.*\.sql$/.test(name))
  const versions = names.map((name) => name.slice(0, 14))
  assert.equal(new Set(versions).size, versions.length, `timestamps K5 duplicados: ${names.join(', ')}`)
})

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
  assert.match(profileMissingMigration, /purchase_invoice_lines_interpretation_proposal_uidx/)
})

test('recalcular crea un nuevo hecho y la supersesión no puede bifurcarse', () => {
  assert.match(supersessionMigration, /DROP INDEX IF EXISTS public\.purchase_interpretation_proposals_input_fingerprint_uidx/)
  assert.match(supersessionMigration, /purchase_interpretation_proposals_single_successor_uidx/)
  assert.match(interpretationActions, /\.from\('purchase_interpretation_proposals'\)[\s\S]*\.insert\(payloads\)/)
  assert.doesNotMatch(interpretationActions, /existingByFingerprint|const missing = payloads/)
})

test('panel técnico y recálculo usan solo la lineage operativa actual', () => {
  assert.match(interpretationActions, /selectCurrentProposalLineage/)
  assert.match(interpretationActions, /return selectCurrentProposalLineage\(rows\)/)
  assert.doesNotMatch(interpretationActions, /return rows\.filter\(\(row\) => !supersededIds\.has/)
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

test('automatización Docling genera K5 solo para la extracción explícita y es idempotente', () => {
  assert.match(autoProposalRoute, /invoiceId: string/)
  assert.match(autoProposalRoute, /extractionId: string/)
  assert.match(autoProposalRoute, /\.eq\('id', extractionId\)/)
  assert.match(autoProposalRoute, /\.eq\('document_extraction_id', extractionId\)/)
  assert.match(autoProposalRoute, /existingByFingerprint/)
  assert.match(autoProposalRoute, /inserted\.length === 0/)
  assert.match(autoProposalRoute, /selectCurrentProposalLineage/)
  assert.match(autoProposalRoute, /line_quantity: n\.lineQuantity/)
  assert.match(autoProposalRoute, /normalized_unit_price: n\.normalizedUnitPrice/)
  assert.match(autoProposalRoute, /review_reasons: n\.reviewReasons/)
  assert.match(autoProposalRoute, /warnings: n\.warnings/)
  assert.doesNotMatch(autoProposalRoute, /\.order\('extracted_at'/)
  assert.doesNotMatch(autoProposalRoute, /auto_map_invoice_lines_fuzzy/)
})

test('automatización Docling está firmada y ocurre entre evidencia persistida y cierre del lease', () => {
  assert.match(autoProposalRoute, /createHmac\('sha256'/)
  assert.match(autoProposalRoute, /x-k5-timestamp/)
  assert.match(autoProposalRoute, /x-k5-signature/)
  assert.match(doclingWorker, /crypto\.subtle\.sign\("HMAC"/)
  assert.match(doclingWorker, /triggerK5AutoProposal/)
  const persistAt = doclingWorker.indexOf('persist_document_evidence')
  const k5At = doclingWorker.lastIndexOf('triggerK5AutoProposal({')
  const autoApplyAt = doclingWorker.lastIndexOf('triggerK4AutoApply({')
  const completeAt = doclingWorker.lastIndexOf('complete_docling_evidence_job')
  assert.ok(persistAt >= 0 && k5At > persistAt, 'K5 debe ejecutarse después de persistir evidencia')
  assert.ok(autoApplyAt > k5At, 'K4 automático solo puede evaluarse después de K5')
  assert.ok(completeAt > autoApplyAt, 'el lease solo se cierra después de evaluar el autoaplicado')
  assert.match(doclingWorker, /k4AutoApply = \{ ok: false, error: errorMessage\(error\) \}/)
})

test('K5 no escribe ledger, precios ni confirmaciones directamente', () => {
  const forbidden = [
    "from('stock_movements')",
    "from('ingredient_price_history')",
    "from('purchase_receipt_confirmations').insert",
    "rpc('apply_receipt_line'",
  ]
  for (const token of forbidden) {
    assert.equal(interpretationActions.includes(token), false, `manual K5: ${token}`)
    assert.equal(autoProposalRoute.includes(token), false, `auto K5: ${token}`)
  }
  for (const token of [
    "from('stock_movements')",
    "from('ingredient_price_history')",
    "from('purchase_receipt_confirmations').insert",
  ]) {
    assert.equal(autoApplyRoute.includes(token), false, `auto K4 coordinator: ${token}`)
  }
  assert.doesNotMatch(autoProposalRoute, /supplier_item_mappings[\s\S]{0,300}\.(?:insert|upsert|update|delete)\(/)
})

test('autoaplicado K4 tiene gates duros y usa preview antes de confirmar', () => {
  assert.match(autoApplyRoute, /MAX_PRICE_DELTA_RATIO = 0\.25/)
  assert.match(autoApplyRoute, /status\) !== 'ready_for_review'/)
  assert.match(autoApplyRoute, /review_reasons/)
  assert.match(autoApplyRoute, /warnings_present/)
  assert.match(autoApplyRoute, /mapping_not_confirmed_leaf/)
  assert.match(autoApplyRoute, /pending_order_requires_allocation/)
  assert.match(autoApplyRoute, /p_dry_run: true/)
  assert.match(autoApplyRoute, /proposal_validated !== true/)
  assert.match(autoApplyRoute, /mapping_will_be_confirmed === true/)
  assert.match(autoApplyRoute, /price_delta_over_25_percent/)
  assert.match(autoApplyRoute, /p_dry_run: false/)
  assert.match(autoApplyRoute, /auto-k5:\$\{proposalId\}/)
})

test('delegado automático es service-role-only y el productor económico sigue siendo apply_receipt_line', () => {
  assert.match(autoReceiptMigration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/)
  assert.match(autoReceiptMigration, /provenance->>'source'.*docling_evidence/)
  assert.match(autoReceiptMigration, /provenance->>'trigger'.*docling_completion/)
  assert.match(autoReceiptMigration, /p\.role IN \('manager', 'admin'\)/)
  assert.match(autoReceiptMigration, /set_config\('request\.jwt\.claim\.sub'/)
  assert.match(autoReceiptMigration, /v_result := public\.apply_receipt_line\(/)
  assert.doesNotMatch(autoReceiptMigration, /INSERT INTO public\.stock_movements/)
  assert.doesNotMatch(autoReceiptMigration, /UPDATE public\.ingredients/)
  assert.doesNotMatch(autoReceiptMigration, /INSERT INTO public\.purchase_receipt_confirmations/)
  assert.match(autoReceiptMigration, /REVOKE ALL ON FUNCTION public\.apply_receipt_line_automated[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(autoReceiptMigration, /GRANT EXECUTE ON FUNCTION public\.apply_receipt_line_automated[\s\S]*TO service_role/)
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

test('precio normalizado usa exactamente la frontera persistida numeric(18,8)', () => {
  assert.match(mappedSnapshot, /roundExactToScale\(normalizedUnitPrice, 8\)/)
  assert.match(priceScaleMigration, /round\(\(v_preview->>'normalized_unit_price'\)::numeric, 8\)/)
  assert.match(priceScaleMigration, /round\(v_proposal\.normalized_unit_price, 8\)/)
  assert.doesNotMatch(priceScaleMigration, /physical_quantity[^\n]*round/i)
  assert.doesNotMatch(priceScaleMigration, /purchase_quantity[^\n]*round/i)
})

test('normalizador no contiene fallbacks económicos de factor 1 ni latest', () => {
  assert.doesNotMatch(normalizer, /conversionFactor\s*\?\?\s*1/)
  assert.doesNotMatch(normalizer, /conversion_factor\s*:\s*1/)
  assert.doesNotMatch(normalizer, /latest/i)
  assert.match(normalizer, /mapping_presentation_incompatible/)
  assert.match(normalizer, /needs_mapping/)
  assert.match(normalizer, /needs_review/)
})
