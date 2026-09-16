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
      .eq('status', 'success'),
    gate.supabase
      .from('purchase_interpretation_proposals')
      .select('id,proposal_set_id,purchase_invoice_id,supersedes_proposal_id,provenance,created_at')
      .in('purchase_invoice_id', invoiceIds),
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
