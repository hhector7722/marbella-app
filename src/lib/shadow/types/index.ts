export {
  CANONICAL_COMPARABLE_FIELDS,
  type CanonicalComparableField,
  type CanonicalComparisonVector,
  type ShadowSubjectKey,
} from './canonical-vector.ts';

export {
  DISCREPANCY_STATUSES,
  DISCREPANCY_TRANSITIONS,
  type DiscrepancyStatus,
  type ShadowDiscrepancy,
} from './discrepancy.ts';

export {
  COMPARISON_MATCH_STATUSES,
  SHADOW_RUN_STATUSES,
  type ComparisonMatchStatus,
  type ShadowComparison,
  type ShadowRun,
  type ShadowRunStatus,
  type ShadowRunTotals,
} from './run.ts';

export type { ShadowMetrics } from './metrics.ts';
export type {
  ShadowDailyReport,
  ShadowReportAlertLine,
  ShadowReportRisk,
} from './report.ts';
export type { ShadowAlert } from './alert.ts';
export type { ShadowFieldDiff } from './field-diff.ts';

export {
  DISCREPANCY_CODES,
  type DiscrepancyCode,
  type DiscrepancyOwnerDomain,
  type DiscrepancySeverity,
} from './taxonomy.ts';
