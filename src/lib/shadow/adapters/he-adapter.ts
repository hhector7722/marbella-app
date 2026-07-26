import type { LiquidationResult } from '../../hours-engine/types.ts';
import type { EmployeeBoundaryFacts } from '../../hours-engine/types.ts';
import {
  netPayableHoursFromLiquidation,
  priceLiquidationOvertime,
} from '../../hours-engine/week-card-from-liquidation.ts';
import type { CanonicalComparisonVector } from '../types/canonical-vector.ts';

/**
 * Hechos auxiliares que LiquidationResult no transporta (p.ej. justificadas).
 * Opcionales: si faltan, el campo canónico queda `null` (D000 posible).
 */
export type HeAdapterFacts = {
  justifiedHoursWeek?: number | null;
};

export type HeAdapterLiquidationInput = {
  employeeId: string;
  weekStart: string;
  liquidation: LiquidationResult;
  /** Necesario para Overtime Cost Engine (tarifas de tramo + settlement lunes). */
  employee: EmployeeBoundaryFacts;
  facts?: HeAdapterFacts;
  /** Override bolsa/pago ya aplicado en la liquidación (mismo que liquidateWeek). */
  bagModeOverride?: boolean | null;
  /** Override €/h semanal (`overtime_price_snapshot`). */
  overrideRate?: number | null;
};

function resolveBagMode(
  result: LiquidationResult,
  bagModeOverride?: boolean | null,
): boolean {
  if (bagModeOverride === true) return true;
  if (bagModeOverride === false) return false;
  return (
    result.segments.length > 0 && result.segments.every((s) => s.bagMode)
  );
}

function regimeLabelFromResult(result: LiquidationResult): string | null {
  if (result.segments.length === 0) return null;
  const labels = [
    ...new Set(result.segments.map((s) => s.regimeApplied)),
  ].sort();
  return labels.join('+');
}

/**
 * Proyecta LiquidationResult → CanonicalComparisonVector.
 * otCost = Overtime Cost Engine (mismo estimatedValue que la UI).
 */
export function heLiquidationToCanonical(
  input: HeAdapterLiquidationInput,
): CanonicalComparisonVector {
  const { liquidation: r, facts, bagModeOverride, employee, overrideRate } =
    input;
  if (r.employeeId !== input.employeeId) {
    throw new Error(
      `shadow/he-adapter: employeeId mismatch (${input.employeeId} vs ${r.employeeId})`,
    );
  }
  if (r.weekStart !== input.weekStart) {
    throw new Error(
      `shadow/he-adapter: weekStart mismatch (${input.weekStart} vs ${r.weekStart})`,
    );
  }
  if (employee.employeeId !== input.employeeId) {
    throw new Error(
      `shadow/he-adapter: employee.employeeId mismatch (${input.employeeId} vs ${employee.employeeId})`,
    );
  }

  const bagMode = resolveBagMode(r, bagModeOverride);
  const justified =
    facts?.justifiedHoursWeek === undefined
      ? null
      : (facts.justifiedHoursWeek ?? null);
  const physical =
    justified === null ? null : Math.max(0, r.hoursWorked - justified);

  const payable = netPayableHoursFromLiquidation(r, bagModeOverride);
  const compensated = bagMode
    ? r.carryOut < 0
      ? 0
      : r.overtimeHours
    : 0;

  const pricing = priceLiquidationOvertime(r, employee, {
    bagModeOverride,
    overrideRate,
  });

  return {
    employeeId: input.employeeId,
    weekStart: input.weekStart,
    source: 'he',
    computableHours: r.hoursWorked,
    justifiedHours: justified,
    physicalHours: physical,
    contractedHoursEffective: r.contractedHoursEffective,
    regimeLabel: regimeLabelFromResult(r),
    ordinaryHours: r.ordinaryHours,
    overtimeHours: r.overtimeHours,
    carryIn: r.carryIn,
    carryOut: r.carryOut,
    weeklyBalance: r.weeklyBalance,
    balanceFinal: r.balanceFinal,
    pendingHours: r.carryIn,
    payableHours: payable,
    compensatedHours: compensated,
    bagModeApplied: bagMode,
    isPaid: r.isPaid,
    otCost: pricing.estimatedValue,
    laborCost: null,
  };
}

export type HeAdapter = {
  toCanonical(input: HeAdapterLiquidationInput): CanonicalComparisonVector;
};

export function createHeAdapter(): HeAdapter {
  return { toCanonical: heLiquidationToCanonical };
}

/** @deprecated stub Commit 1 — usar createHeAdapter */
export function createHeAdapterStub(): HeAdapter {
  return {
    toCanonical() {
      throw new Error(
        'shadow/adapters: use createHeAdapter() (Commit 2 implementado)',
      );
    },
  };
}

export type HeAdapterInput = HeAdapterLiquidationInput;
