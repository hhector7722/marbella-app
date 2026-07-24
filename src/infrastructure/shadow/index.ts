export {
  createSupabaseShadowComparisonStore,
  createSupabaseShadowDiscrepancyStore,
  createSupabaseShadowMetricsStore,
  createSupabaseShadowPersistence,
  createSupabaseShadowRunStore,
} from './supabase-shadow-persistence.ts';

export {
  resolveHorizonBounds,
  listWeekStartsInclusive,
  createSupabaseShadowSubjectLoader,
  createSupabaseShadowFactLoader,
  listShadowEmployeeIds,
  buildSubjectsCartesian,
} from './loaders/index.ts';

export {
  parseShadowCliArgs,
  SHADOW_CLI_HELP,
  type ShadowCliArgs,
} from './ops/parse-args.ts';
export { formatShadowRunSummary } from './ops/format-summary.ts';
export {
  runShadowOps,
  HOURS_ENGINE_SHADOW_LABEL,
  type RunShadowOpsInput,
  type ShadowOpsLogger,
} from './ops/run-shadow-ops.ts';
