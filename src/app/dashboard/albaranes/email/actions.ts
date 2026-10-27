'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function importPurchaseEmailDocument(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    redirect('/dashboard/albaranes/email?error=' + encodeURIComponent('Solo responsables'))
  }
  const documentId = String(form.get('documentId') ?? '').trim()
  const supplierId = Number(form.get('supplierId'))
  const kind = String(form.get('kind') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(documentId)
      || !Number.isInteger(supplierId) || supplierId <= 0
      || !['delivery_note','monthly_invoice','other'].includes(kind)) {
    redirect('/dashboard/albaranes/email?error=' + encodeURIComponent('Selecciona proveedor y tipo de documento'))
  }
  const { data, error } = await supabase.rpc('promote_purchase_email_document', {
    p_document_id: documentId,
    p_supplier_id: supplierId,
    p_kind: kind,
  })
  if (error) {
    const message = /ya existe|duplicad|already/i.test(error.message)
      ? 'Este PDF ya está incorporado; no se ha duplicado.'
      : 'No se pudo importar. Revisa el documento y vuelve a intentarlo.'
    redirect('/dashboard/albaranes/email?error=' + encodeURIComponent(message))
  }
  const result = data as { invoice_id?: string } | null
  if (!result?.invoice_id) {
    redirect('/dashboard/albaranes/email?error=' + encodeURIComponent('La cola no devolvió un albarán'))
  }
  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/albaranes/email')
  redirect('/dashboard/albaranes?id=' + encodeURIComponent(result.invoice_id))
}
