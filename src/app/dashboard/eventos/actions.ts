'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

type GateResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string | null }
  | { ok: false; message: string }

async function gateManager(): Promise<GateResult> {
  const supabase = await createClient()
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession()

  if (sessionErr) return { ok: false, message: sessionErr.message }
  const user = session?.user ?? null
  if (!user) return { ok: false, message: 'No autenticado' }

  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) return { ok: false, message: error.message }

  const role = (profile as any)?.role ?? null
  const isManager = role === 'manager' || role === 'admin'
  if (!isManager) return { ok: false, message: 'Sin permiso (solo manager/admin)' }

  return { ok: true, supabase, userId: user.id, role }
}

const zProductId = z.string().min(1)

const defaultPackItemSchema = z.object({
  product_id: zProductId,
  quantity: z.coerce.number().int().min(0).max(999),
})

const upsertEventProductSchema = z.object({
  productId: zProductId,
  isActive: z.coerce.boolean(),
})

export async function upsertEventProductAvailabilityAction(input: unknown): Promise<
  | { success: true }
  | {
      success: false
      message: string
    }
> {
  const parsed = upsertEventProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const { productId, isActive } = parsed.data

  // Fuente SSOT: `v_digital_menu_items` (carta)
  const articuloId = Number(productId)
  if (!Number.isFinite(articuloId) || articuloId <= 0) {
    return { success: false, message: 'Producto inválido' }
  }

  const { data: row, error } = await gate.supabase
    .from('v_digital_menu_items')
    .select('articulo_id, carta_nombre, precio, category_parent_name, category_child_name')
    .eq('articulo_id', articuloId)
    .maybeSingle()

  if (error) return { success: false, message: error.message }
  if (!row) return { success: false, message: 'Producto no encontrado en la carta' }

  const name = String((row as any).carta_nombre ?? '').trim()
  const price = Number((row as any).precio)
  const parent = String((row as any).category_parent_name ?? '').trim()
  const child = String((row as any).category_child_name ?? '').trim()
  const category = [parent, child].filter(Boolean).join(' · ') || null

  if (!name) return { success: false, message: 'Producto sin nombre' }
  if (!Number.isFinite(price) || price < 0) return { success: false, message: 'Producto sin precio válido' }

  const { error: upErr } = await gate.supabase.from('event_products').upsert(
    {
      product_id: productId,
      name,
      price,
      category,
      is_active: isActive,
    },
    { onConflict: 'product_id' }
  )

  if (upErr) return { success: false, message: upErr.message }

  revalidatePath('/dashboard/eventos')
  return { success: true }
}

const DEFAULT_PACK_ID = '7a4f7a5b-98b3-4f61-8bb4-0f6b7f6b7c01'

const updateDefaultPackSchema = z.object({
  label: z.string().trim().min(1).max(80),
  items: z.array(defaultPackItemSchema).max(200),
})

export async function updateDefaultPackAction(input: unknown): Promise<
  | { success: true }
  | {
      success: false
      message: string
    }
> {
  const parsed = updateDefaultPackSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const items = parsed.data.items
    .filter((it) => Number(it.quantity) > 0)
    .map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity) }))

  const { error } = await gate.supabase.from('event_default_pack').upsert(
    {
      id: DEFAULT_PACK_ID,
      label: parsed.data.label,
      items,
      updated_by: gate.userId,
    },
    { onConflict: 'id' }
  )

  if (error) return { success: false, message: error.message }

  revalidatePath('/dashboard/eventos')
  return { success: true }
}

const createEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  event_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_time: z.string().trim().regex(/^\d{2}:\d{2}$/),
  description: z.string().trim().max(400).optional().nullable(),
  pack_mode: z.enum(['default', 'custom']),
  pack_items: z.array(defaultPackItemSchema).optional().nullable(),
  products_mode: z.enum(['global', 'custom']),
  enabled_product_ids: z.array(zProductId).optional().nullable(),
})

function slugifyBase(input: string): string {
  const s = String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return s || 'evento'
}

function randomSuffix4(): string {
  return Math.random().toString(36).slice(2, 6)
}

export async function createEventAction(input: unknown): Promise<
  | { success: true; eventId: string; slug: string }
  | {
      success: false
      message: string
    }
> {
  const parsed = createEventSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const data = parsed.data
  const ymd = data.event_date

  const base = slugifyBase(data.name)
  let slug = `${base}-${ymd}-${randomSuffix4()}`

  for (let i = 0; i < 3; i++) {
    const { data: existing, error } = await gate.supabase.from('events').select('id').eq('slug', slug).maybeSingle()
    if (error) return { success: false, message: error.message }
    if (!existing) break
    slug = `${base}-${ymd}-${randomSuffix4()}`
  }

  const time = `${data.event_time}:00`

  const pack_items =
    data.pack_mode === 'custom'
      ? (data.pack_items ?? []).filter((x) => Number(x.quantity) > 0).map((x) => ({ product_id: x.product_id, quantity: Number(x.quantity) }))
      : null

  const enabled_product_ids =
    data.products_mode === 'custom'
      ? Array.from(new Set((data.enabled_product_ids ?? []).map((x) => String(x).trim()).filter(Boolean)))
      : null

  const { data: inserted, error: insErr } = await gate.supabase
    .from('events')
    .insert({
      slug,
      name: data.name,
      event_date: ymd,
      event_time: time,
      description: data.description && data.description.trim() ? data.description.trim() : null,
      pack_items,
      enabled_product_ids,
      is_active: true,
      created_by: gate.userId,
    })
    .select('id, slug')
    .maybeSingle()

  if (insErr) return { success: false, message: insErr.message }
  if (!inserted) return { success: false, message: 'No se pudo crear el evento' }

  revalidatePath('/dashboard/eventos')
  return { success: true, eventId: String((inserted as any).id), slug: String((inserted as any).slug) }
}

const toggleEventSchema = z.object({
  eventId: z.string().uuid(),
  isActive: z.coerce.boolean(),
})

export async function setEventActiveAction(input: unknown): Promise<{ success: true } | { success: false; message: string }> {
  const parsed = toggleEventSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const { error } = await gate.supabase
    .from('events')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.eventId)

  if (error) return { success: false, message: error.message }

  revalidatePath('/dashboard/eventos')
  return { success: true }
}

const orderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
})

export async function setEventOrderStatusAction(input: unknown): Promise<{ success: true } | { success: false; message: string }> {
  const parsed = orderStatusSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data: updated, error } = await gate.supabase
    .from('event_orders')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.orderId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, message: error.message }
  if (!updated) return { success: false, message: 'No se pudo actualizar (RLS o no existe)' }

  return { success: true }
}

