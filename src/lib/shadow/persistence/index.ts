export type {
  PersistShadowRunResult,
  ShadowComparisonRecord,
  ShadowComparisonStore,
  ShadowDiscrepancyStore,
  ShadowFieldDiffRecord,
  ShadowMetricsStore,
  ShadowPersistencePorts,
  ShadowRunPersistMeta,
  ShadowRunRecord,
  ShadowRunStore,
} from './ports.ts';

export {
  persistShadowRunResult,
  upsertObservedDiscrepancy,
  type UpsertObservedDiscrepancyResult,
} from './persist-run.ts';

export {
  createInMemoryComparisonStore,
  createInMemoryDiscrepancyStore,
  createInMemoryMetricsStore,
  createInMemoryRunStore,
  createInMemoryShadowPersistence,
} from './memory.ts';

/** @deprecated */
export function shadowPersistenceNotImplemented(): never {
  throw new Error(
    'shadow/persistence: usar persistShadowRunResult + ShadowPersistencePorts',
  );
}
