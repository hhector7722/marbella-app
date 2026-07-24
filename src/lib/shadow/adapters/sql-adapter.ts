import type { CanonicalComparisonVector } from '../types/canonical-vector.ts';

/**
 * Puerto de entrada al Shadow Domain desde el productor SQL.
 *
 * Implementación real (Commit 2): weekly_snapshots / stats → CanonicalComparisonVector.
 * No importa supabase ni SQL en el scaffolding.
 */
export type SqlAdapterInput = {
  employeeId: string;
  weekStart: string;
  /** Fila snapshot u objeto stats — opaco en el contrato del dominio. */
  snapshot: unknown;
  stats?: unknown;
};

export type SqlAdapter = {
  toCanonical(input: SqlAdapterInput): CanonicalComparisonVector;
};

export function createSqlAdapterStub(): SqlAdapter {
  return {
    toCanonical() {
      throw new Error(
        'shadow/adapters: SqlAdapter no implementado (Commit 2)',
      );
    },
  };
}
