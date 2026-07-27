/**
 * API pública del Writer de proyección (Fase 1).
 */

export {
  HOURS_ENGINE_VERSION,
  COST_ENGINE_VERSION,
  PROJECTION_CONTRACT_VERSION,
  buildProjectionMetadata,
} from './versions.ts';
export type {
  ProjectionProcessKind,
  ProjectionGenerationMetadata,
} from './versions.ts';

export {
  mapEnginesToProjectionRow,
  domainRowToInsertPayload,
  domainRowToUpdatePayload,
  projectionDomainEquals,
  roundMoneyCents,
  MONEY_EPS,
} from './map-projection.ts';
export type { WeeklyProjectionDomainRow } from './map-projection.ts';

export {
  validateProjectionBatch,
  validateWriterPreconditions,
  validateCarryInvariantsOnResult,
  validateLaborInvariantsOnResult,
} from './validate-projection.ts';
export type {
  ProjectionWeekCandidate,
  ProjectionValidationResult,
  ValidateProjectionBatchOptions,
} from './validate-projection.ts';

export { writeWeeklyProjection } from './write-weekly-projection.ts';
export type {
  WriteWeeklyProjectionInput,
  WriteWeeklyProjectionResult,
  WriteWeeklyProjectionSuccess,
  WriteWeeklyProjectionFailure,
} from './write-weekly-projection.ts';
