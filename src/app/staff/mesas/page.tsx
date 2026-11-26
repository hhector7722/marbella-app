import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { StaffFloorplanEditor } from '@/components/staff/StaffFloorplanEditor'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import type { FloorplanRecord } from '@/lib/staff/floorplan'

export const dynamic = 'force-dynamic'

export default async function StaffMesasPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')
  if (!isMasterDashboardUser(user.email)) redirect('/dashboard')

  const { data: floorplan, error: layoutError } = await supabase
    .from('staff_floorplans')
    .select('id, draft, published, revision, updated_at')
    .eq('id', 'principal')
    .maybeSingle()

  if (layoutError || !floorplan) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Plano de mesas</h1>
          <p className="mt-2 text-sm text-slate-600">
            No se ha podido cargar la configuración del plano. No se enviará ninguna operación a BDP.
          </p>
          <a href="/staff/dashboard" className="mt-4 inline-block text-sm font-semibold text-[#1f627f]">Volver a inicio</a>
        </div>
      </main>
    )
  }

  const canEdit = true
  return (
    <StaffFloorplanEditor
      key={floorplan.revision}
      record={floorplan as unknown as FloorplanRecord}
      canEdit={canEdit}
    />
  )
}
