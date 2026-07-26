import type {
  EmployeeBoundaryFacts,
  LiquidationResult,
} from '../../hours-engine/types.ts';
import type { SqlWeeklySnapshotRow } from '../adapters/sql-adapter.ts';
import type { HeAdapterFacts } from '../adapters/he-adapter.ts';

/** Clave de sujeto Employee × Week. */
export type ShadowSubject = {
  employeeId: string;
  weekStart: string;
};

/**
 * Hechos ya resueltos para un sujeto (entrada a adapters).
 * El Runner no escribe; solo consume este bundle.
 */
export type ShadowSubjectFacts = {
  subject: ShadowSubject;
  liquidation: LiquidationResult;
  /** Frontera contractual (tarifas de tramo + settlement lunes). */
  employee: EmployeeBoundaryFacts;
  heFacts?: HeAdapterFacts;
  bagModeOverride?: boolean | null;
  /** Override €/h semanal (`overtime_price_snapshot`). */
  overrideRate?: number | null;
  snapshot: SqlWeeklySnapshotRow;
  profilePreferStock?: boolean | null;
};

/** Resultado de carga por sujeto (infra → Runner). */
export type ShadowFactLoadResult =
  | { status: 'ready'; facts: ShadowSubjectFacts }
  | { status: 'skip'; reason: string }
  | { status: 'error'; error: string };

/** Puerto: enumerar sujetos del horizonte. */
export type ShadowSubjectLoader = {
  listSubjects():
    | readonly ShadowSubject[]
    | Promise<readonly ShadowSubject[]>;
};

/** Puerto: cargar hechos de un sujeto (solo lectura). */
export type ShadowFactLoader = {
  loadFacts(
    subject: ShadowSubject,
  ): ShadowFactLoadResult | Promise<ShadowFactLoadResult>;
};

export type ShadowRunnerClock = {
  nowIso(): string;
};

export type ShadowRunnerOptions = {
  horizonStart: string;
  horizonEnd: string;
  runId?: string;
  clock?: ShadowRunnerClock;
  fixedDurationMs?: number;
};
