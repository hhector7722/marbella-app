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
  liquidateWeekForCard,
  overtimeRateForWeek,
  patchWeeksFromLiquidation,
  weekCardSummaryFromLiquidation,
} from './week-card-from-liquidation.ts';
export type { WeekCardSummaryFromEngine } from './week-card-from-liquidation.ts';
export { loadEmployeeBoundaryFacts } from './load-employee-facts.ts';
export {
  applyContractualChange,
  assertContractTermInvariants,
  coalesceIdenticalConsecutiveTerms,
  findTermContaining,
  rewriteHistoricalTerm,
  snapshotFromProfileFields,
  snapshotsEqual,
} from './contract-terms-versioning.ts';
export {
  persistContractualChange,
  persistHistoricalTermRewrite,
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
