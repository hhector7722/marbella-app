import type { DiscrepancyCode } from './taxonomy.ts';

/** KPIs de un Shadow Run (dominio Migración). */
export type ShadowMetrics = {
  runId: string;
  coverageSubjects: number;
  exactMatchRate: number;
  toleratedMatchRate: number;
  criticalDiffRate: number;
  openByCode: Partial<Record<DiscrepancyCode, number>>;
  regressions: number;
  improvements: number;
  newFingerprints: number;
};
