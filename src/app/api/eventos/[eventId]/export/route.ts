import { createClient } from '@/utils/supabase/server'

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  const needs = /[",\n\r]/.test(s)
  const v = s.replace(/"/g, '""')
  return needs ? `"${v}"` : v
}

function itemsToText(items: any): string {
  const arr = Array.isArray(items) ? items : []
  const parts: string[] = []
  for (const it of arr) {
    const name = String((it as any)?.name ?? '').trim()
    const qty = Number((it as any)?.quantity ?? 0)
    if (!name) continue
    if (!Number.isFinite(qty) || qty <= 0) continue
    parts.push(`${name} x${qty}`)
  }
  return parts.join(' | ')
}

export async function GET(_req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return new Response(`Error: ${sessErr.message}`, { status: 401 })
  }
  const user = session?.user ?? null
  if (!user) {
    return new Response('No autenticado', { status: 401 })
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (pErr) return new Response(`Error: ${pErr.message}`, { status: 403 })

  const role = (profile as any)?.role ?? null
  const isManager = role === 'manager' || role === 'admin'
  if (!isManager) return new Response('Sin permiso', { status: 403 })

  const id = String(eventId ?? '').trim()
  if (!id) return new Response('Evento inválido', { status: 400 })

  const { data: ev, error: evErr } = await supabase.from('events').select('id, slug').eq('id', id).maybeSingle()
  if (evErr) return new Response(`Error: ${evErr.message}`, { status: 500 })
  if (!ev) return new Response('No encontrado', { status: 404 })

  const { data: orders, error: oErr } = await supabase
    .from('event_orders')
    .select('responsible_name, created_at, status, items, total_amount')
    .eq('event_id', id)
    .order('created_at', { ascending: true })
    .limit(20000)

  if (oErr) return new Response(`Error: ${oErr.message}`, { status: 500 })

  const header = ['responsible_name', 'created_at', 'status', 'items', 'total_amount'].join(',')
  const lines = (orders ?? []).map((o: any) => {
    const row = [
      csvEscape(o.responsible_name),
      csvEscape(o.created_at),
      csvEscape(o.status),
      csvEscape(itemsToText(o.items)),
      csvEscape(o.total_amount ?? ''),
    ]
    return row.join(',')
  })

  const csv = [header, ...lines].join('\n')
  const slug = String((ev as any).slug ?? id)
  const filename = `event-${slug}-orders.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

