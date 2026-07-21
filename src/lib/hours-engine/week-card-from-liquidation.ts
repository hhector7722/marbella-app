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
   * EXTRAS (modo pago) = horas de esta semana que realmente se liquidan a cobro.
   * Nunca > 0 si la semana deja deuda (carryOut < 0).
   * EXTRAS (modo bolsa) = overtimeHours (acumulan; importe 0).
   */
  weeklyBalance: number;
  finalBalance: number;
  estimatedValue: number;
  isPaid: boolean;
  preferStock: boolean;
  limitHours: number;
  hourlyRate: number;
};

/**
 * Horas que el waterfall de carry extrae a cobro en modo pago.
 * Invariante: si carryOut < 0 (queda deuda), netPayable = 0.
 * Bolsa: 0 (todo permanece en banco).
 */
export function netPayableHoursFromLiquidation(
  result: LiquidationResult,
  bagModeOverride?: boolean | null,
): number {
  const preferStock =
    bagModeOverride === true
      ? true
      : bagModeOverride === false
        ? false
        : result.segments.length > 0 && result.segments.every((s) => s.bagMode);
  if (preferStock) return 0;
  // Crédito extraído = lo que no se queda en el banco.
  return Math.max(0, result.balanceFinal - Math.max(0, result.carryOut));
}

export type WeekAdminFlags = {
  /** Solo sello administrativo Pagada (hecho de proceso, no resultado de liquidación). */
  isPaid?: boolean;
  /**
   * Override semanal Bolsa/Pago (`prefer_stock_hours_override`).
   * `true`/`false` fuerza; `null`/`undefined` → bagMode del contrato.
   */
  bagModeOverride?: boolean | null;
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
 *
 * IMPORTE = horas realmente extraídas a cobro × tarifa (waterfall carry).
 * Nunca se cobra si queda deuda (carryOut < 0).
 *
 * EXTRAS (pago) = parte de esa liquidación que viene de la semana
 *   (netPayable − max(0, carryIn)); no el OT bruto de un tramo.
 * EXTRAS (bolsa) = overtimeHours (acumula; importe 0).
 */
export function weekCardSummaryFromLiquidation(
  result: LiquidationResult,
  overtimeRatePerHour: number,
  bagModeOverride?: boolean | null,
): WeekCardSummaryFromEngine {
  const preferStock =
    bagModeOverride === true
      ? true
      : bagModeOverride === false
        ? false
        : result.segments.length > 0 && result.segments.every((s) => s.bagMode);

  const netPayable = netPayableHoursFromLiquidation(result, bagModeOverride);

  // En pago: extras = horas de ESTA semana que se cobran (no el crédito previo).
  // Si la semana deja deuda, netPayable=0 → extras=0 (no se puede cobrar con pendiente).
  const extrasFooter = preferStock
    ? result.overtimeHours
    : Math.max(0, netPayable - Math.max(0, result.carryIn));

  return {
    totalHours: result.hoursWorked,
    startBalance: result.carryIn,
    weeklyBalance: extrasFooter,
    finalBalance: result.balanceFinal,
    estimatedValue: netPayable * overtimeRatePerHour,
    isPaid: result.isPaid,
    preferStock,
    limitHours: result.contractedHoursEffective,
    hourlyRate: overtimeRatePerHour,
  };
}

export function assertCardMatchesLiquidation(
  summary: WeekCardSummaryFromEngine,
  result: LiquidationResult,
  bagModeOverride?: boolean | null,
): void {
  const eps = 1e-9;
  if (Math.abs(summary.totalHours - result.hoursWorked) > eps) {
    throw new Error('Footer HORAS ≠ hoursWorked');
  }
  if (Math.abs(summary.startBalance - result.carryIn) > eps) {
    throw new Error('Footer PENDIENTES ≠ carryIn');
  }
  const netPayable = netPayableHoursFromLiquidation(result, bagModeOverride);
  if (Math.abs(summary.estimatedValue - netPayable * summary.hourlyRate) > eps) {
    throw new Error('Footer IMPORTE ≠ netPayable × tarifa');
  }
  // Nunca cobrar si queda deuda pendiente.
  if (result.carryOut < -eps && summary.estimatedValue > eps) {
    throw new Error('IMPORTE > 0 con carryOut negativo (deuda)');
  }
  if (result.carryOut < -eps && summary.weeklyBalance > eps) {
    throw new Error('EXTRAS > 0 con carryOut negativo (deuda)');
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
  /** Override semanal Bolsa/Pago; null → contrato. */
  bagModeOverride?: boolean | null;
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
    bagModeOverride: input.bagModeOverride,
  });
  const rate = overtimeRateForWeek(input.employee, input.weekStart);
  const summary = weekCardSummaryFromLiquidation(
    result,
    rate,
    input.bagModeOverride,
  );
  assertCardMatchesLiquidation(summary, result, input.bagModeOverride);
  return {
    result,
    extrasByDay: extrasByDayFromResult(result),
    summary,
  };
}

type WeekLike = {
  startDate: string;
  days: ReadonlyArray<{ date: string; extraHours: number }>;
  /** Solo se lee `isPaid` y override de bolsa; el resto se regenera. */
  summary?: WeekAdminFlags;
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
  options: {
    openingCarryIn: number;
    /** Override Bolsa/Pago por weekStart; ausente → null (contrato). */
    bagModeOverrideByWeek?: (weekStart: CivilDate) => boolean | null;
  },
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
    const bagModeOverride =
      week.summary?.bagModeOverride ??
      options.bagModeOverrideByWeek?.(weekStart) ??
      null;

    const { result, extrasByDay, summary } = liquidateWeekForCard({
      employee,
      weekStart,
      logs: weekLogs,
      isPaid,
      carryIn,
      bagModeOverride,
    });

    carryIn = result.carryOut;

    byIndex.set(index, {
      ...week,
      summary: {
        ...(week.summary ?? {}),
        ...summary,
        isPaid,
        bagModeOverride,
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
