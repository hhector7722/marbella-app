import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import { BdpCatalogAdmin } from '@/components/staff/BdpCatalogAdmin'
export const dynamic='force-dynamic'
export default async function Page(){
  const auth=await createClient()
  const {data:{user},error}=await auth.auth.getUser()
  if(error||!user)redirect('/login')
  if(!isMasterDashboardUser(user.email))redirect('/dashboard')
  return <BdpCatalogAdmin/>
}
