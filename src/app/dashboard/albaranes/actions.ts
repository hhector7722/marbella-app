'use server'

import { createClient } from '@/utils/supabase/server'

type GateResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string | null }
  | { ok: false; message: string }

async function gateAuthenticated(): Promise<GateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'No autenticado' }

  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) return { ok: false, message: error.message }

  return { ok: true, supabase, userId: user.id, role: profile?.role ?? null }
}

export type PurchaseInvoiceListItem = {
  id: number
  created_at: string
  created_by: string | null
  source: string | null
  status: string | null
  supplier_id: number | null
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  file_path: string | null
}

export async function listPurchaseInvoicesAction(params?: {
  limit?: number
}): Promise<{ success: true; items: PurchaseInvoiceListItem[]; canViewAll: boolean } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const limit = Math.min(Math.max(Number(params?.limit ?? 50) || 50, 1), 200)
  const canViewAll = gate.role === 'manager' || gate.role === 'admin'

  let q = gate.supabase
    .from('purchase_invoices')
    .select(
      `
      id,
      created_at,
      created_by,
      source,
      status,
      supplier_id,
      invoice_number,
      invoice_date,
      total_amount,
      file_path,
      suppliers(name)
    `
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!canViewAll) q = q.eq('created_by', gate.userId)

  const { data, error } = await q
  if (error) return { success: false, message: error.message }

  const items: PurchaseInvoiceListItem[] = (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    created_by: r.created_by ?? null,
    source: r.source ?? null,
    status: r.status ?? null,
    supplier_id: r.supplier_id ?? null,
    supplier_name: r.suppliers?.name ?? null,
    invoice_number: r.invoice_number ?? null,
    invoice_date: r.invoice_date ?? null,
    total_amount: r.total_amount ?? null,
    file_path: r.file_path ?? null,
  }))

  return { success: true, items, canViewAll }
}

export type PurchaseInvoiceLine = {
  id: number
  original_name: string
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  status: string | null
  ingredient_id: string | null
  ingredient_name: string | null
}

export type PurchaseInvoiceDetail = {
  id: number
  created_at: string
  created_by: string | null
  source: string | null
  status: string | null
  supplier_id: number | null
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  file_path: string | null
  signed_url: string | null
  lines: PurchaseInvoiceLine[]
}

export async function getPurchaseInvoiceDetailAction(
  invoiceId: number
): Promise<{ success: true; detail: PurchaseInvoiceDetail } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const id = Number(invoiceId)
  if (!Number.isFinite(id) || id <= 0) return { success: false, message: 'ID inválido' }

  const canViewAll = gate.role === 'manager' || gate.role === 'admin'

  let q = gate.supabase
    .from('purchase_invoices')
    .select(
      `
      id,
      created_at,
      created_by,
      source,
      status,
      supplier_id,
      invoice_number,
      invoice_date,
      total_amount,
      file_path,
      suppliers(name),
      purchase_invoice_lines(
        id,
        original_name,
        quantity,
        unit_price,
        total_price,
        status,
        ingredient_id,
        ingredients(name)
      )
    `
    )
    .eq('id', id)
    .maybeSingle()

  if (!canViewAll) q = q.eq('created_by', gate.userId)

  const { data, error } = await q
  if (error) return { success: false, message: error.message }
  if (!data) return { success: false, message: 'No encontrado o sin permiso' }

  let signedUrl: string | null = null
  const filePath = (data as any).file_path as string | null
  if (filePath) {
    const { data: signed, error: signedErr } = await gate.supabase.storage.from('albaranes').createSignedUrl(filePath, 60 * 10)
    if (signedErr) return { success: false, message: `No se pudo firmar el documento: ${signedErr.message}` }
    signedUrl = signed?.signedUrl ?? null
  }

  const lines = ((data as any).purchase_invoice_lines ?? []).map((l: any) => ({
    id: l.id,
    original_name: l.original_name ?? 'Sin nombre',
    quantity: l.quantity ?? null,
    unit_price: l.unit_price ?? null,
    total_price: l.total_price ?? null,
    status: l.status ?? null,
    ingredient_id: l.ingredient_id ?? null,
    ingredient_name: l.ingredients?.name ?? null,
  })) as PurchaseInvoiceLine[]

  const detail: PurchaseInvoiceDetail = {
    id: (data as any).id,
    created_at: (data as any).created_at,
    created_by: (data as any).created_by ?? null,
    source: (data as any).source ?? null,
    status: (data as any).status ?? null,
    supplier_id: (data as any).supplier_id ?? null,
    supplier_name: (data as any).suppliers?.name ?? null,
    invoice_number: (data as any).invoice_number ?? null,
    invoice_date: (data as any).invoice_date ?? null,
    total_amount: (data as any).total_amount ?? null,
    file_path: filePath,
    signed_url: signedUrl,
    lines,
  }

  return { success: true, detail }
}

