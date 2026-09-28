/**
 * Horas previstas de una semana frontera de agosto.
 * Hecho de empleado + semana. No se deduce de fichajes, turnos ni del tramo.
 */

import type { CivilDate, ExpectedHoursByDay } from './types.ts';
import {
  isAugustCivilDate,
  isPartialAugustClosureWeek,
  weekBounds,
} from './week-dates.ts';

export type ExpectedHoursRow = {
  week_start: string;
  day: string;
  expected_hours: number | string | null;
};

export type ExpectedHoursFailureCode =
  | 'incomplete'
  | 'day_outside_week'
  | 'duplicate_day'
  | 'invalid_hours'
  | 'not_partial_week'
  | 'inactive_day'
  | 'no_staff_contract';

export class ExpectedHoursError extends Error {
  readonly code: ExpectedHoursFailureCode;

  constructor(code: ExpectedHoursFailureCode, message: string) {
    super(message);
    this.name = 'ExpectedHoursError';
    this.code = code;
  }
}

export type ExpectedHoursInterpretation =
  | { status: 'unconfigured' }
  | { status: 'configured'; byDay: ExpectedHoursByDay };

export type ClosureHoursSummary = {
  expectedTotal: number;
  closureExemptHours: number;
  requiredHours: number;
};

function ymdKey(value: string): string {
  return value.split('T')[0]!;
}

function assertFiniteHours(value: number, day: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 24) {
    throw new ExpectedHoursError(
      'invalid_hours',
      `Horas previstas inválidas en ${day}: ${String(value)}`,
    );
  }
  return value;
}

/**
 * Suma compartida por el Hours Engine y el editor.
 * `requiredHours` son las horas previstas de los días de `days` que no son agosto.
 * No redondea: el resolver aplica el redondeo Marbella al tramo.
 */
export function summarizeClosureHours(
  days: readonly CivilDate[],
  byDay: ExpectedHoursByDay,
): ClosureHoursSummary {
  let expectedTotal = 0;
  let closureExemptHours = 0;
  for (const day of days) {
    const hours = byDay[day] ?? 0;
    expectedTotal += hours;
    if (isAugustCivilDate(day)) closureExemptHours += hours;
  }
  return {
    expectedTotal,
    closureExemptHours,
    requiredHours: expectedTotal - closureExemptHours,
  };
}

/**
 * 0 filas = sin configurar.
 * 7 filas válidas de esa semana = distribución.
 * 1–6 filas, día fuera de la semana, duplicado u horas inválidas = error.
 * No rellena huecos.
 */
export function interpretExpectedHoursRows(
  weekStart: CivilDate,
  rows: readonly ExpectedHoursRow[],
): ExpectedHoursInterpretation {
  if (rows.length === 0) return { status: 'unconfigured' };

  const { days } = weekBounds(weekStart);
  const allowed = new Set<string>(days);
  const byDay: Record<string, number> = {};

  for (const row of rows) {
    if (ymdKey(row.week_start) !== weekStart) {
      throw new ExpectedHoursError(
        'day_outside_week',
        `week_start ${row.week_start} no es ${weekStart}`,
      );
    }
    const day = ymdKey(row.day);
    if (!allowed.has(day)) {
      throw new ExpectedHoursError(
        'day_outside_week',
        `El día ${day} no pertenece a la semana ${weekStart}`,
      );
    }
    if (Object.prototype.hasOwnProperty.call(byDay, day)) {
      throw new ExpectedHoursError(
        'duplicate_day',
        `Día duplicado en la distribución de ${weekStart}: ${day}`,
      );
    }
    const hours = typeof row.expected_hours === 'number'
      ? row.expected_hours
      : Number(row.expected_hours);
    byDay[day] = assertFiniteHours(hours, day);
  }

  if (Object.keys(byDay).length !== days.length) {
    throw new ExpectedHoursError(
      'incomplete',
      `Distribución incompleta de ${weekStart}: ${Object.keys(byDay).length} de ${days.length} días`,
    );
  }

  return { status: 'configured', byDay };
}

/**
 * Guarda solo una semana frontera, con exactamente sus 7 días.
 * 0 es válido. No inventa los huecos.
 */
export function assertSavableExpectedWeek(
  weekStart: CivilDate,
  entries: readonly { day: string; expectedHours: number }[],
): ExpectedHoursByDay {
  if (!isPartialAugustClosureWeek(weekStart)) {
    throw new ExpectedHoursError(
      'not_partial_week',
      `La semana ${weekStart} no cruza el cierre de agosto`,
    );
  }
  const interpreted = interpretExpectedHoursRows(
    weekStart,
    entries.map((entry) => ({
      week_start: weekStart,
      day: entry.day,
      expected_hours: entry.expectedHours,
    })),
  );
  if (interpreted.status !== 'configured') {
    throw new ExpectedHoursError(
      'incomplete',
      `Distribución incompleta de ${weekStart}`,
    );
  }
  return interpreted.byDay;
}

/** Siempre 7 filas, incluidos los ceros. */
export function expectedHoursUpsertPayload(
  userId: string,
  weekStart: CivilDate,
  byDay: ExpectedHoursByDay,
  updatedBy: string | null,
): {
  user_id: string;
  week_start: CivilDate;
  day: CivilDate;
  expected_hours: number;
  updated_by: string | null;
}[] {
  const saved = assertSavableExpectedWeek(
    weekStart,
    weekBounds(weekStart).days.map((day) => ({
      day,
      expectedHours: byDay[day] ?? Number.NaN,
    })),
  );
  return weekBounds(weekStart).days.map((day) => ({
    user_id: userId,
    week_start: weekStart,
    day,
    expected_hours: saved[day]!,
    updated_by: updatedBy,
  }));
}

/**
 * Lookup por lunes. Una semana que no es frontera ignora las filas.
 * Una frontera sin filas devuelve null (fallback legado).
 * Una frontera con filas a medias lanza.
 */
export function expectedHoursLookupFromRows(
  rows: readonly ExpectedHoursRow[],
): (weekStart: CivilDate) => ExpectedHoursByDay | null {
  const byWeek = new Map<string, ExpectedHoursRow[]>();
  for (const row of rows) {
    const week = ymdKey(row.week_start);
    const list = byWeek.get(week);
    if (list) list.push(row);
    else byWeek.set(week, [row]);
  }

  return (weekStart: CivilDate) => {
    if (!isPartialAugustClosureWeek(weekStart)) return null;
    const list = byWeek.get(weekStart) ?? [];
    const interpreted = interpretExpectedHoursRows(weekStart, list);
    if (interpreted.status === 'unconfigured') return null;
    return interpreted.byDay;
  };
}
