import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT_TEMPLATE = `Eres el Asistente Operativo IA de Bar La Marbella. 
Misión: Datos precisos sobre Sala/KDS, Tesorería, Personal, Recetas y Stock.
Reglas:
1. Tono: Directo, técnico, riguroso. Sin saludos ni cortesía.
2. Cero Alucinación: Si el dato no está en {contexto_autorizado}, di: "Dato no disponible".
3. Fechas: Zona horaria Barcelona (CEST/CET).
4. Zero-Display: Valores 0 se muestran como " ".
5. Seguridad: Solo usa la información en {contexto_autorizado}.

Contexto autorizado: {contexto_autorizado}
`

function ymdInEuropeMadrid(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d) // YYYY-MM-DD
}

function inferIntent(lastUserMessage: string): 'sales' | 'treasury' | 'personal' | 'kds' | 'unknown' {
  const q = lastUserMessage.toLowerCase()
  if (/\b(caja|tesorer[ií]a|arqueo|cierres?|cash)\b/.test(q)) return 'treasury'
  if (/\b(ventas?|facturaci[oó]n|ingresos?|tickets?)\b/.test(q)) return 'sales'
  if (/\b(horas?|turnos?|fichaj|timesheet|n[oó]mina|personal)\b/.test(q)) return 'personal'
  if (/\b(kds|cocina|comandas?|mesa|sala|radar)\b/.test(q)) return 'kds'
  return 'unknown'
}

async function buildAuthorizedContext(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  intent: ReturnType<typeof inferIntent>
}): Promise<Record<string, unknown>> {
  const { supabase, userId, intent } = params

  if (intent === 'treasury') {
    const { data, error } = await supabase.rpc('get_operational_box_status')
    if (error) throw new Error(`RPC get_operational_box_status: ${error.message}`)
    return { intent, rpc: 'get_operational_box_status', data }
  }

  if (intent === 'sales') {
    const target_date = ymdInEuropeMadrid(new Date())
    const { data, error } = await supabase.rpc('get_daily_sales_stats', { target_date })
    if (error) throw new Error(`RPC get_daily_sales_stats: ${error.message}`)
    return { intent, rpc: 'get_daily_sales_stats', args: { target_date }, data }
  }

  if (intent === 'personal') {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now)
    const p_year = Number(parts.find((p) => p.type === 'year')?.value)
    const p_month = Number(parts.find((p) => p.type === 'month')?.value)
    const { data, error } = await supabase.rpc('get_monthly_timesheet', { p_user_id: userId, p_year, p_month })
    if (error) throw new Error(`RPC get_monthly_timesheet: ${error.message}`)
    return { intent, rpc: 'get_monthly_timesheet', args: { p_user_id: userId, p_year, p_month }, data }
  }

  if (intent === 'kds') {
    return {
      intent,
      warning:
        'No hay RPC KDS verificado en schema_dump.sql para este intent. Dato no disponible en el contexto actual. Verifica RBAC o añade un RPC agregador.',
    }
  }

  return {
    intent,
    warning:
      'Intención no mapeada a ningún RPC verificado. Dato no disponible en el contexto actual. Verifica RBAC o consulta la vista nativa.',
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr) {
      return NextResponse.json({ error: 'Auth error', detail: userErr.message }, { status: 401 })
    }
    const user = userRes?.user
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      return NextResponse.json({ error: 'Configuración de API Gemini incompleta' }, { status: 500 })
    }

    const body = await req.json().catch(() => null)
    const sessionId: string | null = body?.sessionId ?? null
    const incomingMessages: ChatMessage[] | null = Array.isArray(body?.messages) ? body.messages : null
    const singleMessage: string | null = typeof body?.message === 'string' ? body.message : null

    const messages: ChatMessage[] = incomingMessages ?? (singleMessage ? [{ role: 'user', content: singleMessage }] : [])
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user' && typeof m?.content === 'string')
    const lastUserMessage = (lastUser?.content ?? '').trim()
    if (!lastUserMessage) {
      return NextResponse.json({ error: 'Falta el mensaje del usuario' }, { status: 400 })
    }

    // 1) Validar o crear sesión (RLS)
    let effectiveSessionId: string
    if (sessionId) {
      const { data: existing, error: selErr } = await supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (selErr) {
        return NextResponse.json({ error: 'DB error', detail: selErr.message }, { status: 500 })
      }
      if (!existing?.id) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }
      effectiveSessionId = existing.id
    } else {
      const { data: created, error: insErr } = await supabase
        .from('ai_chat_sessions')
        .insert({ user_id: user.id, status: 'active' })
        .select('id')
        .single()
      if (insErr) {
        return NextResponse.json({ error: 'DB error', detail: insErr.message }, { status: 500 })
      }
      effectiveSessionId = created.id
    }

    // 2) Persistir mensaje user
    const { error: msgUserErr } = await supabase.from('ai_chat_messages').insert({
      session_id: effectiveSessionId,
      user_id: user.id,
      role: 'user',
      content_type: 'text',
      text_content: lastUserMessage,
    })
    if (msgUserErr) {
      return NextResponse.json({ error: 'DB error', detail: msgUserErr.message }, { status: 500 })
    }

    // 3) Contexto por intención (RPCs verificados)
    const intent = inferIntent(lastUserMessage)
    let authorizedContext: Record<string, unknown>
    try {
      authorizedContext = await buildAuthorizedContext({ supabase, userId: user.id, intent })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: 'Context build failed', detail: msg }, { status: 500 })
    }

    const contexto_autorizado = JSON.stringify(authorizedContext)
    // FIX: Uso de replaceAll para asegurar inyección en todas las instancias de la variable
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replaceAll('{contexto_autorizado}', contexto_autorizado)

    // 4) Llamada a Gemini (patrón fetch HTTP del repo)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

    const transcript = messages
      .map((m) => `${m.role === 'assistant' ? 'ASSISTANT' : 'USER'}: ${String(m.content ?? '')}`)
      .join('\n')

    const geminiPayload = {
      contents: [
        {
          parts: [{ text: systemPrompt }, { text: transcript }],
        },
      ],
      generationConfig: { temperature: 0.1 },
    }

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '')
      return NextResponse.json({ error: 'Gemini API error', detail: errText }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (reply == null || typeof reply !== 'string') {
      return NextResponse.json({ error: 'Gemini response inválida' }, { status: 502 })
    }

    // 5) Persistir mensaje assistant
    const { error: msgAsstErr } = await supabase.from('ai_chat_messages').insert({
      session_id: effectiveSessionId,
      user_id: user.id,
      role: 'assistant',
      content_type: 'text',
      text_content: reply,
    })
    if (msgAsstErr) {
      return NextResponse.json({ error: 'DB error', detail: msgAsstErr.message }, { status: 500 })
    }

    return NextResponse.json({
      sessionId: effectiveSessionId,
      reply,
      intent,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Unexpected error', detail: msg }, { status: 500 })
  }
}