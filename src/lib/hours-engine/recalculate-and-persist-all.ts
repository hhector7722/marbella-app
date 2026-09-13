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
import { compareCivilDate, previousWeekStart } from './week-dates.ts';

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
 * Semanas con snapshot anterior al alta y sin C de v2.
 *
 * Cadena aislada: carryIn de apertura 0, no alimenta `timelineStart` (INV-C01).
 * El Hours Engine las liquida como `pre_alta`. Tras el primer barrido, esta
 * consulta no devuelve filas y el cron no reescribe el pre-alta.
 */
async function writeIsolatedPreTimelineIfNeeded(
  client: SupabaseClient,
  userId: string,
  processKind: ProjectionProcessKind,
): Promise<{ ok: true; weeksWritten: number } | { ok: false; error: string }> {
  let timeline: CivilDate | null = null;
  try {
    const employee = await loadEmployeeBoundaryFacts(client, userId);
    timeline = employeeTimelineStartWeek(employee);
  } catch (err) {
    return {
      ok: false,
      error: `frontera empleado (pre-alta): ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  if (timeline == null) return { ok: true, weeksWritten: 0 };

  const { data, error } = await client
    .from('weekly_snapshots')
    .select('week_start')
    .eq('user_id', userId)
    .lt('week_start', timeline)
    .is('carry_out', null)
    .order('week_start', { ascending: true });

  if (error) {
    return { ok: false, error: `snapshots pre-alta: ${error.message}` };
  }
  if (!data?.length) return { ok: true, weeksWritten: 0 };

  const fromWeekStart = ymdKey(String(data[0]!.week_start));
  const lastOrphan = ymdKey(String(data[data.length - 1]!.week_start));
  const fence = previousWeekStart(timeline);
  const toWeekStart =
    compareCivilDate(lastOrphan, fence) <= 0 ? lastOrphan : fence;

  if (compareCivilDate(fromWeekStart, toWeekStart) > 0) {
    return { ok: true, weeksWritten: 0 };
  }

  const result = await writeWeeklyProjection(client, {
    userId,
    fromWeekStart,
    toWeekStart,
    processKind,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, weeksWritten: result.weeksWritten };
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
    const pre = await writeIsolatedPreTimelineIfNeeded(
      client,
      userId,
      processKind,
    );
    if (!pre.ok) {
      failures.push(`${userId} (pre-alta): ${pre.error}`);
      continue;
    }
    weeksWritten += pre.weeksWritten;

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
 * Solo residuos pre-alta sin v2. No reescribe la cadena oficial post-alta.
 */
export async function backfillIsolatedPreTimelineProjection(
  client: SupabaseClient,
  processKind: ProjectionProcessKind = 'backfill',
): Promise<{ weeksWritten: number; employeeCount: number }> {
  const { data, error } = await client
    .from('weekly_snapshots')
    .select('user_id')
    .is('carry_out', null)
    .limit(10000);

  if (error) {
    throw new Error(`Listado pre-alta para Writer: ${error.message}`);
  }

  const userIds = [
    ...new Set((data ?? []).map((r) => r.user_id).filter(Boolean)),
  ] as string[];

  const failures: string[] = [];
  let weeksWritten = 0;
  for (const userId of userIds) {
    const pre = await writeIsolatedPreTimelineIfNeeded(
      client,
      userId,
      processKind,
    );
    if (!pre.ok) {
      failures.push(`${userId} (pre-alta): ${pre.error}`);
      continue;
    }
    weeksWritten += pre.weeksWritten;
  }

  if (failures.length > 0) {
    throw new Error(
      `backfillIsolatedPreTimelineProjection falló en ${failures.length} empleados. Primero: ${failures[0]}`,
    );
  }

  return { weeksWritten, employeeCount: userIds.length };
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
