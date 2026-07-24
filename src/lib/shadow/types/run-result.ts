import type { CanonicalComparisonVector } from './canonical-vector.ts';
import type { DiscrepancyCode, DiscrepancySeverity } from './taxonomy.ts';
import type {
  ComparisonMatchStatus,
  ShadowRunTotals,
} from './run.ts';
import type { CanonicalComparableField } from './canonical-vector.ts';

/** Una comparación clasificada dentro de un Shadow Run (solo memoria). */
export type ShadowRunComparisonItem = {
  employeeId: string;
  weekStart: string;
  matchStatus: ComparisonMatchStatus;
  heVector: CanonicalComparisonVector;
  sqlVector: CanonicalComparisonVector;
  primaryDiscrepancyCode: DiscrepancyCode | null;
  fieldDiffs: readonly {
    field: CanonicalComparableField;
    heValue: string | number | boolean | null;
    sqlValue: string | number | boolean | null;
    discrepancyCode: DiscrepancyCode;
    severity: DiscrepancySeverity;
  }[];
};

/** Métricas mínimas del Commit 6. */
export type ShadowRunMetrics = {
  totalSubjects: number;
  exactMatches: number;
  toleratedMatches: number;
  criticalDifferences: number;
  comparisons: number;
  skipped: number;
  diffs: number;
  /** ms — inyectable/fijo en tests para determinismo estricto. */
  durationMs: number;
  exactMatchRate: number;
  criticalDiffRate: number;
  byCode: Readonly<Partial<Record<DiscrepancyCode, number>>>;
};

/**
 * Única salida del Runner (Commit 6).
 * Sin persistencia. Sin efectos secundarios.
 */
export type ShadowRunResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: 'completed' | 'failed';
  horizonStart: string;
  horizonEnd: string;
  errorMessage: string | null;
  metrics: ShadowRunMetrics;
  comparisons: readonly ShadowRunComparisonItem[];
  /** Totales compatibles con ShadowRun.totals. */
  totals: ShadowRunTotals;
};
