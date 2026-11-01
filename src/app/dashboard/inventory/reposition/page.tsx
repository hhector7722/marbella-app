import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { isReplenishmentPilotUser } from '@/lib/replenishment/access'
import { ReplenishmentClient, type Fridge, type Slot, type Product } from './ReplenishmentClient'

export const dynamic = 'force-dynamic'

export default async function ReplenishmentPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')
  if (!isReplenishmentPilotUser(user.email)) redirect('/dashboard/inventory')

  const [fridgesResult, slotsResult, productsResult] = await Promise.all([
    supabase.from('replenishment_fridges').select('id,name').order('created_at', { ascending: true }),
    supabase.from('replenishment_slots')
      .select('id,fridge_id,ingredient_id,label,level_number,capacity,sort_order')
      .order('level_number', { ascending: true }).order('sort_order', { ascending: true }),
    supabase.from('ingredients').select('id,name,base_unit').eq('base_unit', 'ud')
      .is('archived_at', null).order('name', { ascending: true }),
  ])

  const loadError = fridgesResult.error || slotsResult.error || productsResult.error
  return (
    <ReplenishmentClient
      canManage
      fridges={(fridgesResult.data ?? []) as Fridge[]}
      slots={(slotsResult.data ?? []) as Slot[]}
      products={(productsResult.data ?? []) as Product[]}
      error={loadError ? 'No se pudo cargar la configuración. Comprueba que la migración de reposición visual esté aplicada y que tengas acceso.' : null}
    />
  )
}
