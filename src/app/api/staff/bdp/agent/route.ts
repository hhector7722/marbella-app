import { createPublicKey, verify } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAoi+lhYK7euuB2Vi5n/MaAg4mnMc70MmN4bd8nXifBGM=\n-----END PUBLIC KEY-----'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function respond(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}})}
function authorized(req:Request,raw:string) {
  const time=req.headers.get('x-handy-timestamp')??''
  const signature=req.headers.get('x-handy-signature')??''
  if(!/^\d{13}$/.test(time)||Math.abs(Date.now()-Number(time))>15000||!/^[A-Za-z0-9+/=]{80,100}$/.test(signature))return false
  try{return verify(null,Buffer.from(['POST',new URL(req.url).pathname,time,raw].join('\n')),createPublicKey(PUBLIC_KEY),Buffer.from(signature,'base64'))}catch{return false}
}
export async function POST(req:Request){
  try{
    const raw=await req.text()
    if(raw.length>8000||!authorized(req,raw))return respond({error:'No autorizado'},401)
    const body=JSON.parse(raw)
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
    if(!url||!key)throw new Error('Backend unavailable')
    const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
    if(body.action==='poll'){
      if(typeof body.ready!=='boolean')return respond({error:'Estado inválido'},400)
      const {error}=await db.from('bdp_handy_agent_state').upsert({id:true,ready:body.ready,checked_at:new Date().toISOString(),detail:String(body.detail??'').slice(0,200)})
      if(error)throw error
      if(!body.ready)return respond({job:null})
      const result=await db.rpc('bdp_handy_claim')
      if(result.error)throw result.error
      return respond({job:result.data?.[0]??null})
    }
    if(body.action==='result'){
      if(!UUID.test(String(body.id??''))||!['confirmed','rejected','uncertain'].includes(body.status))return respond({error:'Resultado inválido'},400)
      const {data,error}=await db.from('bdp_handy_jobs').update({
        status:body.status,finished_at:new Date().toISOString(),result:{detail:String(body.detail??'').slice(0,500)}
      }).eq('id',body.id).eq('status','executing').select('id,status').maybeSingle()
      if(error)throw error
      if(data)return respond({ok:true})
      const existing=await db.from('bdp_handy_jobs').select('status').eq('id',body.id).maybeSingle()
      return existing.data?.status===body.status?respond({ok:true}):respond({error:'Estado incompatible'},409)
    }
    return respond({error:'Acción inválida'},400)
  }catch(e){console.error('Handy agent',e);return respond({error:'No se pudo procesar la petición'},503)}
}
