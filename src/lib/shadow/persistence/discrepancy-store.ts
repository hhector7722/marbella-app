import type { ShadowDiscrepancy } from '../types/discrepancy.ts';
import {
  createShadowDiscrepancy,
  touchDiscrepancyOccurrence,
  type CreateDiscrepancyInput,
} from '../discrepancy/factory.ts';
import { buildDiscrepancyFingerprint } from '../discrepancy/fingerprint.ts';

/**
 * Puerto de persistencia de discrepancias (identidad por fingerprint).
 * Commit 7 añadirá implementación Supabase; aquí: memoria + contrato.
 */
export type DiscrepancyStore = {
  getByFingerprint(fingerprint: string): ShadowDiscrepancy | null;
  getById(id: string): ShadowDiscrepancy | null;
  upsert(d: ShadowDiscrepancy): void;
  list(): readonly ShadowDiscrepancy[];
};

export function createInMemoryDiscrepancyStore(
  seed: readonly ShadowDiscrepancy[] = [],
): DiscrepancyStore {
  const byFp = new Map<string, ShadowDiscrepancy>();
  const byId = new Map<string, ShadowDiscrepancy>();
  for (const d of seed) {
    byFp.set(d.fingerprint, d);
    byId.set(d.id, d);
  }
  return {
    getByFingerprint(fp) {
      return byFp.get(fp) ?? null;
    },
    getById(id) {
      return byId.get(id) ?? null;
    },
    upsert(d) {
      byFp.set(d.fingerprint, d);
      byId.set(d.id, d);
    },
    list() {
      return [...byId.values()];
    },
  };
}

export type UpsertObservedDiscrepancyResult = {
  discrepancy: ShadowDiscrepancy;
  /** true si ya existía (occurrences++). */
  wasExisting: boolean;
  /** true si estaba CLOSED/VERIFIED y reaparece → regresión de migración. */
  isRegression: boolean;
};

/**
 * Agrupa antes de persistir: reutiliza fingerprint, actualiza occurrences/last_seen.
 */
export function upsertObservedDiscrepancy(
  store: DiscrepancyStore,
  input: CreateDiscrepancyInput,
): UpsertObservedDiscrepancyResult {
  const fingerprint = buildDiscrepancyFingerprint({
    employeeId: input.employeeId,
    weekStart: input.weekStart,
    discrepancyCode: input.discrepancyCode,
    affectedFields: input.affectedFields,
  });
  const existing = store.getByFingerprint(fingerprint);
  const now = input.nowIso ?? new Date().toISOString();

  if (!existing) {
    const created = createShadowDiscrepancy({ ...input, nowIso: now });
    store.upsert(created);
    return { discrepancy: created, wasExisting: false, isRegression: false };
  }

  const isRegression =
    existing.status === 'CLOSED' ||
    existing.status === 'VERIFIED' ||
    existing.status === 'FIXED';

  let next = touchDiscrepancyOccurrence(existing, now);
  if (isRegression && existing.status !== 'INVESTIGATING') {
    // Reabre investigación sin perder historial de occurrences.
    next = {
      ...next,
      status: 'INVESTIGATING',
      resolvedAt: null,
      accepted: false,
    };
  }
  store.upsert(next);
  return { discrepancy: next, wasExisting: true, isRegression };
}
