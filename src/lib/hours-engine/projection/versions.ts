/**
 * Versiones de metadata del Writer de proyección (PROJECTION CONTRACT v1).
 * Nunca entran en liquidateWeek / computeCarry / priceWeekOvertime (INV-J08).
 */

/** Fingerprint del Hours Engine que produce horas/carry. */
export const HOURS_ENGINE_VERSION = 'he-1.0.0' as const;

/** Fingerprint del Cost Engine que produce estimatedValue → total_cost. */
export const COST_ENGINE_VERSION = 'cost-1.0.0' as const;

/** Identifica PROJECTION CONTRACT v1. */
export const PROJECTION_CONTRACT_VERSION = 'projection-contract-v1' as const;

/**
 * Origen del write (metadata de proceso).
 * Fase 1: el Writer acepta el valor; el cableado de cron/fichaje/import es Fase 1b.
 */
export type ProjectionProcessKind =
  | 'writer'
  | 'cron'
  | 'import'
  | 'backfill'
  | 'recalc'
  | 'fichaje'
  | 'toggle_paid'
  | 'manual';

export type ProjectionGenerationMetadata = {
  hoursEngineVersion: typeof HOURS_ENGINE_VERSION;
  costEngineVersion: typeof COST_ENGINE_VERSION;
  projectionContractVersion: typeof PROJECTION_CONTRACT_VERSION;
  processKind: ProjectionProcessKind;
  /** ISO-8601; solo trazabilidad, no dominio. */
  generatedAtIso: string;
};

export function buildProjectionMetadata(
  processKind: ProjectionProcessKind,
  generatedAt: Date = new Date(),
): ProjectionGenerationMetadata {
  return {
    hoursEngineVersion: HOURS_ENGINE_VERSION,
    costEngineVersion: COST_ENGINE_VERSION,
    projectionContractVersion: PROJECTION_CONTRACT_VERSION,
    processKind,
    generatedAtIso: generatedAt.toISOString(),
  };
}
