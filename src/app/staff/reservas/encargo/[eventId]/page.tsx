import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { loadEncargoPageById } from '@/lib/load-event-encargo-page'
import { canCreateEncargo } from '@/app/dashboard/eventos/roles'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import StaffEncargoPageClient from './StaffEncargoPageClient'

function ErrorView({ message }: { message: string }) {
  return (
    <DashboardDetailLayout
      title="Encargo"
      showBackButton
      backHref="/staff/reservas"
      template="detail"
      maxWidthClass="max-w-2xl"
    >
      <p className="text-sm font-bold text-zinc-900">{message}</p>
    </DashboardDetailLayout>
  )
}

export default async function StaffEncargoPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle()

  const role = (profile as { role?: string } | null)?.role ?? null
  if (!canCreateEncargo(role)) {
    return <ErrorView message="Sin permiso para gestionar encargos." />
  }

  const loaded = await loadEncargoPageById(supabase, eventId)
  if (!loaded.ok) return <ErrorView message={loaded.message} />

  const { data: orders } = await supabase
    .from('event_orders')
    .select('id, items, status, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const orderRows = (orders ?? []) as Array<{
    id: string
    items: unknown
    status: string
    created_at: string
  }>

  let primaryOrder = orderRows.find((o) => o.status === 'confirmed') ?? orderRows[0] ?? null

  return (
    <StaffEncargoPageClient
      event={loaded.data.event}
      orderId={primaryOrder?.id ?? null}
      initialItems={primaryOrder?.items ?? []}
    />
  )
}
