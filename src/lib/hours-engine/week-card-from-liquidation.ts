/**
 * Única proyección UI de la tarjeta semanal desde LiquidationResult.
 * Sin cálculos en React ni lectura de weekly_snapshots para resultados.
 *
 * Cadena de carry: el caller DEBE pasar openingCarryIn / carryIn explícitos
 * (vía resolveOpeningCarryIn). No hay default implícito a 0.
 */

import { liquidateWeek } from './liquidation-engine.ts';
import { resolveEffectiveContract } from './contract-resolver.ts';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import type {
  CivilDate,
  EmployeeBoundaryFacts,
  LiquidationResult,
  TimeLogFact,
} from './types.ts';

function extrasByDayFromResult(
  result: LiquidationResult,
): Readonly<Record<CivilDate, number>> {
  const out: Record<CivilDate, number> = {};
  for (const d of result.dailyBreakdown.days) {
    out[d.day] = d.overtimeHours;
  }
  return out;
}

/** Footer de la tarjeta semanal — campos que pinta WeekCard / modal. */
export type WeekCardSummaryFromEngine = {
  totalHours: number;
  /** PENDIENTES = carryIn de la liquidación. */
  startBalance: number;
  /**
   * EXTRAS = overtimeHours (misma cifra que Σ Ex. diarias).
   * No usar weeklyBalance del carry para este label.
   */
  weeklyBalance: number;
  finalBalance: number;
  estimatedValue: number;
  isPaid: boolean;
  preferStock: boolean;
  limitHours: number;
  hourlyRate: number;
};

export type WeekAdminFlags = {
  /** Solo sello administrativo Pagada (hecho de proceso, no resultado de liquidación). */
  isPaid?: boolean;
};

function weekStartKey(week: { startDate: string }): CivilDate {
  return (
    typeof week.startDate === 'string' ? week.startDate.split('T')[0]! : String(week.startDate)
  ) as CivilDate;
}

/** Tarifa OT efectiva de la semana (tramos versionados). */
export function overtimeRateForWeek(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): number {
  const contract = resolveEffectiveContract(employee, weekStart);
  for (const s of contract.segments) {
    if (s.overtimeRatePerHour != null && Number.isFinite(s.overtimeRatePerHour)) {
      return Number(s.overtimeRatePerHour);
    }
  }
  return 0;
}

/**
 * Proyecta LiquidationResult → footer de tarjeta.
 * EXTRAS = overtimeHours (garantiza igualdad con dailyBreakdown).
 * IMPORTE = extras de tramos en modo pago × tarifa (bolsa → 0).
 */
export function weekCardSummaryFromLiquidation(
  result: LiquidationResult,
  overtimeRatePerHour: number,
): WeekCardSummaryFromEngine {
  const payableOvertime = result.segments
    .filter((s) => !s.bagMode)
    .reduce((acc, s) => acc + s.overtimeHours, 0);

  const preferStock =
    result.segments.length > 0 && result.segments.every((s) => s.bagMode);

  return {
    totalHours: result.hoursWorked,
    startBalance: result.carryIn,
    weeklyBalance: result.overtimeHours,
    finalBalance: result.balanceFinal,
    estimatedValue: Math.max(0, payableOvertime) * overtimeRatePerHour,
    isPaid: result.isPaid,
    preferStock,
    limitHours: result.contractedHoursEffective,
    hourlyRate: overtimeRatePerHour,
  };
}

export function assertCardMatchesLiquidation(
  summary: WeekCardSummaryFromEngine,
  result: LiquidationResult,
): void {
  const eps = 1e-9;
  const sumDailyOt = result.dailyBreakdown.days.reduce((a, d) => a + d.overtimeHours, 0);
  if (Math.abs(summary.weeklyBalance - result.overtimeHours) > eps) {
    throw new Error('Footer EXTRAS ≠ LiquidationResult.overtimeHours');
  }
  if (Math.abs(summary.weeklyBalance - sumDailyOt) > eps) {
    throw new Error('Footer EXTRAS ≠ Σ Ex. diarias');
  }
  if (Math.abs(summary.totalHours - result.hoursWorked) > eps) {
    throw new Error('Footer HORAS ≠ hoursWorked');
  }
  if (Math.abs(summary.startBalance - result.carryIn) > eps) {
    throw new Error('Footer PENDIENTES ≠ carryIn');
  }
}

/**
 * Liquida una semana y proyecta días + footer desde el mismo resultado.
 * `carryIn` es obligatorio (usar resolveOpeningCarryIn para la primera semana de una cadena).
 */
export function liquidateWeekForCard(input: {
  employee: EmployeeBoundaryFacts;
  weekStart: CivilDate;
  logs: readonly TimeLogFact[];
  isPaid?: boolean;
  carryIn: number;
}): {
  result: LiquidationResult;
  extrasByDay: Readonly<Record<CivilDate, number>>;
  summary: WeekCardSummaryFromEngine;
} {
  const result = liquidateWeek({
    employee: input.employee,
    weekStart: input.weekStart,
    logs: input.logs,
    isPaid: input.isPaid ?? false,
    carryIn: input.carryIn,
  });
  const rate = overtimeRateForWeek(input.employee, input.weekStart);
  const summary = weekCardSummaryFromLiquidation(result, rate);
  assertCardMatchesLiquidation(summary, result);
  return {
    result,
    extrasByDay: extrasByDayFromResult(result),
    summary,
  };
}

type WeekLike = {
  startDate: string;
  days: ReadonlyArray<{ date: string; extraHours: number }>;
  summary?: WeekAdminFlags & Record<string, unknown>;
};

/**
 * Parchea semanas: días Ex. + footer desde la misma liquidación.
 * Encadena carryOut → carryIn entre semanas (orden cronológico).
 * `openingCarryIn` es obligatorio — nunca se asume 0 implícitamente.
 */
export function patchWeeksFromLiquidation<TWeek extends WeekLike>(
  weeks: readonly TWeek[],
  employee: EmployeeBoundaryFacts,
  logs: readonly TimeLogFact[],
  options: { openingCarryIn: number },
): TWeek[] {
  const indexed = weeks.map((week, index) => ({ week, index }));
  indexed.sort((a, b) =>
    weekStartKey(a.week).localeCompare(weekStartKey(b.week)),
  );

  let carryIn = options.openingCarryIn;
  const byIndex = new Map<number, TWeek>();

  for (const { week, index } of indexed) {
    const weekStart = weekStartKey(week);
    const daySet = new Set(
      week.days.map((d) =>
        typeof d.date === 'string' ? d.date.split('T')[0]! : String(d.date),
      ),
    );

    const weekLogs = logs.filter((l) => {
      const day = formatYmdInMadrid(l.clockInIso);
      return day != null && daySet.has(day);
    });

    const isPaid = week.summary?.isPaid === true;
    const { result, extrasByDay, summary } = liquidateWeekForCard({
      employee,
      weekStart,
      logs: weekLogs,
      isPaid,
      carryIn,
    });

    carryIn = result.carryOut;

    byIndex.set(index, {
      ...week,
      summary: {
        ...(week.summary ?? {}),
        ...summary,
        isPaid,
      },
      days: week.days.map((day) => {
        const key =
          typeof day.date === 'string' ? day.date.split('T')[0]! : String(day.date);
        return {
          ...day,
          extraHours: extrasByDay[key] ?? 0,
        };
      }) as TWeek['days'],
    } as TWeek);
  }

  return weeks.map((_, i) => byIndex.get(i)!);
}
