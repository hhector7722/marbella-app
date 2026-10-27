'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export type PackageDeliveryResult =
  | { success: true; invoiceId: string; duplicate: boolean }
  | { success: false; message: string }

/**
 * Same authenticated flow as scanner, without an invented invoice or price.
 * The RPC atomically adds the physical stock and a normal albarán with one
 * descriptive product line. Server validates quantities and role again.
 */
export async function recordStandardPackageDelivery(params: {
  requestId: string
  supplierId: number
  packages: number
}): Promise<PackageDeliveryResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Inicia sesión para registrar la entrega.' }
  const requestId = String(params.requestId ?? '')
  const supplierId = Number(params.supplierId)
  const packages = Number(params.packages)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    || ![17,22].includes(supplierId) || !Number.isSafeInteger(packages)
    || packages < 1 || (supplierId === 22 && packages > 50)
    || (supplierId === 17 && packages > 20)) {
    return { success: false, message: 'Introduce un número válido de sacos o garrafas.' }
  }
  const { data, error } = await supabase.rpc('record_manual_package_invoice', {
    p_request_id: requestId,
    p_supplier_id: supplierId,
    p_packages: packages,
  })
  if (error) {
    return { success: false, message: error.message.includes('Solo responsables')
      ? 'Solo un responsable puede confirmar entradas de mercancía.'
      : 'No se pudo registrar la entrega. Revisa la cantidad e inténtalo otra vez.' }
  }
  const result = data as { invoice_id?: string; duplicate?: boolean } | null
  if (!result?.invoice_id) return { success: false, message: 'No se ha creado el albarán.' }
  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/inventory')
  return { success: true, invoiceId: result.invoice_id, duplicate: result.duplicate===true }
}
