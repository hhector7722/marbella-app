'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function recordVermutDelivery(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id',user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    redirect('/dashboard/albaranes/vermut?error='+
      encodeURIComponent('Solo un responsable puede registrar la entrada'))
  }
  const id=String(form.get('requestId')??'').trim()
  const liters=Number(String(form.get('litros')??'').replace(',','.'))
  const note=String(form.get('note')??'').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(liters)
    || liters<=0 || liters>200 || note.length>300) {
    redirect('/dashboard/albaranes/vermut?error='+encodeURIComponent('Introduce los litros reales recibidos'))
  }
  const { error } = await supabase.rpc('record_manual_vermut_receipt',{
    p_request_id:id,p_quantity_l:liters,p_note:note||null,
  })
  if (error) {
    redirect('/dashboard/albaranes/vermut?error='+
      encodeURIComponent('No se pudo guardar la entrada; revisa los litros e inténtalo de nuevo'))
  }
  revalidatePath('/dashboard/albaranes/vermut')
  revalidatePath('/dashboard/inventory')
  redirect('/dashboard/albaranes/vermut?ok=1')
}
