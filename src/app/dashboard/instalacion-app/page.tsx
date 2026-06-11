import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import AppInstallStatusClient from '@/components/dashboard/AppInstallStatusClient'

export default async function AppInstallStatusPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role
  if (role !== 'manager' && role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <DashboardDetailLayout
      title="Instalación app"
      subtitle="Quién abre la app instalada vs navegador (última visita)"
      backHref="/master/dashboard"
      maxWidthClass="max-w-3xl"
    >
      <AppInstallStatusClient />
    </DashboardDetailLayout>
  )
}
