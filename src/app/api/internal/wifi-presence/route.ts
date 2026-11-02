import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import {
  NOTIFICATION_HECTOR_EMAIL,
  normalizeNotificationEmail,
} from '@/lib/notification-recipients'

export const runtime = 'nodejs'

type WifiState = 'connected' | 'disconnected'
type EventInput = {
  event_id: string
  state: WifiState
  occurred_at: string
}

const ACTION_URL = '/dashboard'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function authorized(header: string | null, secret: string): boolean {
  const supplied = header?.startsWith('Bearer ') ? header.slice(7) : ''
  const a = createHash('sha256').update(supplied).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}

function validate(input: unknown): EventInput | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (typeof value.event_id !== 'string' || !UUID_PATTERN.test(value.event_id)) return null
  if (value.state !== 'connected' && value.state !== 'disconnected') return null
  if (typeof value.occurred_at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value.occurred_at)) return null
  const date = new Date(value.occurred_at)
  if (!Number.isFinite(date.getTime())) return null
  // Descartar eventos demasiado viejos o relojes del PC muy adelantados.
  if (date.getTime() < Date.now() - 7 * 24 * 3600_000) return null
  if (date.getTime() > Date.now() + 30 * 60_000) return null
  return {
    event_id: value.event_id.toLowerCase(),
    state: value.state,
    occurred_at: date.toISOString(),
  }
}

export async function POST(request: Request) {
  const secret = process.env.WIFI_PRESENCE_WEBHOOK_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Monitor no configurado' }, { status: 503 })
  }
  if (!authorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.text()
    if (body.length > 4096) {
      return NextResponse.json({ error: 'Petición demasiado grande' }, { status: 413 })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return NextResponse.json({ error: 'JSON no válido' }, { status: 400 })
    }
    const event = validate(parsed)
    if (!event) return NextResponse.json({ error: 'Evento no válido' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 })
    }
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: recipient, error: profileError } = await db
      .from('profiles')
      .select('id, email')
      .ilike('email', NOTIFICATION_HECTOR_EMAIL)
      .maybeSingle()

    if (profileError || !recipient ||
      normalizeNotificationEmail(recipient.email) !== NOTIFICATION_HECTOR_EMAIL) {
      console.error('[wifi-presence] Perfil destinatario no disponible', profileError)
      return NextResponse.json({ error: 'Destinatario no disponible' }, { status: 503 })
    }

    // El PK garantiza que un reintento del monitor no duplica el evento.
    const { error: saveError } = await db
      .from('wifi_presence_events')
      .upsert({
        id: event.event_id,
        user_id: recipient.id,
        state: event.state,
        occurred_at: event.occurred_at,
      }, { onConflict: 'id', ignoreDuplicates: true })
    if (saveError) {
      console.error('[wifi-presence] No se pudo guardar evento', saveError)
      return NextResponse.json({ error: 'Error de persistencia' }, { status: 503 })
    }

    const { data: stored, error: storedError } = await db
      .from('wifi_presence_events')
      .select('user_id, state, occurred_at, push_accepted_at')
      .eq('id', event.event_id)
      .single()
    if (storedError || !stored) {
      return NextResponse.json({ error: 'Evento no recuperable' }, { status: 503 })
    }
    if (stored.user_id !== recipient.id || stored.state !== event.state ||
        new Date(stored.occurred_at).getTime() !== new Date(event.occurred_at).getTime()) {
      return NextResponse.json({ error: 'ID de evento reutilizado' }, { status: 409 })
    }

    const connected = event.state === 'connected'
    const title = connected ? 'iPhone conectado al Wi-Fi' : 'iPhone desconectado del Wi-Fi'
    const when = new Date(event.occurred_at).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const message = 'Huawei del bar · ' + when

    // Persistir en la campana una sola vez. El índice único cubre peticiones
    // concurrentes y fallos entre guardar el evento y crear el aviso.
    const { data: already, error: lookupError } = await db
      .from('user_notifications')
      .select('id')
      .eq('user_id', recipient.id)
      .eq('entity_type', 'wifi_presence')
      .eq('entity_id', event.event_id)
      .maybeSingle()
    if (lookupError) {
      return NextResponse.json({ error: 'Error de notificación interna' }, { status: 503 })
    }
    if (!already) {
      const { error: notifyError } = await db.from('user_notifications').insert({
        user_id: recipient.id,
        type: connected ? 'wifi_presence_connected' : 'wifi_presence_disconnected',
        title,
        body: message,
        action_url: ACTION_URL,
        entity_type: 'wifi_presence',
        entity_id: event.event_id,
      })
      if (notifyError && notifyError.code !== '23505') {
        console.error('[wifi-presence] No se pudo generar aviso', notifyError)
        return NextResponse.json({ error: 'No se pudo guardar aviso' }, { status: 503 })
      }
    }

    if (stored.push_accepted_at) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY
    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ error: 'Push no configurado' }, { status: 503 })
    }

    const { data: subs, error: subError } = await db
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', recipient.id)
    if (subError) {
      return NextResponse.json({ error: 'Suscripciones inaccesibles' }, { status: 503 })
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:info@barmarbella.com',
      vapidPublic,
      vapidPrivate,
    )

    const subscriptions = subs || []
    const payload = JSON.stringify({ title, body: message, url: ACTION_URL })
    const results = await Promise.allSettled(subscriptions.map((sub) =>
      webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
    ))
    const expiredIds: string[] = []
    let accepted = 0
    let transientFailures = 0
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        accepted += 1
        return
      }
      const httpStatus = (result.reason as { statusCode?: number })?.statusCode
      if (httpStatus === 404 || httpStatus === 410) {
        expiredIds.push(subscriptions[index].id)
      } else {
        transientFailures += 1
      }
    })
    if (expiredIds.length) {
      await db.from('push_subscriptions').delete().in('id', expiredIds)
    }
    if (transientFailures > 0) {
      return NextResponse.json({ error: 'Proveedor push no disponible' }, { status: 503 })
    }

    const { error: markError } = await db.from('wifi_presence_events')
      .update({ push_accepted_at: new Date().toISOString() })
      .eq('id', event.event_id)
    if (markError) {
      return NextResponse.json({ error: 'No se pudo finalizar el envío' }, { status: 503 })
    }
    return NextResponse.json({
      success: true,
      savedInApp: true,
      pushAccepted: accepted,
      pushSubscriptions: subscriptions.length,
    })
  } catch (error) {
    console.error('[wifi-presence] Error no controlado', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
