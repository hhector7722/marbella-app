import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["'`]|["'`]$/g,'')]}))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const { data: props } = await sb.from('purchase_interpretation_proposals')
  .select('id,purchase_invoice_id,status,review_reasons,warnings,normalizer_version,created_at')
  .eq('normalizer_version','mistral-pipeline-v3').order('created_at',{ascending:false}).limit(2000)
const reasonCount = new Map(); const warnCount = new Map(); const invSet=new Set(); let needs=0, ready=0
for (const p of props??[]) {
  invSet.add(p.purchase_invoice_id)
  if (p.status==='ready_for_review') ready++; else if (p.status!=='excluded') needs++
  for (const r of (p.review_reasons??[])) reasonCount.set(r,(reasonCount.get(r)??0)+1)
  for (const w of (p.warnings??[])) warnCount.set(w,(warnCount.get(w)??0)+1)
}
console.log('propuestas', props?.length, 'invoices', invSet.size, 'ready', ready, 'no-ready', needs)
console.log('top review_reasons:', [...reasonCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15))
console.log('top warnings:', [...warnCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15))
// supplier of 6603f30d
const { data: inv } = await sb.from('purchase_invoices').select('id,invoice_number,invoice_date,supplier_id,suppliers(name)').eq('id','6603f30d-'+'').limit(1)
