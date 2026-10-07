import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["'`]|["'`]$/g,'')]}))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const q = async (label,p)=>{const r=await p; if(r.error) console.log(label,'ERR',r.error.message); else return r.data}
const { data: lines } = await sb.from('purchase_invoice_lines')
  .select('id,invoice_id,original_name,status,mapped_ingredient_id,interpretation_proposal_id,quantity,unit_price,total_price,line_unit,superseded_by_extraction_id')
  .not('interpretation_proposal_id','is',null)
  .order('created_at',{ascending:false}).limit(400)
const byId = new Map()
for (const l of lines ?? []) byId.set(l.id,l)
const propIds = [...new Set((lines??[]).map(l=>l.interpretation_proposal_id).filter(Boolean))]
const { data: props } = await sb.from('purchase_interpretation_proposals')
  .select('id,status,review_reasons,warnings,normalizer_version,supersedes_proposal_id,provenance')
  .in('id', propIds)
const pById = new Map((props??[]).map(p=>[p.id,p]))
let mappedBlocked=0
for (const l of lines ?? []) {
  const p = pById.get(l.interpretation_proposal_id)
  if (!p) continue
  const rr = Array.isArray(p.review_reasons)?p.review_reasons:[]
  const w = new Set(Array.isArray(p.warnings)?p.warnings:[])
  const docOnly = rr.length>0 && rr.every(r=>w.has(r))
  if (l.status==='mapped' && l.mapped_ingredient_id && p.status!=='ready_for_review') {
    mappedBlocked++
    if (mappedBlocked<=15) console.log('MAPPED-BLOCKED', JSON.stringify({inv:l.invoice_id.slice(0,8),line:l.id.slice(0,8),item:(l.original_name||'').slice(0,40),pstatus:p.status,rr,warn:[...w],docOnly,rev:p.provenance?.revision||null}))
  }
}
console.log('total mapped con propuesta no-ready:', mappedBlocked)
