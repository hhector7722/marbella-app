/**
 * Cadena corta de liquidación para un periodo visible.
 *
 * El arrastre de la primera semana sale de `weekly_snapshots.pending_balance`
 * (INV-J01). Solo se liquidan las semanas de la ventana. El € extra diario
 * es el importe semanal partido por pesos de extrasByDay, no las horas.
 */

import { allocateWeekCostToDays } from './allocate-week-cost-to-days.ts';
import {
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  overtimeRateOverrideLookupFromRows,
} from './opening-carry.ts';
import {
  type CarrySnapRow,
  resolveWeekCardCarryInFromSnaps,
} from './week-card-carry-in.ts';
import { liquidateWeekForCard } from './week-card-from-liquidation.ts';
import type { CivilDate, EmployeeBoundaryFacts, TimeLogFact } from './types.ts';
import { addCivilDays, nextWeekStart, previousWeekStart } from './week-dates.ts';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';

export const WEEKLY_SNAPSHOT_WINDOW_SELECT =
  'week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot, pending_balance';

export const WEEKLY_SNAPSHOT_WINDOW_SELECT_WITH_USER = `user_id, ${WEEKLY_SNAPSHOT_WINDOW_SELECT}`;

export type WindowSnapRow = CarrySnapRow & {
  overtime_price_snapshot?: number | null;
};

export function listMondaysInclusive(firstMonday: CivilDate, lastMonday: CivilDate): CivilDate[] {
  const out: CivilDate[] = [];
  let cur = firstMonday;
  while (cur <= lastMonday) {
    out.push(cur);
    cur = nextWeekStart(cur);
  }
  return out;
}

export function hoursWindowBounds(firstMonday: CivilDate, lastMonday: CivilDate): {
  logsFrom: CivilDate;
  lastSunday: CivilDate;
  snapsTo: CivilDate;
} {
  return {
    logsFrom: previousWeekStart(firstMonday),
    lastSunday: addCivilDays(lastMonday, 6),
    snapsTo: lastMonday,
  };
}

export function resolveWindowOpeningCarry(input: {
  employee: EmployeeBoundaryFacts;
  firstWeekStart: CivilDate;
  snaps: readonly WindowSnapRow[];
  logs: readonly TimeLogFact[];
}): { carryIn: number } | { needsFullReplay: true } {
  const resolved = resolveWeekCardCarryInFromSnaps({
    weekStart: input.firstWeekStart,
    employee: input.employee,
    snaps: input.snaps,
    logs: input.logs,
  });
  if (resolved.source === 'needs-full-replay') return { needsFullReplay: true };
  return { carryIn: resolved.carryIn };
}

export function overtimeMoneyByDayFromChain(input: {
  employee: EmployeeBoundaryFacts;
  weekStarts: readonly CivilDate[];
  snaps: readonly WindowSnapRow[];
  logs: readonly TimeLogFact[];
  openingCarryIn: number;
}): Record<string, number> {
  const isPaidByWeek = isPaidLookupFromRows(input.snaps);
  const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(input.snaps);
  const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(input.snaps);
  const byDay: Record<string, number> = {};
  let carryIn = input.openingCarryIn;

  for (const weekStart of input.weekStarts) {
    const weekEnd = addCivilDays(weekStart, 6);
    const weekLogs = input.logs.filter((l) => {
      const day = formatYmdInMadrid(l.clockInIso);
      return day != null && day >= weekStart && day <= weekEnd;
    });
    const { result, extrasByDay, summary } = liquidateWeekForCard({
      employee: input.employee,
      weekStart,
      logs: weekLogs,
      isPaid: isPaidByWeek(weekStart),
      carryIn,
      bagModeOverride: bagModeOverrideByWeek(weekStart),
      overrideRate: overtimeRateOverrideByWeek(weekStart),
    });
    carryIn = result.carryOut;

    const dayCosts = allocateWeekCostToDays(
      extrasByDay,
      summary.estimatedValue ?? 0,
      weekStart,
      weekEnd,
    );
    for (const [day, amount] of Object.entries(dayCosts)) {
      byDay[day] = Math.round(((byDay[day] ?? 0) + amount) * 100) / 100;
    }
  }

  return byDay;
}
