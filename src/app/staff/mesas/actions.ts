'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import {
  type FloorplanLayout,
  type FloorplanRecord,
  validateFloorplanLayout,
  hasFixedFloorplanGeometry,
} from '@/lib/staff/floorplan'

type SaveResult =
  | { ok: true; revision: number; published: boolean }
  | { ok: false; error: string }

export async function saveStaffFloorplanAction(
  layout: FloorplanLayout,
  expectedRevision: number,
  publish: boolean,
): Promise<SaveResult> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, error: 'Versión del plano incorrecta.' }
  }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'Inicia sesión de nuevo.' }

  if (!isMasterDashboardUser(user.email)) {
    return { ok: false, error: 'Acceso exclusivo de la cuenta master.' }
  }

  const { data, error } = await supabase
    .from('staff_floorplans')
    .select('id, draft, published, revision, updated_at')
    .eq('id', 'principal')
    .maybeSingle()
  if (error || !data) {
    return { ok: false, error: 'No se ha encontrado la configuración del plano.' }
  }
  const current = data as unknown as FloorplanRecord
  if (current.revision !== expectedRevision) {
    return { ok: false, error: 'El plano ha cambiado en otro dispositivo. Recarga antes de guardar.' }
  }

  // Tras la primera publicación no se admite guardar ni un borrador incompleto.
  const requireComplete = publish || current.published !== null
  const problems = validateFloorplanLayout(layout, requireComplete)
  if (problems.length) return { ok: false, error: problems[0] }
  if (!hasFixedFloorplanGeometry(layout)) {
    return { ok: false, error: 'No se permite modificar la posición del mobiliario de los planos originales.' }
  }

  // En ninguna actualización se permite reutilizar o quitar la numeración
  // de una mesa activa. La radiografía de sala es una salvaguarda conservadora,
  // NO la autoridad para escribir comandas ni cobrar en BDP.
  if (current.published) {
    const next = new Map(layout.tables.map((item) => [item.id, item]))
    const changedNumbers = current.published.tables.flatMap((oldTable) => {
      const updated = next.get(oldTable.id)
      if (oldTable.number === null) return []
      const oldSalon = current.published!.salons[oldTable.zone]
      const newSalon = updated ? layout.salons[updated.zone] : null
      if (!updated || oldTable.number !== updated.number || oldSalon !== newSalon) {
        return [oldTable.number]
      }
      return []
    })

    if (changedNumbers.length) {
      const { data: sala, error: salaError } = await supabase
        .from('estado_sala')
        .select('ultima_actualizacion, radiografia_completa')
        .eq('id', 1)
        .maybeSingle()
      const updatedAt = sala?.ultima_actualizacion
        ? new Date(sala.ultima_actualizacion).getTime()
        : NaN
      // Si no hay lectura fresca, prohibimos un cambio de identidad BDP.
      if (salaError || !Number.isFinite(updatedAt) ||
          Date.now() - updatedAt > 60_000 || updatedAt > Date.now() + 10_000 ||
          !Array.isArray(sala?.radiografia_completa)) {
        return { ok: false, error: 'No se puede verificar el estado actual de BDP. No se han cambiado los números.' }
      }
      const occupied = new Set(
        (sala.radiografia_completa as Array<{ mesa?: unknown }>)
          .map((row) => Number(row?.mesa))
          .filter((n) => Number.isSafeInteger(n) && n > 0),
      )
      if (changedNumbers.some((n) => occupied.has(n))) {
        return { ok: false, error: 'Hay una mesa afectada con actividad en BDP. Ciérrala antes de renumerarla o eliminarla.' }
      }
    }
  }

  const now = new Date().toISOString()
  const { data: saved, error: saveError } = await supabase
    .from('staff_floorplans')
    .update({
      draft: layout,
      ...(publish ? { published: layout } : {}),
      revision: expectedRevision + 1,
      updated_at: now,
      updated_by: user.id,
    })
    .eq('id', 'principal')
    .eq('revision', expectedRevision)
    .select('revision')
    .maybeSingle()

  if (saveError) return { ok: false, error: 'No se pudo guardar: ' + saveError.message }
  if (!saved) return { ok: false, error: 'Otro usuario ha modificado el plano. Recarga y vuelve a intentarlo.' }

  revalidatePath('/staff/mesas')
  return { ok: true, revision: expectedRevision + 1, published: publish || !!current.published }
}
