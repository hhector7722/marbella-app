import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import { validateMobileCategories } from '@/lib/staff/bdp-mobile-catalog'

export const dynamic='force-dynamic'
export async function PUT(req:Request){
  const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}})
  try{
    const auth=await createClient()
    const {data:{user},error}=await auth.auth.getUser()
    if(error||!user||!isMasterDashboardUser(user.email))return response({error:'No autorizado'},401)
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
    if(!url||!key)throw Error('Backend no configurado')
    const db=createAdminClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
    const raw=await req.text()
    if(raw.length>250000)return response({error:'Configuración demasiado grande'},413)
    let input
    try{input=JSON.parse(raw)}catch{return response({error:'Configuración inválida'},400)}
    if(!input||!Number.isSafeInteger(input.revision)||input.revision<1)return response({error:'Revisión inválida'},400)
    const {data:products,error:productError}=await db.from('bdp_articulos').select('id').gt('id',0)
    if(productError)throw productError
    let categories
    try{categories=validateMobileCategories(input.categories,new Set((products??[]).map(p=>p.id)))}
    catch(e){return response({error:e instanceof Error?e.message:'Configuración inválida'},400)}
    const {data,error:saveError}=await db.from('bdp_mobile_catalog').update({
      categories,revision:input.revision+1,updated_at:new Date().toISOString()
    }).eq('id','principal').eq('revision',input.revision).select('revision').maybeSingle()
    if(saveError)throw saveError
    if(!data)return response({error:'La configuración ha cambiado. Recarga antes de guardar.'},409)
    return response({revision:data.revision})
  }catch(e){console.error('BDP mobile catalog PUT',e);return response({error:'No se pudo guardar el catálogo'},503)}
}
