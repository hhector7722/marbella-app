export {
  createInMemoryDiscrepancyStore,
  upsertObservedDiscrepancy,
  type DiscrepancyStore,
  type UpsertObservedDiscrepancyResult,
} from './discrepancy-store.ts';

/** @deprecated scaffolding */
export function shadowPersistenceNotImplemented(): never {
  throw new Error(
    'shadow/persistence: usar createInMemoryDiscrepancyStore (Supabase en Commit 7)',
  );
}
