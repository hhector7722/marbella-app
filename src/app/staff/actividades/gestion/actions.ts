'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export async function getGestionActivitiesAction() {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !isMasterDashboardUser(session.user.email ?? '')) {
      return { success: false, error: 'No autorizado' };
    }

    let { data, error } = await supabase
      .from('activities')
      .select('id, name, color, is_active')
      .order('name');

    if (error) {
      const { data: occurrences } = await supabase
        .from('activity_occurrences')
        .select('activity_id, occurrence_venues(venues(code))');
        
      const pistaSet = new Set<string>();
      if (occurrences) {
        for (const occ of occurrences) {
          const venues = (occ.occurrence_venues as any[] || []).map(v => v.venues?.code?.toUpperCase());
          if (venues.some(code => ['P1', 'P2', 'P3', 'P4'].includes(code))) {
            pistaSet.add(occ.activity_id);
          }
        }
      }

      if (error.code === '42703') { // column is_active does not exist
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('activities')
          .select('id, name, color')
          .order('name');
          
        if (fallbackErr) return { success: false, error: fallbackErr.message };
        const enhancedFallback = fallbackData.map((d: any) => ({
          ...d,
          is_active: true,
          is_pista: pistaSet.has(d.id),
        }));
        return { success: true, data: enhancedFallback };
      }
      return { success: false, error: error.message };
    }

    const { data: occurrences } = await supabase
      .from('activity_occurrences')
      .select('activity_id, occurrence_venues(venues(code))');
      
    const pistaSet = new Set<string>();
    if (occurrences) {
      for (const occ of occurrences) {
        const venues = (occ.occurrence_venues as any[] || []).map(v => v.venues?.code?.toUpperCase());
        if (venues.some(code => ['P1', 'P2', 'P3', 'P4'].includes(code))) {
          pistaSet.add(occ.activity_id);
        }
      }
    }

    const enhancedData = (data ?? []).map((d: any) => ({
      ...d,
      is_pista: pistaSet.has(d.id),
    }));

    return { success: true, data: enhancedData };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

export async function updateActivityAction(id: string, payload: { name?: string, color?: string, is_active?: boolean }) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !isMasterDashboardUser(session.user.email ?? '')) {
      return { success: false, error: 'No autorizado' };
    }

    // Try to update with is_active
    const { error } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', id);

    if (error) {
      if (error.code === '42703' && payload.is_active !== undefined) {
        // Fallback: ignore is_active if column doesn't exist yet
        const { is_active, ...restPayload } = payload;
        const { error: fallbackErr } = await supabase
          .from('activities')
          .update(restPayload)
          .eq('id', id);
        
        if (fallbackErr) return { success: false, error: fallbackErr.message };
        return { success: true, message: 'Actualizado (is_active ignorado porque falta ejecutar el SQL)' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// Merge duplicates: redirect all occurrences from `fromIds` to `survivorId`, then delete the duplicates
export async function mergeActivitiesAction(survivorId: string, fromIds: string[]) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !isMasterDashboardUser(session.user.email ?? '')) {
      return { success: false, error: 'No autorizado' };
    }

    if (!fromIds.length) return { success: false, error: 'Selecciona al menos una actividad a fusionar.' };
    if (fromIds.includes(survivorId)) return { success: false, error: 'El superviviente no puede estar en la lista de duplicados.' };

    // 1. Reasignar todas las ocurrencias al superviviente
    const { error: updateErr } = await supabase
      .from('activity_occurrences')
      .update({ activity_id: survivorId })
      .in('activity_id', fromIds);

    if (updateErr) return { success: false, error: 'Error al reasignar ocurrencias: ' + updateErr.message };

    // 2. Borrar las actividades duplicadas
    const { error: deleteErr } = await supabase
      .from('activities')
      .delete()
      .in('id', fromIds);

    if (deleteErr) return { success: false, error: 'Error al borrar duplicados: ' + deleteErr.message };

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}
