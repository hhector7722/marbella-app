/**
 * Orquestación de cadena continua de carry.
 * No forma parte del núcleo (liquidateWeek / computeCarry / resolver).
 * Toda cadena de UI debe obtener openingCarryIn vía resolveOpeningCarryIn.
 */

import { liquidateWeek } from './liquidation-engine.ts';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import {
  assertMonday,
  compareCivilDate,
  mondayOnOrBefore,
  nextWeekStart,
  previousWeekStart,
  weekBounds,
} from './week-dates.ts';
import type {
  CivilDate,
  EmployeeBoundaryFacts,
  TimeLogFact,
} from './types.ts';

/**
 * Primer lunes de la línea temporal del empleado.
 * Alta o primer tramo contractual; null si no hay ancla → openingCarryIn = 0.
 */
export function employeeTimelineStartWeek(
  employee: EmployeeBoundaryFacts,
): CivilDate | null {
  const candidates: CivilDate[] = [];
  if (employee.joiningDate) {
    candidates.push(employee.joiningDate.split('T')[0]!);
  }
  for (const t of employee.terms) {
    candidates.push(t.effectiveFrom.split('T')[0]!);
  }
  if (candidates.length === 0) return null;
  candidates.sort(compareCivilDate);
  return mondayOnOrBefore(candidates[0]!);
}

function logsInWeek(
  logs: readonly TimeLogFact[],
  weekStart: CivilDate,
): TimeLogFact[] {
  const daySet = new Set(weekBounds(weekStart).days);
  return logs.filter((l) => {
    const day = formatYmdInMadrid(l.clockInIso);
    return day != null && daySet.has(day);
  });
}

/**
 * carryOut de la semana inmediatamente anterior a `chainStart`.
 * 0 solo si no existe semana anterior en la línea temporal del empleado.
 *
 * Recorre timelineStart → … → previousWeek(chainStart) con liquidateWeek,
 * encadenando carryOut → carryIn. Independiente de mes/año/paginación.
 */
export function resolveOpeningCarryIn(input: {
  employee: EmployeeBoundaryFacts;
  /** Lunes de la primera semana de la cadena que se va a liquidar. */
  chainStart: CivilDate;
  logs: readonly TimeLogFact[];
  /** Hecho Pagada por weekStart; ausente → false. */
  isPaidByWeek: (weekStart: CivilDate) => boolean;
  /** Override Bolsa/Pago; ausente → null (contrato). */
  bagModeOverrideByWeek?: (weekStart: CivilDate) => boolean | null;
}): number {
  assertMonday(input.chainStart);

  const timelineStart = employeeTimelineStartWeek(input.employee);
  if (timelineStart == null) return 0;

  const prev = previousWeekStart(input.chainStart);
  if (compareCivilDate(prev, timelineStart) < 0) return 0;

  let carryIn = 0;
  for (
    let weekStart = timelineStart;
    compareCivilDate(weekStart, input.chainStart) < 0;
    weekStart = nextWeekStart(weekStart)
  ) {
    const result = liquidateWeek({
      employee: input.employee,
      weekStart,
      logs: logsInWeek(input.logs, weekStart),
      isPaid: input.isPaidByWeek(weekStart),
      carryIn,
      bagModeOverride: input.bagModeOverrideByWeek?.(weekStart) ?? null,
    });
    carryIn = result.carryOut;
  }

  return carryIn;
}

/** Lookup Pagada desde filas de weekly_snapshots (u homólogo). */
export function isPaidLookupFromRows(
  rows: readonly { week_start: string; is_paid: boolean | null }[],
): (weekStart: CivilDate) => boolean {
  const map = new Map<string, boolean>();
  for (const r of rows) {
    const key =
      typeof r.week_start === 'string' ? r.week_start.split('T')[0]! : String(r.week_start);
    map.set(key, r.is_paid === true);
  }
  return (weekStart) => map.get(weekStart) === true;
}

/**
 * Lookup override Bolsa/Pago desde weekly_snapshots.prefer_stock_hours_override.
 * Solo `true`/`false` explícitos; `null` → usar bagMode del contrato.
 */
export function bagModeOverrideLookupFromRows(
  rows: readonly {
    week_start: string;
    prefer_stock_hours_override?: boolean | null;
  }[],
): (weekStart: CivilDate) => boolean | null {
  const map = new Map<string, boolean>();
  for (const r of rows) {
    if (r.prefer_stock_hours_override !== true && r.prefer_stock_hours_override !== false) {
      continue;
    }
    const key =
      typeof r.week_start === 'string' ? r.week_start.split('T')[0]! : String(r.week_start);
    map.set(key, r.prefer_stock_hours_override);
  }
  return (weekStart) => map.get(weekStart) ?? null;
}

/**
 * Lookup override €/h desde weekly_snapshots.overtime_price_snapshot.
 * Solo valores numéricos (incl. 0); `null` en BD → sin override (contrato).
 */
export function overtimeRateOverrideLookupFromRows(
  rows: readonly {
    week_start: string;
    overtime_price_snapshot?: number | null;
  }[],
): (weekStart: CivilDate) => number | null {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.overtime_price_snapshot == null) continue;
    const n = Number(r.overtime_price_snapshot);
    if (!Number.isFinite(n)) continue;
    const key =
      typeof r.week_start === 'string' ? r.week_start.split('T')[0]! : String(r.week_start);
    map.set(key, n);
  }
  return (weekStart) => map.get(weekStart) ?? null;
}
