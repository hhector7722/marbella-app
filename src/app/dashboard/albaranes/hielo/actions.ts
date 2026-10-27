'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function recordDonHieloDelivery(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role')
    .eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    redirect('/dashboard/albaranes/hielo?error=' + encodeURIComponent('Solo un responsable puede registrar la entrega'))
  }
  const id = String(form.get('requestId') ?? '').trim()
  const kilos = Number(String(form.get('kilos') ?? '').replace(',', '.'))
  const note = String(form.get('note') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(kilos) || kilos<=0 || kilos>500 || note.length>300) {
    redirect('/dashboard/albaranes/hielo?error=' + encodeURIComponent('Introduce los kilos recibidos'))
  }
  const { error } = await supabase.rpc('record_manual_don_hielo_receipt', {
    p_request_id:id, p_quantity_kg:kilos, p_note:note || null,
  })
  if (error) {
    redirect('/dashboard/albaranes/hielo?error=' + encodeURIComponent('No se pudo registrar el hielo. Revisa la cantidad y vuelve a intentarlo.'))
  }
  revalidatePath('/dashboard/albaranes/hielo')
  revalidatePath('/dashboard/inventory')
  redirect('/dashboard/albaranes/hielo?ok=1')
}
