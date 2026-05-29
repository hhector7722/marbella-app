import { createClient } from '@/utils/supabase/server'
import {
  buildEventOrderProductColumns,
  formatOrderQuantityCell,
  quantityForProduct,
  type EventOrderMatrixRow,
} from '@/lib/event-orders-matrix'

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  const needs = /[",\n\r]/.test(s)
  const v = s.replace(/"/g, '""')
  return needs ? `"${v}"` : v
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

  const role = (profile as { role?: string } | null)?.role ?? null
  const isManager = role === 'manager' || role === 'admin'
  if (!isManager) return new Response('Sin permiso', { status: 403 })

  const id = String(eventId ?? '').trim()
  if (!id) return new Response('Evento inválido', { status: 400 })

  const { data: ev, error: evErr } = await supabase.from('events').select('id, slug').eq('id', id).maybeSingle()
  if (evErr) return new Response(`Error: ${evErr.message}`, { status: 500 })
  if (!ev) return new Response('No encontrado', { status: 404 })

  const { data: orders, error: oErr } = await supabase
    .from('event_orders')
    .select('id, responsible_name, items')
    .eq('event_id', id)
    .order('created_at', { ascending: true })
    .limit(20000)

  if (oErr) return new Response(`Error: ${oErr.message}`, { status: 500 })

  const matrixRows: EventOrderMatrixRow[] = ((orders ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: String(o.id),
    responsible_name: String(o.responsible_name ?? ''),
    items: (o.items ?? []) as EventOrderMatrixRow['items'],
  }))

  const productColumns = buildEventOrderProductColumns(matrixRows)
  const header = ['nombre', ...productColumns.map((c) => c.name)].map(csvEscape).join(',')

  const lines = matrixRows.map((o) => {
    const cells = [
      csvEscape(o.responsible_name),
      ...productColumns.map((col) => {
        const qty = quantityForProduct(o, col.productId)
        const cell = formatOrderQuantityCell(qty)
        return csvEscape(cell === ' ' ? '' : cell)
      }),
    ]
    return cells.join(',')
  })

  const csv = [header, ...lines].join('\n')
  const slug = String((ev as { slug?: string }).slug ?? id)

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-${slug}.csv"`,
    },
  })
}
