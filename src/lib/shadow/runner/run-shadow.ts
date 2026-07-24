import { createHeAdapter } from '../adapters/he-adapter.ts';
import { createSqlAdapter } from '../adapters/sql-adapter.ts';
import { compareCanonicalVectors } from '../comparator/compare.ts';
import { classifyCompareResult } from '../classifier/classify.ts';
import type { ShadowRunResult } from '../types/run-result.ts';
import type { ShadowRunComparisonItem } from '../types/run-result.ts';
import {
  computeShadowRunMetrics,
  matchStatusFromClassification,
  metricsToTotals,
} from './metrics.ts';
import type {
  ShadowFactLoader,
  ShadowRunnerOptions,
  ShadowSubject,
  ShadowSubjectLoader,
} from './ports.ts';
import type { ShadowPersistencePorts, ShadowRunPersistMeta } from '../persistence/ports.ts';
import { persistShadowRunResult } from '../persistence/persist-run.ts';
import { SHADOW_DOMAIN_VERSION } from '../version.ts';
import type { PersistShadowRunResult } from '../persistence/ports.ts';

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
 * Ejecuta un Shadow Run completo en memoria.
 * Sin escrituras. Determinista si clock/runId/duration son fijos.
 */
export function executeShadowRun(input: ExecuteShadowRunInput): ShadowRunResult {
  const startedAt = input.options.clock?.nowIso() ?? defaultNowIso();
  const runId = input.options.runId ?? crypto.randomUUID();
  const t0 =
    input.options.fixedDurationMs === undefined
      ? performance.now()
      : null;

  const subjectList = [...input.subjects.listSubjects()].sort(compareSubjects);
  const heAdapter = createHeAdapter();
  const sqlAdapter = createSqlAdapter();

  const comparisons: ShadowRunComparisonItem[] = [];
  let skipped = 0;

  try {
    for (const subject of subjectList) {
      const bundle = input.facts.loadFacts(subject);
      if (bundle == null || bundle.skip) {
        skipped += 1;
        continue;
      }

      const heVector = heAdapter.toCanonical({
        employeeId: subject.employeeId,
        weekStart: subject.weekStart,
        liquidation: bundle.liquidation,
        facts: bundle.heFacts,
        bagModeOverride: bundle.bagModeOverride,
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
    }

    const finishedAt = input.options.clock?.nowIso() ?? defaultNowIso();
    const durationMs =
      input.options.fixedDurationMs ??
      (t0 == null ? 0 : Math.max(0, Math.round(performance.now() - t0)));

    const metrics = computeShadowRunMetrics({
      comparisons,
      skipped,
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
      totals: metricsToTotals(metrics),
    };
  }
}

export type ExecuteAndPersistShadowRunInput = ExecuteShadowRunInput & {
  /** Si se omite, no hay side-effects de persistencia. */
  persistence?: ShadowPersistencePorts;
  persistMeta?: Partial<ShadowRunPersistMeta> & {
    hoursEngineVersion: string;
  };
};

export type ExecuteAndPersistShadowRunOutput = {
  result: ShadowRunResult;
  persist: PersistShadowRunResult | null;
};

/**
 * Runner con persistencia opcional vía puertos (nunca Supabase directo).
 */
export async function executeAndPersistShadowRun(
  input: ExecuteAndPersistShadowRunInput,
): Promise<ExecuteAndPersistShadowRunOutput> {
  const result = executeShadowRun(input);
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

/** Helper: loader de sujetos desde un array fijo (fixtures / dry-run futuro). */
export function subjectLoaderFromList(
  subjects: readonly ShadowSubject[],
): ShadowSubjectLoader {
  return {
    listSubjects() {
      return subjects;
    },
  };
}

/** Helper: fact loader desde mapa employeeId|weekStart → facts. */
export function factLoaderFromMap(
  map: ReadonlyMap<string, import('./ports.ts').ShadowSubjectFacts>,
): ShadowFactLoader {
  return {
    loadFacts(subject) {
      return map.get(`${subject.employeeId}|${subject.weekStart}`) ?? null;
    },
  };
}

export function subjectKey(s: ShadowSubject): string {
  return `${s.employeeId}|${s.weekStart}`;
}
