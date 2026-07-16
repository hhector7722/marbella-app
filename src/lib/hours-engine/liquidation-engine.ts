import { aggregateWeekAttendance } from './attendance-aggregator.ts';
import { resolveEffectiveContract } from './contract-resolver.ts';
import { computeCarry } from './carry-engine.ts';
import { buildDailyBreakdown } from './daily-breakdown.ts';
import { applyRegimeToSegment } from './regime-policy.ts';
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

function assertDailyCoherent(
  overtimeHours: number,
  ordinaryHours: number,
  daily: DailyBreakdown,
): void {
  if (Math.abs(daily.overtimeHoursTotal - overtimeHours) > EPS) {
    throw new Error(
      `Invariante roto: Σ extras diarias (${daily.overtimeHoursTotal}) ≠ extras semanales (${overtimeHours})`,
    );
  }
  if (Math.abs(daily.ordinaryHoursTotal - ordinaryHours) > EPS) {
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
  const { employee, weekStart, logs, isPaid, carryIn } = input;
  const { weekEnd } = weekBounds(weekStart);

  const attendance = aggregateWeekAttendance(employee, weekStart, logs);
  const contract = resolveEffectiveContract(employee, weekStart);

  // Semana sin fichajes → balance semanal 0 (regla v1.0).
  if (attendance.totalHours === 0) {
    const carry = computeCarry({
      carryIn,
      parts: [],
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

  // Pre-alta: el resolver ya emite segmentos pre_alta para días < alta.
  // Horas en días sin segmento (empleado sin tramo) se agrupan al final como staff 0-contrato.
  const covered = new Set<string>();
  for (const seg of contract.segments) {
    for (const d of seg.days) covered.add(d);
  }

  const orphanDays = attendance.days
    .filter((d) => d.hours > 0 && !covered.has(d.day))
    .map((d) => d.day);

  const segmentInputs = [
    ...contract.segments,
    ...(orphanDays.length > 0
      ? [
          {
            days: orphanDays,
            weeklyHoursOfTerm: 0,
            contractedHours: 0,
            bagMode: false,
            termRegime: 'staff' as const,
            kind: 'pre_alta' as const,
            effectiveFrom: null,
            effectiveTo: null,
          },
        ]
      : []),
  ];

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
