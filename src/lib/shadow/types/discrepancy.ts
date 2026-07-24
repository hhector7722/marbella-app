import type {
  DiscrepancyCode,
  DiscrepancyOwnerDomain,
  DiscrepancySeverity,
} from './taxonomy.ts';
import type { CanonicalComparableField } from './canonical-vector.ts';

/**
 * Ciclo de vida de una discrepancia de migración.
 * NEW → CONFIRMED → INVESTIGATING → ACCEPTED | FIXED → VERIFIED → CLOSED
 */
export const DISCREPANCY_STATUSES = [
  'NEW',
  'CONFIRMED',
  'INVESTIGATING',
  'ACCEPTED',
  'FIXED',
  'VERIFIED',
  'CLOSED',
] as const;

export type DiscrepancyStatus = (typeof DISCREPANCY_STATUSES)[number];

/** Transiciones permitidas (resolver las aplicará). */
export const DISCREPANCY_TRANSITIONS: Readonly<
  Record<DiscrepancyStatus, readonly DiscrepancyStatus[]>
> = {
  NEW: ['CONFIRMED', 'INVESTIGATING', 'ACCEPTED', 'CLOSED'],
  CONFIRMED: ['INVESTIGATING', 'ACCEPTED', 'FIXED', 'CLOSED'],
  INVESTIGATING: ['ACCEPTED', 'FIXED', 'CONFIRMED', 'CLOSED'],
  ACCEPTED: ['INVESTIGATING', 'VERIFIED', 'CLOSED'],
  FIXED: ['VERIFIED', 'INVESTIGATING', 'CLOSED'],
  VERIFIED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: [],
};

/**
 * Entidad persistente con identidad propia (fingerprint).
 * Los runs referencian discrepancias; no duplican el ciclo de vida.
 */
export type ShadowDiscrepancy = {
  id: string;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  status: DiscrepancyStatus;
  owner: DiscrepancyOwnerDomain;
  severity: DiscrepancySeverity;
  discrepancyCode: DiscrepancyCode;
  affectedFields: readonly CanonicalComparableField[];
  accepted: boolean;
  notes: string | null;
  resolvedAt: string | null;
  employeeId: string;
  weekStart: string;
};
