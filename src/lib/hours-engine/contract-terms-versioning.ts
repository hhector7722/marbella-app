/**
 * Único planificador de versionado contractual (puro).
 * No escribe BD. No toca liquidación ni Contract Resolver.
 *
 * Reglas:
 * - Sin cambio de snapshot → noop
 * - Cambio → cierra tramo abierto el día anterior; abre nuevo desde effectiveFrom
 * - Mismo día (open.effectiveFrom === effectiveFrom) → actualiza el abierto in-place
 * - Empleado nuevo (sin tramos) → primer tramo
 * - Invariantes: sin solapes, ≤1 abierto, sin huecos
 */

import type { CivilDate, ContractRegime, ContractTermFact } from './types.ts';
import { addCivilDays, compareCivilDate } from './week-dates.ts';
import { assertTermsNonOverlapping } from './ui-bridge.ts';

export type ContractualSnapshot = {
  weeklyHours: number;
  bagMode: boolean;
  regime: ContractRegime;
  overtimeRatePerHour: number | null;
};

export type VersioningResult =
  | { kind: 'noop'; terms: readonly ContractTermFact[] }
  | { kind: 'created'; terms: readonly ContractTermFact[] }
  | { kind: 'appended'; terms: readonly ContractTermFact[] }
  | { kind: 'updated_open'; terms: readonly ContractTermFact[] }
  | { kind: 'rewritten'; terms: readonly ContractTermFact[] };

function previousCivilDay(ymd: CivilDate): CivilDate {
  return addCivilDays(ymd, -1);
}

function nextCivilDay(ymd: CivilDate): CivilDate {
  return addCivilDays(ymd, 1);
}

export function snapshotsEqual(a: ContractualSnapshot, b: ContractualSnapshot): boolean {
  const rateA = a.overtimeRatePerHour ?? null;
  const rateB = b.overtimeRatePerHour ?? null;
  return (
    a.weeklyHours === b.weeklyHours &&
    a.bagMode === b.bagMode &&
    a.regime === b.regime &&
    rateA === rateB
  );
}

export function termToSnapshot(t: ContractTermFact): ContractualSnapshot {
  return {
    weeklyHours: t.weeklyHours,
    bagMode: t.bagMode,
    regime: t.regime,
    overtimeRatePerHour: t.overtimeRatePerHour ?? null,
  };
}

export function snapshotToTerm(
  snapshot: ContractualSnapshot,
  effectiveFrom: CivilDate,
  effectiveTo: CivilDate | null = null,
): ContractTermFact {
  return {
    effectiveFrom,
    effectiveTo,
    weeklyHours: snapshot.weeklyHours,
    bagMode: snapshot.bagMode,
    regime: snapshot.regime,
    overtimeRatePerHour: snapshot.overtimeRatePerHour,
  };
}

/** Deriva snapshot contractual desde campos de perfil (misma regla que el seed SQL). */
export function snapshotFromProfileFields(input: {
  contracted_hours_weekly?: number | null;
  prefer_stock_hours?: boolean | null;
  is_fixed_salary?: boolean | null;
  role?: string | null;
  overtime_cost_per_hour?: number | null;
}): ContractualSnapshot {
  const role = input.role ?? 'staff';
  const isFixed = !!input.is_fixed_salary;
  const regime: ContractRegime =
    role === 'manager' ? 'manager' : isFixed ? 'fixed' : 'staff';
  const weeklyHours =
    regime === 'manager' || regime === 'fixed'
      ? 0
      : Number(input.contracted_hours_weekly ?? 40);
  return {
    weeklyHours,
    bagMode: !!input.prefer_stock_hours,
    regime,
    overtimeRatePerHour:
      input.overtime_cost_per_hour == null || input.overtime_cost_per_hour === undefined
        ? null
        : Number(input.overtime_cost_per_hour),
  };
}

/**
 * Sin huecos: cada tramo cerrado T cumple next.effectiveFrom === T.effectiveTo + 1
 * (salvo el último abierto).
 */
export function assertNoGaps(terms: readonly ContractTermFact[]): void {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const nxt = sorted[i + 1]!;
    if (cur.effectiveTo === null) {
      throw new Error('Tramo abierto no puede preceder a otro tramo');
    }
    const expectedNext = nextCivilDay(cur.effectiveTo);
    if (compareCivilDate(nxt.effectiveFrom, expectedNext) !== 0) {
      throw new Error(
        `Hueco o solape entre tramos: ${cur.effectiveTo} → ${nxt.effectiveFrom} (esperado ${expectedNext})`,
      );
    }
  }
}

export function assertAtMostOneOpen(terms: readonly ContractTermFact[]): void {
  const opens = terms.filter((t) => t.effectiveTo === null);
  if (opens.length > 1) {
    throw new Error(`Más de un tramo abierto (${opens.length})`);
  }
}

export function assertContractTermInvariants(terms: readonly ContractTermFact[]): void {
  assertTermsNonOverlapping(terms);
  assertAtMostOneOpen(terms);
  assertNoGaps(terms);
}

/**
 * Aplica un cambio contractual con fecha efectiva.
 * Preserva tramos históricos cerrados.
 */
export function applyContractualChange(
  terms: readonly ContractTermFact[],
  nextSnapshot: ContractualSnapshot,
  effectiveFrom: CivilDate,
): VersioningResult {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );

  if (sorted.length === 0) {
    const created = [snapshotToTerm(nextSnapshot, effectiveFrom, null)];
    assertContractTermInvariants(created);
    return { kind: 'created', terms: created };
  }

  const openIdx = sorted.findIndex((t) => t.effectiveTo === null);
  if (openIdx < 0) {
    // Todos cerrados: enlazar sin hueco
    const last = sorted[sorted.length - 1]!;
    if (last.effectiveTo === null) {
      throw new Error('Estado inconsistente');
    }
    const expectedFrom = nextCivilDay(last.effectiveTo);
    if (compareCivilDate(effectiveFrom, expectedFrom) !== 0) {
      throw new Error(
        `Hueco al reabrir: efectivo ${effectiveFrom}, esperado ${expectedFrom}`,
      );
    }
    const appended = [...sorted, snapshotToTerm(nextSnapshot, effectiveFrom, null)];
    assertContractTermInvariants(appended);
    return { kind: 'appended', terms: appended };
  }

  const open = sorted[openIdx]!;
  if (snapshotsEqual(termToSnapshot(open), nextSnapshot)) {
    assertContractTermInvariants(sorted);
    return { kind: 'noop', terms: sorted };
  }

  // Mismo día: corregir el abierto (no crear tramo idéntico de rango inválido)
  if (compareCivilDate(open.effectiveFrom, effectiveFrom) === 0) {
    const updated = sorted.map((t, i) =>
      i === openIdx ? snapshotToTerm(nextSnapshot, effectiveFrom, null) : t,
    );
    assertContractTermInvariants(updated);
    return { kind: 'updated_open', terms: updated };
  }

  if (compareCivilDate(effectiveFrom, open.effectiveFrom) <= 0) {
    throw new Error(
      `effectiveFrom (${effectiveFrom}) debe ser posterior al inicio del tramo abierto (${open.effectiveFrom})`,
    );
  }

  const dayBefore = previousCivilDay(effectiveFrom);
  const closed = sorted.map((t, i) =>
    i === openIdx ? { ...t, effectiveTo: dayBefore } : t,
  );
  const appended = [...closed, snapshotToTerm(nextSnapshot, effectiveFrom, null)];
  assertContractTermInvariants(appended);
  return { kind: 'appended', terms: appended };
}

/**
 * Reescribe un tramo histórico cerrado (por effectiveFrom).
 * No toca tramos posteriores ni el abierto salvo que sea ese.
 */
export function rewriteHistoricalTerm(
  terms: readonly ContractTermFact[],
  termEffectiveFrom: CivilDate,
  nextSnapshot: ContractualSnapshot,
): VersioningResult {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  const idx = sorted.findIndex(
    (t) => compareCivilDate(t.effectiveFrom, termEffectiveFrom) === 0,
  );
  if (idx < 0) {
    throw new Error(`No existe tramo con effectiveFrom=${termEffectiveFrom}`);
  }
  const target = sorted[idx]!;
  if (snapshotsEqual(termToSnapshot(target), nextSnapshot)) {
    return { kind: 'noop', terms: sorted };
  }
  const rewritten = sorted.map((t, i) =>
    i === idx
      ? {
          ...t,
          weeklyHours: nextSnapshot.weeklyHours,
          bagMode: nextSnapshot.bagMode,
          regime: nextSnapshot.regime,
          overtimeRatePerHour: nextSnapshot.overtimeRatePerHour,
        }
      : t,
  );
  assertContractTermInvariants(rewritten);
  return { kind: 'rewritten', terms: rewritten };
}
