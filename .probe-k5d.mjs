import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["'`]|["'`]$/g,'')]}))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const inv='6603f30d'
const { data: rows } = await sb.from('purchase_invoices').select('id,supplier_id,suppliers(name)').like('id',`${inv}%`)
console.log('invoice', JSON.stringify(rows))
// líneas de ese albarán y su propuesta
const { data: lines } = await sb.from('purchase_invoice_lines').select('id,original_name,status,mapped_ingredient_id,interpretation_proposal_id').like('invoice_id',`${inv}%`)
const pids=[...new Set((lines??[]).map(l=>l.interpretation_proposal_id).filter(Boolean))]
const { data: props } = await sb.from('purchase_interpretation_proposals').select('id,status,review_reasons,warnings,source_item_name').in('id',pids)
const pById=new Map((props??[]).map(p=>[p.id,p]))
for (const l of lines??[]) { const p=pById.get(l.interpretation_proposal_id); console.log(JSON.stringify({item:(l.original_name||'').slice(0,30),lineStatus:l.status,mapped:!!l.mapped_ingredient_id,pStatus:p?.status,rr:p?.review_reasons,w:p?.warnings})) }
