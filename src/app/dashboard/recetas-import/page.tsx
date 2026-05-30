import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import RecetasImportClient from './RecetasImportClient'

export default async function RecetasImportPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: allIngredients } = await supabase.from('ingredients').select('id, name').order('name')

  return <RecetasImportClient allIngredients={allIngredients ?? []} />
}
