import type { DiscrepancyCode } from './taxonomy.ts';
import type { CanonicalComparisonVector } from './canonical-vector.ts';

export const SHADOW_RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
] as const;

export type ShadowRunStatus = (typeof SHADOW_RUN_STATUSES)[number];

export type ShadowRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: ShadowRunStatus;
  horizonStart: string;
  horizonEnd: string;
  dryRun: boolean;
  engineVersion: string | null;
  errorMessage: string | null;
  /** Totales agregados (EMR, CDR, counts); rellenados al cerrar el run. */
  totals: ShadowRunTotals | null;
};

export type ShadowRunTotals = {
  subjectsCompared: number;
  exactMatches: number;
  toleratedMatches: number;
  diffs: number;
  skipped: number;
  exactMatchRate: number;
  criticalDiffRate: number;
  byCode: Partial<Record<DiscrepancyCode, number>>;
};

export const COMPARISON_MATCH_STATUSES = [
  'exact',
  'tolerated',
  'diff',
  'schema_gap',
  'skipped',
] as const;

export type ComparisonMatchStatus =
  (typeof COMPARISON_MATCH_STATUSES)[number];

/** Una comparación employee×week dentro de un run (referencia a vectores + outcome). */
export type ShadowComparison = {
  id: string;
  runId: string;
  employeeId: string;
  weekStart: string;
  matchStatus: ComparisonMatchStatus;
  heVector: CanonicalComparisonVector;
  sqlVector: CanonicalComparisonVector;
  /** IDs de ShadowDiscrepancy vinculadas (no embebe el ciclo de vida). */
  discrepancyIds: readonly string[];
  primaryDiscrepancyCode: DiscrepancyCode | null;
};
