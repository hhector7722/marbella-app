import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import EventEncargoCartaClient from '@/app/eventos/[slug]/EventEncargoCartaClient'
import { loadEncargoPageById } from '@/lib/load-event-encargo-page'
import { canCreateEncargo } from '@/app/dashboard/eventos/roles'

function ErrorView({ message }: { message: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-2xl px-5 pb-safe pt-safe md:px-8">
        <div className="mt-6 rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Encargo</p>
          <p className="mt-2 text-sm font-bold text-zinc-900">{message}</p>
        </div>
      </div>
    </main>
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

  const { data } = loaded

  return (
    <EventEncargoCartaClient
      variant="staff"
      event={{
        id: data.event.id,
        slug: data.event.slug,
        name: data.event.name,
        event_date: data.event.event_date,
        event_time: data.event.event_time,
      }}
      allMenuItems={data.allMenuItems}
      clientMenuItems={data.clientMenuItems}
      menuCategories={data.menuCategories}
      categoryCoverById={data.categoryCoverById}
      categoryCoverScaleById={data.categoryCoverScaleById}
      startingPackItems={data.startingPackItems}
      initialEnabledProductIds={data.initialEnabledProductIds}
      initialCategoryLimits={data.initialCategoryLimits}
      canManage
      backHref="/staff/reservas"
    />
  )
}
