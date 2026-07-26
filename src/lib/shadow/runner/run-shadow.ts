import { createHeAdapter } from '../adapters/he-adapter.ts';
import { createSqlAdapter } from '../adapters/sql-adapter.ts';
import { compareCanonicalVectors } from '../comparator/compare.ts';
import { classifyCompareResult } from '../classifier/classify.ts';
import type { ShadowRunResult } from '../types/run-result.ts';
import type {
  ShadowRunComparisonItem,
  ShadowSubjectOutcome,
} from '../types/run-result.ts';
import {
  computeShadowRunMetrics,
  matchStatusFromClassification,
  metricsToTotals,
} from './metrics.ts';
import type {
  ShadowFactLoadResult,
  ShadowFactLoader,
  ShadowRunnerOptions,
  ShadowSubject,
  ShadowSubjectFacts,
  ShadowSubjectLoader,
} from './ports.ts';
import type {
  ShadowPersistencePorts,
  ShadowRunPersistMeta,
  PersistShadowRunResult,
} from '../persistence/ports.ts';
import { persistShadowRunResult } from '../persistence/persist-run.ts';
import { SHADOW_DOMAIN_VERSION } from '../version.ts';

export type ExecuteShadowRunInput = {
  subjects: ShadowSubjectLoader;
  facts: ShadowFactLoader;
  options: ShadowRunnerOptions;
};

function compareSubjects(a: ShadowSubject, b: ShadowSubject): number {
  const e = a.employeeId.localeCompare(b.employeeId);
  if (e !== 0) return e;
  return a.weekStart.localeCompare(b.weekStart);
}

function defaultNowIso(): string {
  return new Date().toISOString();
}

/**
 * Ejecuta un Shadow Run.
 * Fallos por sujeto no abortan el run.
 * Determinista si clock/runId/duration son fijos y loaders son deterministas.
 */
export async function executeShadowRun(
  input: ExecuteShadowRunInput,
): Promise<ShadowRunResult> {
  const startedAt = input.options.clock?.nowIso() ?? defaultNowIso();
  const runId = input.options.runId ?? crypto.randomUUID();
  const t0 =
    input.options.fixedDurationMs === undefined
      ? performance.now()
      : null;

  const subjectList = [...(await input.subjects.listSubjects())].sort(
    compareSubjects,
  );
  const heAdapter = createHeAdapter();
  const sqlAdapter = createSqlAdapter();

  const comparisons: ShadowRunComparisonItem[] = [];
  const subjectOutcomes: ShadowSubjectOutcome[] = [];
  let skipped = 0;
  let failed = 0;

  try {
    for (const subject of subjectList) {
      let loaded: ShadowFactLoadResult;
      try {
        loaded = await input.facts.loadFacts(subject);
      } catch (err) {
        failed += 1;
        subjectOutcomes.push({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          outcome: 'failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (loaded.status === 'skip') {
        skipped += 1;
        subjectOutcomes.push({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          outcome: 'skipped',
          detail: loaded.reason,
        });
        continue;
      }

      if (loaded.status === 'error') {
        failed += 1;
        subjectOutcomes.push({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          outcome: 'failed',
          detail: loaded.error,
        });
        continue;
      }

      try {
        const bundle = loaded.facts;
        const heVector = heAdapter.toCanonical({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          liquidation: bundle.liquidation,
          employee: bundle.employee,
          facts: bundle.heFacts,
          bagModeOverride: bundle.bagModeOverride,
          overrideRate: bundle.overrideRate,
        });

        const sqlVector = sqlAdapter.toCanonical({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          snapshot: bundle.snapshot,
          profilePreferStock: bundle.profilePreferStock,
        });

        const raw = compareCanonicalVectors(heVector, sqlVector);
        const classified = classifyCompareResult(raw);
        const matchStatus = matchStatusFromClassification(classified);

        const fieldDiffs = [...classified.fieldDiffs]
          .map((f) => ({
            field: f.field,
            heValue: f.heValue,
            sqlValue: f.sqlValue,
            discrepancyCode: f.discrepancyCode,
            severity: f.severity,
          }))
          .sort((a, b) => a.field.localeCompare(b.field));

        comparisons.push({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          matchStatus,
          heVector,
          sqlVector,
          primaryDiscrepancyCode: classified.primaryCode,
          fieldDiffs,
        });
        subjectOutcomes.push({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          outcome: 'succeeded',
          detail: matchStatus,
        });
      } catch (err) {
        failed += 1;
        subjectOutcomes.push({
          employeeId: subject.employeeId,
          weekStart: subject.weekStart,
          outcome: 'failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const finishedAt = input.options.clock?.nowIso() ?? defaultNowIso();
    const durationMs =
      input.options.fixedDurationMs ??
      (t0 == null ? 0 : Math.max(0, Math.round(performance.now() - t0)));

    const metrics = computeShadowRunMetrics({
      comparisons,
      skipped,
      failed,
      durationMs,
    });

    return {
      runId,
      startedAt,
      finishedAt,
      status: 'completed',
      horizonStart: input.options.horizonStart,
      horizonEnd: input.options.horizonEnd,
      errorMessage: null,
      metrics,
      comparisons,
      subjectOutcomes,
      totals: metricsToTotals(metrics),
    };
  } catch (err) {
    const finishedAt = input.options.clock?.nowIso() ?? defaultNowIso();
    const durationMs =
      input.options.fixedDurationMs ??
      (t0 == null ? 0 : Math.max(0, Math.round(performance.now() - t0)));
    const message = err instanceof Error ? err.message : String(err);
    const metrics = computeShadowRunMetrics({
      comparisons,
      skipped,
      failed,
      durationMs,
    });
    return {
      runId,
      startedAt,
      finishedAt,
      status: 'failed',
      horizonStart: input.options.horizonStart,
      horizonEnd: input.options.horizonEnd,
      errorMessage: message,
      metrics,
      comparisons,
      subjectOutcomes,
      totals: metricsToTotals(metrics),
    };
  }
}

export type ExecuteAndPersistShadowRunInput = ExecuteShadowRunInput & {
  persistence?: ShadowPersistencePorts;
  persistMeta?: Partial<ShadowRunPersistMeta> & {
    hoursEngineVersion: string;
  };
};

export type ExecuteAndPersistShadowRunOutput = {
  result: ShadowRunResult;
  persist: PersistShadowRunResult | null;
};

export async function executeAndPersistShadowRun(
  input: ExecuteAndPersistShadowRunInput,
): Promise<ExecuteAndPersistShadowRunOutput> {
  const result = await executeShadowRun(input);
  if (!input.persistence) {
    return { result, persist: null };
  }
  const meta: ShadowRunPersistMeta = {
    hoursEngineVersion: input.persistMeta?.hoursEngineVersion ?? 'unknown',
    shadowVersion: input.persistMeta?.shadowVersion ?? SHADOW_DOMAIN_VERSION,
    config: {
      horizonStart: input.options.horizonStart,
      horizonEnd: input.options.horizonEnd,
      ...(input.persistMeta?.config ?? {}),
    },
  };
  const persist = await persistShadowRunResult(
    input.persistence,
    result,
    meta,
  );
  return { result, persist };
}

export function subjectLoaderFromList(
  subjects: readonly ShadowSubject[],
): ShadowSubjectLoader {
  return {
    listSubjects() {
      return subjects;
    },
  };
}

export function factLoaderFromMap(
  map: ReadonlyMap<string, ShadowSubjectFacts>,
): ShadowFactLoader {
  return {
    loadFacts(subject) {
      const facts = map.get(`${subject.employeeId}|${subject.weekStart}`);
      if (!facts) {
        return { status: 'skip', reason: 'not_in_map' };
      }
      if ((facts as ShadowSubjectFacts & { skip?: boolean }).skip) {
        return {
          status: 'skip',
          reason:
            (facts as ShadowSubjectFacts & { skipReason?: string })
              .skipReason ?? 'skipped',
        };
      }
      return { status: 'ready', facts };
    },
  };
}

export function subjectKey(s: ShadowSubject): string {
  return `${s.employeeId}|${s.weekStart}`;
}
