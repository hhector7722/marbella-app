/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const scanner = read('src/app/dashboard/scanner/actions.ts')
const migration = read('supabase/migrations/20260915104503_scanner_enqueue_docling_evidence.sql')
const edgeWorker = read('supabase/functions/docling-evidence-worker/index.ts')
const localWorker = read('integrations/docling-worker/worker.py')

test('el scanner conserva el original y encola una sola intención durable Docling', () => {
  assert.match(scanner, /storage\.from\('albaranes'\)\.upload/)
  assert.match(scanner, /rpc\('enqueue_docling_evidence_job'/)
  assert.match(scanner, /DOCLING_SCANNER_EXTRACTOR_VERSION/)
  assert.match(scanner, /retry_docling_evidence_jobs/)
  assert.doesNotMatch(scanner, /extractAlbaranWithGemini|gemini-extract-albaran|runOcrForInvoice/)
  assert.doesNotMatch(scanner, /purchase_invoice_lines/)
  assert.doesNotMatch(scanner, /persist_document_evidence/)
  assert.doesNotMatch(scanner, /\bafter\(/)
})

test('la cola relaciona documento, hash y versión; retry no sustituye evidence histórica', () => {
  assert.match(migration, /source_attachment_id uuid/)
  assert.match(migration, /ON CONFLICT \(invoice_id, file_version_hash, extractor_version\) DO NOTHING/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enqueue_docling_evidence_job/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.retry_docling_evidence_jobs/)
  assert.match(migration, /evidence_extraction_id IS NULL/)
  assert.match(migration, /immutable_failure_count/)
  assert.match(migration, /'requeued'/)
})

test('worker y Edge Function permanecen evidence-only, incluidos los errores', () => {
  assert.match(edgeWorker, /persist_document_evidence/)
  assert.match(edgeWorker, /complete_docling_evidence_job/)
  assert.doesNotMatch(edgeWorker, /stock_movements|apply_receipt_line|ingredient_price_history|supplier_item_mappings/)
  assert.doesNotMatch(localWorker, /createClient|SUPABASE_SERVICE_ROLE_KEY|stock_movements|purchase_invoice_lines/)
  assert.doesNotMatch(localWorker, /"rawArtifact": \{"error"/)
})

test('la finalización solo cambia estado operativo y evidencia; no introduce efectos económicos', () => {
  const completion = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.complete_docling_evidence_job'))
  assert.match(completion, /SET status = 'pending_mapping'/)
  assert.match(completion, /SET status = 'ocr_failed'/)
  assert.doesNotMatch(completion, /stock_movements|ingredient_price_history|purchase_invoice_lines|supplier_item_mappings|ingredients/)
})
