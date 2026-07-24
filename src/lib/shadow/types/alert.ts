import type { DiscrepancySeverity } from './taxonomy.ts';

/**
 * Alerta de migración (no de negocio operativo).
 * Emisión real: commits posteriores; aquí solo el contrato.
 */
export type ShadowAlert = {
  id: string;
  fingerprint: string;
  severity: DiscrepancySeverity;
  title: string;
  body: string;
  runId: string;
  discrepancyId: string | null;
  createdAt: string;
  suppressed: boolean;
};
