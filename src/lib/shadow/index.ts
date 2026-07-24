/**
 * Shadow Domain — bounded context de **Migración** (SSOT Phase 1).
 *
 * Independiente de Liquidation (Hours Engine) y del productor SQL.
 * Persistencia solo vía puertos (nunca Supabase en este módulo).
 */

export * from './types/index.ts';
export * from './adapters/index.ts';
export * from './discrepancy/index.ts';
export {
  canTransitionDiscrepancyStatus,
  InvalidDiscrepancyTransitionError,
  transitionDiscrepancy,
} from './resolver/index.ts';
export {
  createInMemoryComparisonStore,
  createInMemoryDiscrepancyStore,
  createInMemoryMetricsStore,
  createInMemoryRunStore,
  createInMemoryShadowPersistence,
  persistShadowRunResult,
  upsertObservedDiscrepancy,
  type PersistShadowRunResult,
  type ShadowComparisonRecord,
  type ShadowComparisonStore,
  type ShadowDiscrepancyStore,
  type ShadowFieldDiffRecord,
  type ShadowMetricsStore,
  type ShadowPersistencePorts,
  type ShadowRunPersistMeta,
  type ShadowRunRecord,
  type ShadowRunStore,
  type UpsertObservedDiscrepancyResult,
} from './persistence/index.ts';
export {
  compareCanonicalVectors,
  type CanonicalCompareResult,
  type RawCanonicalFieldDelta,
} from './comparator/index.ts';
export {
  classifyCompareResult,
  classifyFieldDelta,
  ROUNDING_EPSILON_HOURS,
  type ClassifiedFieldDiff,
  type ClassifyCompareResult,
} from './classifier/index.ts';
export {
  executeAndPersistShadowRun,
  executeShadowRun,
  factLoaderFromMap,
  subjectKey,
  subjectLoaderFromList,
  computeShadowRunMetrics,
  matchStatusFromClassification,
  metricsToTotals,
  type ExecuteAndPersistShadowRunInput,
  type ExecuteAndPersistShadowRunOutput,
  type ExecuteShadowRunInput,
  type ShadowFactLoadResult,
  type ShadowFactLoader,
  type ShadowRunnerClock,
  type ShadowRunnerOptions,
  type ShadowSubject,
  type ShadowSubjectFacts,
  type ShadowSubjectLoader,
} from './runner/index.ts';
export { SHADOW_DOMAIN_VERSION } from './version.ts';
