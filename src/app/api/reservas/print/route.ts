import { createPublicKey, verify } from 'node:crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createSessionClient } from '@/utils/supabase/server'
import { formatEncargoProductLabel, formatEncargoProductNote } from '@/lib/encargo-staff-helpers'
import { isDrinkConsumptionRecipe } from '@/lib/staff-consumption-display'
import { KITCHEN_PRINT_PUBLIC_KEY } from '@/lib/reservas/kitchen-print-public-key'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Selection = 'food' | 'drink' | 'all'
type Language = 'ca' | 'es' | 'en'
type Line = { product_id: string; name: string; quantity: number; notes: string }

function respond(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase backend not configured')
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function agentAuthorized(req: Request, body = '') {
  const keyPem = KITCHEN_PRINT_PUBLIC_KEY
  const timestamp = req.headers.get('x-printer-timestamp')
  const signature = req.headers.get('x-printer-signature')
  if (!keyPem || !timestamp || !/^\d{13}$/.test(timestamp)
    || !signature || !/^[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 200
    || Math.abs(Date.now() - Number(timestamp)) > 120_000) return false
  try {
    const pathname = new URL(req.url).pathname
    const signed = [req.method, pathname, timestamp, body].join('\n')
    return verify(null, Buffer.from(signed, 'utf8'),
      createPublicKey(keyPem.replace(/\\n/g, '\n')), Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

async function userId() {
  const client = await createSessionClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null
  const { data: profile } = await database().from('profiles')
    .select('id').eq('id', user.id).maybeSingle()
  return profile ? user.id : null
}

function isDrink(name: string, category: string) {
  return isDrinkConsumptionRecipe({ name, category })
    || /begud|cafeter|còctel|coctel|cocktail|licor/i.test(category)
    || /\b(aigua|aquarius|juver|bitter|schweppes|trina|pepsi|monster|gaseosa|batido|granini|cava|vermut)\b/i.test(name)
}

// Notificación sin datos sensibles. El trabajo solo se lee con token del agente.
async function notifyPrinter() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return
  try {
    await fetch(url + '/realtime/v1/api/broadcast', {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{
        topic: 'marbella-kitchen-print', event: 'new-job', payload: { wake: true },
      }] }),
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    })
  } catch {
    // El agente también consulta periódicamente los trabajos pendientes.
  }
}

export async function GET(req: Request) {
  try {
    if (agentAuthorized(req)) {
      const db = database()
      const { data: first, error } = await db.from('kitchen_print_jobs')
        .select('id').eq('status', 'pending').order('created_at').limit(1).maybeSingle()
      if (error) throw error
      if (!first) return respond({ job: null })
      const now = new Date().toISOString()
      const { data, error: claimError } = await db.from('kitchen_print_jobs')
        .update({ status: 'processing', claimed_at: now, updated_at: now })
        .eq('id', first.id).eq('status', 'pending').select('id,payload').maybeSingle()
      if (claimError) throw claimError
      return respond({ job: data ?? null })
    }
    const id = new URL(req.url).searchParams.get('id')
    const owner = await userId()
    if (!owner) return respond({ error: 'No autorizado' }, 401)
    if (!id || !UUID.test(id)) return respond({ error: 'Trabajo inválido' }, 400)
    const { data, error } = await database().from('kitchen_print_jobs')
      .select('id,status,error').eq('id', id).eq('created_by', owner).maybeSingle()
    if (error) throw error
    return data ? respond(data) : respond({ error: 'Trabajo no encontrado' }, 404)
  } catch (err) {
    console.error('Print queue GET:', err)
    return respond({ error: 'Error consultando la cola' }, 500)
  }
}

export async function PATCH(req: Request) {
  try {
    const raw = await req.text()
    if (!agentAuthorized(req, raw)) return respond({ error: 'No autorizado' }, 401)
    const body = JSON.parse(raw) as { id?: string; status?: string; error?: string }
    if (!UUID.test(String(body.id ?? '')) || !['sent', 'failed'].includes(String(body.status))) {
      return respond({ error: 'Confirmación inválida' }, 400)
    }
    const now = new Date().toISOString()
    const { data, error } = await database().from('kitchen_print_jobs').update({
      status: body.status,
      error: body.status === 'failed' ? String(body.error ?? 'Impresora no disponible').slice(0, 500) : null,
      sent_at: body.status === 'sent' ? now : null,
      updated_at: now,
    }).eq('id', body.id!).eq('status', 'processing').select('id').maybeSingle()
    if (error) throw error
    return data ? respond({ ok: true }) : respond({ error: 'Estado incompatible' }, 409)
  } catch (err) {
    console.error('Print queue PATCH:', err)
    return respond({ error: 'Error confirmando el trabajo' }, 500)
  }
}

export async function POST(req: Request) {
  try {
    const owner = await userId()
    if (!owner) return respond({ error: 'No autorizado' }, 401)
    const input = await req.json() as {
      eventId?: unknown; requestKey?: unknown; selection?: unknown;
      language?: unknown; observations?: unknown
    }
    if (!UUID.test(String(input.eventId ?? '')) || !UUID.test(String(input.requestKey ?? ''))
      || !['food', 'drink', 'all'].includes(String(input.selection))
      || !['ca', 'es', 'en'].includes(String(input.language))
      || typeof input.observations !== 'string' || input.observations.length > 1200) {
      return respond({ error: 'Datos de comanda inválidos' }, 400)
    }
    const db = database()
    const eventId = String(input.eventId)
    const selection = input.selection as Selection
    const language = input.language as Language
    const { data: event, error: eErr } = await db.from('events')
      .select('id,name,event_date,event_time,guest_count').eq('id', eventId).maybeSingle()
    if (eErr) throw eErr
    if (!event) return respond({ error: 'Reserva no encontrada' }, 404)

    const { data: orders, error: oErr } = await db.from('event_orders')
      .select('items,status,created_at').eq('event_id', eventId)
      .neq('status', 'cancelled').order('created_at', { ascending: true })
    if (oErr) throw oErr
    const list = orders ?? []
    const primary = list.find((o) => o.status === 'confirmed')
      ?? list.find((o) => o.status === 'pending' && Array.isArray(o.items) && o.items.length > 0)
      ?? list.find((o) => o.status === 'pending')
    const raw = Array.isArray(primary?.items) ? primary.items : []
    const lines: Line[] = raw.flatMap((value: unknown) => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      const product_id = String(row.product_id ?? '').trim()
      const quantity = Number(row.quantity)
      if (!product_id || !Number.isFinite(quantity) || quantity <= 0 || quantity > 9999) return []
      return [{
        product_id,
        quantity,
        name: String(row.name ?? '').trim().slice(0, 200),
        notes: String(row.notes ?? '').trim().slice(0, 250),
      }]
    })
    if (!lines.length) return respond({ error: 'No hay productos en este pedido' }, 400)
    if (lines.length > 250) return respond({ error: 'Demasiadas líneas' }, 400)

    let chosen = lines
    if (selection !== 'all') {
      const ids = [...new Set(lines.map((line) => line.product_id))]
      const { data: catalogRows, error: pErr } = await db.from('event_products')
        .select('product_id,name,category').in('product_id', ids)
      if (pErr) throw pErr
      const catalog = new Map((catalogRows ?? []).map((p) => [p.product_id, p]))
      if (ids.some((id) => !catalog.has(id))) {
        return respond({ error: 'Hay productos sin categoría. No se puede separar la comanda.' }, 409)
      }
      chosen = lines.filter((item) => {
        const product = catalog.get(item.product_id)!
        return isDrink(product.name || item.name, product.category ?? '') === (selection === 'drink')
      })
    }
    if (!chosen.length) return respond({
      error: selection === 'drink' ? 'No hay bebidas en este pedido' : 'No hay comida en este pedido',
    }, 400)

    const payload = {
      name: String(event.name ?? '').slice(0, 160),
      date: String(event.event_date ?? '').slice(0, 10),
      time: String(event.event_time ?? '').slice(0, 5),
      guests: event.guest_count ?? null,
      selection,
      language,
      observations: input.observations.trim(),
      items: chosen.map((item) => ({
        quantity: item.quantity,
        name: formatEncargoProductLabel(item.name, item.notes),
        note: formatEncargoProductNote(item.name, item.notes),
      })),
    }
    const { data, error: insertErr } = await db.from('kitchen_print_jobs').insert({
      request_key: input.requestKey, event_id: eventId, created_by: owner,
      selection, language, payload,
    }).select('id,status').single()
    if (insertErr?.code === '23505') {
      const { data: existing } = await db.from('kitchen_print_jobs')
        .select('id,status').eq('request_key', input.requestKey).eq('created_by', owner).maybeSingle()
      return existing ? respond({ job: existing }) : respond({ error: 'Trabajo duplicado' }, 409)
    }
    if (insertErr || !data) throw insertErr ?? new Error('No se creó el trabajo')
    await notifyPrinter()
    return respond({ job: data }, 202)
  } catch (err) {
    console.error('Print queue POST:', err)
    return respond({ error: 'No se pudo enviar la comanda a cocina' }, 500)
  }
}