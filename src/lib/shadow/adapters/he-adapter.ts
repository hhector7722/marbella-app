import type { LiquidationResult } from '../../hours-engine/types.ts';
import { netPayableHoursFromLiquidation } from '../../hours-engine/week-card-from-liquidation.ts';
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
  facts?: HeAdapterFacts;
  /** Override bolsa/pago ya aplicado en la liquidación (mismo que liquidateWeek). */
  bagModeOverride?: boolean | null;
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

function otRateFromResult(result: LiquidationResult): number | null {
  for (const s of result.segments) {
    // tarifa no está en SegmentLiquidation — se deriva vía estimated en UI;
    // otCost se deja null si no hay hecho de tarifa en facts futuros.
    void s;
  }
  return null;
}

/**
 * Proyecta LiquidationResult → CanonicalComparisonVector.
 * Único conocimiento de HE dentro de Shadow (anti-corruption layer).
 */
export function heLiquidationToCanonical(
  input: HeAdapterLiquidationInput,
): CanonicalComparisonVector {
  const { liquidation: r, facts, bagModeOverride } = input;
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

  void otRateFromResult;

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
    otCost: null,
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

/** @deprecated alias tipado opaco del scaffolding */
export type HeAdapterInput = HeAdapterLiquidationInput;
