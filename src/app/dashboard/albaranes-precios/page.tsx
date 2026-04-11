import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AlbaranesPreciosClient from './AlbaranesPreciosClient'

export default async function AlbaranesPreciosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: allIngredients } = await supabase
    .from('ingredients')
    .select('id, name, current_price, purchase_unit')
    .order('name')

  return <AlbaranesPreciosClient allIngredients={allIngredients ?? []} />
}
