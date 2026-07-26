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
  persistOvertimeCostFromEngine,
  recalcSnapshotsAndPersistOvertimeCost,
} from './persist-overtime-cost.ts';
export type {
  PersistOvertimeCostResult,
  RecalcAndPersistResult,
} from './persist-overtime-cost.ts';
export {
  persistOvertimeCostForEmployees,
  recalculateAllBalancesAndPersist,
} from './recalculate-and-persist-all.ts';
export type { RecalculateAllBalancesPersistResult } from './recalculate-and-persist-all.ts';
export { COST_ENGINE_COVERAGE_MATRIX } from './cost-engine-coverage.ts';
export {
  buildOvertimeWeeksFromSsot,
  type StaffWeeklyStats,
  type WeeklyStats,
  type BuildOvertimeWeeksOptions,
} from './overtime-weeks-ssot.ts';
export {
  buildLaborCostPeriodFromSsot,
  buildLaborCostDayDetailFromSsot,
  allocatePayrollToNaturalDays,
  PAYROLL_ORDINARY_ROW_ID,
  type LaborDayCell,
  type LaborDayWorker,
  type LaborCostPeriodResult,
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
  snapshotFromProfileFields,
  snapshotsEqual,
} from './contract-terms-versioning.ts';
export {
  persistContractualChange,
  persistHistoricalTermRewrite,
  persistTermBoundsReschedule,
  persistTermReschedule,
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
