export type {
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
  executeShadowRun,
  factLoaderFromMap,
  subjectKey,
  subjectLoaderFromList,
} from './run-shadow.ts';

/** @deprecated scaffolding */
export function runShadowParityNotImplemented(): never {
  throw new Error('shadow/runner: usar executeShadowRun');
}
