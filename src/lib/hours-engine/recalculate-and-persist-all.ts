/**
 * Recálculo global SQL (horas) + persistencia Cost Engine para todos los empleados.
 * Usado por Server Action UI y por /api/cron/recalculate-balances.
 * No contiene lógica monetaria propia: delega en persistOvertimeCostFromEngine.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
  loadEmployeeBoundaryFacts,
  persistOvertimeCostFromEngine,
} from './index.ts';

export type RecalculateAllBalancesPersistResult = {
  success: true;
  weeksPersisted: number;
  employeeCount: number;
  rpcData: unknown;
};

/**
 * 1) rpc_recalculate_all_balances (horas)
 * 2) persistOvertimeCostFromEngine por cada empleado con snapshots
 */
export async function recalculateAllBalancesAndPersist(
  client: SupabaseClient,
): Promise<RecalculateAllBalancesPersistResult> {
  const { data, error } = await client.rpc('rpc_recalculate_all_balances');

  if (error) {
    throw new Error(`rpc_recalculate_all_balances: ${error.message}`);
  }

  const { data: users, error: usersErr } = await client
    .from('weekly_snapshots')
    .select('user_id')
    .limit(10000);

  if (usersErr) {
    throw new Error(
      `Recálculo SQL OK, pero falló listado para persistir costes: ${usersErr.message}`,
    );
  }

  const userIds = [
    ...new Set((users ?? []).map((r) => r.user_id).filter(Boolean)),
  ] as string[];

  const failures: string[] = [];
  let weeksPersisted = 0;

  for (const userId of userIds) {
    let fromWeekStart: string;
    try {
      const employee = await loadEmployeeBoundaryFacts(client, userId);
      fromWeekStart =
        employeeTimelineStartWeek(employee) ??
        (
          await client
            .from('weekly_snapshots')
            .select('week_start')
            .eq('user_id', userId)
            .order('week_start', { ascending: true })
            .limit(1)
            .maybeSingle()
        ).data?.week_start?.toString().split('T')[0] ??
        '';
      if (!fromWeekStart) continue;
    } catch (err) {
      failures.push(
        `${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const persist = await persistOvertimeCostFromEngine(client, {
      userId,
      fromWeekStart,
    });
    if (!persist.ok) {
      failures.push(`${userId}: ${persist.error}`);
      continue;
    }
    weeksPersisted += persist.weeksPersisted;
  }

  if (failures.length > 0) {
    throw new Error(
      `Recálculo SQL OK; persistencia Cost Engine falló en ${failures.length} empleados. Primero: ${failures[0]}`,
    );
  }

  return {
    success: true,
    weeksPersisted,
    employeeCount: userIds.length,
    rpcData: data,
  };
}

/**
 * Solo persistencia Cost Engine (horas ya recalculadas por otro camino).
 * Usado tras imports masivos o cuando SQL ya ejecutó fn_recalc.
 */
export async function persistOvertimeCostForEmployees(
  client: SupabaseClient,
  userIds: readonly string[],
): Promise<{ weeksPersisted: number; employeeCount: number }> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const failures: string[] = [];
  let weeksPersisted = 0;

  for (const userId of unique) {
    let fromWeekStart: string;
    try {
      const employee = await loadEmployeeBoundaryFacts(client, userId);
      fromWeekStart =
        employeeTimelineStartWeek(employee) ??
        (
          await client
            .from('weekly_snapshots')
            .select('week_start')
            .eq('user_id', userId)
            .order('week_start', { ascending: true })
            .limit(1)
            .maybeSingle()
        ).data?.week_start?.toString().split('T')[0] ??
        '';
      if (!fromWeekStart) continue;
    } catch (err) {
      failures.push(
        `${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const persist = await persistOvertimeCostFromEngine(client, {
      userId,
      fromWeekStart,
    });
    if (!persist.ok) {
      failures.push(`${userId}: ${persist.error}`);
      continue;
    }
    weeksPersisted += persist.weeksPersisted;
  }

  if (failures.length > 0) {
    throw new Error(
      `persistOvertimeCostForEmployees falló en ${failures.length} empleados. Primero: ${failures[0]}`,
    );
  }

  return { weeksPersisted, employeeCount: unique.length };
}
