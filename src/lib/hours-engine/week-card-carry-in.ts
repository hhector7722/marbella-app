/**
 * Carry-in de una tarjeta semanal suelta.
 *
 * Si la proyección de ESTA semana existe, `pending_balance` ES el carryIn
 * (INV-J01). No se rejuega el histórico. Si no hay fila, se liquida solo
 * la semana anterior (su snapshot + sus logs) o se declara replay completo.
 */

import { liquidateWeek } from './liquidation-engine.ts';
import {
  assertMonday,
  compareCivilDate,
  previousWeekStart,
} from './week-dates.ts';
import { employeeTimelineStartWeek } from './opening-carry.ts';
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
