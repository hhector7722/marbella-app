/**
 * Resumen de consola para Shadow Run (ops). Sin HTML / dashboard.
 */

import type {
  ExecuteAndPersistShadowRunOutput,
} from '../../../lib/shadow/runner/run-shadow.ts';
import type { ShadowRunResult } from '../../../lib/shadow/types/run-result.ts';

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function topCodes(
  byCode: Readonly<Partial<Record<string, number>>>,
  limit = 8,
): string[] {
  return Object.entries(byCode)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, limit)
    .map(([code, n]) => `  ${code} × ${n}`);
}

export function formatShadowRunSummary(
  output: ExecuteAndPersistShadowRunOutput,
  extras?: { persistEnabled: boolean },
): string {
  const r: ShadowRunResult = output.result;
  const m = r.metrics;
  const lines: string[] = [
    '',
    '══════════════════════════════════════',
    'Shadow Run',
    '══════════════════════════════════════',
    `Run Id:                 ${r.runId}`,
    `Status:                 ${r.status}`,
    `Horizon:                ${r.horizonStart} → ${r.horizonEnd}`,
    `Subjects:               ${m.totalSubjects}`,
    `  Succeeded:            ${m.succeeded}`,
    `  Failed:               ${m.failed}`,
    `  Skipped:              ${m.skipped}`,
    `Duration:               ${m.durationMs} ms`,
    `Exact Match:            ${m.exactMatches}`,
    `Tolerance:              ${m.toleratedMatches}`,
    `Critical Differences:   ${m.criticalDifferences}`,
    `EMR:                    ${pct(m.exactMatchRate)}`,
    `CDR:                    ${pct(m.criticalDiffRate)}`,
  ];

  if (r.errorMessage) {
    lines.push(`Run error:              ${r.errorMessage}`);
  }

  const tops = topCodes(m.byCode);
  lines.push('Top Discrepancies:');
  if (tops.length === 0) {
    lines.push('  (ninguna)');
  } else {
    lines.push(...tops);
  }

  if (extras?.persistEnabled) {
    if (output.persist) {
      lines.push(
        `Persist:                ok (comparisons=${output.persist.comparisonsSaved}, diffs=${output.persist.fieldDiffsSaved}, disc+${output.persist.discrepanciesCreated}/↑${output.persist.discrepanciesUpdated}/↺${output.persist.discrepanciesReopened}/✓${output.persist.discrepanciesClosed})`,
      );
    } else {
      lines.push('Persist:                solicitado pero sin resultado');
    }
  } else {
    lines.push('Persist:                dry-run (no escrito)');
  }

  const failures = r.subjectOutcomes.filter((o) => o.outcome === 'failed');
  if (failures.length > 0) {
    lines.push('Errors:');
    for (const f of failures.slice(0, 20)) {
      lines.push(
        `  ${f.employeeId} | ${f.weekStart} → ${f.detail ?? 'error'}`,
      );
    }
    if (failures.length > 20) {
      lines.push(`  … y ${failures.length - 20} más`);
    }
  }

  lines.push('══════════════════════════════════════', '');
  return lines.join('\n');
}
