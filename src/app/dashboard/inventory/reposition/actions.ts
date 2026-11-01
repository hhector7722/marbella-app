'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isReplenishmentPilotUser } from '@/lib/replenishment/access'

const PAGE = '/dashboard/inventory/reposition'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function requirePilotOwner() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Inicia sesión para continuar.')
  if (!isReplenishmentPilotUser(user.email)) {
    throw new Error('Acceso restringido al piloto de reposición visual.')
  }
  return { supabase, user }
}

function requireUuid(value: string) {
  if (!UUID.test(value)) throw new Error('Identificador no válido.')
}

export async function createReplenishmentFridge(nameInput: string) {
  const name = nameInput.trim()
  if (name.length < 1 || name.length > 80) throw new Error('Nombre de nevera no válido.')
  const { supabase, user } = await requirePilotOwner()
  const { error } = await supabase.from('replenishment_fridges')
    .insert({ name, created_by: user.id })
  if (error) throw new Error('No se pudo crear la nevera: ' + error.message)
  revalidatePath(PAGE)
}

export async function deleteReplenishmentFridge(id: string) {
  requireUuid(id)
  const { supabase } = await requirePilotOwner()
  const { error } = await supabase.from('replenishment_fridges').delete().eq('id', id)
  if (error) throw new Error('No se pudo eliminar la nevera: ' + error.message)
  revalidatePath(PAGE)
}

export async function createReplenishmentSlot(input: {
  fridgeId: string
  ingredientId: string
  label: string
  level: number
  capacity: number
}) {
  requireUuid(input.fridgeId)
  requireUuid(input.ingredientId)
  const label = input.label.trim()
  if (label.length > 80 || !Number.isInteger(input.level) || input.level < 1 || input.level > 30 ||
      !Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 500) {
    throw new Error('Configuración no válida.')
  }
  const { supabase } = await requirePilotOwner()
  const { data: ingredient, error: ingredientError } = await supabase.from('ingredients')
    .select('id, base_unit').eq('id', input.ingredientId).is('archived_at', null).maybeSingle()
  if (ingredientError || !ingredient || ingredient.base_unit !== 'ud') {
    throw new Error('Selecciona un producto activo contado por unidades.')
  }
  const { error } = await supabase.from('replenishment_slots').insert({
    fridge_id: input.fridgeId,
    ingredient_id: input.ingredientId,
    label,
    level_number: input.level,
    capacity: input.capacity,
  })
  if (error) throw new Error('No se pudo guardar la zona: ' + error.message)
  revalidatePath(PAGE)
}

export async function deleteReplenishmentSlot(id: string) {
  requireUuid(id)
  const { supabase } = await requirePilotOwner()
  const { error } = await supabase.from('replenishment_slots').delete().eq('id', id)
  if (error) throw new Error('No se pudo eliminar la zona: ' + error.message)
  revalidatePath(PAGE)
}
