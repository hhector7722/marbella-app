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

  const role = (profile as { role?: string } | null)?.role ?? null
  const isManager = role === 'manager' || role === 'admin'
  if (!isManager) return { ok: false, message: 'Sin permiso (solo manager/admin)' }

  return { ok: true, supabase, userId: user.id, role }
}

async function gateStaffEncargo(): Promise<GateResult> {
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

  const role = (profile as { role?: string } | null)?.role ?? null
  const allowed = role === 'staff' || role === 'supervisor' || role === 'manager' || role === 'admin'
  if (!allowed) return { ok: false, message: 'Sin permiso' }

  return { ok: true, supabase, userId: user.id, role }
}

function revalidateEncargoPaths(slug?: string, clientToken?: string | null) {
  revalidatePath('/dashboard/eventos')
  revalidatePath('/staff/reservas')
  if (slug) {
    revalidatePath(`/eventos/${slug}`)
  }
  if (clientToken) {
    revalidatePath(`/pedido/${clientToken}`)
  }
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

const createEncargoSchema = z.object({
  contact_name: z.string().trim().min(2).max(120),
  event_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_time: z.string().trim().regex(/^\d{2}:\d{2}$/),
  guest_count: z.coerce.number().int().min(1).max(9999),
  reservation_id: z.string().uuid().optional().nullable(),
  /** Si true: habilita edición cliente + token (mismo event; sin líneas hasta el envío). */
  client_edit: z.coerce.boolean().optional().default(false),
})

const staffOrderItemSchema = z.object({
  product_id: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(999),
  notes: z.string().trim().max(400).optional().nullable(),
  is_half: z.coerce.boolean().optional(),
})

const createStaffEventOrderSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(staffOrderItemSchema).min(1).max(200),
  notes: z.string().trim().max(400).optional().nullable(),
  responsible_name: z.string().trim().min(2).max(80).optional().nullable(),
})

const updateStaffEventOrderSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(staffOrderItemSchema).min(1).max(200),
})

const categoryLimitsSchema = z.object({
  parents: z.record(z.string(), z.coerce.number().int().min(1).max(9999)).optional(),
  subs: z.record(z.string(), z.coerce.number().int().min(1).max(9999)).optional(),
})

const saveEventEncargoSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(defaultPackItemSchema).max(200).optional(),
  enabled_product_ids: z.array(zProductId).max(5000).nullable().optional(),
  category_limits: categoryLimitsSchema.optional(),
})

const deleteEventSchema = z.object({
  eventId: z.string().uuid(),
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

export async function createEncargoAction(input: unknown): Promise<
  | {
      success: true
      eventId: string
      slug: string
      clientEditEnabled: boolean
      clientEditToken: string | null
    }
  | { success: false; message: string }
> {
  const parsed = createEncargoSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const data = parsed.data
  const ymd = data.event_date
  const base = slugifyBase(data.contact_name)
  let slug = `${base}-${ymd}-${randomSuffix4()}`

  for (let i = 0; i < 3; i++) {
    const { data: existing, error } = await gate.supabase.from('events').select('id').eq('slug', slug).maybeSingle()
    if (error) return { success: false, message: error.message }
    if (!existing) break
    slug = `${base}-${ymd}-${randomSuffix4()}`
  }

  const time = `${data.event_time}:00`

  const { data: inserted, error: insErr } = await gate.supabase
    .from('events')
    .insert({
      slug,
      name: data.contact_name,
      event_date: ymd,
      event_time: time,
      description: null,
      guest_count: data.guest_count,
      pack_items: null,
      enabled_product_ids: null,
      is_active: true,
      created_by: gate.userId,
      reservation_id: data.reservation_id ?? null,
      client_edit_enabled: false,
      client_edit_token: null,
      created_from: data.reservation_id ? 'reservation' : 'standalone',
    })
    .select('id, slug')
    .maybeSingle()

  if (insErr) return { success: false, message: insErr.message }
  if (!inserted) return { success: false, message: 'No se pudo crear el encargo' }

  const eventId = String((inserted as { id: string }).id)
  const eventSlug = String((inserted as { slug: string }).slug)
  let clientEditToken: string | null = null
  let clientEditEnabled = false

  if (data.client_edit) {
    const { data: enData, error: enErr } = await gate.supabase.rpc('enable_event_client_edit', {
      p_event_id: eventId,
    })
    if (enErr) return { success: false, message: enErr.message }
    const payload = enData as { ok?: boolean; client_edit_token?: string; error?: string }
    if (!payload?.ok || !payload.client_edit_token) {
      return { success: false, message: 'Encargo creado pero no se pudo habilitar el enlace cliente.' }
    }
    clientEditToken = String(payload.client_edit_token)
    clientEditEnabled = true
  }

  revalidateEncargoPaths(eventSlug, clientEditToken)
  return {
    success: true,
    eventId,
    slug: eventSlug,
    clientEditEnabled,
    clientEditToken,
  }
}

export async function enableEventClientEditAction(input: unknown): Promise<
  | { success: true; eventId: string; clientEditToken: string }
  | { success: false; message: string }
> {
  const parsed = z.object({ eventId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data, error } = await gate.supabase.rpc('enable_event_client_edit', {
    p_event_id: parsed.data.eventId,
  })
  if (error) {
    const msg = String(error.message ?? '')
    if (/sin_permiso|no_autenticado/i.test(msg)) return { success: false, message: 'Sin permiso' }
    if (/already_submitted/i.test(msg)) {
      return {
        success: false,
        message: 'El cliente ya envió el pedido. Usa «Reabrir pedido al cliente» si hace falta.',
      }
    }
    return { success: false, message: msg || 'Error habilitando enlace' }
  }

  const payload = data as { ok?: boolean; client_edit_token?: string; error?: string }
  if (!payload?.ok || !payload.client_edit_token) {
    if (payload?.error === 'not_found') return { success: false, message: 'Encargo no encontrado.' }
    if (payload?.error === 'already_submitted') {
      return {
        success: false,
        message: 'El cliente ya envió el pedido. Usa «Reabrir pedido al cliente» si hace falta.',
      }
    }
    return { success: false, message: 'No se pudo habilitar el enlace.' }
  }

  revalidateEncargoPaths(undefined, String(payload.client_edit_token))
  return {
    success: true,
    eventId: parsed.data.eventId,
    clientEditToken: String(payload.client_edit_token),
  }
}

/** Reabre el mismo pedido al cliente (sin borrar líneas). El próximo envío sustituye. */
export async function reopenClientOrderAction(input: unknown): Promise<
  | { success: true; eventId: string; clientEditToken: string }
  | { success: false; message: string }
> {
  const parsed = z.object({ eventId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data, error } = await gate.supabase.rpc('reopen_client_order', {
    p_event_id: parsed.data.eventId,
  })
  if (error) {
    const msg = String(error.message ?? '')
    if (/sin_permiso|no_autenticado/i.test(msg)) return { success: false, message: 'Sin permiso' }
    return { success: false, message: msg || 'Error reabriendo pedido' }
  }

  const payload = data as { ok?: boolean; client_edit_token?: string; error?: string }
  if (!payload?.ok || !payload.client_edit_token) {
    if (payload?.error === 'not_found') return { success: false, message: 'Encargo no encontrado.' }
    if (payload?.error === 'not_submitted') {
      return { success: false, message: 'El cliente aún no ha enviado el pedido.' }
    }
    return { success: false, message: 'No se pudo reabrir el pedido.' }
  }

  revalidateEncargoPaths(undefined, String(payload.client_edit_token))
  return {
    success: true,
    eventId: parsed.data.eventId,
    clientEditToken: String(payload.client_edit_token),
  }
}

/** @deprecated Usar reopenClientOrderAction */
export async function requestNewClientOrderAction(input: unknown): Promise<
  | { success: true; eventId: string; clientEditToken: string }
  | { success: false; message: string }
> {
  return reopenClientOrderAction(input)
}

export async function disableEventClientEditAction(input: unknown): Promise<
  { success: true } | { success: false; message: string }
> {
  const parsed = z.object({ eventId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data, error } = await gate.supabase.rpc('disable_event_client_edit', {
    p_event_id: parsed.data.eventId,
  })
  if (error) return { success: false, message: error.message }
  const payload = data as { ok?: boolean; error?: string }
  if (!payload?.ok) return { success: false, message: 'No se pudo deshabilitar.' }

  revalidateEncargoPaths()
  return { success: true }
}

/** @deprecated Usar createEncargoAction */
export async function createEventAction(input: unknown): Promise<
  | {
      success: true
      eventId: string
      slug: string
      clientEditEnabled: boolean
      clientEditToken: string | null
    }
  | { success: false; message: string }
> {
  return createEncargoAction(input)
}

export async function createStaffEventOrderAction(input: unknown): Promise<
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
  const parsed = createStaffEventOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data, error } = await gate.supabase.rpc('create_staff_event_order', {
    p_event_id: parsed.data.eventId,
    p_items: parsed.data.items.map((it) => ({
      product_id: it.product_id,
      quantity: it.quantity,
      notes: it.notes ?? null,
      is_half: Boolean(it.is_half),
    })),
    p_notes: parsed.data.notes ?? null,
    p_responsible_name: parsed.data.responsible_name ?? null,
  })

  if (error) {
    const msg = String(error.message ?? '')
    if (/sin_permiso|no_autenticado/i.test(msg)) return { success: false, message: 'Sin permiso' }
    if (/producto_no_disponible|producto_no_permitido/i.test(msg)) {
      return { success: false, message: 'Hay productos no disponibles para este encargo.' }
    }
    if (/items_|quantity_invalida|product_id_requerido/i.test(msg)) {
      return { success: false, message: 'Pedido inválido.' }
    }
    return { success: false, message: msg || 'Error guardando el pedido' }
  }

  const payload = data as { ok?: boolean; error?: string; id?: string; responsible_name?: string; items?: unknown[]; total_amount?: number; status?: string }
  if (!payload?.ok) {
    if (payload?.error === 'not_found') return { success: false, message: 'Encargo no encontrado.' }
    return { success: false, message: 'No se pudo crear el pedido.' }
  }

  revalidateEncargoPaths()
  revalidatePath(`/staff/reservas/encargo/${parsed.data.eventId}`)

  return {
    success: true,
    order: {
      id: String(payload.id),
      responsible_name: String(payload.responsible_name ?? 'Personal'),
      items: Array.isArray(payload.items)
        ? (payload.items as Array<{
            product_id: string
            name: string
            quantity: number
            unit_price: number
            notes?: string | null
          }>)
        : [],
      total_amount: Number(payload.total_amount) || 0,
      status: String(payload.status ?? 'confirmed'),
    },
  }
}

export async function updateStaffEventOrderAction(input: unknown): Promise<
  | {
      success: true
      order: {
        id: string
        items: Array<{
          product_id: string
          name: string
          quantity: number
          unit_price: number
          notes?: string | null
        }>
        total_amount: number
      }
    }
  | { success: false; message: string }
> {
  const parsed = updateStaffEventOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data, error } = await gate.supabase.rpc('update_staff_event_order', {
    p_order_id: parsed.data.orderId,
    p_items: parsed.data.items.map((it) => ({
      product_id: it.product_id,
      quantity: it.quantity,
      notes: it.notes ?? null,
      is_half: Boolean(it.is_half),
    })),
  })

  if (error) {
    const msg = String(error.message ?? '')
    if (/sin_permiso|no_autenticado/i.test(msg)) return { success: false, message: 'Sin permiso' }
    if (/producto_no_disponible|producto_no_permitido/i.test(msg)) {
      return { success: false, message: 'Hay productos no disponibles para este encargo.' }
    }
    return { success: false, message: msg || 'Error actualizando el pedido' }
  }

  const payload = data as {
    ok?: boolean
    error?: string
    id?: string
    event_id?: string
    items?: unknown[]
    total_amount?: number
  }
  if (!payload?.ok) {
    if (payload?.error === 'not_found') return { success: false, message: 'Pedido no encontrado.' }
    return { success: false, message: 'No se pudo actualizar el pedido.' }
  }

  revalidateEncargoPaths()
  if (payload.event_id) {
    revalidatePath(`/staff/reservas/encargo/${payload.event_id}`)
  }

  return {
    success: true,
    order: {
      id: String(payload.id),
      items: Array.isArray(payload.items)
        ? (payload.items as Array<{
            product_id: string
            name: string
            quantity: number
            unit_price: number
            notes?: string | null
          }>)
        : [],
      total_amount: Number(payload.total_amount) || 0,
    },
  }
}

export async function deleteEncargoStaffAction(input: unknown): Promise<
  { success: true } | { success: false; message: string }
> {
  const parsed = deleteEventSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const { error } = await gate.supabase.from('events').delete().eq('id', parsed.data.eventId)
  if (error) return { success: false, message: error.message }

  revalidateEncargoPaths()
  return { success: true }
}

export async function saveEventEncargoConfigAction(
  input: unknown
): Promise<{ success: true } | { success: false; message: string }> {
  const parsed = saveEventEncargoSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateStaffEncargo()
  if (!gate.ok) return { success: false, message: gate.message }

  const patch: Record<string, unknown> = {}

  if (parsed.data.items !== undefined) {
    patch.pack_items = parsed.data.items
      .filter((it) => Number(it.quantity) > 0)
      .map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity) }))
  }

  if (parsed.data.enabled_product_ids !== undefined) {
    const ids = parsed.data.enabled_product_ids
    patch.enabled_product_ids =
      ids && ids.length > 0
        ? Array.from(new Set(ids.map((x) => String(x).trim()).filter(Boolean)))
        : []
  }

  if (parsed.data.category_limits !== undefined) {
    const lim = parsed.data.category_limits
    const parents = lim.parents ?? {}
    const subs = lim.subs ?? {}
    const hasAny = Object.keys(parents).length > 0 || Object.keys(subs).length > 0
    patch.category_limits = hasAny ? { parents, subs } : null
  }

  const { data: updated, error } = await gate.supabase
    .from('events')
    .update(patch)
    .eq('id', parsed.data.eventId)
    .select('slug')
    .maybeSingle()

  if (error) return { success: false, message: error.message }
  if (!updated) return { success: false, message: 'Encargo no encontrado' }

  const slug = String((updated as { slug?: string }).slug ?? '')
  revalidateEncargoPaths(slug)
  revalidatePath(`/staff/reservas/encargo/${parsed.data.eventId}`)
  return { success: true }
}

/** @deprecated Usar saveEventEncargoConfigAction */
export async function saveEventPackAction(input: unknown): Promise<{ success: true } | { success: false; message: string }> {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      items: z.array(defaultPackItemSchema).max(200),
    })
    .safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }
  return saveEventEncargoConfigAction({
    eventId: parsed.data.eventId,
    items: parsed.data.items,
  })
}

export async function deleteEventAction(input: unknown): Promise<{ success: true } | { success: false; message: string }> {
  const parsed = deleteEventSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Datos inválidos' }

  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const { error } = await gate.supabase.from('events').delete().eq('id', parsed.data.eventId)
  if (error) return { success: false, message: error.message }

  revalidatePath('/dashboard/eventos')
  return { success: true }
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

  revalidateEncargoPaths()
  return { success: true }
}

