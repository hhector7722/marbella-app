import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { listPurchaseInvoicesAction } from './actions'
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

  const res = await listPurchaseInvoicesAction({ limit: 60 })

  return (
    <DashboardDetailLayout
      title="Albaranes"
      backHref="/dashboard"
      maxWidthClass="max-w-5xl"
      showBackButton={false}
    >
      <AlbaranesHistoricoClient
        initialItems={res.success ? res.items : []}
        initialError={res.success ? null : res.message}
        isManager={isManager}
      />
    </DashboardDetailLayout>
  )
}

