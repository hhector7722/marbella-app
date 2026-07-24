/**
 * Fact loader real: HE (liquidateWeek + carry) + weekly_snapshots.
 * Implementa ShadowFactLoader — el dominio no conoce este módulo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bagModeOverrideLookupFromRows,
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  loadEmployeeBoundaryFacts,
  liquidateWeek,
  resolveOpeningCarryIn,
} from '../../../lib/hours-engine/index.ts';
import { weekBounds } from '../../../lib/hours-engine/week-dates.ts';
import type {
  EmployeeBoundaryFacts,
  TimeLogFact,
} from '../../../lib/hours-engine/types.ts';
import {
  formatYmdInMadrid,
  madridRangeUtcIso,
} from '../../../lib/madrid-date-bounds.ts';
import type { SqlWeeklySnapshotRow } from '../../../lib/shadow/adapters/sql-adapter.ts';
import type {
  ShadowFactLoadResult,
  ShadowFactLoader,
  ShadowSubject,
} from '../../../lib/shadow/runner/ports.ts';

type LogRow = {
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  justified_hours: number | null;
};

type SnapshotRow = SqlWeeklySnapshotRow & {
  week_start: string;
  is_paid: boolean | null;
  prefer_stock_hours_override?: boolean | null;
};

type EmployeeCache = {
  facts: EmployeeBoundaryFacts;
  engineLogs: TimeLogFact[];
  logRows: LogRow[];
  snapRows: SnapshotRow[];
  isPaidByWeek: (weekStart: string) => boolean;
  bagModeOverrideByWeek: (weekStart: string) => boolean | null;
  profilePreferStock: boolean | null;
};

const SNAPSHOT_SELECT =
  'user_id, week_start, total_hours, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, ordinary_hours, extra_hours, total_cost, is_paid, prefer_stock_hours_override';

function justifiedHoursInWeek(
  logRows: readonly LogRow[],
  weekStart: string,
): number {
  const daySet = new Set(weekBounds(weekStart).days);
  let sum = 0;
  for (const row of logRows) {
    const day = formatYmdInMadrid(row.clock_in);
    if (!day || !daySet.has(day)) continue;
    const j = Number(row.justified_hours ?? 0);
    if (Number.isFinite(j) && j > 0) sum += j;
  }
  return sum;
}

function findSnapshot(
  rows: readonly SnapshotRow[],
  weekStart: string,
): SnapshotRow | null {
  for (const row of rows) {
    const key =
      typeof row.week_start === 'string'
        ? row.week_start.split('T')[0]!
        : String(row.week_start);
    if (key === weekStart) return row;
  }
  return null;
}

export type SupabaseShadowFactLoaderOptions = {
  /** Último lunes del horizonte (carga logs/snaps hasta domingo de esa semana). */
  horizonEndWeekStart: string;
};

export function createSupabaseShadowFactLoader(
  client: SupabaseClient,
  options: SupabaseShadowFactLoaderOptions,
): ShadowFactLoader {
  const byEmployee = new Map<string, Promise<EmployeeCache>>();

  async function loadEmployeeCache(
    employeeId: string,
  ): Promise<EmployeeCache> {
    const existing = byEmployee.get(employeeId);
    if (existing) return existing;

    const promise = (async (): Promise<EmployeeCache> => {
      const [employeeFacts, profileRes] = await Promise.all([
        loadEmployeeBoundaryFacts(client, employeeId),
        client
          .from('profiles')
          .select('prefer_stock_hours')
          .eq('id', employeeId)
          .maybeSingle(),
      ]);

      if (profileRes.error) {
        throw new Error(
          `profiles prefer_stock_hours: ${profileRes.error.message}`,
        );
      }

      const timelineStart = employeeTimelineStartWeek(employeeFacts);
      const { weekEnd: horizonEndDay } = weekBounds(
        options.horizonEndWeekStart,
      );
      const logsFrom = timelineStart ?? options.horizonEndWeekStart;
      const { startIso, endIso } = madridRangeUtcIso(logsFrom, horizonEndDay);

      const [logsResult, snapsResult] = await Promise.all([
        client
          .from('time_logs')
          .select('clock_in, clock_out, total_hours, justified_hours')
          .eq('user_id', employeeId)
          .gte('clock_in', startIso)
          .lte('clock_in', endIso),
        timelineStart
          ? client
              .from('weekly_snapshots')
              .select(SNAPSHOT_SELECT)
              .eq('user_id', employeeId)
              .gte('week_start', timelineStart)
              .lte('week_start', options.horizonEndWeekStart)
          : client
              .from('weekly_snapshots')
              .select(SNAPSHOT_SELECT)
              .eq('user_id', employeeId)
              .gte('week_start', options.horizonEndWeekStart)
              .lte('week_start', options.horizonEndWeekStart),
      ]);

      if (logsResult.error) {
        throw new Error(`time_logs: ${logsResult.error.message}`);
      }
      if (snapsResult.error) {
        throw new Error(`weekly_snapshots: ${snapsResult.error.message}`);
      }

      const logRows = (logsResult.data ?? []) as LogRow[];
      const snapRows = (snapsResult.data ?? []) as SnapshotRow[];
      const engineLogs: TimeLogFact[] = logRows.map((l) => ({
        clockInIso: l.clock_in,
        clockOutIso: l.clock_out,
        totalHours: l.total_hours,
      }));

      const prefer =
        profileRes.data?.prefer_stock_hours === true
          ? true
          : profileRes.data?.prefer_stock_hours === false
            ? false
            : null;

      return {
        facts: employeeFacts,
        engineLogs,
        logRows,
        snapRows,
        isPaidByWeek: isPaidLookupFromRows(snapRows),
        bagModeOverrideByWeek: bagModeOverrideLookupFromRows(snapRows),
        profilePreferStock: prefer,
      };
    })();

    byEmployee.set(employeeId, promise);
    try {
      return await promise;
    } catch (err) {
      byEmployee.delete(employeeId);
      throw err;
    }
  }

  return {
    async loadFacts(subject: ShadowSubject): Promise<ShadowFactLoadResult> {
      try {
        const cache = await loadEmployeeCache(subject.employeeId);
        const snapshot = findSnapshot(cache.snapRows, subject.weekStart);
        if (!snapshot) {
          return {
            status: 'skip',
            reason: 'no_sql_snapshot',
          };
        }

        const openingCarryIn = resolveOpeningCarryIn({
          employee: cache.facts,
          chainStart: subject.weekStart,
          logs: cache.engineLogs,
          isPaidByWeek: cache.isPaidByWeek,
          bagModeOverrideByWeek: cache.bagModeOverrideByWeek,
        });

        const bagModeOverride =
          cache.bagModeOverrideByWeek(subject.weekStart) ?? null;
        const isPaid = cache.isPaidByWeek(subject.weekStart);
        const weekLogs = cache.engineLogs.filter((l) => {
          const day = formatYmdInMadrid(l.clockInIso);
          return (
            day != null && weekBounds(subject.weekStart).days.includes(day)
          );
        });

        const liquidation = liquidateWeek({
          employee: cache.facts,
          weekStart: subject.weekStart,
          logs: weekLogs,
          isPaid,
          carryIn: openingCarryIn,
          bagModeOverride,
        });

        return {
          status: 'ready',
          facts: {
            subject,
            liquidation,
            heFacts: {
              justifiedHoursWeek: justifiedHoursInWeek(
                cache.logRows,
                subject.weekStart,
              ),
            },
            bagModeOverride,
            snapshot: {
              ...snapshot,
              user_id: snapshot.user_id ?? subject.employeeId,
              week_start: subject.weekStart,
            },
            profilePreferStock: cache.profilePreferStock,
          },
        };
      } catch (err) {
        return {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
