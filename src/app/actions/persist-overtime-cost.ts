'use server';

import { createClient } from '@/utils/supabase/server';
import {
  mondayOnOrBefore,
  persistOvertimeCostFromEngine,
  recalcSnapshotsAndPersistOvertimeCost,
} from '@/lib/hours-engine';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';

/**
 * Tras un cambio de time_logs (p.ej. fichaje cliente):
 * el trigger SQL ya recalculó horas sin tocar total_cost.
 * Esta action solo persiste estimatedValue → total_cost.
 *
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
  const result = await persistOvertimeCostFromEngine(supabase, {
    userId: uid,
    fromWeekStart,
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  return { success: true, weeksPersisted: result.weeksPersisted };
}

/**
 * Recalc SQL (horas) + persist Cost Engine. Para Server Actions que mutan snapshots/logs.
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

  const result = await recalcSnapshotsAndPersistOvertimeCost(
    supabase,
    userId,
    startDate,
  );
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  return { success: true, weeksPersisted: result.weeksPersisted };
}

/**
 * Tras importaciones masivas de time_logs (p.ej. /admin/import):
 * el trigger SQL ya recalculó horas; aquí solo persiste Cost Engine.
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

  const { persistOvertimeCostForEmployees } = await import(
    '@/lib/hours-engine/recalculate-and-persist-all'
  );

  try {
    const result = await persistOvertimeCostForEmployees(supabase, userIds);
    return { success: true, weeksPersisted: result.weeksPersisted };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
