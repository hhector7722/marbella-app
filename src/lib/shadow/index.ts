/**
 * Shadow Domain — bounded context de **Migración** (SSOT Phase 1).
 *
 * Independiente de Liquidation (Hours Engine) y del productor SQL.
 * Solo conoce: Canonical Comparison Vector, Discrepancy, Run, Metrics, Report, Alert.
 *
 * Dependencias permitidas hacia fuera:
 *   HE  → HeAdapter → CanonicalComparisonVector
 *   SQL → SqlAdapter → CanonicalComparisonVector
 *
 * Prohibido: importar liquidateWeek / fn_recalc / mutar productores.
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
  createInMemoryDiscrepancyStore,
  upsertObservedDiscrepancy,
  type DiscrepancyStore,
  type UpsertObservedDiscrepancyResult,
} from './persistence/index.ts';
