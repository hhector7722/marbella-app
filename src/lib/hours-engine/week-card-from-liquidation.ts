/**
 * Única proyección UI de la tarjeta semanal desde LiquidationResult.
 * Dinero (estimatedValue) → Overtime Cost Engine únicamente.
 * Horas / carry → Hours Engine (liquidateWeek); sin recalcular aquí.
 *
 * Cadena de carry: el caller DEBE pasar openingCarryIn / carryIn explícitos
 * (vía resolveOpeningCarryIn). No hay default implícito a 0.
 */

import { liquidateWeek } from './liquidation-engine.ts';
import { resolveEffectiveContract, resolveEffectiveOvertimeRate } from './contract-resolver.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import { compareCivilDate } from './week-dates.ts';
import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import {
  priceWeekOvertime,
  MissingOvertimeRateError,
  type PriceWeekOvertimeResult,
} from './overtime-cost-engine.ts';
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
   * EXTRAS (modo bolsa) = overtimeHours si carryOut ≥ 0; si queda deuda → 0.
   * Nunca > 0 si la semana deja deuda (carryOut < 0).
   */
  weeklyBalance: number;
  finalBalance: number;
  estimatedValue: number | null;
  isPaid: boolean;
  preferStock: boolean;
  limitHours: number;
  hourlyRate: number | null;
  hasMissingRate?: boolean;
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
  return roundMarbellaHours(
    Math.max(0, result.balanceFinal - Math.max(0, result.carryOut)),
  );
}

export type WeekAdminFlags = {
  /** Solo sello administrativo Pagada (hecho de proceso, no resultado de liquidación). */
  isPaid?: boolean;
  /**
   * Override semanal Bolsa/Pago (`prefer_stock_hours_override`).
   * `true`/`false` fuerza; `null`/`undefined` → bagMode del contrato.
   */
  bagModeOverride?: boolean | null;
  /**
   * Override €/h semanal (`overtime_price_snapshot`).
   * `null`/`undefined` → pricing por tramos; número (incl. 0) → override.
   */
  overtimeRateOverride?: number | null;
};

function weekStartKey(week: { startDate: string }): CivilDate {
  return (
    typeof week.startDate === 'string' ? week.startDate.split('T')[0]! : String(week.startDate)
  ) as CivilDate;
}

export function priceLiquidationOvertime(
  result: LiquidationResult,
  employee: EmployeeBoundaryFacts,
  options?: {
    bagModeOverride?: boolean | null;
    overrideRate?: number | null;
  },
): PriceWeekOvertimeResult {
  const netPayableHours = netPayableHoursFromLiquidation(
    result,
    options?.bagModeOverride,
  );
  const effectiveOvertimeRate = resolveEffectiveOvertimeRate(
    employee,
    result.weekStart,
    options?.overrideRate,
  );
  try {
    return priceWeekOvertime({
      netPayableHours,
      effectiveOvertimeRate,
    });
  } catch (err) {
    if (err instanceof MissingOvertimeRateError) {
      return { estimatedValue: null, hourlyRate: null, hasMissingRate: true };
    }
    throw err;
  }
}

/**
 * @deprecated Solo display / legacy. El importe NO debe usar esta función.
 * Preferir Overtime Cost Engine (`priceWeekOvertime`).
 */
export function overtimeRateForWeek(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): number {
  return resolveEffectiveOvertimeRate(employee, weekStart) ?? 0;
}




/**
 * Proyecta LiquidationResult → footer de tarjeta.
 * IMPORTE = únicamente `pricing` del Overtime Cost Engine.
 */
export function weekCardSummaryFromLiquidation(
  result: LiquidationResult,
  pricing: PriceWeekOvertimeResult,
  bagModeOverride?: boolean | null,
): WeekCardSummaryFromEngine {
  const preferStock =
    bagModeOverride === true
      ? true
      : bagModeOverride === false
        ? false
        : result.segments.length > 0 && result.segments.every((s) => s.bagMode);

  const netPayable = netPayableHoursFromLiquidation(result, bagModeOverride);

  // En pago: extras = horas de ESTA semana que se liquidan a cobro.
  // En bolsa: extras = OT de la semana que acumula en banco.
  // Ambos: si queda deuda (carryOut < 0), el OT se absorbió → EXTRAS footer = 0.
  const extrasFooter =
    result.carryOut < 0
      ? 0
      : preferStock
        ? roundMarbellaHours(result.overtimeHours)
        : roundMarbellaHours(Math.max(0, netPayable - Math.max(0, result.carryIn)));

  return {
    totalHours: result.hoursWorked,
    startBalance: result.carryIn,
    weeklyBalance: extrasFooter,
    finalBalance: result.balanceFinal,
    estimatedValue: pricing.estimatedValue,
    isPaid: result.isPaid,
    preferStock,
    limitHours: result.contractedHoursEffective,
    hourlyRate: pricing.hourlyRate,
    hasMissingRate: pricing.hasMissingRate,
  };
}

export function assertCardMatchesLiquidation(
  summary: WeekCardSummaryFromEngine,
  result: LiquidationResult,
  employee: EmployeeBoundaryFacts,
  options?: {
    bagModeOverride?: boolean | null;
    overrideRate?: number | null;
  },
): void {
  const eps = 1e-9;
  if (Math.abs(summary.totalHours - result.hoursWorked) > eps) {
    throw new Error('Footer HORAS ≠ hoursWorked');
  }
  if (Math.abs(summary.startBalance - result.carryIn) > eps) {
    throw new Error('Footer PENDIENTES ≠ carryIn');
  }
  const pricing = priceLiquidationOvertime(result, employee, options);
  if (
    summary.estimatedValue != null &&
    pricing.estimatedValue != null &&
    Math.abs(summary.estimatedValue - pricing.estimatedValue) > eps
  ) {
    throw new Error('Footer IMPORTE ≠ Overtime Cost Engine');
  }
  if (
    summary.hourlyRate != null &&
    pricing.hourlyRate != null &&
    Math.abs(summary.hourlyRate - pricing.hourlyRate) > eps
  ) {
    throw new Error('Footer hourlyRate ≠ Overtime Cost Engine');
  }
  // Nunca cobrar si queda deuda pendiente.
  if (summary.estimatedValue != null && result.carryOut < -eps && summary.estimatedValue > eps) {
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
  /**
   * Override €/h (`overtime_price_snapshot`).
   * null/undefined → segmentos contractuales; número (incl. 0) → override.
   */
  overrideRate?: number | null;
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
  const pricing = priceLiquidationOvertime(result, input.employee, {
    bagModeOverride: input.bagModeOverride,
    overrideRate: input.overrideRate,
  });
  const summary = weekCardSummaryFromLiquidation(
    result,
    pricing,
    input.bagModeOverride,
  );
  assertCardMatchesLiquidation(summary, result, input.employee, {
    bagModeOverride: input.bagModeOverride,
    overrideRate: input.overrideRate,
  });
  return {
    result,
    extrasByDay: extrasByDayFromResult(result),
    summary,
  };
}

type WeekLike = {
  startDate: string;
  days: ReadonlyArray<{ date: string; extraHours: number }>;
  /** Solo se lee flags admin; el resto se regenera. */
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
    /** Override €/h por weekStart; ausente → null (tramos). */
    overtimeRateOverrideByWeek?: (weekStart: CivilDate) => number | null;
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
    const overrideRate =
      week.summary?.overtimeRateOverride !== undefined
        ? week.summary.overtimeRateOverride
        : (options.overtimeRateOverrideByWeek?.(weekStart) ?? null);

    const { result, extrasByDay, summary } = liquidateWeekForCard({
      employee,
      weekStart,
      logs: weekLogs,
      isPaid,
      carryIn,
      bagModeOverride,
      overrideRate,
    });

    carryIn = result.carryOut;

    byIndex.set(index, {
      ...week,
      summary: {
        ...(week.summary ?? {}),
        ...summary,
        isPaid,
        bagModeOverride,
        overtimeRateOverride: overrideRate,
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
