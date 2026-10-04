import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Faltan la URL o la clave de servicio de Supabase.')

const email = 'marbella-purchase-automation@marbella.invalid'
const marker = 'purchase_receipt_v1'
const client = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let user = null
for (let page = 1; !user; page += 1) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  user = data.users.find((candidate) => candidate.email === email) ?? null
  if (user || data.users.length < 1000) break
}

if (!user) {
  const { data, error } = await client.auth.admin.createUser({
    email,
    app_metadata: { marbella_automation_actor: marker },
  })
  if (error) throw error
  user = data.user
}

if (!user || user.app_metadata?.marbella_automation_actor !== marker
  || user.email_confirmed_at) {
  throw new Error('La identidad técnica no cumple el marcador o la condición de correo no confirmado.')
}

const { data: existing, error: lookupError } = await client.from('profiles')
  .select('id,role,visible_in_plantilla')
  .eq('id', user.id)
  .maybeSingle()
if (lookupError) throw lookupError

if (!existing) {
  const { error } = await client.from('profiles').insert({
    id: user.id,
    email,
    first_name: 'Automatización',
    last_name: 'Recepción de compras',
    role: 'manager',
    visible_in_plantilla: false,
    needs_onboarding: false,
  })
  if (error) throw error
} else if (existing.role !== 'manager' || existing.visible_in_plantilla !== false) {
  throw new Error('El perfil técnico existente no es un manager oculto.')
}

console.log('Actor técnico de compras provisionado; registrar el perfil en private.purchase_receipt_automation_actor según el runbook.')
