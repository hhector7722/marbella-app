import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["'`]|["'`]$/g,'')]}))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const q = async (label,p)=>{const r=await p; if(r.error) console.log(label,'ERR',r.error.message); else console.log(label, JSON.stringify(r.data,null,2)); return r.data}

const { data: props } = await sb
  .from('purchase_interpretation_proposals')
  .select('id,purchase_invoice_id,status,review_reasons,warnings,normalizer_version,source_item_name,supersedes_proposal_id,created_at')
  .order('created_at',{ascending:false})
  .limit(12)
console.log('=== últimas 12 propuestas ===')
for (const p of props ?? []) {
  const rr = Array.isArray(p.review_reasons)?p.review_reasons:[]
  const w = Array.isArray(p.warnings)?p.warnings:[]
  const wset = new Set(w)
  const docOnly = rr.length>0 && rr.every(r=>wset.has(r))
  console.log(JSON.stringify({id:p.id.slice(0,8),inv:p.purchase_invoice_id.slice(0,8),status:p.status,rr,w,docOnly,norm:p.normalizer_version,item:p.source_item_name,sup:p.supersedes_proposal_id?p.supersedes_proposal_id.slice(0,8):null,at:p.created_at}))
}
