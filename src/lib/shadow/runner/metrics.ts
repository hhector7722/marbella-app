import type { DiscrepancyCode } from '../types/taxonomy.ts';
import type {
  ShadowRunComparisonItem,
  ShadowRunMetrics,
} from '../types/run-result.ts';
import type { ShadowRunTotals } from '../types/run.ts';
import type { ComparisonMatchStatus } from '../types/run.ts';

function rate(num: number, den: number): number {
  if (den === 0) return 0;
  // 4 decimales fijos → determinismo estable en JSON/asserts.
  return Math.round((num / den) * 10000) / 10000;
}

export function matchStatusFromClassification(input: {
  exact: boolean;
  fieldDiffs: readonly { discrepancyCode: DiscrepancyCode; severity: string }[];
}): ComparisonMatchStatus {
  if (input.exact || input.fieldDiffs.length === 0) return 'exact';
  const allRounding = input.fieldDiffs.every((d) => d.discrepancyCode === 'D004');
  if (allRounding) return 'tolerated';
  const anyGap = input.fieldDiffs.some((d) => d.discrepancyCode === 'D000');
  if (anyGap && input.fieldDiffs.every((d) => d.discrepancyCode === 'D000')) {
    return 'schema_gap';
  }
  return 'diff';
}

export function computeShadowRunMetrics(input: {
  comparisons: readonly ShadowRunComparisonItem[];
  skipped: number;
  durationMs: number;
}): ShadowRunMetrics {
  const { comparisons, skipped, durationMs } = input;
  let exactMatches = 0;
  let toleratedMatches = 0;
  let diffs = 0;
  let criticalDifferences = 0;
  const byCode: Partial<Record<DiscrepancyCode, number>> = {};

  for (const c of comparisons) {
    if (c.matchStatus === 'exact') exactMatches += 1;
    else if (c.matchStatus === 'tolerated') toleratedMatches += 1;
    else if (c.matchStatus === 'skipped') {
      /* no-op: skipped counted aparte */
    } else diffs += 1;

    for (const f of c.fieldDiffs) {
      byCode[f.discrepancyCode] = (byCode[f.discrepancyCode] ?? 0) + 1;
      if (f.severity === 'CRITICAL') criticalDifferences += 1;
    }
  }

  const compared = comparisons.length;
  const totalSubjects = compared + skipped;

  return {
    totalSubjects,
    exactMatches,
    toleratedMatches,
    criticalDifferences,
    comparisons: compared,
    skipped,
    diffs,
    durationMs,
    exactMatchRate: rate(exactMatches, compared),
    criticalDiffRate: rate(
      comparisons.filter((c) =>
        c.fieldDiffs.some((f) => f.severity === 'CRITICAL'),
      ).length,
      compared,
    ),
    byCode,
  };
}

export function metricsToTotals(m: ShadowRunMetrics): ShadowRunTotals {
  return {
    subjectsCompared: m.comparisons,
    exactMatches: m.exactMatches,
    toleratedMatches: m.toleratedMatches,
    diffs: m.diffs,
    skipped: m.skipped,
    exactMatchRate: m.exactMatchRate,
    criticalDiffRate: m.criticalDiffRate,
    byCode: { ...m.byCode },
  };
}
