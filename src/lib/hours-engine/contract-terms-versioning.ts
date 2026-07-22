/**
 * Único planificador de versionado contractual (puro).
 * No escribe BD. No toca liquidación ni Contract Resolver.
 *
 * Operación: splice histórico
 * - Localiza el tramo que contiene effectiveFrom
 * - Noop si el snapshot coincide
 * - Si D == inicio del tramo → reescribe in-place
 * - Si D > inicio → parte: izquierda (hasta D-1) + derecha (D → to original)
 * - Cola de tramos posteriores intacta
 * - Coalesce de vecinos con el mismo snapshot
 * - Invariantes: sin solapes, ≤1 abierto, sin huecos
 */

import type { CivilDate, ContractRegime, ContractTermFact } from './types.ts';
import { addCivilDays, compareCivilDate, isCivilDateInRange } from './week-dates.ts';
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
  | { kind: 'spliced'; terms: readonly ContractTermFact[] }
  | { kind: 'updated'; terms: readonly ContractTermFact[] }
  /** @deprecated Alias histórico de spliced (tests / callers antiguos). */
  | { kind: 'appended'; terms: readonly ContractTermFact[] }
  /** @deprecated Alias histórico de updated. */
  | { kind: 'updated_open'; terms: readonly ContractTermFact[] }
  | { kind: 'rewritten'; terms: readonly ContractTermFact[] }
  /** Mueve el inicio de un tramo y reajusta el anterior (sin huecos). */
  | { kind: 'rescheduled'; terms: readonly ContractTermFact[] };

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

export function findTermContaining(
  terms: readonly ContractTermFact[],
  day: CivilDate,
): ContractTermFact | null {
  for (const t of terms) {
    if (isCivilDateInRange(day, t.effectiveFrom, t.effectiveTo)) {
      return t;
    }
  }
  return null;
}

/** Fusiona vecinos consecutivos con el mismo snapshot contractual. */
export function coalesceIdenticalConsecutiveTerms(
  terms: readonly ContractTermFact[],
): ContractTermFact[] {
  if (terms.length === 0) return [];
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  const out: ContractTermFact[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = sorted[i]!;
    if (snapshotsEqual(termToSnapshot(prev), termToSnapshot(cur))) {
      out[out.length - 1] = {
        ...prev,
        effectiveTo: cur.effectiveTo,
      };
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Aplica un cambio contractual con fecha efectiva (splice histórico).
 * Preserva tramos que no contienen la fecha.
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
    const created = coalesceIdenticalConsecutiveTerms([
      snapshotToTerm(nextSnapshot, effectiveFrom, null),
    ]);
    assertContractTermInvariants(created);
    return { kind: 'created', terms: created };
  }

  const target = findTermContaining(sorted, effectiveFrom);
  if (!target) {
    const first = sorted[0]!;
    if (compareCivilDate(effectiveFrom, first.effectiveFrom) < 0) {
      throw new Error(
        `La fecha efectiva (${effectiveFrom}) es anterior al primer contrato (${first.effectiveFrom})`,
      );
    }
    throw new Error(
      `La fecha efectiva (${effectiveFrom}) no pertenece a ningún tramo contractual`,
    );
  }

  if (snapshotsEqual(termToSnapshot(target), nextSnapshot)) {
    assertContractTermInvariants(sorted);
    return { kind: 'noop', terms: sorted };
  }

  const idx = sorted.findIndex(
    (t) => compareCivilDate(t.effectiveFrom, target.effectiveFrom) === 0,
  );
  if (idx < 0) {
    throw new Error('Estado inconsistente: tramo localizado no encontrado');
  }

  // Exactamente el inicio del tramo → reescritura in-place
  if (compareCivilDate(effectiveFrom, target.effectiveFrom) === 0) {
    const updated = sorted.map((t, i) =>
      i === idx
        ? snapshotToTerm(nextSnapshot, t.effectiveFrom, t.effectiveTo)
        : t,
    );
    const coalesced = coalesceIdenticalConsecutiveTerms(updated);
    assertContractTermInvariants(coalesced);
    const wasOpen = target.effectiveTo === null;
    return {
      kind: wasOpen ? 'updated_open' : 'updated',
      terms: coalesced,
    };
  }

  // Dentro del tramo (D > from): partir
  const dayBefore = previousCivilDay(effectiveFrom);
  if (compareCivilDate(dayBefore, target.effectiveFrom) < 0) {
    throw new Error('Rango inválido al partir el tramo');
  }

  const left: ContractTermFact = {
    ...target,
    effectiveTo: dayBefore,
  };
  const right = snapshotToTerm(nextSnapshot, effectiveFrom, target.effectiveTo);

  const spliced = [
    ...sorted.slice(0, idx),
    left,
    right,
    ...sorted.slice(idx + 1),
  ];
  const coalesced = coalesceIdenticalConsecutiveTerms(spliced);
  assertContractTermInvariants(coalesced);

  // Compat: si el tramo partido era el abierto, callers antiguos esperan 'appended'
  if (target.effectiveTo === null) {
    return { kind: 'appended', terms: coalesced };
  }
  return { kind: 'spliced', terms: coalesced };
}

/**
 * Reescribe un tramo histórico por effectiveFrom (payload).
 * Equivale a applyContractualChange con D = inicio de ese tramo.
 */
export function rewriteHistoricalTerm(
  terms: readonly ContractTermFact[],
  termEffectiveFrom: CivilDate,
  nextSnapshot: ContractualSnapshot,
): VersioningResult {
  const plan = applyContractualChange(terms, nextSnapshot, termEffectiveFrom);
  if (plan.kind === 'noop') {
    return plan;
  }
  if (plan.kind === 'updated' || plan.kind === 'updated_open') {
    return { kind: 'rewritten', terms: plan.terms };
  }
  // Si por alguna razón no era el inicio, no debería ocurrir al pasar el from exacto
  return { kind: 'rewritten', terms: plan.terms };
}

/**
 * Mueve la fecha de inicio de un tramo (por su effectiveFrom original) y
 * recalcula el fin del tramo anterior para no dejar huecos.
 * También aplica el snapshot de condiciones al tramo movido.
 *
 * - Misma fecha → rewrite in-place (condiciones).
 * - Fecha posterior → el tramo anterior absorbe [oldFrom, newFrom-1].
 * - Fecha anterior → el tramo anterior se acorta hasta newFrom-1.
 */
export function rescheduleTermStart(
  terms: readonly ContractTermFact[],
  originalFrom: CivilDate,
  newFrom: CivilDate,
  nextSnapshot: ContractualSnapshot,
): VersioningResult {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  const idx = sorted.findIndex(
    (t) => compareCivilDate(t.effectiveFrom, originalFrom) === 0,
  );
  if (idx < 0) {
    throw new Error(`No hay tramo que empiece el ${originalFrom}`);
  }

  const target = sorted[idx]!;
  return rescheduleTermBounds(
    terms,
    originalFrom,
    newFrom,
    target.effectiveTo,
    nextSnapshot,
  );
}

/**
 * Mueve la fecha de fin de un tramo y recalcula el inicio del siguiente
 * (sin huecos). null = vigente (solo permitido en el último tramo).
 */
export function rescheduleTermEnd(
  terms: readonly ContractTermFact[],
  originalFrom: CivilDate,
  newTo: CivilDate | null,
  nextSnapshot: ContractualSnapshot,
): VersioningResult {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  const idx = sorted.findIndex(
    (t) => compareCivilDate(t.effectiveFrom, originalFrom) === 0,
  );
  if (idx < 0) {
    throw new Error(`No hay tramo que empiece el ${originalFrom}`);
  }
  const target = sorted[idx]!;
  return rescheduleTermBounds(
    terms,
    originalFrom,
    target.effectiveFrom,
    newTo,
    nextSnapshot,
  );
}

/**
 * Mueve inicio y/o fin de un tramo (identificado por effectiveFrom original).
 * Recalcula vecinos para no dejar huecos. Aplica el snapshot al tramo.
 */
export function rescheduleTermBounds(
  terms: readonly ContractTermFact[],
  originalFrom: CivilDate,
  newFrom: CivilDate,
  newTo: CivilDate | null,
  nextSnapshot: ContractualSnapshot,
): VersioningResult {
  const sorted = [...terms].sort((a, b) =>
    compareCivilDate(a.effectiveFrom, b.effectiveFrom),
  );
  const idx = sorted.findIndex(
    (t) => compareCivilDate(t.effectiveFrom, originalFrom) === 0,
  );
  if (idx < 0) {
    throw new Error(`No hay tramo que empiece el ${originalFrom}`);
  }

  const target = sorted[idx]!;
  const fromUnchanged = compareCivilDate(newFrom, originalFrom) === 0;
  const toUnchanged =
    (newTo === null && target.effectiveTo === null) ||
    (newTo !== null &&
      target.effectiveTo !== null &&
      compareCivilDate(newTo, target.effectiveTo) === 0);

  if (fromUnchanged && toUnchanged) {
    return rewriteHistoricalTerm(terms, originalFrom, nextSnapshot);
  }

  if (newTo !== null && compareCivilDate(newFrom, newTo) > 0) {
    throw new Error(
      `La fecha de inicio (${newFrom}) no puede ser posterior al fin (${newTo})`,
    );
  }

  if (newTo === null && idx < sorted.length - 1) {
    throw new Error(
      'Solo el último tramo puede quedar vigente (sin fecha de fin)',
    );
  }

  const updated = sorted.map((t) => ({ ...t }));

  // Ajustar tramo anterior si se mueve el inicio
  if (!fromUnchanged) {
    if (idx === 0) {
      // Solo cambia el from del primero
    } else {
      const prev = updated[idx - 1]!;
      if (compareCivilDate(newFrom, prev.effectiveFrom) <= 0) {
        throw new Error(
          `La fecha de inicio debe ser posterior al inicio del tramo anterior (${prev.effectiveFrom})`,
        );
      }
      updated[idx - 1] = { ...prev, effectiveTo: previousCivilDay(newFrom) };
    }
  }

  // Ajustar tramo siguiente si se mueve el fin
  if (!toUnchanged && idx < updated.length - 1) {
    if (newTo === null) {
      throw new Error(
        'Solo el último tramo puede quedar vigente (sin fecha de fin)',
      );
    }
    const next = updated[idx + 1]!;
    const nextFrom = nextCivilDay(newTo);
    if (
      next.effectiveTo !== null &&
      compareCivilDate(nextFrom, next.effectiveTo) > 0
    ) {
      throw new Error(
        `La fecha de fin (${newTo}) deja sin días el tramo siguiente (fin ${next.effectiveTo})`,
      );
    }
    updated[idx + 1] = { ...next, effectiveFrom: nextFrom };
  }

  updated[idx] = snapshotToTerm(nextSnapshot, newFrom, newTo);

  const coalesced = coalesceIdenticalConsecutiveTerms(updated);
  assertContractTermInvariants(coalesced);
  return { kind: 'rescheduled', terms: coalesced };
}
