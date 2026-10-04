'use server'

import { createClient } from '@/utils/supabase/server'
import { selectCurrentProposalLineage } from '@/lib/albaranes/k5/proposal-lineage'

export type K5InvoiceCandidate = {
  id: string
  supplierId: number
  supplierName: string
  invoiceNumber: string | null
  invoiceDate: string | null
  status: string
  successfulExtractions: number
  activeProposals: number
}

export type K5InvoiceAvailability = {
  kind: 'processing' | 'no_table' | 'failed' | 'missing' | 'supplier_missing' | 'discarded' | 'available'
  detail: string | null
}

export type MistralOpsMetrics = {
  jobs: number
  completed: number
  failed: number
  extractedLines: number
  matchedLines: number
  receivedLines: number
  exceptionLines: number
  pages: number
  averageDurationSeconds: number | null
  autoReceiptRate: number | null
  mappingRate: number | null
}

type ManagerGate =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; message: string }

async function requireManager(): Promise<ManagerGate> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, message: 'Inicia sesión para continuar.' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error || (profile?.role !== 'manager' && profile?.role !== 'admin')) {
    return { ok: false, message: 'Solo manager o administración puede abrir la revisión K5.' }
  }
  return { ok: true, supabase }
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

export async function getMistralOpsMetricsAction(): Promise<MistralOpsMetrics | null> {
  const gate = await requireManager()
  if (!gate.ok) return null
  const { data, error } = await gate.supabase.from('document_processing_jobs')
    .select('status,attempt_count,extraction_metrics')
    .like('extractor_version', 'mistral-%')
    .order('created_at', { ascending: false }).limit(100)
  if (error || !data) return null
  const completed = data.filter((job) => job.status === 'completed')
  const failed = data.filter((job) => job.status === 'failed').length
  const metric = (key: string) => completed.reduce((sum, job) => {
    const value = Number((job.extraction_metrics as Record<string, unknown> | null)?.[key] ?? 0)
    return sum + (Number.isFinite(value) && value > 0 ? value : 0)
  }, 0)
  const extractedLines = metric('line_count')
  const matchedLines = metric('mapped_line_count')
  const receivedLines = metric('auto_applied_line_count')
  const duration = metric('duration_ms')
  const pages = completed.reduce((sum, job) => {
    const metrics = job.extraction_metrics as Record<string, unknown> | null
    const usage = metrics?.usage_info as Record<string, unknown> | null
    const value = Number(usage?.pages_processed ?? metrics?.page_count ?? 0)
    return sum + (Number.isFinite(value) && value > 0 ? value : 0)
  }, 0)
  return { jobs: data.length, completed: completed.length, failed, extractedLines,
    matchedLines, receivedLines, exceptionLines: metric('exception_count'), pages,
    averageDurationSeconds: completed.length ? duration / completed.length / 1000 : null,
    autoReceiptRate: extractedLines ? receivedLines / extractedLines : null,
    mappingRate: extractedLines ? matchedLines / extractedLines : null }
}

export async function getK5InvoiceAvailabilityAction(params: { invoiceId: string }): Promise<
  | { success: true; availability: K5InvoiceAvailability }
  | { success: false; message: string }
> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const invoiceId = text(params?.invoiceId)
  if (!invoiceId) return { success: false, message: 'Albarán inválido.' }

  const { data: invoice, error: invoiceError } = await gate.supabase
    .from('purchase_invoices')
    .select('id,supplier_id,status,ocr_error')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError) return { success: false, message: 'No se pudo comprobar el estado del albarán.' }
  if (!invoice) return { success: false, message: 'El albarán solicitado no existe.' }

  if (text(invoice.status) === 'discarded') {
    return { success: true, availability: { kind: 'discarded', detail: null } }
  }
  if (invoice.supplier_id == null) {
    return { success: true, availability: { kind: 'supplier_missing', detail: null } }
  }

  const [{ data: extractionRows, error: extractionError }, { data: jobRows, error: jobError }] = await Promise.all([
    gate.supabase
      .from('document_extractions')
      .select('status,extracted_at')
      .eq('invoice_id', invoiceId)
      .eq('extractor_version', 'mistral-ocr-4-1-document-observation-v2')
      .order('extracted_at', { ascending: false }),
    gate.supabase
      .from('document_processing_jobs')
      .select('status,last_error,attempt_count,created_at,completed_at')
      .eq('invoice_id', invoiceId)
      .eq('extractor_version', 'mistral-ocr-4-1-document-observation-v2')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  if (extractionError || jobError) {
    return { success: false, message: 'No se pudo comprobar la extracción de este albarán.' }
  }

  const extractions = (extractionRows ?? []) as Array<Record<string, unknown>>
  const latestExtraction = extractions[0] ?? null
  const latestJob = ((jobRows ?? []) as Array<Record<string, unknown>>)[0] ?? null
  const invoiceStatus = text(invoice.status)
  const jobStatus = text(latestJob?.status)

  if (jobStatus === 'pending' || jobStatus === 'leased'
    || (invoiceStatus === 'processing' && latestJob != null)) {
    const attemptCount = Number(latestJob?.attempt_count)
    return {
      success: true,
      availability: {
        kind: 'processing',
        detail: Number.isFinite(attemptCount) && attemptCount > 0 ? `Intento de extracción ${attemptCount}.` : null,
      },
    }
  }

  if (extractions.some((row) => text(row.status) === 'success')) {
    return { success: true, availability: { kind: 'available', detail: null } }
  }

  if (text(latestExtraction?.status) === 'no_table') {
    return { success: true, availability: { kind: 'no_table', detail: null } }
  }

  if (
    jobStatus === 'failed'
    || text(latestExtraction?.status) === 'failed'
    || (invoiceStatus === 'ocr_failed' && latestJob != null)
  ) {
    return {
      success: true,
      availability: {
        kind: 'failed',
        detail: text(latestJob?.last_error) || text(invoice.ocr_error) || null,
      },
    }
  }

  return { success: true, availability: { kind: 'missing', detail: null } }
}

export async function listK5InvoiceCandidatesAction(): Promise<
  | { success: true; invoices: K5InvoiceCandidate[] }
  | { success: false; message: string }
> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data: invoiceRows, error: invoiceError } = await gate.supabase
    .from('purchase_invoices')
    .select('id,supplier_id,invoice_number,invoice_date,status,created_at')
    .not('supplier_id', 'is', null)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false })
    .limit(120)

  if (invoiceError) return { success: false, message: 'No se pudieron cargar los albaranes.' }
  const invoices = (invoiceRows ?? []) as Array<Record<string, unknown>>
  if (invoices.length === 0) return { success: true, invoices: [] }

  const invoiceIds = invoices.map((row) => text(row.id)).filter(Boolean)
  const supplierIds = [...new Set(invoices.map((row) => Number(row.supplier_id)).filter(Number.isFinite))]

  const [{ data: supplierRows, error: supplierError }, { data: extractionRows, error: extractionError }, { data: proposalRows, error: proposalError }] = await Promise.all([
    gate.supabase.from('suppliers').select('id,name').in('id', supplierIds),
    gate.supabase
      .from('document_extractions')
      .select('id,invoice_id,status')
      .in('invoice_id', invoiceIds)
      .eq('extractor_version', 'mistral-ocr-4-1-document-observation-v2')
      .in('status', ['success', 'no_table']),
    gate.supabase
      .from('purchase_interpretation_proposals')
      .select('id,proposal_set_id,purchase_invoice_id,supersedes_proposal_id,provenance,created_at')
      .in('purchase_invoice_id', invoiceIds)
      .eq('normalizer_version', 'mistral-pipeline-v3'),
  ])

  if (supplierError || extractionError || proposalError) {
    return { success: false, message: 'No se pudo construir la cola de revisión K5.' }
  }

  const supplierName = new Map(
    ((supplierRows ?? []) as Array<Record<string, unknown>>).map((row) => [Number(row.id), text(row.name)])
  )

  const extractionCount = new Map<string, number>()
  for (const row of (extractionRows ?? []) as Array<Record<string, unknown>>) {
    const invoiceId = text(row.invoice_id)
    extractionCount.set(invoiceId, (extractionCount.get(invoiceId) ?? 0) + 1)
  }

  const proposalsByInvoice = new Map<string, Array<Record<string, unknown>>>()
  for (const row of (proposalRows ?? []) as Array<Record<string, unknown>>) {
    const invoiceId = text(row.purchase_invoice_id)
    if (!invoiceId) continue
    const list = proposalsByInvoice.get(invoiceId) ?? []
    list.push(row)
    proposalsByInvoice.set(invoiceId, list)
  }

  const activeProposalCount = new Map<string, number>()
  for (const [invoiceId, proposals] of proposalsByInvoice) {
    activeProposalCount.set(invoiceId, selectCurrentProposalLineage(proposals).length)
  }

  return {
    success: true,
    invoices: invoices
      .map((row): K5InvoiceCandidate | null => {
        const id = text(row.id)
        const supplierId = Number(row.supplier_id)
        const successfulExtractions = extractionCount.get(id) ?? 0
        if (!id || !Number.isFinite(supplierId) || successfulExtractions === 0) return null
        return {
          id,
          supplierId,
          supplierName: supplierName.get(supplierId) || `Proveedor ${supplierId}`,
          invoiceNumber: text(row.invoice_number) || null,
          invoiceDate: text(row.invoice_date) || null,
          status: text(row.status),
          successfulExtractions,
          activeProposals: activeProposalCount.get(id) ?? 0,
        }
      })
      .filter((row): row is K5InvoiceCandidate => Boolean(row)),
  }
}
