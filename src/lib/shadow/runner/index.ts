export type {
  ShadowFactLoadResult,
  ShadowFactLoader,
  ShadowRunnerClock,
  ShadowRunnerOptions,
  ShadowSubject,
  ShadowSubjectFacts,
  ShadowSubjectLoader,
} from './ports.ts';

export {
  computeShadowRunMetrics,
  matchStatusFromClassification,
  metricsToTotals,
} from './metrics.ts';

export {
  executeAndPersistShadowRun,
  executeShadowRun,
  factLoaderFromMap,
  subjectKey,
  subjectLoaderFromList,
  type ExecuteAndPersistShadowRunInput,
  type ExecuteAndPersistShadowRunOutput,
  type ExecuteShadowRunInput,
} from './run-shadow.ts';

/** @deprecated scaffolding */
export function runShadowParityNotImplemented(): never {
  throw new Error('shadow/runner: usar executeShadowRun / executeAndPersistShadowRun');
}
