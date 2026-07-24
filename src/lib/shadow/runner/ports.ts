import type { LiquidationResult } from '../../hours-engine/types.ts';
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
  /** Resultado HE ya liquidado (loader o fixture). */
  liquidation: LiquidationResult;
  heFacts?: HeAdapterFacts;
  bagModeOverride?: boolean | null;
  /** Fila SQL / snapshot proyectable. */
  snapshot: SqlWeeklySnapshotRow;
  profilePreferStock?: boolean | null;
  /** Si true, el runner omite comparación (p.ej. semana abierta). */
  skip?: boolean;
  skipReason?: string;
};

/** Puerto: enumerar sujetos del horizonte. */
export type ShadowSubjectLoader = {
  listSubjects(): readonly ShadowSubject[];
};

/** Puerto: cargar hechos de un sujeto (solo lectura). */
export type ShadowFactLoader = {
  loadFacts(subject: ShadowSubject): ShadowSubjectFacts | null;
};

export type ShadowRunnerClock = {
  /** ISO fijo en tests. */
  nowIso(): string;
};

export type ShadowRunnerOptions = {
  horizonStart: string;
  horizonEnd: string;
  /** Obligatorio para determinismo en tests. */
  runId?: string;
  clock?: ShadowRunnerClock;
  /**
   * Si se aporta, durationMs usa este valor (tests deterministas).
   * Si no, se mide con performance.now / Date.
   */
  fixedDurationMs?: number;
};
