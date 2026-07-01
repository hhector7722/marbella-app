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
      if (error.code === '42703') { // column is_active does not exist
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('activities')
          .select('id, name, color')
          .order('name');
          
        if (fallbackErr) return { success: false, error: fallbackErr.message };
        return { success: true, data: fallbackData.map(d => ({ ...d, is_active: true })) };
      }
      return { success: false, error: error.message };
    }

    return { success: true, data };
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
