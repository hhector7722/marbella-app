import type { CanonicalComparableField } from '../types/canonical-vector.ts';
import type {
  DiscrepancyStatus,
  ShadowDiscrepancy,
} from '../types/discrepancy.ts';
import type {
  DiscrepancyCode,
  DiscrepancyOwnerDomain,
  DiscrepancySeverity,
} from '../types/taxonomy.ts';
import { buildDiscrepancyFingerprint } from './fingerprint.ts';

export type CreateDiscrepancyInput = {
  employeeId: string;
  weekStart: string;
  discrepancyCode: DiscrepancyCode;
  affectedFields: readonly CanonicalComparableField[];
  severity: DiscrepancySeverity;
  owner: DiscrepancyOwnerDomain;
  notes?: string | null;
  nowIso?: string;
  id?: string;
};

export function createShadowDiscrepancy(
  input: CreateDiscrepancyInput,
): ShadowDiscrepancy {
  const now = input.nowIso ?? new Date().toISOString();
  const fingerprint = buildDiscrepancyFingerprint({
    employeeId: input.employeeId,
    weekStart: input.weekStart,
    discrepancyCode: input.discrepancyCode,
    affectedFields: input.affectedFields,
  });
  return {
    id: input.id ?? crypto.randomUUID(),
    fingerprint,
    firstSeenAt: now,
    lastSeenAt: now,
    occurrences: 1,
    status: 'NEW',
    owner: input.owner,
    severity: input.severity,
    discrepancyCode: input.discrepancyCode,
    affectedFields: [...input.affectedFields],
    accepted: false,
    notes: input.notes ?? null,
    resolvedAt: null,
    employeeId: input.employeeId,
    weekStart: input.weekStart,
  };
}

/** Marca que la discrepancia volvió a aparecer en un run. */
export function touchDiscrepancyOccurrence(
  d: ShadowDiscrepancy,
  nowIso?: string,
): ShadowDiscrepancy {
  const now = nowIso ?? new Date().toISOString();
  return {
    ...d,
    lastSeenAt: now,
    occurrences: d.occurrences + 1,
  };
}

export function withDiscrepancyStatus(
  d: ShadowDiscrepancy,
  status: DiscrepancyStatus,
  nowIso?: string,
): ShadowDiscrepancy {
  const now = nowIso ?? new Date().toISOString();
  const accepted = status === 'ACCEPTED' ? true : d.accepted;
  const resolvedAt =
    status === 'CLOSED' || status === 'VERIFIED' || status === 'FIXED'
      ? (d.resolvedAt ?? now)
      : status === 'NEW' || status === 'CONFIRMED' || status === 'INVESTIGATING'
        ? null
        : d.resolvedAt;
  return {
    ...d,
    status,
    accepted,
    resolvedAt,
    lastSeenAt: now,
  };
}
