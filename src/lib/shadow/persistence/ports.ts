import type { ShadowDiscrepancy } from '../types/discrepancy.ts';
import type { ShadowRunResult, ShadowRunMetrics } from '../types/run-result.ts';
import type { ComparisonMatchStatus } from '../types/run.ts';
import type { DiscrepancyCode, DiscrepancySeverity } from '../types/taxonomy.ts';
import type { CanonicalComparableField } from '../types/canonical-vector.ts';

/** Metadatos de reproducibilidad de un run. */
export type ShadowRunPersistMeta = {
  hoursEngineVersion: string;
  shadowVersion: string;
  /** Configuración del run (horizonte, flags de compare, etc.). */
  config: Readonly<Record<string, unknown>>;
};

export type ShadowRunRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: 'completed' | 'failed';
  horizonStart: string;
  horizonEnd: string;
  durationMs: number;
  hoursEngineVersion: string;
  shadowVersion: string;
  config: Readonly<Record<string, unknown>>;
  errorMessage: string | null;
};

export type ShadowComparisonRecord = {
  id: string;
  runId: string;
  employeeId: string;
  weekStart: string;
  matchStatus: ComparisonMatchStatus;
  primaryDiscrepancyCode: DiscrepancyCode | null;
  /** Fingerprints de discrepancias tocadas (no embebe entidades). */
  discrepancyFingerprints: readonly string[];
};

export type ShadowFieldDiffRecord = {
  id: string;
  comparisonId: string;
  runId: string;
  field: CanonicalComparableField;
  heValue: string | number | boolean | null;
  sqlValue: string | number | boolean | null;
  discrepancyCode: DiscrepancyCode;
  severity: DiscrepancySeverity;
};

export type ShadowRunStore = {
  save(run: ShadowRunRecord): void | Promise<void>;
  getById(id: string): ShadowRunRecord | null | Promise<ShadowRunRecord | null>;
};

export type ShadowComparisonStore = {
  save(comparison: ShadowComparisonRecord): void | Promise<void>;
  saveFieldDiffs(diffs: readonly ShadowFieldDiffRecord[]): void | Promise<void>;
};

/**
 * Entidad principal de migración.
 * Identidad = fingerprint. Nunca duplicar.
 */
export type ShadowDiscrepancyStore = {
  getByFingerprint(
    fingerprint: string,
  ): ShadowDiscrepancy | null | Promise<ShadowDiscrepancy | null>;
  getById(id: string): ShadowDiscrepancy | null | Promise<ShadowDiscrepancy | null>;
  listBySubject(
    employeeId: string,
    weekStart: string,
  ): readonly ShadowDiscrepancy[] | Promise<readonly ShadowDiscrepancy[]>;
  upsert(d: ShadowDiscrepancy): void | Promise<void>;
};

export type ShadowMetricsStore = {
  save(runId: string, metrics: ShadowRunMetrics): void | Promise<void>;
};

/** Bundle de puertos — lo único que el Runner puede conocer. */
export type ShadowPersistencePorts = {
  runs: ShadowRunStore;
  comparisons: ShadowComparisonStore;
  discrepancies: ShadowDiscrepancyStore;
  metrics: ShadowMetricsStore;
};

export type PersistShadowRunResult = {
  runId: string;
  discrepanciesCreated: number;
  discrepanciesUpdated: number;
  discrepanciesClosed: number;
  discrepanciesReopened: number;
  comparisonsSaved: number;
  fieldDiffsSaved: number;
};
