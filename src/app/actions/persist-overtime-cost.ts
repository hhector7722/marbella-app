'use server';

import { createClient } from '@/utils/supabase/server';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';
import {
  mondayOnOrBefore,
  writeProjectionFromWeek,
  writeProjectionForEmployees,
} from '@/lib/hours-engine';

/**
 * Tras un cambio de time_logs (fichaje): regenera proyección C vía Writer.
 * Auth: el propio usuario o manager.
 */
export async function syncOvertimeCostAfterTimeLogChange(
  userId: string,
  affectedDateYmd?: string | null,
): Promise<{ success: boolean; error?: string; weeksPersisted?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const uid = String(userId || '').trim();
  if (!uid) return { success: false, error: 'Empleado no indicado' };

  if (user.id !== uid) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'manager') {
      return { success: false, error: 'Sin permiso para sincronizar coste de otro usuario' };
    }
  }

  const day =
    affectedDateYmd && String(affectedDateYmd).trim() !== ''
      ? String(affectedDateYmd).split('T')[0]!
      : formatYmdInMadrid(new Date());
  if (!day) {
    return { success: false, error: 'Fecha afectada inválida' };
  }

  const fromWeekStart = mondayOnOrBefore(day);
  const result = await writeProjectionFromWeek(
    supabase,
    uid,
    fromWeekStart,
    'fichaje',
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  return { success: true, weeksPersisted: result.weeksWritten };
}

/**
 * Regenera proyección desde startDate vía Writer.
 * Nombre legacy conservado para callers existentes.
 */
export async function recalcAndPersistOvertimeCostAction(
  userId: string,
  startDate: string,
): Promise<{ success: boolean; error?: string; weeksPersisted?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const result = await writeProjectionFromWeek(
    supabase,
    userId,
    startDate,
    'recalc',
  );
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  return { success: true, weeksPersisted: result.weeksWritten };
}

/**
 * Tras importaciones masivas: Writer completo por empleado.
 * Auth: manager.
 */
export async function persistOvertimeCostForEmployeesAction(
  userIds: string[],
): Promise<{ success: boolean; error?: string; weeksPersisted?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'manager') {
    return { success: false, error: 'Sin permiso (solo manager)' };
  }

  try {
    const result = await writeProjectionForEmployees(supabase, userIds, 'import');
    return { success: true, weeksPersisted: result.weeksWritten };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
