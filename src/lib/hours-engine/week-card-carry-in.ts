/**
 * Carry-in de una tarjeta semanal suelta o de la primera semana de una ventana.
 *
 * Si la proyección de ESTA semana existe, `pending_balance` ES el carryIn
 * (INV-J01). No se rejuega el histórico. Si no hay fila, se liquida solo
 * la semana anterior (su snapshot + sus logs) o se declara replay completo.
 */

import { liquidateWeek } from './liquidation-engine.ts';
import {
  addCivilDays,
  assertMonday,
  compareCivilDate,
  previousWeekStart,
} from './week-dates.ts';
import { employeeTimelineStartWeek } from './opening-carry.ts';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import type {
  CivilDate,
  EmployeeBoundaryFacts,
  TimeLogFact,
} from './types.ts';

export type WeekCardCarrySnapshot = {
  pendingBalance: number;
};

export type PreviousWeekCarryInput = {
  snapshot: WeekCardCarrySnapshot;
  logs: readonly TimeLogFact[];
  isPaid: boolean;
  bagModeOverride: boolean | null;
};

export type WeekCardCarryInResolution =
  | { source: 'this-week-snapshot'; carryIn: number }
  | { source: 'timeline-start'; carryIn: 0 }
  | { source: 'previous-week-liquidation'; carryIn: number }
  | { source: 'needs-full-replay' };

export type CarrySnapRow = {
  week_start: string;
  pending_balance?: number | null;
  is_paid?: boolean | null;
  prefer_stock_hours_override?: boolean | null;
};

export function weekStartKey(value: unknown): CivilDate {
  return String(value).split('T')[0]! as CivilDate;
}

export function pendingBalanceFromValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function findSnapRow<T extends { week_start: string }>(
  rows: readonly T[],
  weekStart: string,
): T | undefined {
  const key = weekStartKey(weekStart);
  return rows.find((r) => weekStartKey(r.week_start) === key);
}

export function resolveWeekCardCarryIn(input: {
  weekStart: CivilDate;
  employee: EmployeeBoundaryFacts;
  thisWeekSnapshot: WeekCardCarrySnapshot | null;
  previousWeek: PreviousWeekCarryInput | null;
}): WeekCardCarryInResolution {
  assertMonday(input.weekStart);

  if (input.thisWeekSnapshot != null) {
    return {
      source: 'this-week-snapshot',
      carryIn: input.thisWeekSnapshot.pendingBalance,
    };
  }

  const timelineStart = employeeTimelineStartWeek(input.employee);
  if (timelineStart == null || compareCivilDate(input.weekStart, timelineStart) <= 0) {
    return { source: 'timeline-start', carryIn: 0 };
  }

  if (input.previousWeek == null) {
    return { source: 'needs-full-replay' };
  }

  const prevStart = previousWeekStart(input.weekStart);
  const result = liquidateWeek({
    employee: input.employee,
    weekStart: prevStart,
    logs: input.previousWeek.logs,
    isPaid: input.previousWeek.isPaid,
    carryIn: input.previousWeek.snapshot.pendingBalance,
    bagModeOverride: input.previousWeek.bagModeOverride,
  });

  return {
    source: 'previous-week-liquidation',
    carryIn: result.carryOut,
  };
}

export function resolveWeekCardCarryInFromSnaps(input: {
  weekStart: CivilDate;
  employee: EmployeeBoundaryFacts;
  snaps: readonly CarrySnapRow[];
  logs: readonly TimeLogFact[];
}): WeekCardCarryInResolution {
  const thisRow = findSnapRow(input.snaps, input.weekStart);
  const prevStart = previousWeekStart(input.weekStart);
  const prevSunday = addCivilDays(prevStart, 6);
  const prevRow = findSnapRow(input.snaps, prevStart);

  return resolveWeekCardCarryIn({
    weekStart: input.weekStart,
    employee: input.employee,
    thisWeekSnapshot: thisRow
      ? { pendingBalance: pendingBalanceFromValue(thisRow.pending_balance) }
      : null,
    previousWeek:
      prevRow != null
        ? {
            snapshot: { pendingBalance: pendingBalanceFromValue(prevRow.pending_balance) },
            logs: input.logs.filter((l) => {
              const day = formatYmdInMadrid(l.clockInIso);
              return day != null && day >= prevStart && day <= prevSunday;
            }),
            isPaid: prevRow.is_paid === true,
            bagModeOverride:
              prevRow.prefer_stock_hours_override === true ||
              prevRow.prefer_stock_hours_override === false
                ? prevRow.prefer_stock_hours_override
                : null,
          }
        : null,
  });
}

export function carryInFromResolution(resolved: WeekCardCarryInResolution): number | null {
  if (resolved.source === 'needs-full-replay') return null;
  return resolved.carryIn;
}
