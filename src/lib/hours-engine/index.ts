/**
 * API pública del núcleo determinista (Fase 1).
 * Único punto de importación recomendado para consumidores internos futuros.
 */

export { resolveEffectiveContract } from './contract-resolver.ts';
export { aggregateWeekAttendance } from './attendance-aggregator.ts';
export { applyRegimeToSegment } from './regime-policy.ts';
export { computeCarry } from './carry-engine.ts';
export { buildDailyBreakdown } from './daily-breakdown.ts';
export { liquidateWeek } from './liquidation-engine.ts';
export {
  appendContractTerm,
  assertTermsNonOverlapping,
  employeeFactsFromContractTerms,
  extrasByDayFromLiquidation,
  liquidateWeekExtrasByDay,
  mapContractTermRows,
  patchWeeksDailyExtrasFromEngine,
} from './ui-bridge.ts';
export {
  assertCardMatchesLiquidation,
  costSegmentsForLiquidation,
  liquidateWeekForCard,
  netPayableHoursFromLiquidation,
  overtimeRateForWeek,
  patchWeeksFromLiquidation,
  priceLiquidationOvertime,
  settlementRateAtWeekStart,
  weekCardSummaryFromLiquidation,
} from './week-card-from-liquidation.ts';
export type { WeekCardSummaryFromEngine } from './week-card-from-liquidation.ts';
export {
  hasOvertimeRateOverride,
  priceWeekOvertime,
} from './overtime-cost-engine.ts';
export type {
  OvertimeCostSegment,
  PriceWeekOvertimeInput,
  PriceWeekOvertimeResult,
} from './overtime-cost-engine.ts';
export {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from './opening-carry.ts';
export { mondayOnOrBefore, nextWeekStart, previousWeekStart, weekBounds } from './week-dates.ts';
export { loadEmployeeBoundaryFacts } from './load-employee-facts.ts';
export {
  persistOvertimeCostForEmployees,
  recalculateAllBalancesAndPersist,
  writeProjectionFromWeek,
  writeProjectionForEmployees,
} from './recalculate-and-persist-all.ts';
export type {
  RecalculateAllBalancesPersistResult,
  WriteProjectionForEmployeesResult,
} from './recalculate-and-persist-all.ts';

/**
 * @deprecated Fase 1b: sin callers de producción. Usar writeWeeklyProjection /
 * writeProjectionFromWeek. Se mantienen las definiciones en persist-overtime-cost.ts
 * solo como legado inerte.
 */
export {
  persistOvertimeCostFromEngine,
  recalcSnapshotsAndPersistOvertimeCost,
} from './persist-overtime-cost.ts';
export type {
  PersistOvertimeCostResult,
  RecalcAndPersistResult,
} from './persist-overtime-cost.ts';

/** Writer único de proyección HE+Cost → weekly_snapshots. */
export {
  writeWeeklyProjection,
  mapEnginesToProjectionRow,
  validateProjectionBatch,
  validateWriterPreconditions,
  HOURS_ENGINE_VERSION,
  COST_ENGINE_VERSION,
  PROJECTION_CONTRACT_VERSION,
  buildProjectionMetadata,
} from './projection/index.ts';
export type {
  WriteWeeklyProjectionInput,
  WriteWeeklyProjectionResult,
  WeeklyProjectionDomainRow,
  ProjectionProcessKind,
  ProjectionGenerationMetadata,
  ProjectionWeekCandidate,
} from './projection/index.ts';

export { COST_ENGINE_COVERAGE_MATRIX } from './cost-engine-coverage.ts';
export {
  buildOvertimeWeeksFromSsot,
  type StaffWeeklyStats,
  type WeeklyStats,
  type BuildOvertimeWeeksOptions,
} from './overtime-weeks-ssot.ts';
export type {
  LaborDayCell,
  LaborDayWorker,
  LaborCostPeriodResult,
} from './labor-cost-ssot.ts';
export { ordinaryHourlyRateFromSsot } from './ordinary-rate-ssot.ts';
export {
  applyContractualChange,
  assertContractTermInvariants,
  coalesceIdenticalConsecutiveTerms,
  findTermContaining,
  rewriteHistoricalTerm,
  rescheduleTermBounds,
  rescheduleTermEnd,
  rescheduleTermStart,
  deleteContractTerm,
  snapshotFromProfileFields,
  snapshotsEqual,
} from './contract-terms-versioning.ts';
export {
  persistContractualChange,
  persistHistoricalTermRewrite,
  persistTermBoundsReschedule,
  persistTermReschedule,
  persistTermDeletion,
} from './persist-contract-terms.ts';

export type {
  ContractualSnapshot,
  VersioningResult,
} from './contract-terms-versioning.ts';

export type {
  CivilDate,
  ContractRegime,
  ContractTermFact,
  ContractSegment,
  EffectiveContractWeek,
  TimeLogFact,
  EmployeeBoundaryFacts,
  LiquidationInput,
  LiquidationResult,
  SegmentLiquidation,
  AttendanceWeek,
  SegmentRegime,
  DailyBreakdown,
  DailyBreakdownDay,
} from './types.ts';

export type {
  ContractTermRow,
  EmployeeBoundaryRow,
} from './ui-bridge.ts';
export type { CarryInput, CarryResult, CarrySegmentPart } from './carry-engine.ts';
export type { RegimeSegmentInput } from './regime-policy.ts';
export type { DailyBreakdownSegmentInput } from './daily-breakdown.ts';
