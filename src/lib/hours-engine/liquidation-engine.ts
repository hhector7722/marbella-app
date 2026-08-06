import { aggregateWeekAttendance } from './attendance-aggregator.ts';
import { resolveEffectiveContract } from './contract-resolver.ts';
import { computeCarry } from './carry-engine.ts';
import { buildDailyBreakdown } from './daily-breakdown.ts';
import { applyRegimeToSegment } from './regime-policy.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import type {
  DailyBreakdown,
  LiquidationInput,
  LiquidationResult,
  SegmentLiquidation,
} from './types.ts';
import { weekBounds } from './week-dates.ts';

const EPS = 1e-9;

function emptyDailyBreakdown(weekStart: string): DailyBreakdown {
  return buildDailyBreakdown(weekStart, {}, []);
}

/**
 * Coherencia diarias ↔ semanales. Compara en escala Marbella (.0/.5)
 * para no tumbar la UI por ruido float (0.619999… vs 0.62).
 */
function assertDailyCoherent(
  overtimeHours: number,
  ordinaryHours: number,
  daily: DailyBreakdown,
): void {
  const dOt = roundMarbellaHours(daily.overtimeHoursTotal);
  const wOt = roundMarbellaHours(overtimeHours);
  if (Math.abs(dOt - wOt) > EPS) {
    throw new Error(
      `Invariante roto: Σ extras diarias (${daily.overtimeHoursTotal}) ≠ extras semanales (${overtimeHours})`,
    );
  }
  const dOrd = roundMarbellaHours(daily.ordinaryHoursTotal);
  const wOrd = roundMarbellaHours(ordinaryHours);
  if (Math.abs(dOrd - wOrd) > EPS) {
    throw new Error(
      `Invariante roto: Σ ordinarias diarias (${daily.ordinaryHoursTotal}) ≠ ordinarias semanales (${ordinaryHours})`,
    );
  }
}

/**
 * Motor de liquidación — función de dominio pura.
 * Lee hechos (vía input), produce LiquidationResult.
 * No escribe hechos, no marca Pagada, no habla con UI.
 */
export function liquidateWeek(input: LiquidationInput): LiquidationResult {
  const { employee, weekStart, logs, isPaid, carryIn, bagModeOverride } = input;
  const { weekEnd } = weekBounds(weekStart);

  const resolveBag = (bagMode: boolean) =>
    bagModeOverride === true || bagModeOverride === false ? bagModeOverride : bagMode;

  const attendance = aggregateWeekAttendance(employee, weekStart, logs);
  const contract = resolveEffectiveContract(employee, weekStart);

  const segmentInputs = contract.segments.map((seg) => ({
    ...seg,
    bagMode: resolveBag(seg.bagMode),
  }));

  // Sin tramos (p.ej. post-baja toda la semana): no hay contrato que consumir.
  if (segmentInputs.length === 0) {
    const carry = computeCarry({
      carryIn,
      parts:
        bagModeOverride === true || bagModeOverride === false
          ? [{ weeklyBalancePart: 0, bagMode: bagModeOverride }]
          : [],
      isPaid,
    });
    const dailyBreakdown = emptyDailyBreakdown(weekStart);

    return {
      employeeId: employee.employeeId,
      weekStart,
      weekEnd,
      hoursWorked: 0,
      contractedHoursEffective: contract.contractedHoursEffective,
      weeklyBalance: 0,
      carryIn: carry.carryIn,
      balanceFinal: carry.balanceFinal,
      carryOut: carry.carryOut,
      isPaid,
      ordinaryHours: 0,
      overtimeHours: 0,
      segments: [],
      dailyBreakdown,
    };
  }

  const segments: SegmentLiquidation[] = segmentInputs.map((seg) =>
    applyRegimeToSegment({
      days: seg.days,
      hoursByDay: attendance.hoursByDay,
      contractedHours: seg.contractedHours,
      bagMode: seg.bagMode,
      termRegime: seg.termRegime,
      kind: seg.kind,
    }),
  );

  // Solo partes con días del resolver en orden; orphan al final.
  const carry = computeCarry({
    carryIn,
    parts: segments.map((s) => ({
      weeklyBalancePart: s.weeklyBalancePart,
      bagMode: s.bagMode,
    })),
    isPaid,
  });

  const ordinaryHours = segments.reduce((acc, s) => acc + s.ordinaryHours, 0);
  const overtimeHours = segments.reduce((acc, s) => acc + s.overtimeHours, 0);

  const dailyBreakdown = buildDailyBreakdown(
    weekStart,
    attendance.hoursByDay,
    segmentInputs.map((seg) => ({
      days: seg.days,
      hoursByDay: attendance.hoursByDay,
      contractedHours: seg.contractedHours,
      termRegime: seg.termRegime,
      kind: seg.kind,
    })),
  );

  assertDailyCoherent(overtimeHours, ordinaryHours, dailyBreakdown);

  return {
    employeeId: employee.employeeId,
    weekStart,
    weekEnd,
    hoursWorked: attendance.totalHours,
    contractedHoursEffective: contract.contractedHoursEffective,
    weeklyBalance: carry.weeklyBalance,
    carryIn: carry.carryIn,
    balanceFinal: carry.balanceFinal,
    carryOut: carry.carryOut,
    isPaid,
    ordinaryHours,
    overtimeHours,
    segments,
    dailyBreakdown,
  };
}
