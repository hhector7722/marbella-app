/**
 * Validación pre-persistencia del Writer (PROJECTION CONTRACT v1 §5 / §8).
 * Abortar escritura si cualquier invariante falla.
 *
 * No recalcula liquidación ni inventa dominio: solo inspecciona
 * LiquidationResult (+ estimatedValue) y, para INV-C04, consulta el oráculo
 * público `computeCarry` con las partes ya presentes en el resultado
 * (consistencia del vector, no segundo camino de negocio).
 *
 * INV-L05 (determinismo): no verificable en un único write sin re-ejecutar
 * `liquidateWeek`; pertenece a la suite unitaria del Hours Engine.
 */

import { computeCarry } from '../carry-engine.ts';
import { assertContractTermInvariants } from '../contract-terms-versioning.ts';
import { roundMarbellaHours, roundMarbellaSigned } from '../marbella-round.ts';
import { weekBounds } from '../week-dates.ts';
import type {
  EmployeeBoundaryFacts,
  LiquidationResult,
} from '../types.ts';
import type { CivilDate } from '../types.ts';
import {
  MONEY_EPS,
  mapEnginesToProjectionRow,
  type WeeklyProjectionDomainRow,
} from './map-projection.ts';

const HOURS_EPS = 1e-6;

export type ProjectionWeekCandidate = {
  liquidation: LiquidationResult;
  estimatedValue: number;
  /** Overrides leídos como input (no se escriben). */
  overrides: {
    isPaid: boolean;
    preferStockHoursOverride: boolean | null;
    overtimePriceSnapshot: number | null;
  };
};

export type ProjectionValidationOk = {
  ok: true;
  rows: WeeklyProjectionDomainRow[];
};

export type ProjectionValidationFail = {
  ok: false;
  error: string;
  code:
    | 'INV-C01'
    | 'INV-C02'
    | 'INV-C03'
    | 'INV-C04'
    | 'INV-C05'
    | 'INV-C06'
    | 'INV-C07'
    | 'INV-C08'
    | 'INV-C09'
    | 'INV-C10'
    | 'INV-L01'
    | 'INV-L02'
    | 'INV-L03'
    | 'INV-L04'
    | 'INV-J01'
    | 'INV-J02'
    | 'INV-J03'
    | 'INV-J04'
    | 'INV-$01'
    | 'INV-$02'
    | 'INV-P04'
    | 'FINITE'
    | 'WEEK_BOUNDS'
    | 'IDENTITY';
};

export type ProjectionValidationResult =
  | ProjectionValidationOk
  | ProjectionValidationFail;

export type ValidateProjectionBatchOptions = {
  /**
   * Semilla temporal del empleado (ADR INV-C01).
   * Si una semana del batch es exactamente timelineStart, su carryIn debe ser 0.
   */
  timelineStart?: CivilDate | null;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fail(
  code: ProjectionValidationFail['code'],
  error: string,
): ProjectionValidationFail {
  return { ok: false, code, error };
}

function close(a: number, b: number, eps: number = HOURS_EPS): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Valida hechos de frontera + tramos + semilla INV-C01 antes de liquidar.
 *
 * `openingCarryAtTimelineStart` debe ser el carry de apertura cuando
 * `chainStart === timelineStart` (ADR: siempre 0).
 */
export function validateWriterPreconditions(input: {
  employee: EmployeeBoundaryFacts;
  timelineStart: CivilDate | null;
  /** Resultado de resolveOpeningCarryIn({ chainStart: timelineStart }). */
  openingCarryAtTimelineStart?: number;
}): ProjectionValidationResult | null {
  if (input.timelineStart == null) {
    return fail(
      'INV-C01',
      'Writer: timelineStart no resoluble (INV-C01). Empleado sin frontera/tramos válidos.',
    );
  }
  if (
    input.openingCarryAtTimelineStart !== undefined &&
    !close(input.openingCarryAtTimelineStart, 0)
  ) {
    return fail(
      'INV-C01',
      `INV-C01: carryIn(timelineStart) debe ser 0; recibido ${input.openingCarryAtTimelineStart}`,
    );
  }
  try {
    assertContractTermInvariants(input.employee.terms);
  } catch (err) {
    return fail(
      'INV-C10',
      `Writer: tramos inválidos (INV-C10): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return null;
}

/**
 * INV-C03…C09 (+ C04 vía oráculo computeCarry sobre partes del resultado).
 * No re-liquida la semana.
 */
export function validateCarryInvariantsOnResult(
  liq: LiquidationResult,
  bagModeOverride: boolean | null,
): ProjectionValidationFail | null {
  const { carryIn, weeklyBalance, balanceFinal, carryOut, isPaid, segments } =
    liq;
  const ws = liq.weekStart;

  // INV-C03: balanceFinal = R(carryIn + weeklyBalance)
  const expectedFinal = roundMarbellaSigned(carryIn + weeklyBalance);
  if (!close(balanceFinal, expectedFinal)) {
    return fail(
      'INV-C03',
      `INV-C03: balanceFinal=${balanceFinal} ≠ R(carryIn+weeklyBalance)=${expectedFinal} @ ${ws}`,
    );
  }

  // INV-C05…C09 (propiedades observables) antes del oráculo C04.
  if (balanceFinal <= HOURS_EPS && !isPaid && !close(carryOut, balanceFinal)) {
    return fail(
      'INV-C05',
      `INV-C05: balanceFinal≤0 no pagada ⇒ carryOut=balanceFinal @ ${ws}`,
    );
  }

  if (isPaid && !close(carryOut, Math.min(0, balanceFinal))) {
    return fail(
      'INV-C06',
      `INV-C06: isPaid ⇒ carryOut=min(0,balanceFinal) @ ${ws}`,
    );
  }

  const allPay =
    segments.length > 0 && segments.every((s) => s.bagMode === false);
  const allBag =
    segments.length > 0 && segments.every((s) => s.bagMode === true);

  if (
    !isPaid &&
    balanceFinal > HOURS_EPS &&
    allPay &&
    !close(carryOut, 0)
  ) {
    return fail(
      'INV-C07',
      `INV-C07: pago puro + crédito ⇒ carryOut=0 @ ${ws}`,
    );
  }

  if (
    !isPaid &&
    balanceFinal > HOURS_EPS &&
    allBag &&
    !close(carryOut, balanceFinal)
  ) {
    return fail(
      'INV-C08',
      `INV-C08: bolsa pura + crédito ⇒ carryOut=balanceFinal @ ${ws}`,
    );
  }

  if (balanceFinal <= HOURS_EPS && carryOut > HOURS_EPS) {
    return fail(
      'INV-C09',
      `INV-C09: balanceFinal≤0 ⇒ carryOut≤0 @ ${ws}`,
    );
  }

  // INV-C04: oráculo computeCarry sobre partes del resultado (no re-liquida).
  const partsFromSegments = segments.map((s) => ({
    weeklyBalancePart: s.weeklyBalancePart,
    bagMode: s.bagMode,
  }));
  const partsForOracle =
    partsFromSegments.length > 0
      ? partsFromSegments
      : bagModeOverride === true || bagModeOverride === false
        ? [{ weeklyBalancePart: 0, bagMode: bagModeOverride }]
        : [];
  const oracle = computeCarry({
    carryIn,
    parts: partsForOracle,
    isPaid,
  });
  if (
    !close(oracle.carryOut, carryOut) ||
    !close(oracle.weeklyBalance, weeklyBalance) ||
    !close(oracle.balanceFinal, balanceFinal)
  ) {
    return fail(
      'INV-C04',
      `INV-C04: resultado ≠ computeCarry(oracle) @ ${ws} (carryOut ${carryOut} vs ${oracle.carryOut})`,
    );
  }

  return null;
}

/**
 * INV-L01…L04 sobre el vector LiquidationResult (sin re-agregar hechos).
 *
 * L01: coherencia interna horas (Σ segmentos / dailyBreakdown ≡ hoursWorked).
 *      No re-suma time_logs (eso duplicaría attendance-aggregator → HE).
 * L02: weeklyBalance ≡ Σ weeklyBalancePart (escala Marbella del resultado).
 * L03: ordinary/OT coherentes con Σ segmentos y dailyBreakdown.
 * L04: segmentos pre_alta no aportan ordinaria contractual.
 * L05: no verificable aquí (requiere re-ejecutar liquidateWeek).
 */
export function validateLaborInvariantsOnResult(
  liq: LiquidationResult,
): ProjectionValidationFail | null {
  const ws = liq.weekStart;
  const segHours = liq.segments.reduce((a, s) => a + s.hoursWorked, 0);
  const dailyHours = liq.dailyBreakdown.days.reduce((a, d) => a + d.hours, 0);

  // INV-L01 — observable sobre el resultado
  if (liq.segments.length > 0 && !close(liq.hoursWorked, segHours)) {
    return fail(
      'INV-L01',
      `INV-L01: hoursWorked=${liq.hoursWorked} ≠ Σ seg.hoursWorked=${segHours} @ ${ws}`,
    );
  }
  if (!close(liq.hoursWorked, dailyHours)) {
    return fail(
      'INV-L01',
      `INV-L01: hoursWorked=${liq.hoursWorked} ≠ Σ daily.hours=${dailyHours} @ ${ws}`,
    );
  }

  // INV-L02
  const sumParts = roundMarbellaSigned(
    liq.segments.reduce((a, s) => a + s.weeklyBalancePart, 0),
  );
  // Semana sin segmentos: weeklyBalance del resultado puede venir de carry con parts override (0).
  if (liq.segments.length > 0 && !close(liq.weeklyBalance, sumParts)) {
    return fail(
      'INV-L02',
      `INV-L02: weeklyBalance=${liq.weeklyBalance} ≠ Σ weeklyBalancePart=${sumParts} @ ${ws}`,
    );
  }

  // INV-L03
  const sumOrd = liq.segments.reduce((a, s) => a + s.ordinaryHours, 0);
  const sumOt = liq.segments.reduce((a, s) => a + s.overtimeHours, 0);
  if (liq.segments.length > 0) {
    if (!close(liq.ordinaryHours, sumOrd) || !close(liq.overtimeHours, sumOt)) {
      return fail(
        'INV-L03',
        `INV-L03: ordinary/OT semanales ≠ Σ segmentos @ ${ws}`,
      );
    }
  }
  if (
    !close(
      roundMarbellaHours(liq.ordinaryHours),
      roundMarbellaHours(liq.dailyBreakdown.ordinaryHoursTotal),
    ) ||
    !close(
      roundMarbellaHours(liq.overtimeHours),
      roundMarbellaHours(liq.dailyBreakdown.overtimeHoursTotal),
    )
  ) {
    return fail(
      'INV-L03',
      `INV-L03: ordinary/OT ≠ dailyBreakdown totals @ ${ws}`,
    );
  }

  // INV-L04 — pre_alta no aporta jornada ordinaria de contrato
  for (const s of liq.segments) {
    if (s.kind === 'pre_alta') {
      if (s.ordinaryHours > HOURS_EPS || s.contractedHours > HOURS_EPS) {
        return fail(
          'INV-L04',
          `INV-L04: segmento pre_alta con ordinaria/contrato @ ${ws}`,
        );
      }
    }
  }

  return null;
}

/**
 * Valida un batch ya liquidado+precificado antes del commit.
 * Construye las filas de dominio mapeadas (contrato §1).
 */
export function validateProjectionBatch(
  candidates: readonly ProjectionWeekCandidate[],
  options: ValidateProjectionBatchOptions = {},
): ProjectionValidationResult {
  if (candidates.length === 0) {
    return { ok: true, rows: [] };
  }

  const rows: WeeklyProjectionDomainRow[] = [];
  const timelineStart = options.timelineStart ?? null;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const liq = c.liquidation;

    if (liq.employeeId == null || liq.employeeId === '') {
      return fail('IDENTITY', `Writer: employeeId vacío en semana índice ${i}`);
    }

    const expectedEnd = weekBounds(liq.weekStart as CivilDate).weekEnd;
    if (liq.weekEnd !== expectedEnd) {
      return fail(
        'WEEK_BOUNDS',
        `Writer: week_end incoherente en ${liq.weekStart}: HE=${liq.weekEnd}, esperado=${expectedEnd}`,
      );
    }

    const nums = [
      liq.carryIn,
      liq.weeklyBalance,
      liq.balanceFinal,
      liq.carryOut,
      liq.hoursWorked,
      liq.ordinaryHours,
      liq.overtimeHours,
      liq.contractedHoursEffective,
      c.estimatedValue,
    ];
    if (!nums.every(isFiniteNumber)) {
      return fail(
        'FINITE',
        `Writer: magnitud no finita en liquidación/coste de ${liq.weekStart}`,
      );
    }

    // INV-C01: carryIn(timelineStart) = 0
    if (
      timelineStart != null &&
      liq.weekStart === timelineStart &&
      !close(liq.carryIn, 0)
    ) {
      return fail(
        'INV-C01',
        `INV-C01: carryIn(timelineStart=${timelineStart})=${liq.carryIn} ≠ 0`,
      );
    }

    const carryFail = validateCarryInvariantsOnResult(
      liq,
      c.overrides.preferStockHoursOverride,
    );
    if (carryFail) return carryFail;

    const laborFail = validateLaborInvariantsOnResult(liq);
    if (laborFail) return laborFail;

    // INV-J01…J04: el payload debe ser exactamente el mapeo del HE (por construcción).
    const row = mapEnginesToProjectionRow(liq, c.estimatedValue);
    if (!close(row.pending_balance, liq.carryIn)) {
      return fail('INV-J01', `INV-J01 pending_balance≠carryIn @ ${liq.weekStart}`);
    }
    if (!close(row.final_balance, liq.balanceFinal)) {
      return fail('INV-J02', `INV-J02 final_balance≠balanceFinal @ ${liq.weekStart}`);
    }
    if (!close(row.balance_hours, liq.weeklyBalance)) {
      return fail('INV-J03', `INV-J03 balance_hours≠weeklyBalance @ ${liq.weekStart}`);
    }
    if (
      !close(row.total_hours, liq.hoursWorked) ||
      !close(row.ordinary_hours, liq.ordinaryHours) ||
      !close(row.extra_hours, liq.overtimeHours) ||
      !close(row.contracted_hours_snapshot, liq.contractedHoursEffective)
    ) {
      return fail(
        'INV-J04',
        `INV-J04 horas/contrato no mapean al HE @ ${liq.weekStart}`,
      );
    }

    // INV-P04 / INV-$01: carryOut < 0 ⇒ estimatedValue = 0
    if (liq.carryOut < -HOURS_EPS && Math.abs(c.estimatedValue) > MONEY_EPS) {
      return fail(
        'INV-P04',
        `INV-P04/INV-$01: carryOut=${liq.carryOut} pero estimatedValue=${c.estimatedValue} @ ${liq.weekStart}`,
      );
    }

    // INV-$02: total_cost es estimatedValue redondeado (ya en row)
    if (
      Math.abs(row.total_cost - Math.round(c.estimatedValue * 100) / 100) >
      MONEY_EPS
    ) {
      return fail(
        'INV-$02',
        `INV-$02 total_cost≠estimatedValue @ ${liq.weekStart}`,
      );
    }

    // Cadena INV-C02
    if (i > 0) {
      const prev = candidates[i - 1]!.liquidation;
      if (!close(prev.carryOut, liq.carryIn)) {
        return fail(
          'INV-C02',
          `INV-C02: carryOut(${prev.weekStart})=${prev.carryOut} ≠ carryIn(${liq.weekStart})=${liq.carryIn}`,
        );
      }
    }

    rows.push(row);
  }

  return { ok: true, rows };
}
