/**
 * Hechos contractuales versionados — sin perfiles vivos.
 * El Contract Resolver solo consume EmployeeBoundaryFacts.terms.
 */

import { liquidateWeek } from './liquidation-engine.ts';
import { patchWeeksFromLiquidation } from './week-card-from-liquidation.ts';
import type {
  CivilDate,
  ContractRegime,
  ContractTermFact,
  EmployeeBoundaryFacts,
  LiquidationResult,
  TimeLogFact,
} from './types.ts';
import { compareCivilDate } from './week-dates.ts';

/** Fila BD / DTO de hours_contract_terms. */
export type ContractTermRow = {
  effective_from: string;
  effective_to: string | null;
  weekly_hours: number;
  bag_mode: boolean;
  regime: string;
  overtime_rate_per_hour?: number | null;
};

export type EmployeeBoundaryRow = {
  id: string;
  joining_date?: string | null;
  end_date?: string | null;
};

/**
 * Convierte filas versionadas → ContractTermFact[].
 * No lee jornada/régimen/bolsa/tarifa desde el perfil vivo.
 */
export function mapContractTermRows(
  rows: readonly ContractTermRow[],
): ContractTermFact[] {
  return rows.map((r) => {
    const regime = r.regime as ContractRegime;
    if (regime !== 'staff' && regime !== 'manager' && regime !== 'fixed') {
      throw new Error(`Régimen de tramo inválido: ${r.regime}`);
    }
    return {
      effectiveFrom: r.effective_from.split('T')[0]!,
      effectiveTo: r.effective_to ? r.effective_to.split('T')[0]! : null,
      weeklyHours: Number(r.weekly_hours),
      bagMode: !!r.bag_mode,
      regime,
      overtimeRatePerHour:
        r.overtime_rate_per_hour == null ? null : Number(r.overtime_rate_per_hour),
    };
  });
}

/**
 * Límites de alta/baja + tramos versionados.
 * joining/end son hechos de frontera (no jornada/régimen/bolsa/tarifa).
 */
export function employeeFactsFromContractTerms(
  boundary: EmployeeBoundaryRow,
  termRows: readonly ContractTermRow[],
): EmployeeBoundaryFacts {
  const terms = mapContractTermRows(termRows);
  assertTermsNonOverlapping(terms);
  return {
    employeeId: boundary.id,
    joiningDate: boundary.joining_date
      ? boundary.joining_date.split('T')[0]!
      : null,
    endDate: boundary.end_date ? boundary.end_date.split('T')[0]! : null,
    terms,
  };
}

/** Invariante de hechos: a lo sumo un tramo por día. */
export function assertTermsNonOverlapping(terms: readonly ContractTermFact[]): void {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const aEnd = a.effectiveTo;
      if (aEnd === null) {
        throw new Error(
          `Tramo abierto ${a.effectiveFrom} solapa con ${b.effectiveFrom}`,
        );
      }
      if (compareCivilDate(b.effectiveFrom, aEnd) <= 0) {
        throw new Error(
          `Tramos solapados: ${a.effectiveFrom}..${aEnd} ∩ ${b.effectiveFrom}..${b.effectiveTo ?? 'open'}`,
        );
      }
    }
  }
}

/**
 * Cierra el tramo abierto e inserta uno nuevo (inmutabilidad del pasado:
 * solo muta effectiveTo del abierto + añade tramo futuro/actual).
 */
export function appendContractTerm(
  terms: readonly ContractTermFact[],
  next: ContractTermFact,
): ContractTermFact[] {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  const closed: ContractTermFact[] = [];
  let foundOpen = false;
  for (const t of sorted) {
    if (t.effectiveTo === null) {
      foundOpen = true;
      const dayBefore = previousCivilDay(next.effectiveFrom);
      if (compareCivilDate(dayBefore, t.effectiveFrom) < 0) {
        throw new Error('El nuevo tramo empieza antes del tramo abierto');
      }
      closed.push({ ...t, effectiveTo: dayBefore });
    } else {
      closed.push({ ...t });
    }
  }
  if (!foundOpen && sorted.length > 0) {
    // Todos cerrados: solo añadir
  }
  const result = [...closed, { ...next }];
  assertTermsNonOverlapping(result);
  return result;
}

function previousCivilDay(ymd: CivilDate): CivilDate {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d! - 1);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Mapa día → extras desde hechos versionados (sin perfil vivo). */
export function liquidateWeekExtrasByDay(input: {
  employee: EmployeeBoundaryFacts;
  weekStart: CivilDate;
  logs: readonly TimeLogFact[];
}): Readonly<Record<CivilDate, number>> {
  // Extras diarias no dependen del banco; carryIn explícito 0 (no arrastre en esta proyección).
  const result = liquidateWeek({
    employee: input.employee,
    weekStart: input.weekStart,
    logs: input.logs,
    isPaid: false,
    carryIn: 0,
  });
  return extrasByDayFromLiquidation(result);
}

export function extrasByDayFromLiquidation(
  result: LiquidationResult,
): Readonly<Record<CivilDate, number>> {
  const out: Record<CivilDate, number> = {};
  for (const d of result.dailyBreakdown.days) {
    out[d.day] = d.overtimeHours;
  }
  return out;
}

/**
 * @deprecated Preferir patchWeeksFromLiquidation (días + footer desde el mismo resultado).
 */
export function patchWeeksDailyExtrasFromEngine<
  TWeek extends {
    startDate: string;
    days: ReadonlyArray<{ date: string; extraHours: number }>;
    summary?: { isPaid?: boolean };
  },
>(
  weeks: readonly TWeek[],
  employee: EmployeeBoundaryFacts,
  logs: readonly TimeLogFact[],
): TWeek[] {
  return patchWeeksFromLiquidation(weeks, employee, logs, { openingCarryIn: 0 });
}
