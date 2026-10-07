import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["'`]|["'`]$/g,'')]}))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const { data: props } = await sb.from('purchase_interpretation_proposals')
  .select('id,status,review_reasons,warnings').eq('normalizer_version','mistral-pipeline-v3').limit(2000)
let docOnlyNeeds=0, lineBlocked=0, ready=0, other=0
const lineReasonCount=new Map()
for (const p of props??[]) {
  const rr=(p.review_reasons??[]).map(String); const w=new Set((p.warnings??[]).map(String))
  const lineReasons=rr.filter(r=>!w.has(r))
  if (p.status==='ready_for_review') { ready++; continue }
  if (p.status!=='needs_review' && p.status!=='needs_mapping') { other++; continue }
  if (lineReasons.length===0 && w.size>0) docOnlyNeeds++
  else { lineBlocked++; for (const r of lineReasons) lineReasonCount.set(r,(lineReasonCount.get(r)??0)+1) }
}
console.log(JSON.stringify({total:props?.length,ready,docOnlyNeeds,lineBlocked,other}))
console.log('line-level blockers:', [...lineReasonCount.entries()].sort((a,b)=>b[1]-a[1]))
