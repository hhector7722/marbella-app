import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { listPurchaseInvoicesDefaultWeekAction } from './actions'
import AlbaranesHistoricoClient from './AlbaranesHistoricoClient'

export const dynamic = 'force-dynamic'

export default async function AlbaranesHistoricoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role ?? null
  const isManager = role === 'manager' || role === 'admin'

  const res = await listPurchaseInvoicesDefaultWeekAction()

  // El layout (cabecera "Albaranes" + slot derecho) se monta dentro del cliente
  // para poder pasar como rightSlot los botones Sparkles/Refresh que dependen
  // de su estado interno (autoMapLoading, isPending, runAutoMap, refresh).
  return (
    <AlbaranesHistoricoClient
      initialItems={res.success ? res.items : []}
      initialError={res.success ? null : res.message}
      isManager={isManager}
    />
  )
}

