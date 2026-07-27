/**
 * Orquestación multi-empleado → Writer único (Fase 1b).
 * Sustituye RPC SQL + persistOvertimeCost* como camino de producción de columnas C.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { employeeTimelineStartWeek } from './opening-carry.ts';
import { loadEmployeeBoundaryFacts } from './load-employee-facts.ts';
import {
  writeWeeklyProjection,
  type ProjectionProcessKind,
  type WriteWeeklyProjectionResult,
} from './projection/index.ts';
import type { CivilDate } from './types.ts';

export type WriteProjectionForEmployeesResult = {
  success: true;
  /** Alias legacy: semanas escritas por el Writer. */
  weeksPersisted: number;
  weeksWritten: number;
  employeeCount: number;
  /** Compatibilidad con callers que esperaban rpcData. */
  rpcData: null;
};

/** @deprecated Alias de compatibilidad — usar WriteProjectionForEmployeesResult. */
export type RecalculateAllBalancesPersistResult = WriteProjectionForEmployeesResult;

function ymdKey(raw: string): CivilDate {
  return (typeof raw === 'string' ? raw.split('T')[0]! : String(raw)) as CivilDate;
}

async function resolveFromWeekStart(
  client: SupabaseClient,
  userId: string,
): Promise<CivilDate | null> {
  try {
    const employee = await loadEmployeeBoundaryFacts(client, userId);
    const timeline = employeeTimelineStartWeek(employee);
    if (timeline) return timeline;
  } catch {
    /* fallback snapshot */
  }
  const { data } = await client
    .from('weekly_snapshots')
    .select('week_start')
    .eq('user_id', userId)
    .order('week_start', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.week_start) return null;
  return ymdKey(String(data.week_start));
}

/**
 * Regenera proyección C para un empleado desde `fromWeekStart` (lunes o fecha civil).
 */
export async function writeProjectionFromWeek(
  client: SupabaseClient,
  userId: string,
  fromWeekStart: string,
  processKind: ProjectionProcessKind = 'recalc',
): Promise<WriteWeeklyProjectionResult> {
  return writeWeeklyProjection(client, {
    userId,
    fromWeekStart: ymdKey(fromWeekStart),
    processKind,
  });
}

/**
 * Writer para N empleados (desde timeline o primer snapshot).
 */
export async function writeProjectionForEmployees(
  client: SupabaseClient,
  userIds: readonly string[],
  processKind: ProjectionProcessKind = 'recalc',
): Promise<{ weeksWritten: number; employeeCount: number }> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const failures: string[] = [];
  let weeksWritten = 0;

  for (const userId of unique) {
    const fromWeekStart = await resolveFromWeekStart(client, userId);
    if (!fromWeekStart) continue;

    const result = await writeWeeklyProjection(client, {
      userId,
      fromWeekStart,
      processKind,
    });
    if (!result.ok) {
      failures.push(`${userId}: ${result.error}`);
      continue;
    }
    weeksWritten += result.weeksWritten;
  }

  if (failures.length > 0) {
    throw new Error(
      `writeProjectionForEmployees falló en ${failures.length} empleados. Primero: ${failures[0]}`,
    );
  }

  return { weeksWritten, employeeCount: unique.length };
}

/**
 * Recálculo global vía Writer (sustituye rpc_recalculate_all_balances + Cost persist).
 * Misma forma de retorno que el wrapper legacy para no romper callers.
 */
export async function recalculateAllBalancesAndPersist(
  client: SupabaseClient,
): Promise<WriteProjectionForEmployeesResult> {
  const { data: users, error: usersErr } = await client
    .from('weekly_snapshots')
    .select('user_id')
    .limit(10000);

  if (usersErr) {
    throw new Error(`Listado empleados para Writer: ${usersErr.message}`);
  }

  const userIds = [
    ...new Set((users ?? []).map((r) => r.user_id).filter(Boolean)),
  ] as string[];

  const result = await writeProjectionForEmployees(client, userIds, 'cron');

  return {
    success: true,
    weeksPersisted: result.weeksWritten,
    weeksWritten: result.weeksWritten,
    employeeCount: result.employeeCount,
    rpcData: null,
  };
}

/**
 * Compatibilidad de nombre: antes solo Cost Engine; ahora Writer completo (C).
 */
export async function persistOvertimeCostForEmployees(
  client: SupabaseClient,
  userIds: readonly string[],
): Promise<{ weeksPersisted: number; employeeCount: number }> {
  const result = await writeProjectionForEmployees(client, userIds, 'import');
  return {
    weeksPersisted: result.weeksWritten,
    employeeCount: result.employeeCount,
  };
}
