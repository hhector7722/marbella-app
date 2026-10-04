#!/usr/bin/env node
// Relectura cronológica y reanudable. Plan por defecto; --enqueue crea solo
// trabajos históricos. El procesador comprueba SHA-256 del original y cachea
// por hash + versión. Este script no invoca K4 ni escribe magnitudes económicas.
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'

const VERSION = 'mistral-ocr-4-1-document-observation-v2'
const PROJECT_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!PROJECT_URL || !SERVICE_KEY) throw new Error('Supabase service credentials missing')
const db = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const enqueue = process.argv.includes('--enqueue')
const outputIndex = process.argv.indexOf('--output')
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null

async function allRows(table, columns) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from(table).select(columns).range(offset, offset + 499)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < 500) break
  }
  return rows
}

const [invoices, extractions, jobs, attachments, confirmations, proposals] = await Promise.all([
  allRows('purchase_invoices', 'id,created_at,invoice_date,status,file_path,content_sha256,expected_pages,duplicate_of_invoice_id'),
  allRows('document_extractions', 'id,invoice_id,file_version_hash,extractor_version,status'),
  allRows('document_processing_jobs', 'id,invoice_id,file_version_hash,extractor_version,status,evidence_extraction_id,replay_mode'),
  allRows('purchase_invoice_attachments', 'id,invoice_id,file_path,content_sha256,page_order'),
  allRows('purchase_receipt_confirmations', 'id,purchase_invoice_id'),
  allRows('purchase_interpretation_proposals', 'id,purchase_invoice_id,document_extraction_id,normalizer_version'),
])
invoices.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
const extractionsByInvoice = Map.groupBy(extractions, (row) => row.invoice_id)
const jobsByInvoice = Map.groupBy(jobs, (row) => row.invoice_id)
const attachmentsByInvoice = Map.groupBy(attachments, (row) => row.invoice_id)
const confirmationsByInvoice = Map.groupBy(confirmations, (row) => row.purchase_invoice_id)
const proposalsByExtraction = Map.groupBy(proposals, (row) => row.document_extraction_id)
const first = invoices.find((invoice) => {
  const history = extractionsByInvoice.get(invoice.id) ?? []
  const previousJobs = jobsByInvoice.get(invoice.id) ?? []
  const hasDocling = history.some((row) => row.extractor_version.startsWith('docling-'))
    || previousJobs.some((row) => row.extractor_version.startsWith('docling-'))
  const validGemini = history.some((row) => row.extractor_version.startsWith('gemini-')
    && row.status === 'success')
  return hasDocling && !validGemini
})
if (!first) throw new Error('No Docling-era boundary found')

const period = invoices.filter((invoice) => invoice.created_at >= first.created_at)
const report = {
  generatedAt: new Date().toISOString(),
  mode: enqueue ? 'enqueue' : 'plan',
  boundary: { invoiceId: first.id, createdAt: first.created_at,
    invoiceDate: first.invoice_date },
  totals: { invoices: period.length, files: 0, reused: 0, reusedToMaterialize: 0, enqueued: 0,
    alreadyQueued: 0, blocked: 0, missingOriginal: 0,
    received: 0, partiallyReceived: 0, pending: 0, failed: 0,
    possibleDuplicate: 0, discarded: 0 },
  files: [],
}

for (const invoice of period) {
  const hasReceipt = (confirmationsByInvoice.get(invoice.id) ?? []).length > 0
  const classification = invoice.duplicate_of_invoice_id ? 'possibleDuplicate'
    : invoice.status === 'discarded' ? 'discarded'
      : invoice.status === 'received' ? 'received'
        : hasReceipt ? 'partiallyReceived'
          : invoice.status === 'ocr_failed' ? 'failed' : 'pending'
  report.totals[classification]++
  const pages = [{ id: null, file_path: invoice.file_path,
    content_sha256: invoice.content_sha256 },
  ...(attachmentsByInvoice.get(invoice.id) ?? []).sort((a, b) => a.page_order - b.page_order)]
  for (const page of pages) {
    report.totals.files++
    const row = { invoiceId: invoice.id, attachmentId: page.id,
      classification, sha256: page.content_sha256, result: null, error: null }
    report.files.push(row)
    if (!page.file_path || !page.content_sha256) {
      row.result = 'missing_original'; report.totals.missingOriginal++; continue
    }
    const cached = (extractionsByInvoice.get(invoice.id) ?? []).find((extraction) =>
      extraction.file_version_hash === page.content_sha256
      && extraction.extractor_version === VERSION && extraction.status === 'success')
    const needsMaterialization = cached && !hasReceipt
      && invoice.status !== 'discarded' && invoice.status !== 'received'
      && !(proposalsByExtraction.get(cached.id) ?? [])
        .some((proposal) => proposal.normalizer_version === 'mistral-pipeline-v3')
    if (cached) report.totals.reused++
    if (cached && !needsMaterialization) { row.result = 'reused'; continue }
    if (needsMaterialization) report.totals.reusedToMaterialize++
    const existing = (jobsByInvoice.get(invoice.id) ?? []).find((job) =>
      job.file_version_hash === page.content_sha256 && job.extractor_version === VERSION)
    if (existing?.status === 'leased' ||
      (existing?.status === 'failed' && existing.evidence_extraction_id)) {
      row.result = 'blocked'; row.error = existing.status;
      report.totals.blocked++; continue
    }
    if (!enqueue) { row.result = existing ? 'would_requeue' : 'would_enqueue'; continue }
    if (existing?.status === 'pending' && existing.replay_mode === 'historical') {
      row.result = 'already_queued'; report.totals.alreadyQueued++; continue
    }
    const write = existing
      ? await db.from('document_processing_jobs').update({ status: 'pending',
        replay_mode: 'historical', attempt_count: 0, next_attempt_at: new Date().toISOString(),
        lease_token: null, lease_expires_at: null, completed_at: null, last_error: null })
        .eq('id', existing.id).select('id').single()
      : await db.from('document_processing_jobs').insert({ invoice_id: invoice.id,
        storage_bucket: 'albaranes', storage_path: page.file_path,
        file_version_hash: page.content_sha256, extractor_version: VERSION,
        source_attachment_id: page.id, replay_mode: 'historical' })
        .select('id').single()
    if (write.error || !write.data) {
      row.result = 'error'; row.error = write.error?.message ?? 'unknown';
      report.totals.blocked++; continue
    }
    const event = await db.from('document_processing_job_events').insert({
      job_id: write.data.id, event_type: 'requeued',
      payload: { reason: 'historical_mistral_replay' },
    })
    if (event.error) { row.error = `event: ${event.error.message}` }
    row.result = 'enqueued'; report.totals.enqueued++
  }
}
if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ boundary: report.boundary, totals: report.totals,
  errors: report.files.filter((row) => row.error) }, null, 2))
