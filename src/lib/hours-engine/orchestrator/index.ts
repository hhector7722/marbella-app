/**
 * API pública Fase 2 — Invalidation Orchestrator.
 * El núcleo determinista (Fase 1) permanece congelado.
 */

export {
  analyzeChange,
  applyFactChange,
  locateFirstAffectedWeek,
} from './invalidation-orchestrator.ts';
export { analyzeFactChangeImpact } from './impact-analyzer.ts';
export { propagateWeeks } from './propagate.ts';
export { MemoryFactStore, MemoryResultStore } from './memory-stores.ts';

export type {
  FactChange,
  ConfirmationDecision,
  ImpactReport,
  OrchestratorApplyResult,
} from './fact-change.ts';
export type { FactStore, ResultStore, EmployeeSeed } from './ports.ts';
export type { OrchestratorDeps } from './invalidation-orchestrator.ts';
