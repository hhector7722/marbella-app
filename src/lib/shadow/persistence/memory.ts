import type { ShadowDiscrepancy } from '../types/discrepancy.ts';
import type { ShadowRunMetrics } from '../types/run-result.ts';
import type {
  ShadowComparisonRecord,
  ShadowComparisonStore,
  ShadowDiscrepancyStore,
  ShadowFieldDiffRecord,
  ShadowMetricsStore,
  ShadowPersistencePorts,
  ShadowRunRecord,
  ShadowRunStore,
} from './ports.ts';

export function createInMemoryRunStore(
  seed: readonly ShadowRunRecord[] = [],
): ShadowRunStore & { readonly _rows: Map<string, ShadowRunRecord> } {
  const rows = new Map(seed.map((r) => [r.id, r]));
  return {
    _rows: rows,
    save(run) {
      rows.set(run.id, run);
    },
    getById(id) {
      return rows.get(id) ?? null;
    },
  };
}

export function createInMemoryComparisonStore(): ShadowComparisonStore & {
  readonly _comparisons: ShadowComparisonRecord[];
  readonly _diffs: ShadowFieldDiffRecord[];
} {
  const comparisons: ShadowComparisonRecord[] = [];
  const diffs: ShadowFieldDiffRecord[] = [];
  return {
    _comparisons: comparisons,
    _diffs: diffs,
    save(c) {
      comparisons.push(c);
    },
    saveFieldDiffs(rows) {
      diffs.push(...rows);
    },
  };
}

export function createInMemoryDiscrepancyStore(
  seed: readonly ShadowDiscrepancy[] = [],
): ShadowDiscrepancyStore & {
  list(): readonly ShadowDiscrepancy[];
} {
  const byFp = new Map<string, ShadowDiscrepancy>();
  const byId = new Map<string, ShadowDiscrepancy>();
  for (const d of seed) {
    byFp.set(d.fingerprint, d);
    byId.set(d.id, d);
  }
  return {
    getByFingerprint(fp) {
      return byFp.get(fp) ?? null;
    },
    getById(id) {
      return byId.get(id) ?? null;
    },
    listBySubject(employeeId, weekStart) {
      return [...byId.values()].filter(
        (d) => d.employeeId === employeeId && d.weekStart === weekStart,
      );
    },
    upsert(d) {
      byFp.set(d.fingerprint, d);
      byId.set(d.id, d);
    },
    list() {
      return [...byId.values()];
    },
  };
}

export function createInMemoryMetricsStore(): ShadowMetricsStore & {
  readonly _byRun: Map<string, ShadowRunMetrics>;
} {
  const byRun = new Map<string, ShadowRunMetrics>();
  return {
    _byRun: byRun,
    save(runId, metrics) {
      byRun.set(runId, metrics);
    },
  };
}

export function createInMemoryShadowPersistence(
  seedDiscrepancies: readonly ShadowDiscrepancy[] = [],
): ShadowPersistencePorts & {
  discrepancies: ReturnType<typeof createInMemoryDiscrepancyStore>;
  runs: ReturnType<typeof createInMemoryRunStore>;
  comparisons: ReturnType<typeof createInMemoryComparisonStore>;
  metrics: ReturnType<typeof createInMemoryMetricsStore>;
} {
  return {
    runs: createInMemoryRunStore(),
    comparisons: createInMemoryComparisonStore(),
    discrepancies: createInMemoryDiscrepancyStore(seedDiscrepancies),
    metrics: createInMemoryMetricsStore(),
  };
}
