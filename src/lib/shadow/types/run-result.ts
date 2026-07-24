import type { CanonicalComparisonVector } from './canonical-vector.ts';
import type { DiscrepancyCode, DiscrepancySeverity } from './taxonomy.ts';
import type {
  ComparisonMatchStatus,
  ShadowRunTotals,
} from './run.ts';
import type { CanonicalComparableField } from './canonical-vector.ts';

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

export type ShadowSubjectOutcome = {
  employeeId: string;
  weekStart: string;
  outcome: 'succeeded' | 'failed' | 'skipped';
  detail: string | null;
};

export type ShadowRunMetrics = {
  totalSubjects: number;
  exactMatches: number;
  toleratedMatches: number;
  criticalDifferences: number;
  comparisons: number;
  skipped: number;
  failed: number;
  succeeded: number;
  diffs: number;
  durationMs: number;
  exactMatchRate: number;
  criticalDiffRate: number;
  byCode: Readonly<Partial<Record<DiscrepancyCode, number>>>;
};

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
  subjectOutcomes: readonly ShadowSubjectOutcome[];
  totals: ShadowRunTotals;
};
