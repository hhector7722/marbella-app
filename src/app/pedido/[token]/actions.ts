'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const saveSchema = z.object({
  token: z.string().uuid(),
  items: z
    .array(
      z.object({
        product_id: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(0).max(999),
        is_half: z.coerce.boolean().optional(),
        notes: z.string().trim().max(400).optional().nullable(),
      })
    )
    .max(200),
  notes: z.string().trim().max(400).optional().nullable(),
})

export async function saveClientEventOrderByTokenAction(input: unknown): Promise<
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
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const items = parsed.data.items.filter((it) => Number(it.quantity) > 0)
  if (items.length === 0) return { success: false, message: 'Debes pedir al menos 1 item.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_client_event_order_by_token', {
    p_token: parsed.data.token,
    p_items: items.map((it) => ({
      product_id: it.product_id,
      quantity: it.quantity,
      is_half: Boolean(it.is_half),
      notes: it.notes ?? null,
    })),
    p_notes: parsed.data.notes ?? null,
  })

  if (error) {
    const msg = String(error.message ?? '')
    if (/event_past/i.test(msg)) return { success: false, message: 'Este pedido ya pasó.' }
    if (/event_inactive|client_edit_disabled|already_submitted/i.test(msg)) {
      return {
        success: false,
        message: 'Ya habéis enviado el pedido. Si necesitáis cambios, contactad con el bar.',
      }
    }
    if (/producto_no_disponible|producto_no_permitido/i.test(msg)) {
      return { success: false, message: 'Hay productos no disponibles para este pedido.' }
    }
    if (/items_|quantity_invalida|product_id_requerido/i.test(msg)) {
      return { success: false, message: 'Pedido inválido.' }
    }
    return { success: false, message: msg || 'Error guardando el pedido' }
  }

  const payload = data as {
    ok?: boolean
    error?: string
    id?: string
    responsible_name?: string
    items?: unknown[]
    total_amount?: number
    status?: string
  }

  if (!payload?.ok) {
    const err = String(payload?.error ?? 'error')
    if (err === 'event_past') return { success: false, message: 'Este pedido ya pasó.' }
    if (err === 'event_inactive' || err === 'client_edit_disabled' || err === 'already_submitted') {
      return {
        success: false,
        message: 'Ya habéis enviado el pedido. Si necesitáis cambios, contactad con el bar.',
      }
    }
    if (err === 'not_found') return { success: false, message: 'Enlace no válido.' }
    return { success: false, message: 'No se pudo guardar el pedido.' }
  }

  revalidatePath(`/pedido/${parsed.data.token}`)
  revalidatePath('/staff/reservas')

  return {
    success: true,
    order: {
      id: String(payload.id),
      responsible_name: String(payload.responsible_name ?? ''),
      items: Array.isArray(payload.items) ? (payload.items as Array<{ product_id: string; name: string; quantity: number; unit_price: number }>) : [],
      total_amount: Number(payload.total_amount) || 0,
      status: String(payload.status ?? 'pending'),
    },
  }
}
