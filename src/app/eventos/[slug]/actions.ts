'use server'

import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

const submitSchema = z.object({
  slug: z.string().trim().min(1),
  responsible_name: z.string().trim().min(2).max(80),
  items: z
    .array(
      z.object({
        product_id: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(0).max(999),
      })
    )
    .max(200),
  notes: z.string().trim().max(400).optional().nullable(),
})

export async function submitEventOrderAction(input: unknown): Promise<
  | {
      success: true
      order: {
        id: string
        responsible_name: string
        items: Array<{ product_id: string; name: string; quantity: number; unit_price: number }>
        total_amount: number
        status: string
      }
    }
  | { success: false; message: string }
> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const items = parsed.data.items.filter((it) => Number(it.quantity) > 0)
  if (items.length === 0) return { success: false, message: 'Debes pedir al menos 1 item.' }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_event_order', {
    p_slug: parsed.data.slug,
    p_responsible_name: parsed.data.responsible_name,
    p_items: items,
    p_notes: parsed.data.notes ?? null,
  })

  if (error) {
    const msg = String(error.message ?? '')
    if (/event_past/i.test(msg)) return { success: false, message: 'Este evento ya pasó.' }
    if (/event_inactive/i.test(msg)) return { success: false, message: 'Este evento está inactivo.' }
    if (/producto_no_disponible|producto_no_permitido/i.test(msg)) {
      return { success: false, message: 'Hay productos no disponibles para este evento.' }
    }
    if (/responsable_requerido/i.test(msg)) return { success: false, message: 'Nombre del responsable requerido.' }
    if (/items_/i.test(msg) || /quantity_invalida|product_id_requerido/i.test(msg)) {
      return { success: false, message: 'Pedido inválido.' }
    }
    return { success: false, message: msg || 'Error enviando el pedido' }
  }

  const payload = data as any
  if (!payload?.ok) {
    const err = String(payload?.error ?? 'error')
    if (err === 'event_past') return { success: false, message: 'Este evento ya pasó.' }
    if (err === 'event_inactive') return { success: false, message: 'Este evento está inactivo.' }
    if (err === 'not_found') return { success: false, message: 'Evento no encontrado.' }
    return { success: false, message: 'No se pudo crear el pedido.' }
  }

  return {
    success: true,
    order: {
      id: String(payload.id),
      responsible_name: String(payload.responsible_name ?? payload.responsible_name ?? parsed.data.responsible_name),
      items: Array.isArray(payload.items) ? payload.items : [],
      total_amount: Number(payload.total_amount) || 0,
      status: String(payload.status ?? 'pending'),
    },
  }
}

