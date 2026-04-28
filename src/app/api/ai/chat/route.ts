import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT_TEMPLATE = `Eres el Asistente Operativo IA de Bar La Marbella. 
Misión: Proporcionar datos precisos sobre Sala/KDS, Tesorería, Personal, Recetas y Proveedores.
Reglas:
1. Tono: Directo, técnico, escéptico y riguroso. Sin saludos, introducciones ni cortesía.
2. Cero Alucinación: Si el dato no está en {contexto_autorizado}, responde EXACTAMENTE: "Dato no disponible en el contexto actual. Verifica permisos o la vista nativa." NUNCA inventes cifras.
3. Fechas: Asume zona horaria Barcelona (CEST/CET).
4. Zero-Display: Valores monetarios, numéricos o contadores iguales a 0 se muestran como un espacio en blanco " ".
5. Seguridad: Basa tus cálculos y respuestas ÚNICAMENTE en la información inyectada en el contexto.

Contexto autorizado: {contexto_autorizado}
`

function ymdInEuropeMadrid(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d) // YYYY-MM-DD
}

type Intent = 'sales' | 'treasury' | 'personal' | 'kds' | 'recipes' | 'suppliers' | 'unknown'

function inferIntent(lastUserMessage: string): Intent {
  const q = lastUserMessage.toLowerCase()
  if (/\b(caja|tesorer[ií]a|arqueo|cierres?|cash|descuadre)\b/.test(q)) return 'treasury'
  if (/\b(ventas?|facturaci[oó]n|ingresos?|tickets?)\b/.test(q)) return 'sales'
  if (/\b(horas?|turnos?|fichajes?|timesheet|n[oó]mina|personal|extras?)\b/.test(q)) return 'personal'
  if (/\b(kds|cocina|comandas?|mesa|sala|radar|preparaci[oó]n)\b/.test(q)) return 'kds'
  if (/\b(recetas?|escandallos?|ingredientes?|elaboraci[oó]n|preparar|plato)\b/.test(q)) return 'recipes'
  if (/\b(proveedores?|albaranes?|facturas?|compras?)\b/.test(q)) return 'suppliers'
  return 'unknown'
}

function resolveTargetDate(message: string): Date {
  const q = message.toLowerCase()
  const d = new Date()
  if (/\bayer\b/.test(q)) {
    d.setDate(d.getDate() - 1)
  }
  return d
}

async function buildAuthorizedContext(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  intent: Intent
  lastUserMessage: string
}): Promise<Record<string, unknown>> {
  const { supabase, userId, intent, lastUserMessage } = params

  // 1. LECTURA DE ROL (RBAC)
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
    
  if (profileErr) throw new Error(`RBAC: no se pudo leer profiles.role: ${profileErr.message}`)
  
  const role = profile?.role ?? 'staff'
  const isManager = role === 'manager'
  const isChef = role === 'chef'

  // 2. GATES DE SEGURIDAD ESTRICTOS
  const requiresManager = ['sales', 'treasury', 'suppliers']
  if (requiresManager.includes(intent) && !isManager) {
    throw new Error('ACCESO DENEGADO: Tu rol no permite consultar datos financieros o estratégicos.')
  }

  if (intent === 'recipes' && !isManager && !isChef) {
    throw new Error('ACCESO DENEGADO: Solo gerencia y cocina pueden consultar escandallos.')
  }

  // 3. EXTRACCIÓN DE DATOS POR INTENCIÓN
  if (intent === 'treasury') {
    const { data, error } = await supabase.rpc('get_operational_box_status')
    if (error) throw new Error(`RPC get_operational_box_status: ${error.message}`)
    return { intent, role, rpc: 'get_operational_box_status', data }
  }

  if (intent === 'sales') {
    const targetDateObj = resolveTargetDate(lastUserMessage)
    const target_date = ymdInEuropeMadrid(targetDateObj)
    const { data, error } = await supabase.rpc('get_daily_sales_stats', { target_date })
    if (error) throw new Error(`RPC get_daily_sales_stats: ${error.message}`)
    return { intent, role, rpc: 'get_daily_sales_stats', args: { target_date }, data }
  }

  if (intent === 'personal') {
    const targetDateObj = resolveTargetDate(lastUserMessage)
    if (/\b(mes pasado|anterior)\b/.test(lastUserMessage.toLowerCase())) {
      targetDateObj.setMonth(targetDateObj.getMonth() - 1)
    }

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(targetDateObj)
    const p_year = Number(parts.find((p) => p.type === 'year')?.value)
    const p_month = Number(parts.find((p) => p.type === 'month')?.value)
    
    const { data, error } = await supabase.rpc('get_monthly_timesheet', { p_user_id: userId, p_year, p_month })
    if (error) throw new Error(`RPC get_monthly_timesheet: ${error.message}`)
    
    const { data: snapshots } = await supabase
      .from('weekly_snapshots')
      .select('week_start, week_end, total_hours, ordinary_hours, extra_hours, pending_balance')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(2)

    return { 
      intent, 
      role,
      rpc: 'get_monthly_timesheet', 
      args: { p_user_id: userId, p_year, p_month }, 
      timesheet_data: data,
      recent_snapshots: snapshots 
    }
  }

  if (intent === 'kds') {
    const { data, error } = await supabase
      .from('kds_projection_orders')
      .select('id_ticket, mesa, estado, opened_at, notas_comanda')
      .eq('estado', 'activa')
      .order('opened_at', { ascending: true })
    if (error) throw new Error(`KDS Query: ${error.message}`)
    return { intent, role, table: 'kds_projection_orders', filter: "estado = 'activa'", active_orders: data }
  }

  if (intent === 'recipes') {
    const match = lastUserMessage.match(/(?:receta|escandallo|plato)(?:\s+de)?\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+)/i)
    const queryTerm = match ? match[1].trim() : null

    let query = supabase
      .from('recipes')
      .select('name, elaboration, category, servings, sale_price, target_food_cost_pct')

    if (queryTerm) {
      query = query.ilike('name', `%${queryTerm}%`).limit(3)
    } else {
      query = query.order('updated_at', { ascending: false }).limit(5)
    }

    const { data, error } = await query
    if (error) throw new Error(`Recipes Query: ${error.message}`)
    return { intent, role, table: 'recipes', query_term: queryTerm || 'recent', results: data }
  }

  if (intent === 'suppliers') {
    const { data, error } = await supabase
      .from('purchase_invoices')
      .select(`
        invoice_number, 
        invoice_date, 
        total_amount, 
        status, 
        suppliers (name)
      `)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw new Error(`Suppliers Query: ${error.message}`)
    return { intent, role, table: 'purchase_invoices', recent_invoices: data }
  }

  return {
    intent,
    role,
    warning: 'Intención no mapeada en el enrutador. Dato no disponible en el contexto actual.',
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

    // 1) Validar o crear sesión (RLS en ai_chat_sessions)
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

    // 3) Construir Contexto Autorizado
    const intent = inferIntent(lastUserMessage)
    let authorizedContext: Record<string, unknown>
    try {
      authorizedContext = await buildAuthorizedContext({ 
        supabase, 
        userId: user.id, 
        intent,
        lastUserMessage
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Si el error es de ACCESO DENEGADO (nuestro RBAC), lo devolvemos como 403 para que la UI lo maneje limpiamente
      const status = msg.includes('ACCESO DENEGADO') ? 403 : 500
      return NextResponse.json({ error: 'Acceso o Contexto denegado', detail: msg }, { status })
    }

    const contexto_autorizado = JSON.stringify(authorizedContext)
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replaceAll('{contexto_autorizado}', contexto_autorizado)

    // 4) Llamada a Gemini (Determinista)
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
      generationConfig: { temperature: 0.05 },
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